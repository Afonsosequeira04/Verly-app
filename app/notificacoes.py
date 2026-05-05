"""
notificacoes.py — Notificações proativas da Verly

Gera alertas inteligentes:
  - Subscrições a renovar em breve
  - Garantias a expirar
  - Orçamento mensal ultrapassado ou perto do limite
  - Comparação de gastos vs mês anterior
"""
from datetime import datetime, timedelta
from flask import Blueprint, jsonify
from flask_login import login_required, current_user
from app.models import Fatura, Meta, Subscricao

notificacoes_bp = Blueprint('notificacoes', __name__)


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


def gerar_notificacoes(user_id: int, orcamento: float = 0) -> list:
    """
    Gera lista de notificações proativas para o utilizador.
    Cada notificação tem: tipo, titulo, mensagem, icone, urgencia ('alta'|'media'|'info').
    """
    notifs = []
    hoje = datetime.utcnow()

    # ── Buscar dados ──────────────────────────────────────────────────────────
    faturas = Fatura.query.filter_by(user_id=user_id).all()
    metas   = Meta.query.filter_by(user_id=user_id).all()
    subs    = Subscricao.query.filter_by(user_id=user_id, ativa=True).all()

    # ── 1. Garantias a expirar nos próximos 30 dias ───────────────────────────
    for f in faturas:
        data_gar = _parse_date(f.data_garantia)
        if data_gar and data_gar >= hoje:
            dias = (data_gar - hoje).days
            if dias <= 30:
                urgencia = 'alta' if dias <= 7 else 'media'
                notifs.append({
                    'tipo':     'garantia',
                    'titulo':   f'Garantia expira em {dias} dia{"s" if dias != 1 else ""}',
                    'mensagem': f'A garantia de {f.loja or f.nome_ficheiro} termina em {data_gar.strftime("%d/%m/%Y")}.',
                    'icone':    '🛡️',
                    'urgencia': urgencia,
                    'link':     f'/faturas/{f.id}',
                })

    # ── 2. Datas de devolução a expirar nos próximos 5 dias ───────────────────
    for f in faturas:
        data_dev = _parse_date(f.data_devolucao)
        if data_dev and data_dev >= hoje:
            dias = (data_dev - hoje).days
            if dias <= 5:
                notifs.append({
                    'tipo':     'devolucao',
                    'titulo':   f'Devolução termina em {dias} dia{"s" if dias != 1 else ""}!',
                    'mensagem': f'Prazo de devolução de {f.loja or f.nome_ficheiro}: {data_dev.strftime("%d/%m/%Y")}.',
                    'icone':    '↩️',
                    'urgencia': 'alta',
                    'link':     f'/faturas/{f.id}',
                })

    # ── 3. Orçamento mensal ───────────────────────────────────────────────────
    if orcamento and orcamento > 0:
        # Gastos do mês atual
        mes_atual = [
            f for f in faturas
            if f.data_upload and f.data_upload.month == hoje.month
            and f.data_upload.year == hoje.year
        ]
        total_mes = sum(f.total or 0 for f in mes_atual)
        pct = (total_mes / orcamento) * 100

        if pct >= 100:
            notifs.append({
                'tipo':     'orcamento',
                'titulo':   'Orçamento mensal ultrapassado',
                'mensagem': f'Gastaste {total_mes:.0f}€ de {orcamento:.0f}€ ({pct:.0f}%). Já ultrapassaste o limite deste mês.',
                'icone':    '🔴',
                'urgencia': 'alta',
                'link':     '/relatorio',
            })
        elif pct >= 80:
            restante = orcamento - total_mes
            notifs.append({
                'tipo':     'orcamento',
                'titulo':   f'{pct:.0f}% do orçamento usado',
                'mensagem': f'Só restam {restante:.0f}€ do teu orçamento mensal de {orcamento:.0f}€.',
                'icone':    '⚠️',
                'urgencia': 'media',
                'link':     '/relatorio',
            })

    # ── 4. Metas de categoria ultrapassadas ───────────────────────────────────
    if metas:
        gastos_cat = {}
        for f in faturas:
            if f.data_upload and f.data_upload.month == hoje.month and f.data_upload.year == hoje.year:
                cat = f.categoria or 'Outros'
                gastos_cat[cat] = gastos_cat.get(cat, 0) + (f.total or 0)

        for meta in metas:
            gasto = gastos_cat.get(meta.categoria, 0)
            if gasto > meta.valor_limite:
                excesso = gasto - meta.valor_limite
                notifs.append({
                    'tipo':     'meta',
                    'titulo':   f'Meta de {meta.categoria} ultrapassada',
                    'mensagem': f'Gastaste {gasto:.0f}€ em {meta.categoria}, {excesso:.0f}€ acima do limite de {meta.valor_limite:.0f}€.',
                    'icone':    '📊',
                    'urgencia': 'media',
                    'link':     '/metas',
                })
            elif gasto >= meta.valor_limite * 0.85:
                restante = meta.valor_limite - gasto
                notifs.append({
                    'tipo':     'meta',
                    'titulo':   f'{meta.categoria} perto do limite',
                    'mensagem': f'Só restam {restante:.0f}€ na meta de {meta.categoria} ({meta.valor_limite:.0f}€/mês).',
                    'icone':    '📈',
                    'urgencia': 'info',
                    'link':     '/metas',
                })

    # ── 5. Subscrições suspeitas (danger) ─────────────────────────────────────
    subs_danger = [s for s in subs if s.risk == 'danger']
    if subs_danger:
        total_sub = sum(s.preco_mensal for s in subs_danger)
        notifs.append({
            'tipo':     'subscricao',
            'titulo':   f'{len(subs_danger)} subscrição(ões) suspeita(s)',
            'mensagem': f'Estás a pagar {total_sub:.0f}€/mês em serviços que talvez não uses. Verifica o Leak Detector.',
            'icone':    '💸',
            'urgencia': 'media',
            'link':     '/subscriptions',
        })

    # ── Ordenar: alta primeiro, depois media, depois info ─────────────────────
    order = {'alta': 0, 'media': 1, 'info': 2}
    notifs.sort(key=lambda n: order.get(n['urgencia'], 9))

    return notifs[:6]  # máx 6 notificações


@notificacoes_bp.route('/notificacoes/api')
@login_required
def api_notificacoes():
    orcamento = getattr(current_user, 'orcamento_mensal', 0) or 0
    notifs = gerar_notificacoes(current_user.id, orcamento)
    return jsonify({
        'success': True,
        'notificacoes': notifs,
        'total': len(notifs),
        'urgentes': sum(1 for n in notifs if n['urgencia'] == 'alta'),
    })
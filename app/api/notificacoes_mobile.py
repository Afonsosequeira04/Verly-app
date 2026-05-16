# ── Adiciona em app/api/__init__.py ───────────────────────────────────────────
# from app.api import notificacoes_mobile  # noqa

# ── Cria o ficheiro app/api/notificacoes_mobile.py ────────────────────────────
"""
app/api/notificacoes_mobile.py — Notificações para o mobile (JWT)

GET /api/v1/notificacoes
    Devolve lista de notificações proativas para o utilizador autenticado.
    Usa a mesma lógica de gerar_notificacoes() já existente no projeto.
"""
from datetime import datetime
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import User, Fatura, Meta, Subscricao
import logging

logger = logging.getLogger(__name__)

ICONE_FALLBACK = {
    'garantia':   '🛡️',
    'devolucao':  '↩️',
    'orcamento':  '⚠️',
    'meta':       '📊',
    'subscricao': '💸',
}


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


def _gerar_notificacoes_mobile(user_id: int, orcamento: float = 0) -> list:
    """Gera notificações proativas com base nos dados reais do utilizador."""
    notifs = []
    hoje = datetime.utcnow()

    faturas = Fatura.query.filter_by(user_id=user_id).all()
    metas   = Meta.query.filter_by(user_id=user_id).all()

    try:
        subs = Subscricao.query.filter_by(user_id=user_id, ativa=True).all()
    except Exception:
        subs = []

    # ── 1. Garantias a expirar nos próximos 30 dias ───────────────────────────
    for f in faturas:
        data_gar = _parse_date(getattr(f, 'data_garantia', None))
        if data_gar and data_gar >= hoje:
            dias = (data_gar - hoje).days
            if dias <= 30:
                urgencia = 'alta' if dias <= 7 else 'media'
                notifs.append({
                    'tipo':     'garantia',
                    'titulo':   f'Garantia expira em {dias} dia{"s" if dias != 1 else ""}',
                    'mensagem': f'A garantia de {f.loja or f.nome_ficheiro or "produto"} termina em {data_gar.strftime("%d/%m/%Y")}.',
                    'icone':    '🛡️',
                    'urgencia': urgencia,
                })

    # ── 2. Devoluções a expirar nos próximos 5 dias ───────────────────────────
    for f in faturas:
        data_dev = _parse_date(getattr(f, 'data_devolucao', None))
        if data_dev and data_dev >= hoje:
            dias = (data_dev - hoje).days
            if dias <= 5:
                notifs.append({
                    'tipo':     'devolucao',
                    'titulo':   f'Devolução termina em {dias} dia{"s" if dias != 1 else ""}!',
                    'mensagem': f'Prazo de devolução de {f.loja or f.nome_ficheiro or "produto"}: {data_dev.strftime("%d/%m/%Y")}.',
                    'icone':    '↩️',
                    'urgencia': 'alta',
                })

    # ── 3. Orçamento mensal ───────────────────────────────────────────────────
    if orcamento and orcamento > 0:
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
                'mensagem': f'Gastaste {total_mes:.0f}€ de {orcamento:.0f}€ ({pct:.0f}%). Já ultrapassaste o limite.',
                'icone':    '🔴',
                'urgencia': 'alta',
            })
        elif pct >= 80:
            restante = orcamento - total_mes
            notifs.append({
                'tipo':     'orcamento',
                'titulo':   f'{pct:.0f}% do orçamento usado',
                'mensagem': f'Só restam {restante:.0f}€ do teu orçamento de {orcamento:.0f}€ este mês.',
                'icone':    '⚠️',
                'urgencia': 'media',
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
                    'mensagem': f'Gastaste {gasto:.0f}€ em {meta.categoria}, {excesso:.0f}€ acima do limite.',
                    'icone':    '📊',
                    'urgencia': 'media',
                })
            elif gasto >= meta.valor_limite * 0.85:
                restante = meta.valor_limite - gasto
                notifs.append({
                    'tipo':     'meta',
                    'titulo':   f'{meta.categoria} perto do limite',
                    'mensagem': f'Só restam {restante:.0f}€ na meta de {meta.categoria}.',
                    'icone':    '📈',
                    'urgencia': 'info',
                })

    # ── 5. Subscrições suspeitas ──────────────────────────────────────────────
    subs_danger = [s for s in subs if getattr(s, 'risk', '') == 'danger']
    if subs_danger:
        total_sub = sum(getattr(s, 'preco_mensal', 0) for s in subs_danger)
        notifs.append({
            'tipo':     'subscricao',
            'titulo':   f'{len(subs_danger)} subscrição(ões) suspeita(s)',
            'mensagem': f'Estás a pagar {total_sub:.0f}€/mês em serviços que talvez não uses.',
            'icone':    '💸',
            'urgencia': 'media',
        })

    # ── 6. Sem dados — dar boas-vindas ────────────────────────────────────────
    if not faturas:
        notifs.append({
            'tipo':     'info',
            'titulo':   'Adiciona a tua primeira fatura',
            'mensagem': 'Fotografa ou carrega uma fatura para começar a monitorizar os teus gastos.',
            'icone':    '📄',
            'urgencia': 'info',
        })

    # Ordenar: alta → media → info
    order = {'alta': 0, 'media': 1, 'info': 2}
    notifs.sort(key=lambda n: order.get(n['urgencia'], 9))

    return notifs[:6]


@api_bp.route('/notificacoes', methods=['GET'])
@jwt_required()
def notificacoes_mobile():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'notificacoes': [], 'total': 0, 'urgentes': 0}), 404

    orcamento = getattr(user, 'orcamento_mensal', 0) or 0
    notifs = _gerar_notificacoes_mobile(user_id, orcamento)

    return jsonify({
        'success':    True,
        'notificacoes': notifs,
        'total':      len(notifs),
        'urgentes':   sum(1 for n in notifs if n['urgencia'] == 'alta'),
    })
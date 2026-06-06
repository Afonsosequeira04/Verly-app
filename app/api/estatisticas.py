"""
app/api/estatisticas.py — FASE 2
GET /api/v1/estatisticas          → estatísticas gerais (todos os meses)
GET /api/v1/estatisticas/mensal   → retrospetiva de um mês específico
    ?ano=2025&mes=4               → filtro por mês

Regista no __init__.py do api_bp se ainda não estiver:
    from app.api import estatisticas   # ← adicionar no app/api/__init__.py
"""

import json
import logging
from collections import defaultdict
from datetime import datetime, date
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.financial_records import get_expense_records, summarize_expenses
from app.models import Fatura
from app import db

logger = logging.getLogger(__name__)

# ─── Helpers ──────────────────────────────────────────────────────────────────

MESES_PT = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _get_fatura_date(f) -> date | None:
    d = _parse_date(f.data_compra)
    if d:
        return d
    if f.data_upload:
        return f.data_upload.date() if hasattr(f.data_upload, 'date') else f.data_upload
    return None


# ─── GET /api/v1/estatisticas ─────────────────────────────────────────────────

@api_bp.route('/estatisticas', methods=['GET'])
@jwt_required()
def estatisticas_geral():
    """
    Estatísticas globais do utilizador (sem filtro de mês).
    Usado pela EstatisticasScreen.
    """
    user_id = int(get_jwt_identity())
    summary = summarize_expenses(user_id, currency=request.args.get('currency'))
    return jsonify({
        'total_geral':  summary['total_geral'],
        'num_faturas':  sum(1 for item in summary['records'] if item['source'] == 'fatura'),
        'num_registos': summary['num_registos'],
        'media_fatura': round(summary['total_geral'] / summary['num_registos'], 2) if summary['num_registos'] else 0,
        'por_categoria': summary['por_categoria'],
        'por_mes': summary['por_mes'],
        'top_lojas': summary['top_lojas'],
        'fontes': summary['fontes'],
        'fontes_por_moeda': summary['fontes_por_moeda'],
        'mes_atual': summary['mes_atual'],
        'previsao_mensal': summary['previsao_mensal'],
        'currency': summary['currency'],
        'available_currencies': summary['available_currencies'],
        'other_currencies': summary['other_currencies'],
        'excluded': summary['excluded'],
    })
    faturas = Fatura.query.filter_by(user_id=user_id).all()

    por_categoria = defaultdict(float)
    por_mes       = defaultdict(float)
    por_loja      = defaultdict(float)
    total_geral   = 0.0

    for f in faturas:
        valor = f.total or 0
        total_geral += valor

        cat  = f.categoria or 'Outros'
        loja = f.loja or 'Desconhecida'
        por_categoria[cat]  += valor
        por_loja[loja]      += valor

        d = _get_fatura_date(f)
        if d:
            mes_key = f"{d.year}-{d.month:02d}"
            por_mes[mes_key] += valor

    # Últimos 12 meses ordenados
    meses_sorted = sorted(por_mes.keys())[-12:]

    return jsonify({
        'total_geral':  round(total_geral, 2),
        'num_faturas':  len(faturas),
        'media_fatura': round(total_geral / len(faturas), 2) if faturas else 0,
        'por_categoria': [
            {'categoria': k, 'total': round(v, 2)}
            for k, v in sorted(por_categoria.items(), key=lambda x: -x[1])
        ],
        'por_mes': [
            {'mes': mk, 'total': round(por_mes[mk], 2)}
            for mk in meses_sorted
        ],
        'top_lojas': [
            {'loja': k, 'total': round(v, 2)}
            for k, v in sorted(por_loja.items(), key=lambda x: -x[1])[:8]
        ],
    })


# ─── GET /api/v1/estatisticas/mensal ─────────────────────────────────────────

@api_bp.route('/estatisticas/mensal', methods=['GET'])
@jwt_required()
def estatisticas_mensal():
    """
    Retrospetiva de um mês específico.
    Usado pela RetrospetivaMensalScreen.

    Query params:
        ano=2025&mes=4   (inteiros)

    Resposta inclui:
        - total, num_faturas, media_fatura
        - por_categoria (para mini bar chart)
        - historico (6 meses anteriores para o histograma)
        - top_loja, dia_mais_caro
        - comparacao (vs mês anterior: delta, pct, subiu)
        - meta_orcamento (orcamento do user e pct usado)
        - meses_disponiveis (para navegação mês a mês)
    """
    from app.models import User

    user_id = int(get_jwt_identity())
    user    = User.query.get_or_404(user_id)

    try:
        ano = int(request.args.get('ano', datetime.utcnow().year))
        mes = int(request.args.get('mes', datetime.utcnow().month))
        if not (1 <= mes <= 12) or ano < 2000:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'error': 'ano e mes inválidos'}), 400

    selected_summary = summarize_expenses(user_id, currency=request.args.get('currency'))
    selected_currency = selected_summary['currency']
    records = get_expense_records(user_id, currency=selected_currency)
    por_mes_dict: dict[str, list] = defaultdict(list)
    for record in records:
        if record['month']:
            por_mes_dict[record['month']].append(record)

    mes_key = f"{ano}-{mes:02d}"
    registos_mes = por_mes_dict.get(mes_key, [])
    total_mes = sum(item['value'] for item in registos_mes)
    num_registos = len(registos_mes)
    num_faturas = sum(1 for item in registos_mes if item['source'] == 'fatura')

    por_cat = defaultdict(float)
    por_loja = defaultdict(float)
    por_fonte = defaultdict(float)
    for item in registos_mes:
        por_cat[item['categoria'] or 'Outros'] += item['value']
        por_loja[item['merchant'] or 'Desconhecida'] += item['value']
        por_fonte[item['source']] += item['value']

    top_loja = max(por_loja, key=por_loja.get) if por_loja else None
    registo_mais_caro = max(registos_mes, key=lambda item: item['value'], default=None)

    mes_ant = mes - 1 if mes > 1 else 12
    ano_ant = ano if mes > 1 else ano - 1
    key_ant = f"{ano_ant}-{mes_ant:02d}"
    total_ant = sum(item['value'] for item in por_mes_dict.get(key_ant, []))
    delta = total_mes - total_ant
    pct_delta = round(abs(delta / total_ant * 100), 1) if total_ant > 0 else None

    historico = []
    for i in range(5, -1, -1):
        m_ = mes - i
        a_ = ano
        while m_ <= 0:
            m_ += 12
            a_ -= 1
        k_ = f"{a_}-{m_:02d}"
        historico.append({
            'mes': k_,
            'total': round(sum(item['value'] for item in por_mes_dict.get(k_, [])), 2),
            'currency': selected_currency,
        })

    orcamento = getattr(user, 'orcamento_mensal', 0) or 0
    pct_orcamento = (
        round((total_mes / orcamento * 100), 1)
        if orcamento > 0 and selected_currency == 'EUR'
        else None
    )

    return jsonify({
        'ano': ano,
        'mes': mes,
        'mes_nome': MESES_PT[mes],
        'currency': selected_currency,
        'total': round(total_mes, 2),
        'num_faturas': num_faturas,
        'num_registos': num_registos,
        'media_fatura': round(total_mes / num_registos, 2) if num_registos > 0 else 0,
        'por_categoria': [
            {'categoria': k, 'total': round(v, 2), 'currency': selected_currency}
            for k, v in sorted(por_cat.items(), key=lambda x: -x[1])
        ],
        'por_fonte': [
            {'fonte': k, 'total': round(v, 2), 'currency': selected_currency}
            for k, v in sorted(por_fonte.items(), key=lambda x: x[0])
        ],
        'historico': historico,
        'top_loja': {
            'nome': top_loja,
            'total': round(por_loja[top_loja], 2),
            'currency': selected_currency,
        } if top_loja else None,
        'fatura_mais_cara': {
            'loja': registo_mais_caro['merchant'] or 'Desconhecida',
            'total': round(registo_mais_caro['value'], 2),
            'currency': selected_currency,
            'data': registo_mais_caro['date'].isoformat() if registo_mais_caro['date'] else None,
            'fonte': registo_mais_caro['source'],
        } if registo_mais_caro else None,
        'comparacao': {
            'total_anterior': round(total_ant, 2),
            'delta': round(delta, 2),
            'variacao_pct': pct_delta,
            'subiu': delta > 0,
        },
        'meta_orcamento': {
            'orcamento': round(orcamento, 2),
            'gasto': round(total_mes, 2),
            'currency': 'EUR',
            'active_currency': selected_currency,
            'currency_mismatch': selected_currency != 'EUR',
            'pct': pct_orcamento,
            'excedeu': total_mes > orcamento if orcamento > 0 and selected_currency == 'EUR' else False,
        } if orcamento > 0 else None,
        'meses_disponiveis': sorted(por_mes_dict.keys()),
    })

    faturas_todas = Fatura.query.filter_by(user_id=user_id).all()

    # Agrupa por mês
    por_mes_dict: dict[str, list] = defaultdict(list)
    for f in faturas_todas:
        d = _get_fatura_date(f)
        if d:
            por_mes_dict[f"{d.year}-{d.month:02d}"].append(f)

    mes_key = f"{ano}-{mes:02d}"
    faturas_mes = por_mes_dict.get(mes_key, [])

    # Totais do mês
    total_mes   = sum(f.total or 0 for f in faturas_mes)
    num_faturas = len(faturas_mes)

    # Por categoria
    por_cat = defaultdict(float)
    for f in faturas_mes:
        por_cat[f.categoria or 'Outros'] += f.total or 0

    # Top loja
    por_loja = defaultdict(float)
    for f in faturas_mes:
        por_loja[f.loja or 'Desconhecida'] += f.total or 0
    top_loja = max(por_loja, key=por_loja.get) if por_loja else None
    top_loja_val = round(por_loja[top_loja], 2) if top_loja else 0

    # Fatura mais cara
    fatura_mais_cara = max(faturas_mes, key=lambda f: f.total or 0, default=None)

    # Comparação com mês anterior
    from calendar import monthrange
    mes_ant     = mes - 1 if mes > 1 else 12
    ano_ant     = ano if mes > 1 else ano - 1
    key_ant     = f"{ano_ant}-{mes_ant:02d}"
    total_ant   = sum(f.total or 0 for f in por_mes_dict.get(key_ant, []))
    delta       = total_mes - total_ant
    pct_delta   = round(abs(delta / total_ant * 100), 1) if total_ant > 0 else None
    subiu       = delta > 0

    # Histórico dos 6 meses anteriores (para histograma)
    historico = []
    for i in range(5, -1, -1):
        m_ = mes - i
        a_ = ano
        while m_ <= 0:
            m_ += 12
            a_ -= 1
        k_ = f"{a_}-{m_:02d}"
        historico.append({
            'mes':   k_,
            'total': round(sum(f.total or 0 for f in por_mes_dict.get(k_, [])), 2),
        })

    # Orçamento
    orcamento = getattr(user, 'orcamento_mensal', 0) or 0
    pct_orcamento = round((total_mes / orcamento * 100), 1) if orcamento > 0 else None

    # Meses disponíveis (para navegação)
    meses_disponiveis = sorted(por_mes_dict.keys())

    return jsonify({
        'ano':          ano,
        'mes':          mes,
        'mes_nome':     MESES_PT[mes],
        'total':        round(total_mes, 2),
        'num_faturas':  num_faturas,
        'media_fatura': round(total_mes / num_faturas, 2) if num_faturas > 0 else 0,
        'por_categoria': [
            {'categoria': k, 'total': round(v, 2)}
            for k, v in sorted(por_cat.items(), key=lambda x: -x[1])
        ],
        'historico':    historico,
        'top_loja': {
            'nome':  top_loja,
            'total': top_loja_val,
        } if top_loja else None,
        'fatura_mais_cara': {
            'loja':  fatura_mais_cara.loja or 'Desconhecida',
            'total': round(fatura_mais_cara.total or 0, 2),
            'data':  fatura_mais_cara.data_compra,
        } if fatura_mais_cara else None,
        'comparacao': {
            'total_anterior': round(total_ant, 2),
            'delta':          round(delta, 2),
            'variacao_pct':   pct_delta,
            'subiu':          subiu,
        },
        'meta_orcamento': {
            'orcamento':      round(orcamento, 2),
            'gasto':          round(total_mes, 2),
            'pct':            pct_orcamento,
            'excedeu':        total_mes > orcamento if orcamento > 0 else False,
        } if orcamento > 0 else None,
        'meses_disponiveis': meses_disponiveis,
    })

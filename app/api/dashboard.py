"""
app/api/dashboard.py — Endpoint do dashboard para o mobile

GET /api/v1/dashboard → resumo completo
"""

import json
import logging
from collections import defaultdict
from datetime import datetime
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Fatura, Conversa
from app.subscriptions import detect_subscriptions
from app.dashboard import (
    _normalise_personality, _calcular_mood, _atualizar_streak,
    _evolucao_mensal_real, _comparacao_mensal, _get_metas_dashboard,
    _gerar_feed_verly, _score_ultima_fatura, _parse_date
)
from app.notificacoes import gerar_notificacoes
from app.reports import _regret_factor
from app import db

logger = logging.getLogger(__name__)


@api_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    from app.models import User
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)

    faturas   = Fatura.query.filter_by(user_id=user_id).order_by(Fatura.data_upload.desc()).all()
    conversas = Conversa.query.filter_by(user_id=user_id).order_by(Conversa.timestamp.desc()).limit(5).all()

    total_gasto = sum(f.total or 0 for f in faturas)
    num_faturas = len(faturas)
    orcamento   = getattr(user, 'orcamento_mensal', 0) or 0
    personalidade = _normalise_personality(getattr(user, 'personalidade', 'calm'))

    categorias = defaultdict(float)
    for f in faturas:
        categorias[f.categoria or 'Outros'] += f.total or 0

    lojas = defaultdict(float)
    for f in faturas:
        lojas[f.loja or 'Desconhecida'] += f.total or 0
    top_loja = max(lojas, key=lojas.get) if lojas else None

    hoje = datetime.now()
    alertas = []
    for f in faturas:
        data_dev = _parse_date(f.data_devolucao)
        if data_dev and data_dev >= hoje:
            dias = (data_dev - hoje).days
            if dias <= 7:
                alertas.append({
                    'tipo': 'devolucao', 'fatura': f.nome_ficheiro,
                    'loja': f.loja or '—', 'data': f.data_devolucao,
                    'dias': dias, 'urgencia': 'critico' if dias <= 3 else 'aviso'
                })
        data_gar = _parse_date(f.data_garantia)
        if data_gar and data_gar >= hoje:
            dias = (data_gar - hoje).days
            if dias <= 30:
                alertas.append({
                    'tipo': 'garantia', 'fatura': f.nome_ficheiro,
                    'loja': f.loja or '—', 'data': f.data_garantia,
                    'dias': dias, 'urgencia': 'critico' if dias <= 7 else 'aviso'
                })
    alertas.sort(key=lambda x: x['dias'])

    subs_data    = detect_subscriptions(user_id)
    metas_info   = _get_metas_dashboard(user_id)
    mood         = _calcular_mood(total_gasto, orcamento, len(alertas), personalidade)
    streak       = _atualizar_streak(user, faturas, orcamento)
    feed_verly   = _gerar_feed_verly(faturas, conversas, orcamento, subs_data, personalidade, metas_info)
    comparacao   = _comparacao_mensal(faturas)
    trend_labels, trend_values = _evolucao_mensal_real(faturas)

    ultima_fatura = faturas[0] if faturas else None
    score_ultima  = _score_ultima_fatura(ultima_fatura)

    desperdicado_mes = sum(
        (f.total or 0) * _regret_factor(f.categoria or 'Outros') for f in faturas
    )

    def fatura_mini(f):
        return {
            'id':          f.id,
            'loja':        f.loja or f.nome_ficheiro,
            'total':       f.total or 0,
            'categoria':   f.categoria or 'Outros',
            'data_compra': f.data_compra,
            'data_upload': f.data_upload.isoformat() if f.data_upload else None,
        }

    return jsonify({
        'total_gasto':    round(total_gasto, 2),
        'num_faturas':    num_faturas,
        'top_loja':       top_loja,
        'orcamento':      orcamento,
        'streak':         streak,
        'mood':           mood,
        'feed':           feed_verly,
        'alertas':        alertas,
        'comparacao':     comparacao,
        'score_ultima':   score_ultima,
        'desperdicado_mes': round(desperdicado_mes, 2),
        'categorias':     [{'nome': k, 'total': round(v, 2)} for k, v in categorias.items()],
        'lojas':          [{'nome': k, 'total': round(v, 2)} for k, v in sorted(lojas.items(), key=lambda x: -x[1])[:6]],
        'evolucao':       {'labels': trend_labels, 'values': trend_values},
        'subscricoes': {
            'total_mensal': round(subs_data['total_mensal_desperdicado'], 2),
            'count_danger': subs_data['count_danger'],
            'count_warning': subs_data['count_warning'],
            'top3': subs_data['subscriptions'][:3],
        },
        'ultimas_faturas': [fatura_mini(f) for f in faturas[:5]],
    })


# ── Estatísticas ──────────────────────────────────────────────────────────────

def _parse_date_str(s):
    if not s:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            continue
    return None


@api_bp.route('/estatisticas', methods=['GET'])
@jwt_required()
def estatisticas():
    user_id = int(get_jwt_identity())
    faturas = Fatura.query.filter_by(user_id=user_id).all()

    if not faturas:
        return jsonify({
            'por_categoria': [],
            'por_mes': [],
            'total_geral': 0,
            'media_mensal': 0,
            'categoria_top': None,
            'num_faturas': 0,
        })

    cat_totais = defaultdict(float)
    cat_counts = defaultdict(int)
    mes_totais = defaultdict(float)

    for f in faturas:
        cat = f.categoria or 'Outros'
        total = f.total or 0
        cat_totais[cat] += total
        cat_counts[cat] += 1

        data = _parse_date_str(f.data_compra) or f.data_upload
        if data:
            chave_mes = data.strftime('%Y-%m') if hasattr(data, 'strftime') else str(data)[:7]
            mes_totais[chave_mes] += total

    por_categoria = sorted(
        [{'categoria': k, 'total': round(v, 2), 'count': cat_counts[k]}
         for k, v in cat_totais.items()],
        key=lambda x: x['total'], reverse=True
    )

    por_mes = sorted(
        [{'mes': k, 'total': round(v, 2)} for k, v in mes_totais.items()],
        key=lambda x: x['mes']
    )

    total_geral  = sum(f.total or 0 for f in faturas)
    media_mensal = total_geral / len(mes_totais) if mes_totais else 0

    return jsonify({
        'por_categoria': por_categoria,
        'por_mes':       por_mes,
        'total_geral':   round(total_geral, 2),
        'media_mensal':  round(media_mensal, 2),
        'categoria_top': por_categoria[0]['categoria'] if por_categoria else None,
        'num_faturas':   len(faturas),
    })

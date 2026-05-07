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
    """
    Retorna todos os dados do dashboard em JSON.
    O React Native usa este endpoint para montar o ecrã principal.
    """
    from app.models import User
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)

    faturas   = Fatura.query.filter_by(user_id=user_id).order_by(Fatura.data_upload.desc()).all()
    conversas = Conversa.query.filter_by(user_id=user_id).order_by(Conversa.timestamp.desc()).limit(5).all()

    total_gasto = sum(f.total or 0 for f in faturas)
    num_faturas = len(faturas)
    orcamento   = getattr(user, 'orcamento_mensal', 0) or 0
    personalidade = _normalise_personality(getattr(user, 'personalidade', 'calm'))

    # Categorias
    categorias = defaultdict(float)
    for f in faturas:
        categorias[f.categoria or 'Outros'] += f.total or 0

    # Lojas
    lojas = defaultdict(float)
    for f in faturas:
        lojas[f.loja or 'Desconhecida'] += f.total or 0
    top_loja = max(lojas, key=lojas.get) if lojas else None

    # Alertas de garantia/devolução
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

    # Últimas faturas (para lista no dashboard)
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

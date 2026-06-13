"""
app/api/perfil_mobile.py - Endpoint de perfil para o mobile (JWT)

GET   /api/v1/perfil
PATCH /api/v1/perfil
"""
import logging

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.api import api_bp
from app.financial_records import clean_currency
from app.models import Conversa, Fatura, User

logger = logging.getLogger(__name__)

PERSONALIDADES_VALIDAS = {'calm', 'pro', 'savage', 'sarcastic'}
LINGUAS_VALIDAS = {'pt', 'en', 'es', 'fr', 'de', 'it'}


def _perfil_payload(user, user_id):
    num_faturas = Fatura.query.filter_by(user_id=user_id).count()
    num_conversas = Conversa.query.filter_by(user_id=user_id).count()
    total_gasto = db.session.query(db.func.sum(Fatura.total)).filter_by(user_id=user_id).scalar() or 0

    return {
        'id': user.id,
        'nome': user.nome,
        'email': user.email,
        'avatar_url': user.avatar_url or None,
        'orcamento_mensal': getattr(user, 'orcamento_mensal', 0) or 0,
        'rendimento_mensal': getattr(user, 'rendimento_mensal', 0) or 0,
        'personalidade': getattr(user, 'personalidade', 'calm') or 'calm',
        'notificacoes_email': getattr(user, 'notificacoes_email', False),
        'onboarding_completo': getattr(user, 'onboarding_completo', False),
        'objetivo': getattr(user, 'objetivo', 'controlar') or 'controlar',
        'email_confirmado': getattr(user, 'email_confirmado', False),
        'streak_dias': getattr(user, 'streak_dias', 0) or 0,
        'lingua': getattr(user, 'lingua', 'pt') or 'pt',
        'moeda_preferida': clean_currency(getattr(user, 'moeda_preferida', 'EUR')),
        'num_faturas': num_faturas,
        'num_conversas': num_conversas,
        'total_gasto': round(total_gasto, 2),
    }


@api_bp.route('/perfil', methods=['GET'])
@jwt_required()
def perfil_mobile_get():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': 'Utilizador nao encontrado.'}), 404

    perfil = _perfil_payload(user, user_id)
    return jsonify({'success': True, 'perfil': perfil, **perfil})


@api_bp.route('/perfil', methods=['PATCH'])
@jwt_required()
def perfil_mobile_update():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': 'Utilizador nao encontrado.'}), 404

    data = request.get_json(silent=True) or {}

    if 'nome' in data and data['nome']:
        user.nome = data['nome'].strip()[:100]
    if 'orcamento_mensal' in data:
        try:
            user.orcamento_mensal = max(0, float(data['orcamento_mensal']))
        except (ValueError, TypeError):
            pass
    if 'rendimento_mensal' in data:
        try:
            user.rendimento_mensal = max(0, float(data['rendimento_mensal']))
        except (ValueError, TypeError):
            pass
    if 'personalidade' in data and data['personalidade'] in PERSONALIDADES_VALIDAS:
        user.personalidade = data['personalidade']
    if 'notificacoes_email' in data:
        user.notificacoes_email = bool(data['notificacoes_email'])
    if 'objetivo' in data:
        user.objetivo = data['objetivo']
    if 'lingua' in data and str(data['lingua']).lower() in LINGUAS_VALIDAS:
        user.lingua = str(data['lingua']).lower()
    if 'moeda_preferida' in data:
        user.moeda_preferida = clean_currency(data.get('moeda_preferida'))

    db.session.commit()

    perfil = _perfil_payload(user, user_id)
    return jsonify({'success': True, 'message': 'Perfil atualizado.', 'perfil': perfil, **perfil})

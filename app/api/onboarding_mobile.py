"""
app/api/onboarding_mobile.py — Onboarding mobile atualizado (JWT)

POST /api/v1/onboarding
    Guarda todas as respostas do onboarding incluindo rendimento_mensal e objetivo.
    Substitui o endpoint /auth/onboarding existente com campos extra.

Registar em app/api/__init__.py:
    from app.api import onboarding_mobile  # noqa
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import User, Meta, CATEGORIAS
from app import db


@api_bp.route('/onboarding', methods=['POST'])
@jwt_required()
def save_onboarding_mobile():
    """
    Guarda o perfil completo do onboarding.
    Body esperado:
    {
        "personalidade": "calm|savage|sarcastic|pro",
        "objetivo": "poupar|controlar|garantias|investir",
        "rendimento_mensal": 2500.0,       ← NOVO campo
        "orcamento_mensal": 1500.0,
        "top_categoria": "alimentacao",
        "frequencia_compra": "semanal",
        "metas": { "Alimentação": 300, "Tecnologia": 200 }  ← opcional
    }
    """
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'message': 'Utilizador não encontrado.'}), 404

    data = request.json or {}

    # ── Campos do utilizador ──────────────────────────────────────────────────
    updates = {}

    if 'personalidade' in data:
        updates['personalidade'] = data['personalidade']

    if 'objetivo' in data:
        updates['objetivo'] = data['objetivo']

    if 'orcamento_mensal' in data:
        try:
            updates['orcamento_mensal'] = float(data['orcamento_mensal'])
        except (ValueError, TypeError):
            pass

    if 'rendimento_mensal' in data:
        try:
            # Aceita número direto ou string do mapa de opções
            val = data['rendimento_mensal']
            MAPA_RENDIMENTO = {
                'ate500':    400,
                '500_1000':  750,
                '1000_2000': 1500,
                '2000_3500': 2750,
                'mais3500':  4000,
            }
            if isinstance(val, str) and val in MAPA_RENDIMENTO:
                updates['rendimento_mensal'] = float(MAPA_RENDIMENTO[val])
            else:
                updates['rendimento_mensal'] = float(val)
        except (ValueError, TypeError):
            pass

    updates['onboarding_completo'] = True

    # Aplicar updates ao utilizador
    for key, value in updates.items():
        if hasattr(user, key):
            setattr(user, key, value)

    # ── Metas por categoria (opcional) ────────────────────────────────────────
    metas = data.get('metas', {})
    if metas:
        Meta.query.filter_by(user_id=user_id).delete()
        for cat, valor in metas.items():
            try:
                v = float(valor)
                if v > 0 and cat in CATEGORIAS:
                    m = Meta(user_id=user_id, categoria=cat, valor_limite=v)
                    db.session.add(m)
            except (ValueError, TypeError):
                pass

    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Onboarding guardado com sucesso.',
        'user': {
            'personalidade': user.personalidade,
            'objetivo': getattr(user, 'objetivo', None),
            'orcamento_mensal': getattr(user, 'orcamento_mensal', 0),
            'rendimento_mensal': getattr(user, 'rendimento_mensal', 0),
        }
    })


@api_bp.route('/onboarding/status', methods=['GET'])
@jwt_required()
def onboarding_status():
    """Verifica se o utilizador completou o onboarding e que campos faltam."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False}), 404

    tem_rendimento = bool(getattr(user, 'rendimento_mensal', 0))
    tem_orcamento = bool(getattr(user, 'orcamento_mensal', 0))
    tem_personalidade = bool(getattr(user, 'personalidade', None))

    return jsonify({
        'success': True,
        'onboarding_completo': bool(user.onboarding_completo),
        'perfil_completo': tem_rendimento and tem_orcamento and tem_personalidade,
        'campos': {
            'tem_rendimento': tem_rendimento,
            'tem_orcamento': tem_orcamento,
            'tem_personalidade': tem_personalidade,
            'tem_objetivo': bool(getattr(user, 'objetivo', None)),
        }
    })
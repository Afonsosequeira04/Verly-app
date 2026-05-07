"""
app/api/auth.py — Endpoints de autenticação para o mobile

POST /api/v1/auth/login     → {access_token, user}
POST /api/v1/auth/register  → {access_token, user}
GET  /api/v1/auth/me        → {user}
POST /api/v1/auth/logout    → {success}
"""

import logging
import re
from flask import request, jsonify
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity, get_jwt
)
from app.api import api_bp
from app.models import User
from app import db

logger = logging.getLogger(__name__)


def _user_to_dict(user):
    """Serializa o utilizador para JSON (sem dados sensíveis)."""
    return {
        'id':                  user.id,
        'nome':                user.nome,
        'email':               user.email,
        'orcamento_mensal':    user.orcamento_mensal or 0,
        'personalidade':       getattr(user, 'personalidade', 'calm') or 'calm',
        'notificacoes_email':  getattr(user, 'notificacoes_email', False),
        'onboarding_completo': getattr(user, 'onboarding_completo', False),
        'streak_dias':         getattr(user, 'streak_dias', 0) or 0,
    }


@api_bp.route('/auth/login', methods=['POST'])
def login():
    """
    Login com email + password.
    Body JSON: {email, password}
    """
    data = request.get_json(silent=True) or {}
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email e password são obrigatórios.'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        logger.warning(f'Tentativa de login falhada — email={email!r}')
        return jsonify({'error': 'Credenciais inválidas.'}), 401

    access_token = create_access_token(identity=str(user.id))
    logger.info(f'Login mobile — user_id={user.id}')

    return jsonify({
        'access_token': access_token,
        'user': _user_to_dict(user),
    })


@api_bp.route('/auth/register', methods=['POST'])
def register():
    """
    Registo de novo utilizador.
    Body JSON: {nome, email, password}
    """
    data = request.get_json(silent=True) or {}
    nome     = (data.get('nome') or '').strip()
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    # Validações básicas
    errors = []
    if not nome or len(nome) < 2:
        errors.append('Nome deve ter pelo menos 2 caracteres.')
    if not email or not re.match(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$', email):
        errors.append('Email inválido.')
    if not password or len(password) < 8:
        errors.append('Password deve ter pelo menos 8 caracteres.')
    elif not re.search(r'[A-Za-z]', password) or not re.search(r'[0-9]', password):
        errors.append('Password deve conter letras e números.')

    if errors:
        return jsonify({'error': errors[0]}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Este email já está registado.'}), 409

    user = User(nome=nome, email=email, onboarding_completo=False)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    logger.info(f'Novo utilizador (mobile) — user_id={user.id}')

    return jsonify({
        'access_token': access_token,
        'user': _user_to_dict(user),
    }), 201


@api_bp.route('/auth/me', methods=['GET'])
@jwt_required()
def me():
    """Retorna os dados do utilizador autenticado."""
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    return jsonify({'user': _user_to_dict(user)})


@api_bp.route('/auth/me', methods=['PATCH'])
@jwt_required()
def update_me():
    """
    Atualiza perfil do utilizador.
    Body JSON: {nome?, orcamento_mensal?, personalidade?, notificacoes_email?}
    """
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    PERSONALIDADES_VALIDAS = {'calm', 'pro', 'savage', 'sarcastic'}

    if 'nome' in data and data['nome']:
        user.nome = data['nome'].strip()[:100]
    if 'orcamento_mensal' in data:
        try:
            user.orcamento_mensal = max(0, float(data['orcamento_mensal']))
        except (ValueError, TypeError):
            pass
    if 'personalidade' in data and data['personalidade'] in PERSONALIDADES_VALIDAS:
        user.personalidade = data['personalidade']
    if 'notificacoes_email' in data:
        user.notificacoes_email = bool(data['notificacoes_email'])

    db.session.commit()
    return jsonify({'user': _user_to_dict(user)})

"""
app/api/auth.py — Endpoints de autenticação para o mobile

POST  /api/v1/auth/login         → {access_token, user}
POST  /api/v1/auth/register      → {access_token, user}
GET   /api/v1/auth/me            → {user}
PATCH /api/v1/auth/me            → atualiza perfil (nome, orcamento, personalidade, ...)
POST  /api/v1/auth/avatar        → faz upload de foto de perfil (base64)
"""

import logging
import re
import base64
import os
from flask import request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity,
)
from app.api import api_bp
from app.models import User
from app import db

logger = logging.getLogger(__name__)


def _user_to_dict(user):
    return {
        'id':                  user.id,
        'nome':                user.nome,
        'email':               user.email,
        'avatar_url':          user.avatar_url or None,
        'orcamento_mensal':    user.orcamento_mensal or 0,
        'personalidade':       getattr(user, 'personalidade', 'calm') or 'calm',
        'notificacoes_email':  getattr(user, 'notificacoes_email', False),
        'onboarding_completo': getattr(user, 'onboarding_completo', False),
        'streak_dias':         getattr(user, 'streak_dias', 0) or 0,
    }


@api_bp.route('/auth/login', methods=['POST'])
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email e password são obrigatórios.'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Credenciais inválidas.'}), 401

    access_token = create_access_token(identity=str(user.id))
    return jsonify({'access_token': access_token, 'user': _user_to_dict(user)})


@api_bp.route('/auth/register', methods=['POST'])
def register():
    data     = request.get_json(silent=True) or {}
    nome     = (data.get('nome') or '').strip()
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

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
    return jsonify({'access_token': access_token, 'user': _user_to_dict(user)}), 201


@api_bp.route('/auth/me', methods=['GET'])
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    return jsonify({'user': _user_to_dict(user)})


@api_bp.route('/auth/me', methods=['PATCH'])
@jwt_required()
def update_me():
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


@api_bp.route('/auth/avatar', methods=['POST'])
@jwt_required()
def upload_avatar():
    """
    Recebe avatar em base64.
    Body JSON: { image_base64: "data:image/jpeg;base64,..." }
    Guarda no campo avatar_url (URL de dados ou caminho de ficheiro).
    """
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    image_b64 = data.get('image_base64', '')
    if not image_b64:
        return jsonify({'error': 'Imagem não fornecida.'}), 400

    # Valida formato
    if not image_b64.startswith('data:image/'):
        return jsonify({'error': 'Formato de imagem inválido. Usa data URI.'}), 400

    # Limita a 2MB em base64 (~1.5MB real)
    if len(image_b64) > 2_800_000:
        return jsonify({'error': 'Imagem demasiado grande. Máximo ~2MB.'}), 400

    # Guarda: tenta salvar em disco, fallback para data URI no campo
    try:
        avatars_dir = os.path.join(current_app.static_folder, 'avatars')
        os.makedirs(avatars_dir, exist_ok=True)

        # Extrai bytes
        header, b64data = image_b64.split(',', 1)
        ext = 'jpg' if 'jpeg' in header else ('png' if 'png' in header else 'jpg')
        img_bytes = base64.b64decode(b64data)

        filename = f'avatar_{user_id}.{ext}'
        filepath = os.path.join(avatars_dir, filename)
        with open(filepath, 'wb') as f:
            f.write(img_bytes)

        # URL relativa acessível via /static/avatars/
        user.avatar_url = f'/static/avatars/{filename}'
    except Exception as e:
        logger.warning(f'Avatar disk save failed, storing data URI: {e}')
        # Fallback: guarda data URI diretamente (funciona mas é grande)
        user.avatar_url = image_b64[:512000]  # limita

    db.session.commit()
    return jsonify({'success': True, 'avatar_url': user.avatar_url})

@api_bp.route('/auth/onboarding', methods=['POST'])
@jwt_required()
def complete_onboarding():
    """Marca o onboarding como completo e guarda a personalidade escolhida."""
    from app.models import User
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilizador não encontrado.'}), 404

    data = request.get_json(silent=True) or {}
    personalidade = data.get('personalidade', 'calm')
    if personalidade not in ('savage', 'sarcastic', 'calm', 'pro'):
        personalidade = 'calm'

    user.onboarding_completo = True
    user.personalidade = personalidade
    db.session.commit()

    return jsonify({'success': True})
"""
app/api/auth.py — Endpoints de autenticação para o mobile

POST  /api/v1/auth/login              → {access_token, user}
POST  /api/v1/auth/register           → {message} (envia email de confirmação)
POST  /api/v1/auth/confirm/<token>    → {access_token, user}
POST  /api/v1/auth/resend-confirm     → reenvia email de confirmação
GET   /api/v1/auth/me                 → {user}
PATCH /api/v1/auth/me                 → atualiza perfil
POST  /api/v1/auth/avatar             → upload de foto de perfil
POST  /api/v1/auth/onboarding         → marca onboarding como completo
POST  /api/v1/auth/firebase           → login com Google/Apple via Firebase
"""

import logging
import re
import base64
import os
import secrets
from datetime import datetime, timedelta
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
        'email_confirmado':    getattr(user, 'email_confirmado', False),
    }


def _enviar_email_confirmacao(user):
    """Envia email de confirmação via Resend."""
    try:
        import resend
        resend.api_key = os.getenv('RESEND_API_KEY', '')
        if not resend.api_key:
            logger.warning('RESEND_API_KEY não definida — email de confirmação não enviado.')
            return False

        app_url    = os.getenv('APP_URL', 'https://verly.app')
        from_email = os.getenv('EMAIL_FROM', 'Verly <noreply@verly.app>')
        confirm_url = f"{app_url}/api/v1/auth/confirm-web/{user.email_confirm_token}"

        html = f"""
        <div style="font-family:'Outfit',sans-serif;max-width:480px;margin:0 auto;background:#080810;color:#EEEEF8;border-radius:16px;padding:40px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="width:52px;height:52px;background:#7C6FE0;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;margin-bottom:16px;">V</div>
            <h1 style="font-size:22px;font-weight:700;margin:0;color:#EEEEF8;">Confirma o teu email</h1>
            <p style="color:#8888B0;margin-top:8px;">Olá {user.nome}! Só mais um passo.</p>
          </div>
          <p style="color:#EEEEF8;line-height:1.6;">Para ativares a tua conta Verly, clica no botão abaixo:</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="{confirm_url}" style="background:#7C6FE0;color:#fff;padding:14px 32px;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none;display:inline-block;">
              Confirmar Email
            </a>
          </div>
          <p style="color:#8888B0;font-size:13px;">Este link expira em 24 horas. Se não criaste uma conta, ignora este email.</p>
        </div>
        """

        resend.Emails.send({
            'from':    from_email,
            'to':      [user.email],
            'subject': 'Confirma o teu email — Verly',
            'html':    html,
        })
        return True
    except Exception as e:
        logger.error(f'Erro ao enviar email de confirmação: {e}')
        return False


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

    if not getattr(user, 'email_confirmado', True):
        return jsonify({
            'error': 'Confirma o teu email antes de entrar.',
            'code':  'EMAIL_NOT_CONFIRMED',
        }), 403

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

    token = secrets.token_urlsafe(32)
    user = User(
        nome=nome,
        email=email,
        onboarding_completo=False,
        email_confirmado=False,
        email_confirm_token=token,
        email_confirm_expiry=datetime.utcnow() + timedelta(hours=24),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    _enviar_email_confirmacao(user)

    return jsonify({
        'message': 'Conta criada! Verifica o teu email para confirmar.',
        'email':   email,
    }), 201


@api_bp.route('/auth/confirm/<token>', methods=['POST'])
def confirm_email(token):
    """Confirma o email via token (chamado pela app após deep link)."""
    user = User.query.filter_by(email_confirm_token=token).first()

    if not user:
        return jsonify({'error': 'Token inválido.'}), 400

    if user.email_confirm_expiry and datetime.utcnow() > user.email_confirm_expiry:
        return jsonify({'error': 'Link expirado.', 'code': 'TOKEN_EXPIRED'}), 400

    user.email_confirmado     = True
    user.email_confirm_token  = None
    user.email_confirm_expiry = None
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    return jsonify({'access_token': access_token, 'user': _user_to_dict(user)})


@api_bp.route('/auth/confirm-web/<token>', methods=['GET'])
def confirm_email_web(token):
    """Confirma o email via link no browser — redireciona para a app."""
    user = User.query.filter_by(email_confirm_token=token).first()

    if not user:
        return '<h2 style="font-family:sans-serif;text-align:center;padding:40px">Link inválido ou já utilizado.</h2>', 400

    if user.email_confirm_expiry and datetime.utcnow() > user.email_confirm_expiry:
        return '<h2 style="font-family:sans-serif;text-align:center;padding:40px">Link expirado. Abre a app e pede um novo email.</h2>', 400

    user.email_confirmado     = True
    user.email_confirm_token  = None
    user.email_confirm_expiry = None
    db.session.commit()

    deep_link = f"verly://confirm/{token}"
    return f"""
    <html>
    <head><meta http-equiv="refresh" content="1;url={deep_link}"></head>
    <body style="font-family:sans-serif;text-align:center;padding:40px;background:#080810;color:#EEEEF8;">
      <div style="font-size:48px;margin-bottom:16px;">✅</div>
      <h2>Email confirmado!</h2>
      <p style="color:#8888B0;">A abrir a app Verly...</p>
      <a href="{deep_link}" style="color:#7C6FE0;">Clica aqui se não abrir automaticamente</a>
    </body>
    </html>
    """


@api_bp.route('/auth/resend-confirm', methods=['POST'])
def resend_confirm():
    """Reenvia email de confirmação."""
    data  = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'message': 'Se o email existir, receberás um novo link.'}), 200

    if getattr(user, 'email_confirmado', True):
        return jsonify({'message': 'Este email já está confirmado.'}), 200

    user.email_confirm_token  = secrets.token_urlsafe(32)
    user.email_confirm_expiry = datetime.utcnow() + timedelta(hours=24)
    db.session.commit()

    _enviar_email_confirmacao(user)
    return jsonify({'message': 'Email de confirmação reenviado!'}), 200


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
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    image_b64 = data.get('image_base64', '')
    if not image_b64:
        return jsonify({'error': 'Imagem não fornecida.'}), 400

    if not image_b64.startswith('data:image/'):
        return jsonify({'error': 'Formato de imagem inválido. Usa data URI.'}), 400

    if len(image_b64) > 2_800_000:
        return jsonify({'error': 'Imagem demasiado grande. Máximo ~2MB.'}), 400

    try:
        avatars_dir = os.path.join(current_app.static_folder, 'avatars')
        os.makedirs(avatars_dir, exist_ok=True)

        header, b64data = image_b64.split(',', 1)
        ext = 'jpg' if 'jpeg' in header else ('png' if 'png' in header else 'jpg')
        img_bytes = base64.b64decode(b64data)

        filename = f'avatar_{user_id}.{ext}'
        filepath = os.path.join(avatars_dir, filename)
        with open(filepath, 'wb') as f:
            f.write(img_bytes)

        user.avatar_url = f'/static/avatars/{filename}'
    except Exception as e:
        logger.warning(f'Avatar disk save failed: {e}')
        user.avatar_url = image_b64[:512000]

    db.session.commit()
    return jsonify({'success': True, 'avatar_url': user.avatar_url})


@api_bp.route('/auth/onboarding', methods=['POST'])
@jwt_required()
def complete_onboarding():
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


@api_bp.route('/auth/firebase', methods=['POST'])
def firebase_login():
    """Login com Google/Apple via Firebase — email confirmado pelo Google."""
    data     = request.get_json(silent=True) or {}
    id_token = data.get('idToken', '').strip()

    if not id_token:
        return jsonify({'error': 'idToken é obrigatório.'}), 400

    try:
        from firebase_admin import auth as firebase_auth
        decoded = firebase_auth.verify_id_token(id_token)
    except Exception as e:
        logger.warning(f'Firebase token inválido: {e}')
        return jsonify({'error': 'Token Firebase inválido ou expirado.'}), 401

    uid   = decoded.get('uid', '')
    email = decoded.get('email', '').lower().strip()
    nome  = decoded.get('name') or (email.split('@')[0] if email else 'Utilizador')
    foto  = decoded.get('picture', '')

    user = None
    if uid:
        user = User.query.filter_by(google_id=uid).first()
    if not user and email:
        user = User.query.filter_by(email=email).first()

    if not user:
        user = User(
            nome=nome[:100],
            email=email,
            google_id=uid,
            password_hash='',
            onboarding_completo=False,
            avatar_url=foto or None,
            email_confirmado=True,
        )
        db.session.add(user)
        db.session.flush()
    else:
        if uid and not user.google_id:
            user.google_id = uid
        if foto and not user.avatar_url:
            user.avatar_url = foto
        user.email_confirmado = True

    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    return jsonify({'access_token': access_token, 'user': _user_to_dict(user)})

# ── Adicionar no final de app/api/auth.py ─────────────────────────────────────

@api_bp.route('/auth/account', methods=['DELETE'])
@jwt_required()
def delete_account():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': 'Utilizador não encontrado.'}), 404

    try:
        db.session.delete(user)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Conta apagada com sucesso.'})
    except Exception as e:
        db.session.rollback()
        logger.error(f'Erro ao apagar conta {user_id}: {e}')
        return jsonify({'success': False, 'message': 'Erro ao apagar conta.'}), 500

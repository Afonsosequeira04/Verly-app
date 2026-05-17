"""
app/api/push_notifications.py — Push notifications FCM reais via Firebase Admin SDK

POST /api/v1/push/token      → guarda o FCM token do dispositivo
DELETE /api/v1/push/token    → remove o token
POST /api/v1/push/test       → envia push de teste ao próprio utilizador

Cron (enviar_alertas_push.py) → envia alertas diários a todos os utilizadores
"""

import logging
import os
from datetime import datetime

from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api import api_bp
from app.models import User
from app import db

logger = logging.getLogger(__name__)


def _get_firebase_app():
    """Inicializa o Firebase Admin SDK (singleton)."""
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
        if not firebase_admin._apps:
            cred_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                'firebase-service-account.json',
            )
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        return firebase_admin.get_app(), messaging
    except Exception as e:
        logger.error(f'Firebase init error: {e}')
        return None, None


def enviar_push(fcm_token: str, titulo: str, corpo: str, data: dict = None) -> bool:
    """
    Envia uma push notification FCM.
    Devolve True se enviada com sucesso, False caso contrário.
    """
    _, messaging = _get_firebase_app()
    if not messaging:
        logger.warning('Firebase messaging não disponível — push não enviada.')
        return False

    try:
        msg = messaging.Message(
            notification=messaging.Notification(title=titulo, body=corpo),
            data={k: str(v) for k, v in (data or {}).items()},
            token=fcm_token,
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    icon='ic_notification',
                    color='#7C6FE0',
                    channel_id='verly_alertas',
                ),
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        badge=1,
                        sound='default',
                        content_available=True,
                    ),
                ),
            ),
        )
        response = messaging.send(msg)
        logger.info(f'Push enviada: {response}')
        return True
    except Exception as e:
        logger.error(f'Erro ao enviar push: {e}')
        return False


def enviar_push_multiplos(tokens: list, titulo: str, corpo: str, data: dict = None) -> dict:
    """
    Envia push a múltiplos tokens de uma vez (multicast).
    Devolve {'success': N, 'failure': M}.
    """
    if not tokens:
        return {'success': 0, 'failure': 0}

    _, messaging = _get_firebase_app()
    if not messaging:
        return {'success': 0, 'failure': len(tokens)}

    try:
        msg = messaging.MulticastMessage(
            notification=messaging.Notification(title=titulo, body=corpo),
            data={k: str(v) for k, v in (data or {}).items()},
            tokens=tokens,
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    icon='ic_notification',
                    color='#7C6FE0',
                    channel_id='verly_alertas',
                ),
            ),
        )
        response = messaging.send_each_for_multicast(msg)
        return {
            'success': response.success_count,
            'failure': response.failure_count,
        }
    except Exception as e:
        logger.error(f'Erro multicast push: {e}')
        return {'success': 0, 'failure': len(tokens)}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@api_bp.route('/push/token', methods=['POST'])
@jwt_required()
def guardar_fcm_token():
    """Guarda ou atualiza o FCM token do dispositivo do utilizador."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False}), 404

    data = request.get_json() or {}
    token = data.get('fcm_token', '').strip()

    if not token:
        return jsonify({'success': False, 'message': 'Token em falta.'}), 400

    # Guarda no campo fcm_token do User (adicionar migration se necessário)
    if hasattr(user, 'fcm_token'):
        user.fcm_token = token
        user.fcm_token_updated = datetime.utcnow()
        db.session.commit()
    else:
        # Fallback: guarda em memória/log se ainda não há coluna
        logger.info(f'FCM token para user {user_id}: {token[:20]}...')

    return jsonify({'success': True})


@api_bp.route('/push/token', methods=['DELETE'])
@jwt_required()
def remover_fcm_token():
    """Remove o FCM token do utilizador (logout / desativar notificações)."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False}), 404

    if hasattr(user, 'fcm_token'):
        user.fcm_token = None
        db.session.commit()

    return jsonify({'success': True})


@api_pb.route('/push/test', methods=['POST'])
@jwt_required()
def push_teste():
    """Envia uma push de teste ao próprio utilizador."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False}), 404

    token = getattr(user, 'fcm_token', None)
    if not token:
        return jsonify({
            'success': False,
            'message': 'Sem FCM token registado. Abre a app primeiro.',
        }), 400

    nome = (user.nome or '').split()[0] or 'utilizador'
    ok = enviar_push(
        token,
        titulo='👋 Olá da Verly!',
        corpo=f'As tuas notificações estão ativas, {nome}. Vais receber alertas de garantias, orçamento e muito mais.',
        data={'tipo': 'teste'},
    )

    return jsonify({'success': ok})
"""
app/api/chat.py — Chat para o mobile
POST /api/v1/chat/mensagem  → envia mensagem e recebe resposta da IA
GET  /api/v1/chat/historico → histórico da conversa
POST /api/v1/chat/limpar    → limpa histórico
"""
import logging
from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Conversa, User
from app import db

logger = logging.getLogger(__name__)


@api_bp.route('/chat/mensagem', methods=['POST'])
@jwt_required()
def chat_mensagem():
    from app.ai import get_user_paths, rebuild_index, ask_question
    user_id = int(get_jwt_identity())
    user    = User.query.get_or_404(user_id)

    data    = request.get_json(silent=True) or {}
    mensagem = (data.get('mensagem') or '').strip()[:2000]

    if not mensagem:
        return jsonify({'error': 'Mensagem vazia.'}), 400

    data_dir, storage_dir = get_user_paths(
        current_app.config['UPLOAD_FOLDER'],
        current_app.config['STORAGE_FOLDER'],
        user_id
    )

    try:
        index    = rebuild_index(data_dir, storage_dir)
        resposta = ask_question(
            index, mensagem, user_id,
            personalidade=getattr(user, 'personalidade', 'calm')
        )
    except Exception as e:
        logger.error(f'Erro no chat API: {e}')
        return jsonify({'error': 'Erro ao processar a mensagem.'}), 500

    # Guardar conversa
    conversa = Conversa(user_id=user_id, pergunta=mensagem, resposta=resposta)
    db.session.add(conversa)
    db.session.commit()

    return jsonify({'resposta': resposta, 'id': conversa.id})


@api_bp.route('/chat/historico', methods=['GET'])
@jwt_required()
def chat_historico():
    user_id = int(get_jwt_identity())
    limite  = min(int(request.args.get('limite', 20)), 50)
    conversas = (Conversa.query
                 .filter_by(user_id=user_id)
                 .order_by(Conversa.timestamp.desc())
                 .limit(limite).all())
    return jsonify({'historico': [
        {
            'id':        c.id,
            'pergunta':  c.pergunta,
            'resposta':  c.resposta,
            'timestamp': c.timestamp.isoformat() if c.timestamp else None,
        }
        for c in reversed(conversas)
    ]})


@api_bp.route('/chat/limpar', methods=['POST'])
@jwt_required()
def chat_limpar():
    user_id = int(get_jwt_identity())
    Conversa.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────────────────────────────────────
"""
app/api/subscricoes.py — Subscrições para o mobile
GET /api/v1/subscricoes → lista de subscrições detectadas
"""
from app.subscriptions import detect_subscriptions


@api_bp.route('/subscricoes', methods=['GET'])
@jwt_required()
def subscricoes():
    user_id = int(get_jwt_identity())
    data    = detect_subscriptions(user_id)
    return jsonify(data)


# ─────────────────────────────────────────────────────────────────────────────
"""
app/api/metas.py — Metas financeiras para o mobile
GET  /api/v1/metas           → lista de metas
POST /api/v1/metas           → criar meta
DELETE /api/v1/metas/<id>    → apagar meta
"""
from app.models import Meta


@api_bp.route('/metas', methods=['GET'])
@jwt_required()
def listar_metas():
    user_id = int(get_jwt_identity())
    metas   = Meta.query.filter_by(user_id=user_id).all()
    return jsonify({'metas': [
        {
            'id':        m.id,
            'nome':      m.nome,
            'limite':    m.limite,
            'categoria': m.categoria,
        }
        for m in metas
    ]})


@api_bp.route('/metas', methods=['POST'])
@jwt_required()
def criar_meta():
    user_id = int(get_jwt_identity())
    data    = request.get_json(silent=True) or {}
    nome    = (data.get('nome') or '').strip()[:100]
    limite  = data.get('limite')
    categoria = (data.get('categoria') or 'Outros').strip()

    if not nome or limite is None:
        return jsonify({'error': 'Nome e limite são obrigatórios.'}), 400

    try:
        limite = float(limite)
    except (ValueError, TypeError):
        return jsonify({'error': 'Limite inválido.'}), 400

    meta = Meta(user_id=user_id, nome=nome, limite=limite, categoria=categoria)
    db.session.add(meta)
    db.session.commit()
    return jsonify({'id': meta.id, 'nome': meta.nome, 'limite': meta.limite}), 201


@api_bp.route('/metas/<int:meta_id>', methods=['DELETE'])
@jwt_required()
def apagar_meta(meta_id):
    user_id = int(get_jwt_identity())
    meta    = Meta.query.filter_by(id=meta_id, user_id=user_id).first_or_404()
    db.session.delete(meta)
    db.session.commit()
    return jsonify({'success': True})

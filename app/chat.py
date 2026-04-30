from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from app import db
from app.models import Conversa, User
from app.ai import get_user_paths, get_index, chat_with_index

chat_bp = Blueprint('chat', __name__)


def get_personalidade():
    """Lê a personalidade directamente da BD — nunca usa cache."""
    user = User.query.get(current_user.id)
    return (user.personalidade or 'calm') if user else 'calm'


@chat_bp.route('/chat')
@login_required
def chat():
    conversas = Conversa.query.filter_by(user_id=current_user.id).order_by(Conversa.timestamp.asc()).all()
    personalidade = get_personalidade()
    return render_template('chat.html', conversas=conversas, personalidade=personalidade)


@chat_bp.route('/chat/send', methods=['POST'])
@login_required
def send():
    user_msg = request.json.get('message', '').strip()
    if not user_msg:
        return jsonify({'response': 'Mensagem vazia.'})

    data_dir, storage_dir = get_user_paths(
        current_app.config['UPLOAD_FOLDER'],
        current_app.config['STORAGE_FOLDER'],
        current_user.id
    )

    index = get_index(data_dir, storage_dir)
    if index is None:
        return jsonify({'response': 'Ainda não tens faturas carregadas. Vai a Faturas e faz upload primeiro.'})

    # Lê sempre da BD — garante que usa a personalidade mais recente
    personalidade = get_personalidade()

    try:
        resposta = chat_with_index(index, user_msg, personalidade)
        conversa = Conversa(user_id=current_user.id, pergunta=user_msg, resposta=resposta)
        db.session.add(conversa)
        db.session.commit()
        return jsonify({'response': resposta})
    except Exception as e:
        return jsonify({'response': f'Erro interno: {str(e)}'})


@chat_bp.route('/chat/clear', methods=['POST'])
@login_required
def clear_chat():
    Conversa.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    return jsonify({'success': True})
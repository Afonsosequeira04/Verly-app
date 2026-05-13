"""
app/api/amizades.py — Sistema de conexões entre utilizadores

GET  /api/v1/amigos                → lista amigos aceites
POST /api/v1/amigos/pedido         → envia pedido de amizade {email}
POST /api/v1/amigos/<id>/aceitar   → aceita pedido
POST /api/v1/amigos/<id>/rejeitar  → rejeita/remove
GET  /api/v1/amigos/pedidos        → pedidos pendentes recebidos
GET  /api/v1/utilizadores/buscar   → pesquisa utilizadores por email ou nome
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import User, Amizade
from app import db


def _user_pub(u):
    return {
        'id':    u.id,
        'nome':  u.nome,
        'email': u.email,
        'avatar_url': u.avatar_url,
    }


@api_bp.route('/amigos', methods=['GET'])
@jwt_required()
def listar_amigos():
    user_id = int(get_jwt_identity())
    amizades = Amizade.query.filter(
        db.or_(
            db.and_(Amizade.de_user_id == user_id, Amizade.estado == 'aceite'),
            db.and_(Amizade.para_user_id == user_id, Amizade.estado == 'aceite'),
        )
    ).all()

    amigos = []
    for a in amizades:
        outro_id = a.para_user_id if a.de_user_id == user_id else a.de_user_id
        outro = User.query.get(outro_id)
        if outro:
            amigos.append({**_user_pub(outro), 'amizade_id': a.id})

    return jsonify({'amigos': amigos})


@api_bp.route('/amigos/pedidos', methods=['GET'])
@jwt_required()
def pedidos_pendentes():
    user_id = int(get_jwt_identity())
    pedidos = Amizade.query.filter_by(para_user_id=user_id, estado='pendente').all()
    result = []
    for p in pedidos:
        remetente = User.query.get(p.de_user_id)
        if remetente:
            result.append({**_user_pub(remetente), 'pedido_id': p.id})
    return jsonify({'pedidos': result})


@api_bp.route('/amigos/pedido', methods=['POST'])
@jwt_required()
def enviar_pedido():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    if not email:
        return jsonify({'error': 'Email obrigatório.'}), 400

    destino = User.query.filter_by(email=email).first()
    if not destino:
        return jsonify({'error': 'Utilizador não encontrado.'}), 404
    if destino.id == user_id:
        return jsonify({'error': 'Não te podes adicionar a ti próprio.'}), 400

    # Verifica se já existe pedido ou amizade
    existe = Amizade.query.filter(
        db.or_(
            db.and_(Amizade.de_user_id == user_id,    Amizade.para_user_id == destino.id),
            db.and_(Amizade.de_user_id == destino.id, Amizade.para_user_id == user_id),
        )
    ).first()

    if existe:
        if existe.estado == 'aceite':
            return jsonify({'error': 'Já são amigos.'}), 400
        if existe.estado == 'pendente':
            return jsonify({'error': 'Pedido já enviado.'}), 400

    a = Amizade(de_user_id=user_id, para_user_id=destino.id, estado='pendente')
    db.session.add(a)
    db.session.commit()
    return jsonify({'success': True, 'pedido_id': a.id}), 201


@api_bp.route('/amigos/<int:pedido_id>/aceitar', methods=['POST'])
@jwt_required()
def aceitar_pedido(pedido_id):
    user_id = int(get_jwt_identity())
    a = Amizade.query.filter_by(id=pedido_id, para_user_id=user_id, estado='pendente').first_or_404()
    a.estado = 'aceite'
    db.session.commit()
    remetente = User.query.get(a.de_user_id)
    return jsonify({'success': True, 'amigo': _user_pub(remetente) if remetente else None})


@api_bp.route('/amigos/<int:amizade_id>/rejeitar', methods=['POST'])
@jwt_required()
def rejeitar_ou_remover(amizade_id):
    user_id = int(get_jwt_identity())
    a = Amizade.query.filter(
        Amizade.id == amizade_id,
        db.or_(Amizade.de_user_id == user_id, Amizade.para_user_id == user_id)
    ).first_or_404()
    db.session.delete(a)
    db.session.commit()
    return jsonify({'success': True})


@api_bp.route('/utilizadores/buscar', methods=['GET'])
@jwt_required()
def buscar_utilizadores():
    user_id = int(get_jwt_identity())
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return jsonify({'utilizadores': []})

    users = User.query.filter(
        User.id != user_id,
        db.or_(
            User.nome.ilike(f'%{q}%'),
            User.email.ilike(f'%{q}%'),
        )
    ).limit(10).all()

    return jsonify({'utilizadores': [_user_pub(u) for u in users]})
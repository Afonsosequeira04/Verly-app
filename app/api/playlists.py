"""
app/api/playlists.py — Playlists de faturas ("Criar Em")

GET    /api/v1/playlists              → lista as playlists do utilizador
POST   /api/v1/playlists              → cria uma nova playlist
GET    /api/v1/playlists/<id>         → detalhe de uma playlist
PATCH  /api/v1/playlists/<id>         → edita nome/descrição/cor
DELETE /api/v1/playlists/<id>         → apaga playlist
POST   /api/v1/playlists/<id>/faturas → adiciona faturas à playlist
DELETE /api/v1/playlists/<id>/faturas/<fatura_id> → remove fatura

--- Colaboração ---
POST   /api/v1/playlists/<id>/partilhar    → gera código de partilha
POST   /api/v1/playlists/juntar/<codigo>   → junta-se a uma playlist
GET    /api/v1/playlists/<id>/membros      → lista membros
DELETE /api/v1/playlists/<id>/sair         → sai da playlist colaborativa
"""

import secrets
import json
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Fatura, Playlist, User, playlist_fatura, playlist_membro
from app import db


# ── Helpers ────────────────────────────────────────────────────────────────────

def _can_access(playlist, user_id):
    """Verifica se o utilizador tem acesso à playlist (dono ou membro)."""
    if playlist.owner_id == user_id:
        return True
    return db.session.query(playlist_membro).filter_by(
        playlist_id=playlist.id, user_id=user_id
    ).first() is not None


def _playlist_to_dict(pl, user_id, include_faturas=False, include_membros=False):
    d = {
        'id':          pl.id,
        'nome':        pl.nome,
        'descricao':   pl.descricao or '',
        'cor':         pl.cor,
        'icone':       pl.icone,
        'owner_id':    pl.owner_id,
        'codigo':      pl.codigo,
        'colaborativa': pl.colaborativa,
        'criado_em':   pl.criado_em.isoformat() if pl.criado_em else None,
        'is_owner':    pl.owner_id == user_id,
        'num_faturas': pl.faturas.count(),
    }

    if include_faturas:
        faturas_list = []
        for f in pl.faturas.all():
            try:
                items = json.loads(f.items) if f.items else []
            except Exception:
                items = []
            faturas_list.append({
                'id':         f.id,
                'loja':       f.loja or 'Desconhecida',
                'total':      f.total or 0,
                'categoria':  f.categoria or 'Outros',
                'data_compra': f.data_compra or '',
                'items':      items,
            })
        d['faturas'] = faturas_list
        d['total'] = sum(f['total'] for f in faturas_list)

    if include_membros:
        membros_list = []
        rows = db.session.execute(
            db.text("""
                SELECT pm.user_id, pm.papel, u.nome, u.email
                FROM playlist_membro pm
                JOIN users u ON u.id = pm.user_id
                WHERE pm.playlist_id = :pid
            """),
            {'pid': pl.id}
        ).fetchall()
        for row in rows:
            membros_list.append({
                'user_id': row[0],
                'papel':   row[1],
                'nome':    row[2],
                'email':   row[3],
            })
        d['membros'] = membros_list

    return d


# ── Endpoints ──────────────────────────────────────────────────────────────────

@api_bp.route('/playlists', methods=['GET'])
@jwt_required()
def listar_playlists():
    user_id = int(get_jwt_identity())

    proprias = Playlist.query.filter_by(owner_id=user_id).order_by(Playlist.criado_em.desc()).all()

    colab_ids = db.session.execute(
        db.text("SELECT playlist_id FROM playlist_membro WHERE user_id = :uid"),
        {'uid': user_id}
    ).fetchall()
    colab_ids = [r[0] for r in colab_ids]
    colaborativas = Playlist.query.filter(Playlist.id.in_(colab_ids)).all() if colab_ids else []

    seen = set()
    result = []
    for pl in proprias + colaborativas:
        if pl.id in seen:
            continue
        seen.add(pl.id)
        result.append(_playlist_to_dict(pl, user_id))

    return jsonify({'playlists': result})


@api_bp.route('/playlists', methods=['POST'])
@jwt_required()
def criar_playlist():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    nome      = (data.get('nome') or '').strip()
    descricao = (data.get('descricao') or '').strip()
    cor       = data.get('cor', '#6C5CE7')
    icone     = data.get('icone', 'list')

    if not nome:
        return jsonify({'error': 'Nome obrigatório.'}), 400

    pl = Playlist(nome=nome, descricao=descricao, cor=cor, icone=icone, owner_id=user_id)
    db.session.add(pl)
    db.session.commit()

    return jsonify({'success': True, 'playlist': _playlist_to_dict(pl, user_id, include_faturas=True, include_membros=True)}), 201


@api_bp.route('/playlists/<int:playlist_id>', methods=['GET'])
@jwt_required()
def detalhe_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    pl = Playlist.query.get_or_404(playlist_id)
    if not _can_access(pl, user_id):
        return jsonify({'error': 'Sem acesso.'}), 403
    return jsonify(_playlist_to_dict(pl, user_id, include_faturas=True, include_membros=True))


@api_bp.route('/playlists/<int:playlist_id>', methods=['PATCH'])
@jwt_required()
def editar_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    pl = Playlist.query.filter_by(id=playlist_id, owner_id=user_id).first_or_404()
    data = request.get_json(silent=True) or {}

    for field in ['nome', 'descricao', 'cor', 'icone']:
        if field in data:
            setattr(pl, field, data[field])
    db.session.commit()
    return jsonify({'success': True, 'playlist': _playlist_to_dict(pl, user_id)})


@api_bp.route('/playlists/<int:playlist_id>', methods=['DELETE'])
@jwt_required()
def apagar_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    pl = Playlist.query.filter_by(id=playlist_id, owner_id=user_id).first_or_404()
    db.session.delete(pl)
    db.session.commit()
    return jsonify({'success': True})


@api_bp.route('/playlists/<int:playlist_id>/faturas', methods=['POST'])
@jwt_required()
def adicionar_fatura_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    pl = Playlist.query.get_or_404(playlist_id)
    if not _can_access(pl, user_id):
        return jsonify({'error': 'Sem acesso.'}), 403

    data = request.get_json(silent=True) or {}
    fatura_ids = data.get('fatura_ids', [])
    if isinstance(fatura_ids, int):
        fatura_ids = [fatura_ids]

    adicionadas = 0
    for fid in fatura_ids:
        fatura = Fatura.query.filter_by(id=fid, user_id=user_id).first()
        if not fatura:
            continue
        if fatura not in pl.faturas.all():
            pl.faturas.append(fatura)
            adicionadas += 1

    db.session.commit()
    return jsonify({'success': True, 'adicionadas': adicionadas})


@api_bp.route('/playlists/<int:playlist_id>/faturas/<int:fatura_id>', methods=['DELETE'])
@jwt_required()
def remover_fatura_playlist(playlist_id, fatura_id):
    user_id = int(get_jwt_identity())
    pl = Playlist.query.get_or_404(playlist_id)
    if not _can_access(pl, user_id):
        return jsonify({'error': 'Sem acesso.'}), 403

    fatura = Fatura.query.get(fatura_id)
    if fatura and fatura in pl.faturas.all():
        pl.faturas.remove(fatura)
        db.session.commit()
    return jsonify({'success': True})


# ── Colaboração ────────────────────────────────────────────────────────────────

@api_bp.route('/playlists/<int:playlist_id>/partilhar', methods=['POST'])
@jwt_required()
def partilhar_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    pl = Playlist.query.filter_by(id=playlist_id, owner_id=user_id).first_or_404()

    if not pl.codigo:
        pl.codigo = secrets.token_urlsafe(6).upper()
        pl.colaborativa = True
        db.session.commit()

    return jsonify({'codigo': pl.codigo, 'playlist_id': pl.id})


@api_bp.route('/playlists/juntar/<string:codigo>', methods=['POST'])
@jwt_required()
def juntar_playlist(codigo):
    user_id = int(get_jwt_identity())
    pl = Playlist.query.filter_by(codigo=codigo.upper()).first()
    if not pl:
        return jsonify({'error': 'Código inválido ou playlist não encontrada.'}), 404
    if pl.owner_id == user_id:
        return jsonify({'error': 'Já és o criador desta playlist.'}), 400

    already = db.session.execute(
        db.text("SELECT 1 FROM playlist_membro WHERE playlist_id=:pid AND user_id=:uid"),
        {'pid': pl.id, 'uid': user_id}
    ).fetchone()
    if not already:
        db.session.execute(
            db.text("INSERT INTO playlist_membro (playlist_id, user_id, papel) VALUES (:pid, :uid, 'editor')"),
            {'pid': pl.id, 'uid': user_id}
        )
        db.session.commit()

    return jsonify({'success': True, 'playlist': _playlist_to_dict(pl, user_id)})


@api_bp.route('/playlists/<int:playlist_id>/membros', methods=['GET'])
@jwt_required()
def membros_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    pl = Playlist.query.get_or_404(playlist_id)
    if not _can_access(pl, user_id):
        return jsonify({'error': 'Sem acesso.'}), 403
    detail = _playlist_to_dict(pl, user_id, include_membros=True)
    return jsonify({'membros': detail.get('membros', [])})


@api_bp.route('/playlists/<int:playlist_id>/sair', methods=['DELETE'])
@jwt_required()
def sair_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    db.session.execute(
        db.text("DELETE FROM playlist_membro WHERE playlist_id=:pid AND user_id=:uid"),
        {'pid': playlist_id, 'uid': user_id}
    )
    db.session.commit()
    return jsonify({'success': True})
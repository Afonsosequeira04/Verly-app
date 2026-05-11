"""
app/api/playlists.py — Playlists de faturas ("Criar Em")

GET    /api/v1/playlists              → lista as playlists do utilizador
POST   /api/v1/playlists              → cria uma nova playlist
GET    /api/v1/playlists/<id>         → detalhe de uma playlist
PATCH  /api/v1/playlists/<id>         → edita nome/descrição/cor
DELETE /api/v1/playlists/<id>         → apaga playlist
POST   /api/v1/playlists/<id>/faturas → adiciona fatura à playlist
DELETE /api/v1/playlists/<id>/faturas/<fatura_id> → remove fatura da playlist

--- Colaboração ---
POST   /api/v1/playlists/<id>/partilhar    → gera código de partilha
POST   /api/v1/playlists/juntar/<codigo>   → junta-se a uma playlist partilhada
GET    /api/v1/playlists/<id>/membros      → lista membros
DELETE /api/v1/playlists/<id>/sair         → sai da playlist colaborativa
"""

import secrets
from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Fatura
from app import db

# ── Modelos inline (adiciona ao models.py depois) ─────────────────────────────
# Por agora usamos tabelas SQLite via db.engine direto para não exigir migration

def _ensure_tables():
    """Cria as tabelas se não existirem."""
    db.engine.execute("""
        CREATE TABLE IF NOT EXISTS playlist (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT    NOT NULL,
            descricao   TEXT,
            cor         TEXT    DEFAULT '#6C5CE7',
            icone       TEXT    DEFAULT 'list',
            owner_id    INTEGER NOT NULL,
            codigo      TEXT    UNIQUE,
            colaborativa INTEGER DEFAULT 0,
            criado_em   TEXT    DEFAULT (datetime('now'))
        )
    """)
    db.engine.execute("""
        CREATE TABLE IF NOT EXISTS playlist_fatura (
            playlist_id INTEGER NOT NULL,
            fatura_id   INTEGER NOT NULL,
            adicionado_em TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (playlist_id, fatura_id)
        )
    """)
    db.engine.execute("""
        CREATE TABLE IF NOT EXISTS playlist_membro (
            playlist_id INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            papel       TEXT    DEFAULT 'editor',
            joined_at   TEXT    DEFAULT (datetime('now')),
            PRIMARY KEY (playlist_id, user_id)
        )
    """)


def _row_to_dict(row):
    return dict(row) if row else None


def _playlist_detail(playlist_id, user_id):
    """Devolve dict completo de uma playlist com faturas e membros."""
    pl = db.engine.execute(
        "SELECT * FROM playlist WHERE id = ?", (playlist_id,)
    ).fetchone()
    if not pl:
        return None

    # verificar acesso
    if pl['owner_id'] != user_id:
        membro = db.engine.execute(
            "SELECT 1 FROM playlist_membro WHERE playlist_id=? AND user_id=?",
            (playlist_id, user_id)
        ).fetchone()
        if not membro:
            return None

    # faturas
    rows = db.engine.execute("""
        SELECT f.id, f.loja, f.total, f.categoria, f.data_compra, f.items
        FROM fatura f
        JOIN playlist_fatura pf ON pf.fatura_id = f.id
        WHERE pf.playlist_id = ?
        ORDER BY f.data_compra DESC
    """, (playlist_id,)).fetchall()
    faturas = [dict(r) for r in rows]

    total = sum(f.get('total') or 0 for f in faturas)

    # membros
    membros = db.engine.execute("""
        SELECT pm.user_id, pm.papel, u.nome, u.email
        FROM playlist_membro pm
        JOIN user u ON u.id = pm.user_id
        WHERE pm.playlist_id = ?
    """, (playlist_id,)).fetchall()

    return {
        **dict(pl),
        'faturas':     faturas,
        'total':       total,
        'num_faturas': len(faturas),
        'membros':     [dict(m) for m in membros],
        'is_owner':    pl['owner_id'] == user_id,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@api_bp.route('/playlists', methods=['GET'])
@jwt_required()
def listar_playlists():
    user_id = int(get_jwt_identity())
    _ensure_tables()

    # playlists próprias
    proprias = db.engine.execute(
        "SELECT * FROM playlist WHERE owner_id = ? ORDER BY criado_em DESC", (user_id,)
    ).fetchall()

    # playlists colaborativas onde é membro
    colaborativas = db.engine.execute("""
        SELECT p.* FROM playlist p
        JOIN playlist_membro pm ON pm.playlist_id = p.id
        WHERE pm.user_id = ?
        ORDER BY p.criado_em DESC
    """, (user_id,)).fetchall()

    result = []
    seen = set()
    for pl in list(proprias) + list(colaborativas):
        d = dict(pl)
        if d['id'] in seen:
            continue
        seen.add(d['id'])
        # contagem de faturas
        count = db.engine.execute(
            "SELECT COUNT(*) as c FROM playlist_fatura WHERE playlist_id=?", (d['id'],)
        ).fetchone()
        d['num_faturas'] = count['c'] if count else 0
        d['is_owner'] = d['owner_id'] == user_id
        result.append(d)

    return jsonify({'playlists': result})


@api_bp.route('/playlists', methods=['POST'])
@jwt_required()
def criar_playlist():
    user_id = int(get_jwt_identity())
    _ensure_tables()
    data = request.get_json(silent=True) or {}

    nome      = (data.get('nome') or '').strip()
    descricao = (data.get('descricao') or '').strip()
    cor       = data.get('cor', '#6C5CE7')
    icone     = data.get('icone', 'list')

    if not nome:
        return jsonify({'error': 'Nome obrigatório.'}), 400

    cur = db.engine.execute(
        "INSERT INTO playlist (nome, descricao, cor, icone, owner_id) VALUES (?,?,?,?,?)",
        (nome, descricao, cor, icone, user_id)
    )
    playlist_id = cur.lastrowid

    return jsonify({
        'success': True,
        'playlist': {
            'id': playlist_id, 'nome': nome, 'descricao': descricao,
            'cor': cor, 'icone': icone, 'owner_id': user_id,
            'colaborativa': 0, 'num_faturas': 0, 'faturas': [], 'membros': [],
            'is_owner': True,
        }
    }), 201


@api_bp.route('/playlists/<int:playlist_id>', methods=['GET'])
@jwt_required()
def detalhe_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    detail = _playlist_detail(playlist_id, user_id)
    if not detail:
        return jsonify({'error': 'Playlist não encontrada ou sem acesso.'}), 404
    return jsonify(detail)


@api_bp.route('/playlists/<int:playlist_id>', methods=['PATCH'])
@jwt_required()
def editar_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    pl = db.engine.execute(
        "SELECT * FROM playlist WHERE id=? AND owner_id=?", (playlist_id, user_id)
    ).fetchone()
    if not pl:
        return jsonify({'error': 'Não encontrado ou sem permissão.'}), 404

    data = request.get_json(silent=True) or {}
    campos = {}
    for field in ['nome', 'descricao', 'cor', 'icone']:
        if field in data:
            campos[field] = data[field]
    if not campos:
        return jsonify({'error': 'Nada para atualizar.'}), 400

    sets = ', '.join(f"{k}=?" for k in campos)
    vals = list(campos.values()) + [playlist_id]
    db.engine.execute(f"UPDATE playlist SET {sets} WHERE id=?", vals)
    return jsonify({'success': True})


@api_bp.route('/playlists/<int:playlist_id>', methods=['DELETE'])
@jwt_required()
def apagar_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    pl = db.engine.execute(
        "SELECT id FROM playlist WHERE id=? AND owner_id=?", (playlist_id, user_id)
    ).fetchone()
    if not pl:
        return jsonify({'error': 'Não encontrado ou sem permissão.'}), 404
    db.engine.execute("DELETE FROM playlist_fatura WHERE playlist_id=?", (playlist_id,))
    db.engine.execute("DELETE FROM playlist_membro WHERE playlist_id=?", (playlist_id,))
    db.engine.execute("DELETE FROM playlist WHERE id=?", (playlist_id,))
    return jsonify({'success': True})


@api_bp.route('/playlists/<int:playlist_id>/faturas', methods=['POST'])
@jwt_required()
def adicionar_fatura_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    detail = _playlist_detail(playlist_id, user_id)
    if not detail:
        return jsonify({'error': 'Playlist não encontrada ou sem acesso.'}), 404

    data = request.get_json(silent=True) or {}
    fatura_ids = data.get('fatura_ids', [])
    if isinstance(fatura_ids, int):
        fatura_ids = [fatura_ids]

    adicionadas = 0
    for fid in fatura_ids:
        fatura = Fatura.query.filter_by(id=fid, user_id=user_id).first()
        if not fatura:
            continue
        exists = db.engine.execute(
            "SELECT 1 FROM playlist_fatura WHERE playlist_id=? AND fatura_id=?",
            (playlist_id, fid)
        ).fetchone()
        if not exists:
            db.engine.execute(
                "INSERT INTO playlist_fatura (playlist_id, fatura_id) VALUES (?,?)",
                (playlist_id, fid)
            )
            adicionadas += 1

    return jsonify({'success': True, 'adicionadas': adicionadas})


@api_bp.route('/playlists/<int:playlist_id>/faturas/<int:fatura_id>', methods=['DELETE'])
@jwt_required()
def remover_fatura_playlist(playlist_id, fatura_id):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    detail = _playlist_detail(playlist_id, user_id)
    if not detail:
        return jsonify({'error': 'Playlist não encontrada ou sem acesso.'}), 404
    db.engine.execute(
        "DELETE FROM playlist_fatura WHERE playlist_id=? AND fatura_id=?",
        (playlist_id, fatura_id)
    )
    return jsonify({'success': True})


# ── Colaboração ────────────────────────────────────────────────────────────────

@api_bp.route('/playlists/<int:playlist_id>/partilhar', methods=['POST'])
@jwt_required()
def partilhar_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    pl = db.engine.execute(
        "SELECT * FROM playlist WHERE id=? AND owner_id=?", (playlist_id, user_id)
    ).fetchone()
    if not pl:
        return jsonify({'error': 'Não encontrado ou sem permissão.'}), 404

    codigo = dict(pl).get('codigo')
    if not codigo:
        codigo = secrets.token_urlsafe(8).upper()
        db.engine.execute(
            "UPDATE playlist SET codigo=?, colaborativa=1 WHERE id=?",
            (codigo, playlist_id)
        )

    return jsonify({'codigo': codigo, 'playlist_id': playlist_id})


@api_bp.route('/playlists/juntar/<string:codigo>', methods=['POST'])
@jwt_required()
def juntar_playlist(codigo):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    pl = db.engine.execute(
        "SELECT * FROM playlist WHERE codigo=?", (codigo.upper(),)
    ).fetchone()
    if not pl:
        return jsonify({'error': 'Código inválido ou playlist não encontrada.'}), 404

    pl_dict = dict(pl)
    if pl_dict['owner_id'] == user_id:
        return jsonify({'error': 'Já és o criador desta playlist.'}), 400

    exists = db.engine.execute(
        "SELECT 1 FROM playlist_membro WHERE playlist_id=? AND user_id=?",
        (pl_dict['id'], user_id)
    ).fetchone()
    if not exists:
        db.engine.execute(
            "INSERT INTO playlist_membro (playlist_id, user_id, papel) VALUES (?,?,?)",
            (pl_dict['id'], user_id, 'editor')
        )

    return jsonify({'success': True, 'playlist': pl_dict})


@api_bp.route('/playlists/<int:playlist_id>/membros', methods=['GET'])
@jwt_required()
def membros_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    detail = _playlist_detail(playlist_id, user_id)
    if not detail:
        return jsonify({'error': 'Playlist não encontrada ou sem acesso.'}), 404
    return jsonify({'membros': detail['membros']})


@api_bp.route('/playlists/<int:playlist_id>/sair', methods=['DELETE'])
@jwt_required()
def sair_playlist(playlist_id):
    user_id = int(get_jwt_identity())
    _ensure_tables()
    db.engine.execute(
        "DELETE FROM playlist_membro WHERE playlist_id=? AND user_id=?",
        (playlist_id, user_id)
    )
    return jsonify({'success': True})
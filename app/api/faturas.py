"""
app/api/faturas.py — CRUD de faturas para o mobile

GET    /api/v1/faturas              → lista
POST   /api/v1/faturas/upload       → upload (R2 + OCR em background)
GET    /api/v1/faturas/<id>         → detalhe
GET    /api/v1/faturas/<id>/url     → signed URL para download
DELETE /api/v1/faturas/<id>         → apagar (R2 + DB + Qdrant)
"""

import json
import logging
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Fatura, CATEGORIAS
from app.extensions import limiter
from app import db

logger = logging.getLogger(__name__)


def _fatura_to_dict(f):
    try:
        items = json.loads(f.items) if f.items else []
    except Exception:
        items = []
    return {
        'id':             f.id,
        'nome_ficheiro':  f.nome_ficheiro,
        'loja':           f.loja,
        'data_compra':    f.data_compra,
        'data_upload':    f.data_upload.isoformat() if f.data_upload else None,
        'total':          f.total or 0,
        'items':          items,
        'categoria':      f.categoria or 'Outros',
        'data_garantia':  f.data_garantia,
        'data_devolucao': f.data_devolucao,
        'has_file':       bool(f.file_key),   # indica se tem ficheiro no R2
    }


# ── Listar ────────────────────────────────────────────────────────────────────

@api_bp.route('/faturas', methods=['GET'])
@jwt_required()
def listar_faturas():
    user_id   = int(get_jwt_identity())
    search    = request.args.get('q', '').strip()[:200]
    categoria = request.args.get('categoria', '').strip()
    ordenar   = request.args.get('ordenar', 'recente').strip()

    if categoria and categoria not in CATEGORIAS:
        categoria = ''
    if ordenar not in {'recente', 'antigo', 'maior', 'menor'}:
        ordenar = 'recente'

    query = Fatura.query.filter_by(user_id=user_id)
    if search:
        query = query.filter(
            db.or_(
                Fatura.loja.ilike(f'%{search}%'),
                Fatura.nome_ficheiro.ilike(f'%{search}%'),
            )
        )
    if categoria:
        query = query.filter_by(categoria=categoria)

    order_map = {
        'recente': Fatura.data_upload.desc(),
        'antigo':  Fatura.data_upload.asc(),
        'maior':   Fatura.total.desc(),
        'menor':   Fatura.total.asc(),
    }
    faturas = query.order_by(order_map[ordenar]).all()

    return jsonify({
        'faturas':    [_fatura_to_dict(f) for f in faturas],
        'total':      round(sum(f.total or 0 for f in faturas), 2),
        'categorias': CATEGORIAS,
    })


# ── Detalhe ───────────────────────────────────────────────────────────────────

@api_bp.route('/faturas/<int:fatura_id>', methods=['GET'])
@jwt_required()
def detalhe_fatura(fatura_id):
    user_id = int(get_jwt_identity())
    f = Fatura.query.filter_by(id=fatura_id, user_id=user_id).first_or_404()
    return jsonify(_fatura_to_dict(f))


# ── Signed URL para download ──────────────────────────────────────────────────

@api_bp.route('/faturas/<int:fatura_id>/url', methods=['GET'])
@jwt_required()
def fatura_signed_url(fatura_id):
    """Devolve URL assinada temporária (15 min) para download seguro do ficheiro."""
    user_id = int(get_jwt_identity())
    f = Fatura.query.filter_by(id=fatura_id, user_id=user_id).first_or_404()

    if not f.file_key:
        return jsonify({'erro': 'Ficheiro não disponível no R2.'}), 404

    from app.r2_service import get_signed_url
    url = get_signed_url(f.file_key, expires_in=900)   # 15 min
    return jsonify({'url': url, 'expires_in': 900})


# ── Upload ────────────────────────────────────────────────────────────────────

@api_bp.route('/faturas/upload', methods=['POST'])
@jwt_required()
@limiter.limit("20 per hour", key_func=lambda: get_jwt_identity())
def upload_fatura():
    """
    Upload de fatura via multipart/form-data.
    1. Valida o ficheiro (extensão + magic bytes)
    2. Faz upload para o Cloudflare R2
    3. Cria registo na DB com status 'processing'
    4. Dispara task Celery para OCR em background
    5. Retorna 202 imediatamente (o cliente deve fazer polling ou usar push)
    """
    from security import validate_upload, sanitize_filename
    from app.r2_service import upload_file
    from app.tasks.ocr import processar_ocr_task

    user_id = int(get_jwt_identity())

    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum ficheiro enviado.'}), 400

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'Ficheiro inválido.'}), 400

    # Validar (extensão + magic bytes) — usa o security.py existente
    is_valid, error_msg, mime = validate_upload(file)
    if not is_valid:
        return jsonify({'error': error_msg}), 400

    safe_name = sanitize_filename(file.filename)
    if not safe_name:
        return jsonify({'error': 'Nome de ficheiro inválido.'}), 400

    # Ler bytes (após validate_upload que faz seek(0))
    file_bytes = file.read()

    # Upload para R2
    try:
        key = upload_file(file_bytes, safe_name, user_id, mime)
    except Exception as e:
        logger.error(f'Erro no upload R2 para user {user_id}: {e}')
        return jsonify({'error': 'Erro ao guardar o ficheiro. Tenta novamente.'}), 500

    # Criar registo na DB
    fatura = Fatura(
        user_id=user_id,
        nome_ficheiro=safe_name,
        file_key=key,
    )
    db.session.add(fatura)
    db.session.commit()

    # Disparar OCR em background (Celery)
    processar_ocr_task.delay(fatura.id)

    return jsonify({
        'id':     fatura.id,
        'status': 'processing',
        'message': 'Fatura recebida. O processamento OCR está em curso.',
    }), 202


# ── Apagar ────────────────────────────────────────────────────────────────────

@api_bp.route('/faturas/<int:fatura_id>', methods=['DELETE'])
@jwt_required()
def apagar_fatura(fatura_id):
    user_id = int(get_jwt_identity())
    f = Fatura.query.filter_by(id=fatura_id, user_id=user_id).first_or_404()

    # Apagar do R2 se existir
    if f.file_key:
        from app.r2_service import delete_file
        delete_file(f.file_key)

    # Apagar do Qdrant
    try:
        from app.qdrant_service import delete_fatura
        delete_fatura(fatura_id)
    except Exception as e:
        logger.warning(f'Qdrant delete falhou para fatura {fatura_id}: {e}')

    db.session.delete(f)
    db.session.commit()
    return jsonify({'success': True})

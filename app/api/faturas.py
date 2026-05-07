"""
app/api/faturas.py — CRUD de faturas para o mobile

GET    /api/v1/faturas           → lista
POST   /api/v1/faturas/upload    → upload de ficheiro
GET    /api/v1/faturas/<id>      → detalhe
DELETE /api/v1/faturas/<id>      → apagar
"""

import os
import json
import logging
from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Fatura, CATEGORIAS
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
    }


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


@api_bp.route('/faturas/<int:fatura_id>', methods=['GET'])
@jwt_required()
def detalhe_fatura(fatura_id):
    user_id = int(get_jwt_identity())
    f = Fatura.query.filter_by(id=fatura_id, user_id=user_id).first_or_404()
    return jsonify(_fatura_to_dict(f))


@api_bp.route('/faturas/<int:fatura_id>', methods=['DELETE'])
@jwt_required()
def apagar_fatura(fatura_id):
    user_id = int(get_jwt_identity())
    f = Fatura.query.filter_by(id=fatura_id, user_id=user_id).first_or_404()
    db.session.delete(f)
    db.session.commit()
    return jsonify({'success': True})


@api_bp.route('/faturas/upload', methods=['POST'])
@jwt_required()
def upload_fatura():
    """
    Upload de fatura via multipart/form-data.
    O processamento é igual ao da web app.
    """
    from app.ai import get_user_paths, rebuild_index, extract_invoice_info, extract_invoice_info_from_text
    from security import validate_upload, sanitize_filename, check_rate_limit

    user_id = int(get_jwt_identity())

    rate_key = f'upload:{user_id}'
    allowed, _ = check_rate_limit(rate_key, max_requests=20, window_seconds=3600)
    if not allowed:
        return jsonify({'error': 'Demasiados uploads. Tenta em 1 hora.'}), 429

    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum ficheiro enviado.'}), 400

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'Ficheiro inválido.'}), 400

    allowed_ext = current_app.config.get('ALLOWED_EXTENSIONS', {'.pdf', '.png', '.jpg', '.jpeg', '.txt'})
    is_valid, error_msg = validate_upload(file, allowed_ext)
    if not is_valid:
        return jsonify({'error': error_msg}), 400

    safe_name = sanitize_filename(file.filename)
    if not safe_name:
        return jsonify({'error': 'Nome de ficheiro inválido.'}), 400

    data_dir, storage_dir = get_user_paths(
        current_app.config['UPLOAD_FOLDER'],
        current_app.config['STORAGE_FOLDER'],
        user_id
    )
    os.makedirs(data_dir, exist_ok=True)

    file_path  = os.path.join(data_dir, safe_name)
    final_name = os.path.basename(file_path)

    try:
        file.save(file_path)
    except OSError as e:
        logger.error(f'Erro ao guardar ficheiro: {e}')
        return jsonify({'error': 'Erro ao guardar o ficheiro.'}), 500

    try:
        ext = os.path.splitext(safe_name)[1].lower()
        if ext == '.txt':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f_txt:
                texto = f_txt.read()
            info = extract_invoice_info_from_text(texto, final_name)
        else:
            index = rebuild_index(data_dir, storage_dir)
            info  = extract_invoice_info(index, final_name)

        rebuild_index(data_dir, storage_dir)

        fatura = Fatura(
            user_id=user_id,
            nome_ficheiro=final_name,
            loja=info['loja'],
            data_compra=info['data_compra'],
            total=info['total'],
            items=info['items'],
            categoria=info['categoria'],
            data_garantia=info['data_garantia'],
            data_devolucao=info['data_devolucao'],
        )
        db.session.add(fatura)
        db.session.commit()

        return jsonify({'success': True, 'fatura': _fatura_to_dict(fatura)}), 201

    except Exception as e:
        logger.error(f'Erro ao processar fatura: {e}')
        return jsonify({'error': 'Erro ao processar a fatura.'}), 500

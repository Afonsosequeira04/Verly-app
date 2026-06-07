"""
faturas.py — Gestão de faturas com validação segura de uploads

Melhorias de segurança vs versão anterior:
  - Validação de MIME type real (magic bytes) — não só extensão
  - Sanitização do nome de ficheiro (path traversal protection)
  - Rate limiting no endpoint de upload
  - Tratamento de erros estruturado com logging
  - Inputs sanitizados em editar_fatura
"""

import os
import json
import logging
from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from app import db
from app.models import Fatura, CATEGORIAS
from app.ai import get_user_paths, rebuild_index, extract_invoice_info
from security import validate_upload, sanitize_filename, sanitize_text_input, check_rate_limit

logger = logging.getLogger(__name__)
faturas_bp = Blueprint('faturas', __name__)


@faturas_bp.route('/faturas')
@login_required
def faturas():
    search = sanitize_text_input(request.args.get('q', ''), max_length=200)
    categoria = request.args.get('categoria', '').strip()
    ordenar = request.args.get('ordenar', 'recente').strip()

    # Validar categoria contra lista conhecida (evita SQL injection por bypass)
    if categoria and categoria not in CATEGORIAS:
        categoria = ''

    # Validar ordenação contra valores permitidos
    ordenar_permitido = {'recente', 'antigo', 'maior', 'menor'}
    if ordenar not in ordenar_permitido:
        ordenar = 'recente'

    query = Fatura.query.filter_by(user_id=current_user.id)

    if search:
        query = query.filter(
            db.or_(
                Fatura.loja.ilike(f'%{search}%'),
                Fatura.nome_ficheiro.ilike(f'%{search}%'),
                Fatura.items.ilike(f'%{search}%'),
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
    query = query.order_by(order_map[ordenar])

    todas = query.all()
    for f in todas:
        try:
            f.items_list = json.loads(f.items) if f.items else []
        except Exception:
            f.items_list = []

    total_filtrado = sum(f.total or 0 for f in todas)

    return render_template('faturas.html',
        faturas=todas,
        categorias=CATEGORIAS,
        search=search,
        categoria_sel=categoria,
        ordenar=ordenar,
        total_filtrado=total_filtrado,
    )


@faturas_bp.route('/faturas/upload', methods=['POST'])
@login_required
def upload():
    # ── Rate limiting: 20 uploads por hora por utilizador ────────────────────
    rate_key = f'upload:{current_user.id}'
    allowed, remaining = check_rate_limit(rate_key, max_requests=20, window_seconds=3600)
    if not allowed:
        logger.warning(f'Rate limit de upload excedido — user_id={current_user.id}')
        return jsonify({
            'success': False,
            'message': 'Demasiados uploads. Tenta novamente em 1 hora.'
        }), 429

    # ── Verificar que ficheiro existe no pedido ───────────────────────────────
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'Nenhum ficheiro enviado.'})

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'Ficheiro inválido.'})

    # ── Validar upload (extensão + magic bytes) ───────────────────────────────
    allowed_ext = current_app.config.get('ALLOWED_EXTENSIONS', {'.pdf', '.png', '.jpg', '.jpeg', '.txt'})
    is_valid, error_msg = validate_upload(file, allowed_ext)
    if not is_valid:
        logger.warning(
            f'Upload rejeitado — user_id={current_user.id} '
            f'filename={file.filename!r} motivo={error_msg!r}'
        )
        return jsonify({'success': False, 'message': error_msg})

    # ── Sanitizar nome de ficheiro ────────────────────────────────────────────
    original_name = file.filename
    safe_name = sanitize_filename(original_name)
    if not safe_name:
        return jsonify({'success': False, 'message': 'Nome de ficheiro inválido.'})

    # ── Obter paths do utilizador ─────────────────────────────────────────────
    data_dir, storage_dir = get_user_paths(
        current_app.config['UPLOAD_FOLDER'],
        current_app.config['STORAGE_FOLDER'],
        current_user.id
    )
    os.makedirs(data_dir, exist_ok=True)

    # Evitar sobrescrever ficheiros existentes (adicionar sufixo se necessário)
    file_path = _unique_path(data_dir, safe_name)
    final_name = os.path.basename(file_path)

    # ── Guardar e processar ficheiro ──────────────────────────────────────────
    try:
        file.save(file_path)
    except OSError as e:
        logger.error(f'Erro ao guardar ficheiro — user_id={current_user.id}: {e}')
        return jsonify({'success': False, 'message': 'Erro ao guardar o ficheiro.'})

    try:
        # Despacha por extensão: imagens → Vision, PDF → pdfplumber+LLM, txt → LLM/regex
        # NÃO usa LlamaIndex — evita confundir faturas diferentes.
        info = extract_invoice_info(file_path, final_name)

        # Actualiza índice do chat em background (falha silenciosa)
        try:
            rebuild_index(data_dir, storage_dir)
        except Exception:
            pass

        fatura = Fatura(
            user_id=current_user.id,
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
        try:
            from app.tasks.qdrant_task import indexar_fatura_task
            indexar_fatura_task.delay(fatura.id)
        except Exception:
            logger.warning('Qdrant invoice indexing dispatch failed', exc_info=True)

        logger.info(
            f'Fatura criada — user_id={current_user.id} '
            f'fatura_id={fatura.id} loja={info["loja"]!r}'
        )

        return jsonify({
            'success': True,
            'message': f'{final_name} analisado com sucesso!',
            'loja': info['loja'],
            'total': info['total'],
            'categoria': info['categoria'],
        })

    except Exception as e:
        # Limpar ficheiro se o processamento falhar
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError:
            pass
        logger.exception(f'Erro ao processar fatura — user_id={current_user.id}')
        return jsonify({'success': False, 'message': f'Erro ao processar o ficheiro: {str(e)}'})


@faturas_bp.route('/faturas/editar/<int:fatura_id>', methods=['POST'])
@login_required
def editar_fatura(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Fatura não encontrada.'}), 404

    data = request.get_json(silent=True) or {}

    if 'categoria' in data:
        # Validar contra lista conhecida
        if data['categoria'] in CATEGORIAS:
            fatura.categoria = data['categoria']

    if 'loja' in data:
        fatura.loja = sanitize_text_input(str(data['loja']), max_length=150)

    if 'total' in data:
        try:
            total = float(data['total'])
            if 0 <= total <= 1_000_000:  # sanity check
                fatura.total = round(total, 2)
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'Total inválido.'}), 400

    if 'notas' in data:
        fatura.notas = sanitize_text_input(str(data['notas']), max_length=1000, allow_newlines=True)

    try:
        db.session.commit()
        try:
            from app.tasks.qdrant_task import indexar_fatura_task
            indexar_fatura_task.delay(fatura.id)
        except Exception:
            logger.warning('Qdrant invoice reindex dispatch failed', exc_info=True)
        return jsonify({'success': True})
    except Exception:
        db.session.rollback()
        logger.exception(f'Erro ao editar fatura — fatura_id={fatura_id}')
        return jsonify({'success': False, 'message': 'Erro ao guardar alterações.'}), 500


@faturas_bp.route('/faturas/delete/<int:fatura_id>', methods=['DELETE'])
@login_required
def delete_fatura(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Fatura não encontrada.'}), 404

    data_dir, storage_dir = get_user_paths(
        current_app.config['UPLOAD_FOLDER'],
        current_app.config['STORAGE_FOLDER'],
        current_user.id
    )

    # Garantir que o path resolvido está dentro da pasta do utilizador
    # (proteção adicional contra path traversal via nome de ficheiro na BD)
    file_path = os.path.realpath(os.path.join(data_dir, fatura.nome_ficheiro))
    data_dir_real = os.path.realpath(data_dir)

    if file_path.startswith(data_dir_real) and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError as e:
            logger.warning(f'Não foi possível remover ficheiro {file_path}: {e}')

    try:
        db.session.delete(fatura)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception(f'Erro ao eliminar fatura — fatura_id={fatura_id}')
        return jsonify({'success': False, 'message': 'Erro ao eliminar fatura.'}), 500

    # Reconstruir índice após remoção
    try:
        rebuild_index(data_dir, storage_dir)
    except Exception:
        pass

    return jsonify({'success': True})


def _unique_path(directory, filename):
    """Devolve um path único — adiciona sufixo numérico se o ficheiro já existir."""
    base, ext = os.path.splitext(filename)
    candidate = os.path.join(directory, filename)
    counter = 1
    while os.path.exists(candidate):
        candidate = os.path.join(directory, f"{base}_{counter}{ext}")
        counter += 1
    return candidate

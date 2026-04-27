import os
import json
from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from app import db
from app.models import Fatura
from app.ai import get_user_paths, rebuild_index, extract_invoice_info

faturas_bp = Blueprint('faturas', __name__)


@faturas_bp.route('/faturas')
@login_required
def faturas():
    todas = Fatura.query.filter_by(user_id=current_user.id).order_by(Fatura.data_upload.desc()).all()
    # Parse items JSON para cada fatura
    for f in todas:
        try:
            f.items_list = json.loads(f.items) if f.items else []
        except Exception:
            f.items_list = []
    return render_template('faturas.html', faturas=todas)


@faturas_bp.route('/faturas/upload', methods=['POST'])
@login_required
def upload():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'Nenhum ficheiro enviado.'})

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'Ficheiro inválido.'})

    allowed = {'.pdf', '.png', '.jpg', '.jpeg', '.txt'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        return jsonify({'success': False, 'message': f'Tipo de ficheiro não suportado: {ext}'})

    data_dir, storage_dir = get_user_paths(
        current_app.config['UPLOAD_FOLDER'],
        current_app.config['STORAGE_FOLDER'],
        current_user.id
    )

    file_path = os.path.join(data_dir, file.filename)
    file.save(file_path)

    try:
        # Reconstrói índice com novo ficheiro
        index = rebuild_index(data_dir, storage_dir)

        # Extrai informações da fatura via IA
        info = extract_invoice_info(index, file.filename)

        # Guarda na base de dados
        fatura = Fatura(
            user_id=current_user.id,
            nome_ficheiro=file.filename,
            loja=info['loja'],
            data_compra=info['data_compra'],
            total=info['total'],
            items=info['items']
        )
        db.session.add(fatura)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{file.filename} analisado com sucesso!',
            'loja': info['loja'],
            'total': info['total']
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao processar: {str(e)}'})


@faturas_bp.route('/faturas/delete/<int:fatura_id>', methods=['DELETE'])
@login_required
def delete_fatura(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Fatura não encontrada.'})

    # Remove ficheiro físico
    data_dir, storage_dir = get_user_paths(
        current_app.config['UPLOAD_FOLDER'],
        current_app.config['STORAGE_FOLDER'],
        current_user.id
    )
    file_path = os.path.join(data_dir, fatura.nome_ficheiro)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.session.delete(fatura)
    db.session.commit()

    # Reconstrói índice sem o ficheiro
    try:
        if os.path.exists(data_dir) and os.listdir(data_dir):
            rebuild_index(data_dir, storage_dir)
        elif os.path.exists(storage_dir):
            import shutil
            shutil.rmtree(storage_dir)
    except Exception:
        pass

    return jsonify({'success': True, 'message': 'Fatura removida.'})

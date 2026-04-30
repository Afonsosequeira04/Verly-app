import os
import json
from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from app import db
from app.models import Fatura, CATEGORIAS
from app.ai import get_user_paths, rebuild_index, extract_invoice_info, extract_invoice_info_from_text

faturas_bp = Blueprint('faturas', __name__)


@faturas_bp.route('/faturas')
@login_required
def faturas():
    search = request.args.get('q', '').strip()
    categoria = request.args.get('categoria', '')
    ordenar = request.args.get('ordenar', 'recente')

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

    if ordenar == 'recente':
        query = query.order_by(Fatura.data_upload.desc())
    elif ordenar == 'antigo':
        query = query.order_by(Fatura.data_upload.asc())
    elif ordenar == 'maior':
        query = query.order_by(Fatura.total.desc())
    elif ordenar == 'menor':
        query = query.order_by(Fatura.total.asc())

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
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'Nenhum ficheiro enviado.'})
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'Ficheiro inválido.'})

    allowed = {'.pdf', '.png', '.jpg', '.jpeg', '.txt'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        return jsonify({'success': False, 'message': f'Tipo não suportado: {ext}'})

    data_dir, storage_dir = get_user_paths(
        current_app.config['UPLOAD_FOLDER'],
        current_app.config['STORAGE_FOLDER'],
        current_user.id
    )

    file_path = os.path.join(data_dir, file.filename)
    file.save(file_path)

    try:
        if ext == '.txt':
            # Lê directamente o texto — sem IA, 100% fiável
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f_txt:
                texto = f_txt.read()
            info = extract_invoice_info_from_text(texto, file.filename)
        else:
            # PDF / imagem — usa IA
            index = rebuild_index(data_dir, storage_dir)
            info = extract_invoice_info(index, file.filename)

        # Reconstrói o índice para o chat ficar actualizado
        rebuild_index(data_dir, storage_dir)

        fatura = Fatura(
            user_id=current_user.id,
            nome_ficheiro=file.filename,
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

        return jsonify({
            'success': True,
            'message': f'{file.filename} analisado com sucesso!',
            'loja': info['loja'],
            'total': info['total'],
            'categoria': info['categoria'],
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro: {str(e)}'})


@faturas_bp.route('/faturas/editar/<int:fatura_id>', methods=['POST'])
@login_required
def editar_fatura(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Não encontrada.'})
    data = request.json
    if 'categoria' in data:
        fatura.categoria = data['categoria']
    if 'loja' in data:
        fatura.loja = data['loja']
    if 'total' in data:
        fatura.total = float(data['total'])
    db.session.commit()
    return jsonify({'success': True})


@faturas_bp.route('/faturas/delete/<int:fatura_id>', methods=['DELETE'])
@login_required
def delete_fatura(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Não encontrada.'})

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

    try:
        if os.path.exists(data_dir) and os.listdir(data_dir):
            rebuild_index(data_dir, storage_dir)
        elif os.path.exists(storage_dir):
            import shutil
            shutil.rmtree(storage_dir)
    except Exception:
        pass

    return jsonify({'success': True})
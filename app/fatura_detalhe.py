"""
fatura_detalhe.py — Página de detalhe completo de uma fatura
"""
import json
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import Fatura, CATEGORIAS

fatura_detalhe_bp = Blueprint('fatura_detalhe', __name__)


@fatura_detalhe_bp.route('/faturas/<int:fatura_id>')
@login_required
def detalhe(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first_or_404()
    try:
        items_list = json.loads(fatura.items) if fatura.items else []
    except Exception:
        items_list = []
    return render_template('fatura_detalhe.html', fatura=fatura, items_list=items_list, categorias=CATEGORIAS)


@fatura_detalhe_bp.route('/faturas/<int:fatura_id>/update', methods=['POST'])
@login_required
def update(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first_or_404()
    data = request.json or {}

    if 'loja' in data:
        fatura.loja = data['loja'].strip() or fatura.loja
    if 'total' in data:
        try:
            fatura.total = float(data['total'])
        except (ValueError, TypeError):
            pass
    if 'data_compra' in data:
        fatura.data_compra = data['data_compra'].strip()
    if 'categoria' in data and data['categoria'] in CATEGORIAS:
        fatura.categoria = data['categoria']
    if 'data_garantia' in data:
        fatura.data_garantia = data['data_garantia'].strip()
    if 'data_devolucao' in data:
        fatura.data_devolucao = data['data_devolucao'].strip()
    if 'notas' in data:
        fatura.notas = data['notas'].strip()
    if 'items' in data:
        # items chega como lista de strings
        try:
            items_clean = [i.strip() for i in data['items'] if str(i).strip()]
            fatura.items = json.dumps(items_clean, ensure_ascii=False)
        except Exception:
            pass

    db.session.commit()
    return jsonify({'success': True})


@fatura_detalhe_bp.route('/faturas/<int:fatura_id>/delete', methods=['POST'])
@login_required
def delete(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first_or_404()
    db.session.delete(fatura)
    db.session.commit()
    return jsonify({'success': True})

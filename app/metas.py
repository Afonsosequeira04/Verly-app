"""
metas.py — Metas de poupança mensais por categoria
"""
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime
from app import db
from app.models import Fatura, Meta, CATEGORIAS

metas_bp = Blueprint('metas', __name__)


def get_gastos_mes_atual(user_id):
    """Calcula gastos por categoria no mês atual."""
    hoje = datetime.now()
    faturas = Fatura.query.filter_by(user_id=user_id).all()
    gastos = {}
    for f in faturas:
        # Tentar parsear a data de compra
        data = None
        if f.data_compra:
            for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
                try:
                    data = datetime.strptime(f.data_compra.strip(), fmt)
                    break
                except ValueError:
                    continue
        if data is None:
            data = f.data_upload

        if data and data.month == hoje.month and data.year == hoje.year:
            cat = f.categoria or 'Outros'
            gastos[cat] = gastos.get(cat, 0) + (f.total or 0)
    return gastos


@metas_bp.route('/metas')
@login_required
def metas():
    todas_metas = Meta.query.filter_by(user_id=current_user.id).all()
    gastos = get_gastos_mes_atual(current_user.id)

    metas_data = []
    for m in todas_metas:
        gasto = gastos.get(m.categoria, 0)
        pct = min(round((gasto / m.valor_limite) * 100) if m.valor_limite > 0 else 0, 100)
        sobra = max(m.valor_limite - gasto, 0)
        metas_data.append({
            'id': m.id,
            'categoria': m.categoria,
            'limite': m.valor_limite,
            'gasto': round(gasto, 2),
            'pct': pct,
            'sobra': round(sobra, 2),
            'ultrapassou': gasto > m.valor_limite,
        })

    # Categorias sem meta mas com gastos
    cats_com_meta = {m['categoria'] for m in metas_data}
    sem_meta = [
        {'categoria': c, 'gasto': round(gastos.get(c, 0), 2)}
        for c in gastos
        if c not in cats_com_meta and gastos.get(c, 0) > 0
    ]

    total_orcado = sum(m['limite'] for m in metas_data)
    total_gasto = sum(m['gasto'] for m in metas_data)

    return render_template('metas.html',
        metas=metas_data,
        sem_meta=sem_meta,
        categorias=CATEGORIAS,
        total_orcado=total_orcado,
        total_gasto=total_gasto,
        mes_atual=datetime.now().strftime('%B %Y'),
    )


@metas_bp.route('/metas/save', methods=['POST'])
@login_required
def save_meta():
    data = request.json or {}
    categoria = data.get('categoria', '').strip()
    valor = data.get('valor', 0)

    if not categoria or categoria not in CATEGORIAS:
        return jsonify({'success': False, 'message': 'Categoria inválida'})
    try:
        valor = float(valor)
        if valor <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'Valor inválido'})

    meta = Meta.query.filter_by(user_id=current_user.id, categoria=categoria).first()
    if meta:
        meta.valor_limite = valor
    else:
        meta = Meta(user_id=current_user.id, categoria=categoria, valor_limite=valor)
        db.session.add(meta)
    db.session.commit()
    return jsonify({'success': True})


@metas_bp.route('/metas/delete/<int:meta_id>', methods=['POST'])
@login_required
def delete_meta(meta_id):
    meta = Meta.query.filter_by(id=meta_id, user_id=current_user.id).first_or_404()
    db.session.delete(meta)
    db.session.commit()
    return jsonify({'success': True})

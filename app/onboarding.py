"""
onboarding.py — Wizard de boas-vindas pós-registo
Aparece uma vez para novos utilizadores: escolher personalidade + orçamento mensal por categoria.
"""
from flask import Blueprint, render_template, request, jsonify, redirect, url_for
from flask_login import login_required, current_user
from app import db
from app.models import User, Meta, CATEGORIAS

onboarding_bp = Blueprint('onboarding', __name__)


@onboarding_bp.route('/onboarding')
@login_required
def onboarding():
    user = User.query.get(current_user.id)
    if user.onboarding_completo:
        return redirect(url_for('dashboard.dashboard'))
    return render_template('onboarding.html', categorias=CATEGORIAS)


@onboarding_bp.route('/onboarding/save', methods=['POST'])
@login_required
def save_onboarding():
    data = request.json or {}

    # Guardar personalidade
    personalidade = data.get('personalidade', 'calm')
    # Guardar metas por categoria
    metas = data.get('metas', {})
    orcamento_mensal = data.get('orcamento_mensal', 0)

    User.query.filter_by(id=current_user.id).update({
        'personalidade': personalidade,
        'orcamento_mensal': float(orcamento_mensal) if orcamento_mensal else 0,
        'onboarding_completo': True,
    })

    # Guardar metas por categoria
    Meta.query.filter_by(user_id=current_user.id).delete()
    for cat, valor in metas.items():
        try:
            v = float(valor)
            if v > 0:
                m = Meta(user_id=current_user.id, categoria=cat, valor_limite=v)
                db.session.add(m)
        except (ValueError, TypeError):
            pass

    db.session.commit()
    return jsonify({'success': True})

"""
personality.py — Roast / Personality Engine
"""
from flask import Blueprint, request, jsonify, render_template, flash, redirect, url_for
from flask_login import login_required, current_user
from app import db
from app.models import User

personality_bp = Blueprint('personality', __name__)

PERSONALIDADES = {
    'savage': {
        'nome':     'Savage',
        'descricao':'Sem filtros. Verdade nua e crua. A Verly não te vai poupar.',
        'preview':  'Gastaste 243€ em lixo financeiro este mês. Parabéns pela consistência.',
        'cor':      '#FF4757',
    },
    'sarcastic': {
        'nome':     'Sarcástico',
        'descricao':'Ironia refinada. Construtivo, mas com estilo.',
        'preview':  'Ah, só 243€ desperdiçados. Modesto para os teus padrões habituais.',
        'cor':      '#FFB800',
    },
    'calm': {
        'nome':     'Calmo',
        'descricao':'Coach financeiro gentil. Honesto sem ser brutal.',
        'preview':  'Identificámos 243€ de oportunidades de poupança. Vamos melhorar juntos.',
        'cor':      '#00D68F',
    },
    'pro': {
        'nome':     'Profissional',
        'descricao':'CFO pessoal. Dados, análise, zero drama.',
        'preview':  'Índice de desperdício: 29.1% (243€). Acção requerida: optimizar 2 categorias.',
        'cor':      '#7B61FF',
    },
}


# Mapeamento de valores legacy para os 4 canónicos
PERSONALITY_ALIASES = {
    'strict':   'pro',
    'friendly': 'calm',
    'rebel':    'savage',
}

def get_personalidade_user():
    """Lê a personalidade directamente da BD — normaliza valores legacy."""
    user = User.query.get(current_user.id)
    raw  = (user.personalidade or 'calm') if user else 'calm'
    return PERSONALITY_ALIASES.get(raw, raw) if raw not in PERSONALIDADES else raw


@personality_bp.route('/personality')
@login_required
def personality():
    atual = get_personalidade_user()
    return render_template('personality.html', personalidades=PERSONALIDADES, atual=atual)


@personality_bp.route('/personality/set', methods=['POST'])
@login_required
def set_personality():
    data = request.json or request.form
    nova = data.get('personalidade', 'calm')

    # Aceitar aliases legacy e normalizar
    nova = PERSONALITY_ALIASES.get(nova, nova)
    if nova not in PERSONALIDADES:
        if request.is_json:
            return jsonify({'success': False, 'message': 'Personalidade inválida.'})
        flash('Personalidade inválida.', 'error')
        return redirect(url_for('personality.personality'))

    # Actualiza directamente na BD sem depender do current_user em cache
    User.query.filter_by(id=current_user.id).update({'personalidade': nova})
    db.session.commit()

    if request.is_json:
        return jsonify({
            'success': True,
            'personalidade': nova,
            'info': PERSONALIDADES[nova],
        })

    flash(f'Personalidade alterada para {PERSONALIDADES[nova]["nome"]}.', 'success')
    return redirect(url_for('personality.personality'))


@personality_bp.route('/personality/preview/<string:modo>')
@login_required
def preview(modo):
    if modo not in PERSONALIDADES:
        return jsonify({'success': False})
    return jsonify({'success': True, 'preview': PERSONALIDADES[modo]['preview'], 'info': PERSONALIDADES[modo]})
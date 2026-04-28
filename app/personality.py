"""
personality.py — Roast / Personality Engine
Gere a preferência de personalidade do utilizador (Savage / Sarcástico / Calmo / Pro).
Expõe route para guardar preferência + preview das frases por modo.
"""
from flask import Blueprint, request, jsonify, render_template, flash, redirect, url_for
from flask_login import login_required, current_user
from app import db

personality_bp = Blueprint('personality', __name__)

PERSONALIDADES = {
    'savage': {
        'nome':     'Savage',
        'emoji':    '🔥',
        'descricao': 'Sem filtros. Verdade nua e crua. A Verly não te vai poupar.',
        'preview':  'Gastaste 243€ em lixo financeiro este mês. Parabéns pela consistência.',
        'cor':      '#FF4757',
    },
    'sarcastic': {
        'nome':     'Sarcástico',
        'emoji':    '😏',
        'descricao': 'Ironia refinada. Construtivo, mas com estilo.',
        'preview':  'Ah, só 243€ desperdiçados. Modesto para os teus padrões habituais.',
        'cor':      '#FF6B35',
    },
    'calm': {
        'nome':     'Calmo',
        'emoji':    '🧘',
        'descricao': 'Coach financeiro gentil. Honesto sem ser brutal.',
        'preview':  'Identificámos 243€ de oportunidades de poupança este mês. Vamos melhorar juntos.',
        'cor':      '#00D68F',
    },
    'pro': {
        'nome':     'Profissional',
        'emoji':    '🧑‍⚖️',
        'descricao': 'CFO pessoal. Dados, análise, zero drama.',
        'preview':  'Índice de desperdício: 29.1% (243€). Acção requerida: optimizar 2 categorias.',
        'cor':      '#7B61FF',
    },
}


# ─── ROUTES ──────────────────────────────────────────────────────────────────

@personality_bp.route('/personality')
@login_required
def personality():
    atual = getattr(current_user, 'personalidade', 'calm') or 'calm'
    return render_template('personality.html',
        personalidades=PERSONALIDADES,
        atual=atual,
    )


@personality_bp.route('/personality/set', methods=['POST'])
@login_required
def set_personality():
    """
    POST /personality/set
    Body JSON ou form: { personalidade: 'savage'|'sarcastic'|'calm'|'pro' }
    """
    data = request.json or request.form
    nova = data.get('personalidade', 'calm')

    if nova not in PERSONALIDADES:
        if request.is_json:
            return jsonify({'success': False, 'message': 'Personalidade inválida.'})
        flash('Personalidade inválida.', 'error')
        return redirect(url_for('personality.personality'))

    # Guardar na BD (requer coluna personalidade na tabela users — ver migration abaixo)
    if hasattr(current_user, 'personalidade'):
        current_user.personalidade = nova
        db.session.commit()

    if request.is_json:
        return jsonify({
            'success':      True,
            'personalidade': nova,
            'info':         PERSONALIDADES[nova],
        })

    flash(f'Personalidade alterada para {PERSONALIDADES[nova]["nome"]}.', 'success')
    return redirect(url_for('personality.personality'))


@personality_bp.route('/personality/preview/<string:modo>')
@login_required
def preview(modo: str):
    """GET /personality/preview/<modo> — devolve o preview de um modo."""
    if modo not in PERSONALIDADES:
        return jsonify({'success': False})
    return jsonify({
        'success': True,
        'preview': PERSONALIDADES[modo]['preview'],
        'info':    PERSONALIDADES[modo],
    })

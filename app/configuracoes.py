"""
configuracoes.py — Página de configurações (personalidade, língua, preferências)
"""
from flask import Blueprint, render_template, request, jsonify, redirect, url_for, flash
from flask_login import login_required, current_user
from app import db
from app.models import User
from app.personality import PERSONALIDADES, PERSONALITY_ALIASES

configuracoes_bp = Blueprint('configuracoes', __name__)

LINGUAS = {
    'pt': {'nome': 'Português', 'flag': '🇵🇹'},
    'en': {'nome': 'English',   'flag': '🇬🇧'},
    'es': {'nome': 'Español',   'flag': '🇪🇸'},
    'fr': {'nome': 'Français',  'flag': '🇫🇷'},
}


def get_personalidade_user():
    user = User.query.get(current_user.id)
    raw = (user.personalidade or 'calm') if user else 'calm'
    return PERSONALITY_ALIASES.get(raw, raw) if raw not in PERSONALIDADES else raw


@configuracoes_bp.route('/configuracoes')
@login_required
def configuracoes():
    atual_personalidade = get_personalidade_user()
    lingua_atual = getattr(current_user, 'lingua', 'pt') or 'pt'
    return render_template('configuracoes.html',
        personalidades=PERSONALIDADES,
        atual_personalidade=atual_personalidade,
        linguas=LINGUAS,
        lingua_atual=lingua_atual,
    )


@configuracoes_bp.route('/configuracoes/personalidade', methods=['POST'])
@login_required
def set_personalidade():
    data = request.get_json(silent=True) or {}
    key = data.get('personalidade') or request.form.get('personalidade', '')
    if key not in PERSONALIDADES:
        return jsonify({'success': False, 'message': 'Personalidade inválida.'}), 400
    current_user.personalidade = key
    db.session.commit()
    info = PERSONALIDADES[key]
    return jsonify({'success': True, 'info': {'nome': info['nome'], 'cor': info['cor']}})


@configuracoes_bp.route('/configuracoes/lingua', methods=['POST'])
@login_required
def set_lingua():
    data = request.get_json(silent=True) or {}
    lingua = data.get('lingua') or request.form.get('lingua', 'pt')
    if lingua not in LINGUAS:
        return jsonify({'success': False, 'message': 'Língua inválida.'}), 400
    # Guarda na sessão (e no user se tiveres o campo)
    try:
        current_user.lingua = lingua
        db.session.commit()
    except Exception:
        pass  # campo pode não existir ainda — migration opcional
    return jsonify({'success': True, 'lingua': lingua, 'nome': LINGUAS[lingua]['nome']})


@configuracoes_bp.route('/configuracoes/preferencias', methods=['POST'])
@login_required
def set_preferencias():
    nome = request.form.get('nome', '').strip()
    notif = request.form.get('notificacoes_email') == 'on'
    orcamento = request.form.get('orcamento_mensal', '').strip()

    if nome:
        current_user.nome = nome
    current_user.notificacoes_email = notif
    if orcamento:
        try:
            current_user.orcamento_mensal = float(orcamento)
        except ValueError:
            pass

    db.session.commit()
    flash('Configurações guardadas com sucesso!', 'success')
    return redirect(url_for('configuracoes.configuracoes'))

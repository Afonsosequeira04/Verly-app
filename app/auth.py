"""
auth.py — Autenticação com rate limiting e segurança reforçada

Melhorias vs versão anterior:
  - Rate limiting em login (10 tentativas por minuto por IP)
  - Rate limiting em register (5 registos por hora por IP)
  - Inputs sanitizados
  - Logging de tentativas falhadas (deteção de ataques)
  - Password validation mais robusta
"""

import logging
from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_user, logout_user, login_required, current_user
from app import db
from app.models import User
from security import sanitize_text_input, check_rate_limit

logger = logging.getLogger(__name__)
auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.dashboard'))
    return redirect(url_for('auth.login'))


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.dashboard'))

    if request.method == 'POST':
        # Rate limiting por IP: 10 tentativas por minuto
        ip = request.remote_addr or 'unknown'
        allowed, remaining = check_rate_limit(f'login:{ip}', max_requests=10, window_seconds=60)
        if not allowed:
            logger.warning(f'Rate limit de login excedido — IP={ip}')
            flash('Demasiadas tentativas de login. Aguarda 1 minuto.', 'error')
            return render_template('auth/login.html'), 429

        email = sanitize_text_input(request.form.get('email', ''), max_length=150).lower()
        password = request.form.get('password', '')

        if not email or not password:
            flash('Preenche todos os campos.', 'error')
            return render_template('auth/login.html')

        user = User.query.filter_by(email=email).first()

        if user and user.check_password(password):
            login_user(user, remember=request.form.get('remember') == 'on')
            logger.info(f'Login bem-sucedido — user_id={user.id} IP={ip}')

            # Redirecionar para página pedida originalmente (se existir)
            next_page = request.args.get('next')
            if next_page and next_page.startswith('/'):  # só paths relativos (segurança)
                return redirect(next_page)
            return redirect(url_for('dashboard.dashboard'))

        # Login falhado — não revelar se é o email ou a password que está errada
        logger.warning(f'Tentativa de login falhada — email={email!r} IP={ip}')
        flash('Email ou password incorretos.', 'error')

    return render_template('auth/login.html')


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.dashboard'))

    if request.method == 'POST':
        # Rate limiting por IP: 5 registos por hora
        ip = request.remote_addr or 'unknown'
        allowed, _ = check_rate_limit(f'register:{ip}', max_requests=5, window_seconds=3600)
        if not allowed:
            logger.warning(f'Rate limit de register excedido — IP={ip}')
            flash('Demasiados registos deste IP. Aguarda 1 hora.', 'error')
            return render_template('auth/register.html'), 429

        nome = sanitize_text_input(request.form.get('nome', ''), max_length=100)
        email = sanitize_text_input(request.form.get('email', ''), max_length=150).lower()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')

        # Validações
        errors = _validate_registration(nome, email, password, confirm)
        if errors:
            for error in errors:
                flash(error, 'error')
            return render_template('auth/register.html')

        if User.query.filter_by(email=email).first():
            # Não revelar que o email já existe (enumeração de utilizadores)
            # Mostrar mensagem genérica e fazer log interno
            logger.info(f'Tentativa de registo com email já existente — email={email!r} IP={ip}')
            flash('Conta criada com sucesso. Faz login para continuar.', 'success')
            return redirect(url_for('auth.login'))

        user = User(nome=nome, email=email, onboarding_completo=False)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        logger.info(f'Novo utilizador registado — user_id={user.id} IP={ip}')
        login_user(user)
        return redirect(url_for('onboarding.onboarding'))

    return render_template('auth/register.html')


@auth_bp.route('/logout')
@login_required
def logout():
    user_id = current_user.id
    logout_user()
    logger.info(f'Logout — user_id={user_id}')
    return redirect(url_for('auth.login'))


def _validate_registration(nome: str, email: str, password: str, confirm: str) -> list[str]:
    """Valida os campos de registo. Retorna lista de erros (vazia se OK)."""
    import re
    errors = []

    if not nome:
        errors.append('O nome é obrigatório.')
    elif len(nome) < 2:
        errors.append('O nome deve ter pelo menos 2 caracteres.')

    if not email:
        errors.append('O email é obrigatório.')
    elif not re.match(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$', email):
        errors.append('Formato de email inválido.')

    if not password:
        errors.append('A password é obrigatória.')
    elif len(password) < 8:
        errors.append('A password deve ter pelo menos 8 caracteres.')
    elif not re.search(r'[A-Za-z]', password):
        errors.append('A password deve conter pelo menos uma letra.')
    elif not re.search(r'[0-9]', password):
        errors.append('A password deve conter pelo menos um número.')

    if password and confirm and password != confirm:
        errors.append('As passwords não coincidem.')

    return errors
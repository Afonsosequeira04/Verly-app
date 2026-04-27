from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for
from flask_login import login_required, current_user
from app import db
from app.models import Fatura, Conversa

perfil_bp = Blueprint('perfil', __name__)


@perfil_bp.route('/perfil')
@login_required
def perfil():
    num_faturas = Fatura.query.filter_by(user_id=current_user.id).count()
    num_conversas = Conversa.query.filter_by(user_id=current_user.id).count()
    total_gasto = db.session.query(db.func.sum(Fatura.total)).filter_by(user_id=current_user.id).scalar() or 0
    return render_template('perfil.html',
        num_faturas=num_faturas,
        num_conversas=num_conversas,
        total_gasto=total_gasto,
    )


@perfil_bp.route('/perfil/atualizar', methods=['POST'])
@login_required
def atualizar():
    nome = request.form.get('nome', '').strip()
    email_notif = request.form.get('email_notificacoes', '').strip()
    notif = request.form.get('notificacoes_email') == 'on'

    if nome:
        current_user.nome = nome
    current_user.email_notificacoes = email_notif if email_notif else None
    current_user.notificacoes_email = notif
    db.session.commit()
    flash('Perfil atualizado com sucesso!', 'success')
    return redirect(url_for('perfil.perfil'))


@perfil_bp.route('/perfil/alterar-password', methods=['POST'])
@login_required
def alterar_password():
    atual = request.form.get('password_atual', '')
    nova = request.form.get('password_nova', '')
    confirmar = request.form.get('confirmar_password', '')

    if not current_user.check_password(atual):
        flash('Password atual incorreta.', 'error')
    elif len(nova) < 6:
        flash('A nova password deve ter pelo menos 6 caracteres.', 'error')
    elif nova != confirmar:
        flash('As passwords não coincidem.', 'error')
    else:
        current_user.set_password(nova)
        db.session.commit()
        flash('Password alterada com sucesso!', 'success')
    return redirect(url_for('perfil.perfil'))


@perfil_bp.route('/perfil/eliminar-conta', methods=['POST'])
@login_required
def eliminar_conta():
    from flask_login import logout_user
    import shutil, os
    from flask import current_app

    user_id = current_user.id

    # Apagar ficheiros físicos
    data_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], str(user_id))
    storage_dir = os.path.join(current_app.config['STORAGE_FOLDER'], str(user_id))
    for d in [data_dir, storage_dir]:
        if os.path.exists(d):
            shutil.rmtree(d)

    logout_user()
    user = db.session.get(db.Model.__class__, user_id)
    # Apagar via query
    from app.models import User
    User.query.filter_by(id=user_id).delete()
    db.session.commit()
    flash('Conta eliminada.', 'success')
    return redirect(url_for('auth.login'))

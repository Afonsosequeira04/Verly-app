import os
import uuid
from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app import db
from app.models import Fatura, Conversa

perfil_bp = Blueprint('perfil', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def _allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@perfil_bp.route('/perfil')
@login_required
def perfil():
    num_faturas   = Fatura.query.filter_by(user_id=current_user.id).count()
    num_conversas = Conversa.query.filter_by(user_id=current_user.id).count()
    total_gasto   = db.session.query(db.func.sum(Fatura.total)).filter_by(user_id=current_user.id).scalar() or 0
    return render_template('perfil.html',
        num_faturas=num_faturas,
        num_conversas=num_conversas,
        total_gasto=total_gasto,
    )


@perfil_bp.route('/perfil/atualizar', methods=['POST'])
@login_required
def atualizar():
    nome       = request.form.get('nome', '').strip()
    email_notif = request.form.get('email_notificacoes', '').strip()
    notif      = request.form.get('notificacoes_email') == 'on'

    if nome:
        current_user.nome = nome
    current_user.email_notificacoes = email_notif if email_notif else None
    current_user.notificacoes_email = notif
    db.session.commit()
    flash('Perfil atualizado com sucesso!', 'success')
    return redirect(url_for('perfil.perfil'))


@perfil_bp.route('/perfil/upload-avatar', methods=['POST'])
@login_required
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'success': False, 'message': 'Nenhum ficheiro enviado.'})

    file = request.files['avatar']
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'Nenhum ficheiro selecionado.'})

    if not _allowed_file(file.filename):
        return jsonify({'success': False, 'message': 'Formato inválido. Usa PNG, JPG ou WebP.'})

    # Garante pasta do utilizador
    user_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    # Apaga avatar anterior se existir
    if current_user.avatar:
        old_path = os.path.join(current_app.config['UPLOAD_FOLDER'], current_user.avatar.lstrip('/'))
        if os.path.exists(old_path):
            os.remove(old_path)

    ext      = file.filename.rsplit('.', 1)[1].lower()
    filename = f"avatar_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(user_dir, filename)
    file.save(filepath)

    # Guarda o path relativo ao UPLOAD_FOLDER
    current_user.avatar = f"{current_user.id}/{filename}"
    db.session.commit()

    avatar_url = url_for('static', filename='') # não usado — devolve via route dedicado
    return jsonify({'success': True, 'avatar_url': url_for('perfil.get_avatar', user_id=current_user.id)})


@perfil_bp.route('/perfil/avatar/<int:user_id>')
@login_required
def get_avatar(user_id):
    from flask import send_file, abort
    if user_id != current_user.id:
        abort(403)
    if not current_user.avatar:
        abort(404)
    path = os.path.join(current_app.config['UPLOAD_FOLDER'], current_user.avatar)
    if not os.path.exists(path):
        abort(404)
    return send_file(path)


@perfil_bp.route('/perfil/alterar-password', methods=['POST'])
@login_required
def alterar_password():
    atual     = request.form.get('password_atual', '')
    nova      = request.form.get('password_nova', '')
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
    import shutil

    user_id = current_user.id
    data_dir    = os.path.join(current_app.config['UPLOAD_FOLDER'],  str(user_id))
    storage_dir = os.path.join(current_app.config['STORAGE_FOLDER'], str(user_id))
    for d in [data_dir, storage_dir]:
        if os.path.exists(d):
            shutil.rmtree(d)

    logout_user()
    from app.models import User
    User.query.filter_by(id=user_id).delete()
    db.session.commit()
    flash('Conta eliminada.', 'success')
    return redirect(url_for('auth.login'))
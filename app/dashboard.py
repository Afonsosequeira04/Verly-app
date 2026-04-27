import json
from flask import Blueprint, render_template
from flask_login import login_required, current_user
from app.models import Fatura, Conversa

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/dashboard')
@login_required
def dashboard():
    faturas = Fatura.query.filter_by(user_id=current_user.id).order_by(Fatura.data_upload.desc()).all()
    conversas = Conversa.query.filter_by(user_id=current_user.id).order_by(Conversa.timestamp.desc()).limit(5).all()

    # Métricas
    total_gasto = sum(f.total or 0 for f in faturas)
    num_faturas = len(faturas)
    num_conversas = Conversa.query.filter_by(user_id=current_user.id).count()

    # Loja com mais compras
    lojas = {}
    for f in faturas:
        loja = f.loja or 'Desconhecida'
        lojas[loja] = lojas.get(loja, 0) + (f.total or 0)
    top_loja = max(lojas, key=lojas.get) if lojas else '—'

    # Dados para gráfico de gastos por loja
    chart_labels = list(lojas.keys())[:6]
    chart_values = [round(lojas[l], 2) for l in chart_labels]

    # Últimas 5 faturas
    ultimas_faturas = faturas[:5]

    return render_template('dashboard.html',
        total_gasto=total_gasto,
        num_faturas=num_faturas,
        num_conversas=num_conversas,
        top_loja=top_loja,
        chart_labels=json.dumps(chart_labels),
        chart_values=json.dumps(chart_values),
        ultimas_faturas=ultimas_faturas,
        conversas_recentes=conversas
    )

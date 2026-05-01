import json
from datetime import datetime
from flask import Blueprint, render_template
from flask_login import login_required, current_user
from app.models import Fatura, Conversa
from app.subscriptions import detect_subscriptions

dashboard_bp = Blueprint('dashboard', __name__)


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


@dashboard_bp.route('/dashboard')
@login_required
def dashboard():
    faturas = Fatura.query.filter_by(user_id=current_user.id).order_by(Fatura.data_upload.desc()).all()
    conversas = Conversa.query.filter_by(user_id=current_user.id).order_by(Conversa.timestamp.desc()).limit(5).all()

    total_gasto = sum(f.total or 0 for f in faturas)
    num_faturas = len(faturas)
    num_conversas = Conversa.query.filter_by(user_id=current_user.id).count()

    # Top loja
    lojas = {}
    for f in faturas:
        loja = f.loja or 'Desconhecida'
        lojas[loja] = lojas.get(loja, 0) + (f.total or 0)
    top_loja = max(lojas, key=lojas.get) if lojas else '—'

    # Gastos por categoria
    categorias = {}
    for f in faturas:
        cat = f.categoria or 'Outros'
        categorias[cat] = categorias.get(cat, 0) + (f.total or 0)

    cat_labels = list(categorias.keys())
    cat_values = [round(categorias[c], 2) for c in cat_labels]

    # Gastos por loja (top 6)
    lojas_sorted = sorted(lojas.items(), key=lambda x: x[1], reverse=True)[:6]
    loja_labels = [l[0] for l in lojas_sorted]
    loja_values = [round(l[1], 2) for l in lojas_sorted]

    # Alertas de garantia e devolução
    hoje = datetime.now()
    alertas = []
    for f in faturas:
        data_dev = _parse_date(f.data_devolucao)
        if data_dev and data_dev >= hoje:
            dias = (data_dev - hoje).days
            if dias <= 7:
                alertas.append({
                    'tipo': 'devolucao',
                    'fatura': f.nome_ficheiro,
                    'loja': f.loja or '—',
                    'data': f.data_devolucao,
                    'dias': dias,
                    'urgencia': 'critico' if dias <= 3 else 'aviso'
                })
        data_gar = _parse_date(f.data_garantia)
        if data_gar and data_gar >= hoje:
            dias = (data_gar - hoje).days
            if dias <= 30:
                alertas.append({
                    'tipo': 'garantia',
                    'fatura': f.nome_ficheiro,
                    'loja': f.loja or '—',
                    'data': f.data_garantia,
                    'dias': dias,
                    'urgencia': 'critico' if dias <= 7 else 'aviso'
                })

    alertas.sort(key=lambda x: x['dias'])

    # Subscrições
    subs_data = detect_subscriptions(current_user.id)

    return render_template('dashboard.html',
        total_gasto=total_gasto,
        num_faturas=num_faturas,
        num_conversas=num_conversas,
        top_loja=top_loja,
        cat_labels=json.dumps(cat_labels),
        cat_values=json.dumps(cat_values),
        loja_labels=json.dumps(loja_labels),
        loja_values=json.dumps(loja_values),
        ultimas_faturas=faturas[:5],
        conversas_recentes=conversas,
        alertas=alertas,
        subs_total_mensal=subs_data['total_mensal_desperdicado'],
        subs_count_danger=subs_data['count_danger'],
        subs_count_warning=subs_data['count_warning'],
        subs_top=subs_data['subscriptions'][:3],
    )
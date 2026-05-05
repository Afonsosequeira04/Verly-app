"""
estatisticas.py — Página de estatísticas detalhadas
"""
from collections import defaultdict
from datetime import datetime
from flask import Blueprint, render_template
from flask_login import login_required, current_user
from app.models import Fatura
from app import db

estatisticas_bp = Blueprint('estatisticas', __name__)


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


@estatisticas_bp.route('/estatisticas')
@login_required
def estatisticas():
    faturas = Fatura.query.filter_by(user_id=current_user.id).all()

    # Gastos por categoria
    por_categoria = defaultdict(float)
    # Gastos por mês (últimos 12)
    por_mes = defaultdict(float)
    # Gastos por loja (top 10)
    por_loja = defaultdict(float)
    # Gastos por dia da semana
    por_dia_semana = defaultdict(float)
    # Totais gerais
    total_geral = 0
    num_faturas = len(faturas)

    dias_semana_nomes = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

    for f in faturas:
        valor = f.total or 0
        total_geral += valor

        cat = f.categoria or 'Outros'
        por_categoria[cat] += valor

        loja = f.loja or 'Desconhecida'
        por_loja[loja] += valor

        data = _parse_date(f.data_compra) or f.data_upload
        if data:
            if hasattr(data, 'date'):
                data = data.date()
            mes_key = f"{data.year}-{data.month:02d}"
            por_mes[mes_key] += valor
            por_dia_semana[data.weekday()] += valor

    # Ordenar meses
    meses_sorted = sorted(por_mes.keys())[-12:]
    meses_labels = []
    for mk in meses_sorted:
        ano, mes = mk.split('-')
        nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        meses_labels.append(f"{nomes[int(mes)]} {ano}")
    meses_values = [round(por_mes[mk], 2) for mk in meses_sorted]

    # Top lojas
    top_lojas = sorted(por_loja.items(), key=lambda x: x[1], reverse=True)[:8]

    # Categorias ordenadas
    cats_sorted = sorted(por_categoria.items(), key=lambda x: x[1], reverse=True)

    # Dia da semana com mais gastos
    dia_semana_values = [round(por_dia_semana.get(i, 0), 2) for i in range(7)]

    # Média por fatura
    media_fatura = round(total_geral / num_faturas, 2) if num_faturas > 0 else 0

    # Mês com mais gastos
    melhor_mes = max(por_mes, key=por_mes.get) if por_mes else None
    melhor_mes_nome = None
    if melhor_mes:
        ano, mes = melhor_mes.split('-')
        nomes = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
        melhor_mes_nome = f"{nomes[int(mes)]} {ano}"

    return render_template('estatisticas.html',
        total_geral=round(total_geral, 2),
        num_faturas=num_faturas,
        media_fatura=media_fatura,
        melhor_mes_nome=melhor_mes_nome,
        melhor_mes_valor=round(por_mes.get(melhor_mes, 0), 2) if melhor_mes else 0,
        meses_labels=meses_labels,
        meses_values=meses_values,
        cats_labels=[c[0] for c in cats_sorted],
        cats_values=[round(c[1], 2) for c in cats_sorted],
        top_lojas_labels=[l[0] for l in top_lojas],
        top_lojas_values=[round(l[1], 2) for l in top_lojas],
        dia_semana_labels=dias_semana_nomes,
        dia_semana_values=dia_semana_values,
    )

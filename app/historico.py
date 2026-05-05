"""
historico.py — Timeline cronológica de todas as transações
"""
from datetime import datetime
from flask import Blueprint, render_template, request
from flask_login import login_required, current_user
from app.models import Fatura, CATEGORIAS
from app import db

historico_bp = Blueprint('historico', __name__)


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


def _get_data_obj(f):
    data = _parse_date(f.data_compra) or f.data_upload
    if data is None:
        return None
    if hasattr(data, 'date'):
        return data.date()
    return data


@historico_bp.route('/historico')
@login_required
def historico():
    categoria_filter = request.args.get('categoria', '')
    mes_filter = request.args.get('mes', '')
    search = request.args.get('q', '').strip().lower()

    faturas = Fatura.query.filter_by(user_id=current_user.id).all()

    # Meses disponíveis para o filtro (calculado antes de aplicar filtros)
    todos_meses_set = set()
    for f in faturas:
        d = _get_data_obj(f)
        if d:
            todos_meses_set.add(f"{d.year}-{d.month:02d}")
    todos_meses = sorted(todos_meses_set, reverse=True)

    # Enriquecer e filtrar
    resultado = []
    for f in faturas:
        data_obj = _get_data_obj(f)

        if categoria_filter and f.categoria != categoria_filter:
            continue
        if mes_filter and data_obj:
            if f"{data_obj.year}-{data_obj.month:02d}" != mes_filter:
                continue
        if search:
            campos = f"{f.loja or ''} {f.categoria or ''} {f.nome_ficheiro or ''}".lower()
            if search not in campos:
                continue

        resultado.append({
            'id': f.id,
            'loja': f.loja or 'Desconhecida',
            'categoria': f.categoria or 'Outros',
            'total': f.total or 0,
            'data': data_obj,
            'data_str': data_obj.strftime('%d/%m/%Y') if data_obj else '—',
            'nome_ficheiro': f.nome_ficheiro,
        })

    # Ordenar por data descendente
    resultado.sort(key=lambda x: x['data'] or datetime.min.date(), reverse=True)

    # Agrupar por mês
    grupos = {}
    nomes_mes = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
    for item in resultado:
        if item['data']:
            key = f"{item['data'].year}-{item['data'].month:02d}"
            nome = f"{nomes_mes[item['data'].month]} {item['data'].year}"
        else:
            key = 'sem-data'
            nome = 'Sem data'
        if key not in grupos:
            grupos[key] = {'nome': nome, 'items': [], 'total': 0}
        grupos[key]['items'].append(item)
        grupos[key]['total'] += item['total']

    grupos_sorted = [grupos[k] for k in sorted(grupos.keys(), reverse=True)]

    return render_template('historico.html',
        grupos=grupos_sorted,
        categorias=CATEGORIAS,
        categoria_filter=categoria_filter,
        mes_filter=mes_filter,
        search=search,
        todos_meses=todos_meses,
        total_resultado=sum(i['total'] for i in resultado),
        num_resultado=len(resultado),
    )
"""
app/api/mobile_extras.py — Endpoints mobile para Score, Impulse, Relatório, Histórico e Lojas

Registar em app/api/__init__.py:
    from app.api import mobile_extras  # noqa — registo automático via decoradores
"""

from collections import defaultdict
from datetime import datetime
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Fatura, User


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(str(date_str).strip(), fmt).date()
        except ValueError:
            continue
    return None


def _get_data_obj(f):
    d = _parse_date(f.data_compra)
    if d:
        return d
    if f.data_upload:
        return f.data_upload.date() if hasattr(f.data_upload, 'date') else f.data_upload
    return None


# ── Score de Compras (/api/v1/scoring/analisar) ────────────────────────────────

@api_bp.route('/scoring/analisar', methods=['POST'])
@jwt_required()
def scoring_analisar():
    """Replica /scoring/analisar para mobile. Reutiliza a lógica do scoring.py."""
    from app.scoring import calcular_score
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'

    data = request.json or {}
    item      = (data.get('item') or 'Item').strip() or 'Item'
    preco     = float(data.get('preco') or 0)
    categoria = data.get('categoria', 'Outros')
    uso       = data.get('uso', 'monthly')

    resultado = calcular_score(categoria, preco, uso, personalidade, item=item)
    resultado['item'] = item
    return jsonify({'success': True, 'resultado': resultado})


@api_bp.route('/scoring/fatura/<int:fatura_id>', methods=['GET'])
@jwt_required()
def scoring_fatura_mobile(fatura_id):
    """Score de uma fatura específica."""
    from app.scoring import calcular_score
    user_id = int(get_jwt_identity())
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=user_id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Fatura não encontrada.'}), 404

    user = User.query.get(user_id)
    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'
    item = fatura.loja or fatura.nome_ficheiro

    resultado = calcular_score(
        categoria=fatura.categoria or 'Outros',
        preco=fatura.total or 0,
        uso='monthly',
        personalidade=personalidade,
        item=item,
    )
    resultado['item'] = item
    return jsonify({'success': True, 'resultado': resultado})


# ── Lojas Próximas (/api/v1/scoring/lojas-proximas) ──────────────────────────
# Reutiliza exatamente a mesma lógica que a web (app/scoring.py)

@api_bp.route('/scoring/lojas-proximas', methods=['POST'])
@jwt_required()
def lojas_proximas_mobile():
    """
    Procura lojas próximas via Google Places (ou Overpass como fallback).
    Body JSON: { item, categoria, lat, lng }
    """
    from app.scoring import buscar_lojas_osm
    data = request.json or {}
    lat       = data.get('lat')
    lng       = data.get('lng')
    categoria = data.get('categoria', 'Outros')
    item      = data.get('item', '')

    if lat is None or lng is None:
        return jsonify({'success': False, 'message': 'Localização não fornecida.', 'lojas': []})

    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'Coordenadas inválidas.', 'lojas': []})

    lojas = buscar_lojas_osm(lat, lng, categoria, item=item)
    return jsonify({'success': True, 'lojas': lojas, 'item': item})


@api_bp.route('/scoring/precos', methods=['POST'])
@jwt_required()
def scoring_precos_mobile():
    """Compara preços online reais quando SERPAPI_KEY está configurada."""
    from app.scoring import buscar_precos_online
    data = request.json or {}
    item = (data.get('item') or '').strip()
    categoria = data.get('categoria', 'Outros')
    if not item:
        return jsonify({'success': False, 'error': 'Produto obrigatório.', 'items': []}), 400
    result = buscar_precos_online(item, categoria)
    return jsonify({'success': True, **result})


# ── Impulse Control (/api/v1/impulse/analisar) ────────────────────────────────

@api_bp.route('/impulse/analisar', methods=['POST'])
@jwt_required()
def impulse_analisar():
    """Impulse control para mobile."""
    from app.impulse import SYSTEM_PROMPTS, _call_llm
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    data = request.json or {}
    produto       = (data.get('produto') or '').strip()
    personalidade = data.get('personalidade', getattr(user, 'personalidade', 'calm') or 'calm')

    if not produto:
        return jsonify({'success': False, 'message': 'Descreve o que queres comprar.'}), 400

    if personalidade not in SYSTEM_PROMPTS:
        personalidade = 'calm'

    system    = SYSTEM_PROMPTS[personalidade]
    resultado = _call_llm(system, produto)

    return jsonify({
        'success':       True,
        'personalidade': personalidade,
        'produto':       produto,
        'resultado':     resultado,
    })


# ── Relatório Mensal (/api/v1/relatorio/api) ─────────────────────────────────

@api_bp.route('/relatorio/api', methods=['GET'])
@jwt_required()
def relatorio_api_mobile():
    """Relatório mensal para mobile. Reutiliza gerar_relatorio e _roast_phrase."""
    from app.reports import gerar_relatorio, _roast_phrase
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    mes = request.args.get('mes', type=int)
    ano = request.args.get('ano', type=int)

    data = gerar_relatorio(user_id, mes, ano)

    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'
    data['roast_phrase'] = (
        _roast_phrase(data['total_gasto'], data['desperdicado'], data['top_cat'], personalidade)
        if data['total_gasto'] > 0
        else 'Sem dados este mês. Carrega as tuas faturas!'
    )

    return jsonify({'success': True, **data})


# ── Histórico (/api/v1/historico/api) ─────────────────────────────────────────

NOMES_MES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
             'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']


@api_bp.route('/historico/api', methods=['GET'])
@jwt_required()
def historico_api_mobile():
    """
    Histórico filtrado para mobile.
    Query params: q (pesquisa), categoria, mes (YYYY-MM)
    """
    user_id = int(get_jwt_identity())

    categoria_filter = request.args.get('categoria', '')
    mes_filter       = request.args.get('mes', '')
    search           = request.args.get('q', '').strip().lower()

    faturas = Fatura.query.filter_by(user_id=user_id).all()

    resultado = []
    for f in faturas:
        data_obj = _get_data_obj(f)

        if categoria_filter and f.categoria != categoria_filter:
            continue
        if mes_filter and data_obj:
            if f'{data_obj.year}-{data_obj.month:02d}' != mes_filter:
                continue
        if search:
            campos = f'{f.loja or ""} {f.categoria or ""} {f.nome_ficheiro or ""}'.lower()
            if search not in campos:
                continue

        resultado.append({
            'id':          f.id,
            'loja':        f.loja or 'Desconhecida',
            'categoria':   f.categoria or 'Outros',
            'total':       f.total or 0,
            'data_str':    data_obj.strftime('%d/%m/%Y') if data_obj else '—',
            'data_upload': f.data_upload.isoformat() if f.data_upload else None,
        })

    resultado.sort(key=lambda x: x['data_str'], reverse=True)

    # Agrupar por mês
    grupos_dict = {}
    for item in resultado:
        d = _parse_date(item['data_str']) if item['data_str'] != '—' else None
        if d:
            key  = f'{d.year}-{d.month:02d}'
            nome = f'{NOMES_MES[d.month]} {d.year}'
        else:
            key  = 'sem-data'
            nome = 'Sem data'

        if key not in grupos_dict:
            grupos_dict[key] = {'nome': nome, 'items': [], 'total': 0}
        grupos_dict[key]['items'].append(item)
        grupos_dict[key]['total'] = round(grupos_dict[key]['total'] + item['total'], 2)

    grupos = [grupos_dict[k] for k in sorted(grupos_dict.keys(), reverse=True)]

    return jsonify({
        'success':         True,
        'grupos':          grupos,
        'total_resultado': round(sum(i['total'] for i in resultado), 2),
        'num_resultado':   len(resultado),
    })

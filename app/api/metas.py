"""
app/api/metas.py — Metas para mobile (JWT)

GET    /api/v1/metas          → lista metas com gastos do mês atual
POST   /api/v1/metas          → cria nova meta {nome, limite, categoria}
DELETE /api/v1/metas/<id>     → apaga meta
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.financial_records import normalize_text, summarize_expenses
from app.models import Meta, Fatura, CATEGORIAS
from app import db
from datetime import datetime


def _gastos_mes_atual(user_id):
    summary = summarize_expenses(user_id)
    return {
        item['categoria']: item['valor']
        for item in summary['mes_atual']['por_categoria']
    }


def _gasto_categoria(gastos, categoria):
    if categoria in gastos:
        return gastos[categoria]
    categoria_key = normalize_text(categoria)
    for key, value in gastos.items():
        if normalize_text(key) == categoria_key:
            return value
    return 0


def _gastos_mes_atual_faturas(user_id):
    hoje = datetime.now()
    faturas = Fatura.query.filter_by(user_id=user_id).all()
    gastos = {}
    for f in faturas:
        data = None
        if f.data_compra:
            for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
                try:
                    data = datetime.strptime(f.data_compra.strip(), fmt)
                    break
                except ValueError:
                    continue
        if data is None and f.data_upload:
            data = f.data_upload
        if data and data.month == hoje.month and data.year == hoje.year:
            cat = f.categoria or 'Outros'
            gastos[cat] = gastos.get(cat, 0) + (f.total or 0)
    return gastos


@api_bp.route('/metas', methods=['GET'])
@jwt_required()
def listar_metas():
    user_id = int(get_jwt_identity())
    metas = Meta.query.filter_by(user_id=user_id).all()
    gastos = _gastos_mes_atual(user_id)

    result = []
    for m in metas:
        gasto = _gasto_categoria(gastos, m.categoria)
        pct = min(round((gasto / m.valor_limite) * 100) if m.valor_limite > 0 else 0, 100)
        result.append({
            'id':        m.id,
            'nome':      m.nome or m.categoria,
            'categoria': m.categoria,
            'limite':    m.valor_limite,
            'gasto':     round(gasto, 2),
            'pct':       pct,
            'sobra':     round(max(m.valor_limite - gasto, 0), 2),
            'ultrapassou': gasto > m.valor_limite,
        })

    return jsonify({'metas': result, 'categorias': CATEGORIAS})


@api_bp.route('/metas', methods=['POST'])
@jwt_required()
def criar_meta():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    nome      = (data.get('nome') or '').strip()
    categoria = (data.get('categoria') or '').strip()
    limite    = data.get('limite')

    if not categoria or categoria not in CATEGORIAS:
        return jsonify({'error': 'Categoria inválida.'}), 400
    try:
        limite = float(limite)
        if limite <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'error': 'Limite inválido.'}), 400

    # Actualiza se já existe uma meta para essa categoria
    meta = Meta.query.filter_by(user_id=user_id, categoria=categoria).first()
    if meta:
        meta.valor_limite = limite
        meta.nome = nome or categoria
    else:
        meta = Meta(user_id=user_id, nome=nome or categoria, categoria=categoria, valor_limite=limite)
        db.session.add(meta)
    db.session.commit()

    gastos = _gastos_mes_atual(user_id)
    gasto = _gasto_categoria(gastos, meta.categoria)

    return jsonify({
        'success': True,
        'meta': {
            'id':        meta.id,
            'nome':      meta.nome or meta.categoria,
            'categoria': meta.categoria,
            'limite':    meta.valor_limite,
            'gasto':     round(gasto, 2),
            'pct':       min(round((gasto / meta.valor_limite) * 100) if meta.valor_limite > 0 else 0, 100),
            'sobra':     round(max(meta.valor_limite - gasto, 0), 2),
            'ultrapassou': gasto > meta.valor_limite,
        }
    }), 201


@api_bp.route('/metas/<int:meta_id>', methods=['DELETE'])
@jwt_required()
def apagar_meta(meta_id):
    user_id = int(get_jwt_identity())
    meta = Meta.query.filter_by(id=meta_id, user_id=user_id).first_or_404()
    db.session.delete(meta)
    db.session.commit()
    return jsonify({'success': True})

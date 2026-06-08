from collections import defaultdict
from datetime import datetime

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.api import api_bp
from app.models import NetWorthItem, NetWorthSnapshot


def _money(value):
    return round(float(value or 0), 2)


def _clean_currency(value):
    return (value or 'EUR').strip().upper()[:10] or 'EUR'


def _snapshot_to_dict(snapshot):
    return {
        'id': snapshot.id,
        'valor': _money(snapshot.valor),
        'currency': snapshot.currency or 'EUR',
        'criado_em': snapshot.criado_em.isoformat() if snapshot.criado_em else None,
    }


def _tracking_payload(history):
    points = [_snapshot_to_dict(snapshot) for snapshot in history]
    delta = 0
    delta_pct = 0
    if len(points) >= 2:
        prev = float(points[-2]['valor'] or 0)
        last = float(points[-1]['valor'] or 0)
        delta = round(last - prev, 2)
        delta_pct = round((delta / prev) * 100, 1) if prev else 0
    return {
        'points': points,
        'delta': delta,
        'delta_pct': delta_pct,
    }


def _item_to_dict(item, history=None):
    history = history or []
    return {
        'id': item.id,
        'nome': item.nome,
        'tipo': item.tipo,
        'categoria': item.categoria,
        'valor': _money(item.valor),
        'currency': item.currency or 'EUR',
        'criado_em': item.criado_em.isoformat() if item.criado_em else None,
        'atualizado_em': item.atualizado_em.isoformat() if item.atualizado_em else None,
        'tracking': _tracking_payload(history),
    }


def _record_snapshot(item):
    db.session.add(NetWorthSnapshot(
        item_id=item.id,
        valor=item.valor,
        currency=item.currency or 'EUR',
        criado_em=datetime.utcnow(),
    ))


def _build_summary(items):
    currencies = sorted({item.currency or 'EUR' for item in items}) or ['EUR']
    primary = currencies[0]

    assets = sum(float(item.valor or 0) for item in items if item.tipo == 'asset' and (item.currency or 'EUR') == primary)
    liabilities = sum(float(item.valor or 0) for item in items if item.tipo == 'liability' and (item.currency or 'EUR') == primary)

    pie_by_category = defaultdict(float)
    liability_by_category = defaultdict(float)
    for item in items:
        if (item.currency or 'EUR') != primary:
            continue
        if item.tipo == 'asset':
            pie_by_category[item.categoria or 'Outros'] += float(item.valor or 0)
        elif item.tipo == 'liability':
            liability_by_category[item.categoria or 'Outros'] += float(item.valor or 0)

    return {
        'currency': primary,
        'assets': _money(assets),
        'liabilities': _money(liabilities),
        'net_worth': _money(assets - liabilities),
        'count': len(items),
        'available_currencies': currencies,
        'pie': [
            {'categoria': categoria, 'valor': _money(valor), 'currency': primary}
            for categoria, valor in sorted(pie_by_category.items(), key=lambda row: row[1], reverse=True)
            if valor > 0
        ],
        'liabilities_by_category': [
            {'categoria': categoria, 'valor': _money(valor), 'currency': primary}
            for categoria, valor in sorted(liability_by_category.items(), key=lambda row: row[1], reverse=True)
            if valor > 0
        ],
    }


@api_bp.route('/networth', methods=['GET'])
@jwt_required()
def networth_get():
    user_id = int(get_jwt_identity())
    items = (
        NetWorthItem.query
        .filter_by(user_id=user_id, ativo=True)
        .order_by(NetWorthItem.tipo.asc(), NetWorthItem.valor.desc())
        .all()
    )
    item_ids = [item.id for item in items]
    histories = defaultdict(list)
    if item_ids:
        snapshots = (
            NetWorthSnapshot.query
            .filter(NetWorthSnapshot.item_id.in_(item_ids))
            .order_by(NetWorthSnapshot.criado_em.asc(), NetWorthSnapshot.id.asc())
            .all()
        )
        for snapshot in snapshots:
            histories[snapshot.item_id].append(snapshot)
    return jsonify({
        'success': True,
        'items': [_item_to_dict(item, histories.get(item.id, [])) for item in items],
        'summary': _build_summary(items),
    })


@api_bp.route('/networth/items', methods=['POST'])
@jwt_required()
def networth_create_item():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    nome = (data.get('nome') or '').strip()
    tipo = (data.get('tipo') or 'asset').strip().lower()
    categoria = (data.get('categoria') or 'Outros').strip() or 'Outros'

    if tipo not in ('asset', 'liability'):
        return jsonify({'success': False, 'error': 'tipo deve ser asset ou liability.'}), 400
    if not nome:
        return jsonify({'success': False, 'error': 'Nome obrigatorio.'}), 400
    try:
        valor = float(data.get('valor') or 0)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'Valor invalido.'}), 400
    if valor <= 0:
        return jsonify({'success': False, 'error': 'Valor deve ser maior que zero.'}), 400

    item = NetWorthItem(
        user_id=user_id,
        nome=nome,
        tipo=tipo,
        categoria=categoria[:80],
        valor=valor,
        currency=_clean_currency(data.get('currency')),
        criado_em=datetime.utcnow(),
        atualizado_em=datetime.utcnow(),
    )
    db.session.add(item)
    db.session.flush()
    _record_snapshot(item)
    db.session.commit()
    return jsonify({'success': True, 'item': _item_to_dict(item, item.snapshots)}), 201


@api_bp.route('/networth/items/<int:item_id>', methods=['PATCH'])
@jwt_required()
def networth_update_item(item_id):
    user_id = int(get_jwt_identity())
    item = NetWorthItem.query.filter_by(id=item_id, user_id=user_id, ativo=True).first()
    if not item:
        return jsonify({'success': False, 'error': 'Item nao encontrado.'}), 404

    data = request.get_json(silent=True) or {}
    changed_value = False

    if 'nome' in data and (data.get('nome') or '').strip():
        item.nome = data['nome'].strip()[:160]
    if 'tipo' in data:
        tipo = (data.get('tipo') or item.tipo).strip().lower()
        if tipo not in ('asset', 'liability'):
            return jsonify({'success': False, 'error': 'tipo deve ser asset ou liability.'}), 400
        item.tipo = tipo
    if 'categoria' in data and (data.get('categoria') or '').strip():
        item.categoria = data['categoria'].strip()[:80]
    if 'currency' in data:
        item.currency = _clean_currency(data.get('currency'))
    if 'valor' in data:
        try:
            valor = float(data.get('valor') or 0)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'Valor invalido.'}), 400
        if valor <= 0:
            return jsonify({'success': False, 'error': 'Valor deve ser maior que zero.'}), 400
        changed_value = abs(float(item.valor or 0) - valor) > 0.009
        item.valor = valor

    item.atualizado_em = datetime.utcnow()
    if changed_value:
        _record_snapshot(item)
    db.session.commit()

    history = (
        NetWorthSnapshot.query
        .filter_by(item_id=item.id)
        .order_by(NetWorthSnapshot.criado_em.asc(), NetWorthSnapshot.id.asc())
        .all()
    )
    return jsonify({'success': True, 'item': _item_to_dict(item, history)})


@api_bp.route('/networth/items/<int:item_id>', methods=['DELETE'])
@jwt_required()
def networth_delete_item(item_id):
    user_id = int(get_jwt_identity())
    item = NetWorthItem.query.filter_by(id=item_id, user_id=user_id, ativo=True).first()
    if not item:
        return jsonify({'success': False, 'error': 'Item nao encontrado.'}), 404
    item.ativo = False
    item.atualizado_em = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True})

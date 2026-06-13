from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.api import api_bp
from app.financial_records import clean_currency
from app.live_deals import (
    analyze_live_deal,
    monthly_replay,
    refresh_watchlist_item,
    watchlist_item_to_dict,
)
from app.models import DealWatchlistItem, User


def _user_id():
    return int(get_jwt_identity())


def _bool_value(data, key, default=True):
    if key not in data:
        return default
    return bool(data.get(key))


def _float_value(value, default=None):
    try:
        if value in (None, ''):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


@api_bp.route('/live-deals/search', methods=['POST'])
@jwt_required()
def live_deals_search():
    user_id = _user_id()
    user = User.query.get(user_id)
    data = request.json or {}
    product = (data.get('product_name') or data.get('produto') or data.get('item') or '').strip()
    if not product:
        return jsonify({'success': False, 'error': 'Produto obrigatorio.'}), 400

    currency = clean_currency(data.get('currency') or getattr(user, 'moeda_preferida', 'EUR') or 'EUR')
    try:
        result = analyze_live_deal(
            user_id,
            product,
            category=data.get('category') or data.get('categoria') or 'Outros',
            lat=_float_value(data.get('lat')),
            lng=_float_value(data.get('lng')),
            urgency=data.get('urgency') or 'flexible',
            budget_limit=_float_value(data.get('budget_limit')),
            radius_km=_float_value(data.get('radius_km'), 5),
            currency=currency,
        )
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    return jsonify(result)


@api_bp.route('/live-deals/watchlist', methods=['GET'])
@jwt_required()
def live_deals_watchlist():
    user_id = _user_id()
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    query = DealWatchlistItem.query.filter_by(user_id=user_id)
    if not include_inactive:
        query = query.filter_by(active=True)
    items = query.order_by(DealWatchlistItem.criado_em.desc()).all()
    return jsonify({
        'success': True,
        'items': [watchlist_item_to_dict(item, include_result=True) for item in items],
    })


@api_bp.route('/live-deals/watchlist', methods=['POST'])
@jwt_required()
def live_deals_create_watch():
    user_id = _user_id()
    user = User.query.get(user_id)
    data = request.json or {}
    product = (data.get('product_name') or data.get('produto') or data.get('item') or '').strip()
    if not product:
        return jsonify({'success': False, 'error': 'Produto obrigatorio.'}), 400

    item = DealWatchlistItem(
        user_id=user_id,
        product_name=product[:220],
        category=(data.get('category') or data.get('categoria') or 'Outros')[:80],
        target_price=_float_value(data.get('target_price')),
        currency=clean_currency(data.get('currency') or getattr(user, 'moeda_preferida', 'EUR') or 'EUR'),
        urgency=data.get('urgency') or 'flexible',
        budget_limit=_float_value(data.get('budget_limit')),
        radius_km=_float_value(data.get('radius_km'), 5),
        lat=_float_value(data.get('lat')),
        lng=_float_value(data.get('lng')),
        notify_price_drop=_bool_value(data, 'notify_price_drop', True),
        notify_stock=_bool_value(data, 'notify_stock', True),
        notify_coupon=_bool_value(data, 'notify_coupon', True),
        notify_good_time=_bool_value(data, 'notify_good_time', True),
    )
    db.session.add(item)
    db.session.flush()

    refresh = data.get('refresh', True)
    analysis = None
    alerts = []
    if refresh:
        try:
            analysis, alerts = refresh_watchlist_item(item)
        except Exception as exc:
            db.session.rollback()
            return jsonify({'success': False, 'error': f'Nao foi possivel verificar produto: {exc}'}), 502

    db.session.commit()
    payload = watchlist_item_to_dict(item, include_result=True)
    if analysis:
        payload['result'] = analysis
        payload['alerts'] = alerts
    return jsonify({'success': True, 'item': payload}), 201


@api_bp.route('/live-deals/watchlist/<int:item_id>', methods=['PATCH'])
@jwt_required()
def live_deals_update_watch(item_id):
    user_id = _user_id()
    item = DealWatchlistItem.query.filter_by(id=item_id, user_id=user_id).first()
    if not item:
        return jsonify({'success': False, 'error': 'Produto nao encontrado.'}), 404

    data = request.json or {}
    mapping = {
        'product_name': 'product_name',
        'category': 'category',
        'urgency': 'urgency',
    }
    for key, attr in mapping.items():
        if key in data and data.get(key) is not None:
            setattr(item, attr, str(data.get(key)).strip()[:220 if attr == 'product_name' else 80])

    for key in ('target_price', 'budget_limit', 'radius_km', 'lat', 'lng'):
        if key in data:
            setattr(item, key, _float_value(data.get(key)))
    if 'currency' in data:
        item.currency = clean_currency(data.get('currency'))
    if 'active' in data:
        item.active = bool(data.get('active'))
    for key in ('notify_price_drop', 'notify_stock', 'notify_coupon', 'notify_good_time'):
        if key in data:
            setattr(item, key, bool(data.get(key)))

    db.session.add(item)
    db.session.commit()
    return jsonify({'success': True, 'item': watchlist_item_to_dict(item, include_result=True)})


@api_bp.route('/live-deals/watchlist/<int:item_id>', methods=['DELETE'])
@jwt_required()
def live_deals_delete_watch(item_id):
    user_id = _user_id()
    item = DealWatchlistItem.query.filter_by(id=item_id, user_id=user_id).first()
    if not item:
        return jsonify({'success': False, 'error': 'Produto nao encontrado.'}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({'success': True})


@api_bp.route('/live-deals/watchlist/<int:item_id>/check', methods=['POST'])
@jwt_required()
def live_deals_check_watch(item_id):
    user_id = _user_id()
    item = DealWatchlistItem.query.filter_by(id=item_id, user_id=user_id).first()
    if not item:
        return jsonify({'success': False, 'error': 'Produto nao encontrado.'}), 404
    try:
        analysis, alerts = refresh_watchlist_item(item)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Nao foi possivel verificar produto: {exc}'}), 502
    return jsonify({
        'success': True,
        'item': watchlist_item_to_dict(item, include_result=True),
        'result': analysis,
        'alerts': alerts,
    })


@api_bp.route('/live-deals/replay', methods=['GET'])
@jwt_required()
def live_deals_replay():
    user_id = _user_id()
    user = User.query.get(user_id)
    month = request.args.get('month')
    currency = clean_currency(request.args.get('currency') or getattr(user, 'moeda_preferida', 'EUR') or 'EUR')
    return jsonify(monthly_replay(user_id, month=month, currency=currency))

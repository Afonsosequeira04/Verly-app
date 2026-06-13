from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.api import api_bp
from app.financial_records import clean_currency
from app.models import RefundOpportunityState, User
from app.refund_radar import STATUS_LABELS, detect_refund_opportunities


VALID_STATUSES = {'new', 'draft', 'sent', 'waiting', 'refunded', 'dismissed'}


@api_bp.route('/refund-radar', methods=['GET'])
@jwt_required()
def refund_radar_list():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    currency = clean_currency(request.args.get('currency') or getattr(user, 'moeda_preferida', 'EUR'))
    include_resolved = request.args.get('include_resolved') == '1'
    return jsonify({
        'success': True,
        **detect_refund_opportunities(user_id, currency=currency, include_resolved=include_resolved),
        'statuses': STATUS_LABELS,
    })


@api_bp.route('/refund-radar/state', methods=['PATCH'])
@jwt_required()
def refund_radar_state():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    key = (data.get('key') or '').strip()
    status = (data.get('status') or '').strip()
    if not key:
        return jsonify({'error': 'key e obrigatorio.'}), 400
    if status not in VALID_STATUSES:
        return jsonify({'error': 'status invalido.'}), 400

    state = RefundOpportunityState.query.filter_by(user_id=user_id, opportunity_key=key).first()
    if not state:
        state = RefundOpportunityState(user_id=user_id, opportunity_key=key)
        db.session.add(state)
    state.status = status
    if 'notes' in data:
        state.notes = (data.get('notes') or '').strip() or None
    if 'recovered_amount' in data:
        try:
            state.recovered_amount = max(0, float(str(data.get('recovered_amount')).replace(',', '.')))
        except (TypeError, ValueError):
            pass
    if 'currency' in data:
        state.currency = clean_currency(data.get('currency'))
    db.session.commit()

    return jsonify({
        'success': True,
        'state': {
            'id': state.id,
            'key': state.opportunity_key,
            'status': state.status,
            'status_label': STATUS_LABELS.get(state.status, state.status),
            'notes': state.notes,
            'recovered_amount': state.recovered_amount or 0,
            'currency': state.currency or 'EUR',
        },
    })

import json
import math
import os
import re
from collections import defaultdict
from datetime import date, datetime

import requests

from app import db
from app.financial_records import clean_currency, convert_currency, normalize_text
from app.models import BankTransaction, DealWatchlistItem, Fatura, Subscricao, User


URGENCY_LABELS = {
    'today': 'Preciso hoje',
    'soon': 'Esta semana',
    'flexible': 'Posso esperar',
}


def _float_or_none(value):
    try:
        if value is None or value == '':
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _date_from_fatura(fatura):
    raw = getattr(fatura, 'data_compra', None)
    if raw:
        for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
            try:
                return datetime.strptime(str(raw).strip(), fmt).date()
            except ValueError:
                pass
    uploaded = getattr(fatura, 'data_upload', None)
    return uploaded.date() if uploaded else None


def _month_bounds(month=None):
    today = date.today()
    if month:
        try:
            year, month_num = [int(part) for part in str(month).split('-', 1)]
            start = date(year, month_num, 1)
        except Exception:
            start = date(today.year, today.month, 1)
    else:
        start = date(today.year, today.month, 1)
    if start.month == 12:
        end = date(start.year + 1, 1, 1)
    else:
        end = date(start.year, start.month + 1, 1)
    return start, end


def _money(value, currency='EUR'):
    return f'{float(value or 0):.2f} {clean_currency(currency)}'


def clean_watch_product_name(value):
    name = str(value or '').strip()
    if not name:
        return ''
    name = re.sub(
        r'^\s*(?:adiciona|adicionar|mete|coloca|poe|segue|seguir|monitoriza|acompanha|avisa(?:-me)?)\s+(?:(?:o|a|um|uma)\s+)?',
        '',
        name,
        flags=re.IGNORECASE,
    )
    name = re.sub(
        r'\s+(?:a|na|no|ao|para)\s+(?:wishlist|lista|live deals?)\s*$',
        '',
        name,
        flags=re.IGNORECASE,
    )
    name = re.sub(
        r'\s+(?:abaixo|ate|por menos de|preco alvo|quando baixar de)\s+\d+(?:[.,]\d{1,2})?\s*(?:eur|euros)?\s*$',
        '',
        name,
        flags=re.IGNORECASE,
    )
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:220]


def _convert_price(value, target_currency):
    converted, _ = convert_currency(value or 0, 'EUR', target_currency)
    return round(converted, 2)


def _delivery_days(offer):
    text = normalize_text(' '.join([
        offer.get('nome') or '',
        offer.get('loja') or '',
        offer.get('source') or '',
        offer.get('snippet') or '',
    ]))
    if any(token in text for token in ('entrega hoje', 'same day', 'pickup today', 'levantamento hoje')):
        return 0
    if any(token in text for token in ('amanha', '24h', 'next day')):
        return 1
    if 'amazon' in text:
        return 1
    return 3


def _delivery_label(days):
    if days == 0:
        return 'hoje'
    if days == 1:
        return 'amanha'
    return f'{days} dias'


def _coupon_signal(option):
    text = normalize_text(' '.join([
        option.get('title') or '',
        option.get('name') or '',
        option.get('merchant') or '',
        option.get('source') or '',
        option.get('loja') or '',
        option.get('snippet') or '',
    ]))
    return any(token in text for token in ('cupao', 'coupon', 'promo', 'desconto', 'sale', 'codigo'))


def _promotion_label(option):
    text = normalize_text(' '.join([
        option.get('title') or '',
        option.get('name') or '',
        option.get('nome') or '',
        option.get('snippet') or '',
        option.get('source') or '',
        option.get('loja') or '',
    ]))
    if any(token in text for token in ('cupao', 'coupon', 'codigo')):
        return 'Cupao possivel'
    if any(token in text for token in ('desconto', 'promo', 'sale', 'black friday', 'outlet')):
        return 'Desconto atual'
    return None


def _coupon_options(product_name, currency):
    api_key = os.getenv('SERPAPI_KEY') or os.getenv('SERP_API_KEY')
    if not api_key:
        return {'configured': False, 'items': [], 'message': 'Configura SERPAPI_KEY para procurar cupoes atuais.'}
    try:
        response = requests.get(
            'https://serpapi.com/search.json',
            params={
                'engine': 'google',
                'q': f'{product_name} cupao desconto promocao codigo Portugal',
                'gl': 'pt',
                'hl': 'pt',
                'api_key': api_key,
            },
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        return {'configured': True, 'items': [], 'message': f'Nao foi possivel procurar cupoes agora: {exc}'}

    items = []
    for raw in (data.get('organic_results') or [])[:6]:
        title = raw.get('title') or ''
        snippet = raw.get('snippet') or ''
        if not _coupon_signal({'title': title, 'snippet': snippet, 'source': raw.get('source') or ''}):
            continue
        items.append({
            'type': 'coupon',
            'title': title,
            'merchant': raw.get('source') or raw.get('displayed_link') or 'Cupao',
            'price': None,
            'currency': currency,
            'link': raw.get('link'),
            'snippet': snippet,
            'coupon_signal': True,
            'promotion_label': _promotion_label({'title': title, 'snippet': snippet}) or 'Cupao atual',
            'source': 'Google Search',
            'reasons': ['Cupao/desconto encontrado agora'],
        })
    return {'configured': True, 'items': items, 'message': '' if items else 'Sem cupoes atuais encontrados.'}


def _store_offer_match(store_name, offers):
    store = normalize_text(store_name)
    if not store:
        return None
    store_tokens = {token for token in store.split() if len(token) >= 3}
    for offer in offers:
        merchant = normalize_text(offer.get('loja') or offer.get('source') or '')
        if not merchant:
            continue
        merchant_tokens = {token for token in merchant.split() if len(token) >= 3}
        if merchant in store or store in merchant or store_tokens.intersection(merchant_tokens):
            return offer
    return None


def _budget_context(user_id, budget_override=None):
    user = User.query.get(user_id)
    monthly_budget = _float_or_none(budget_override)
    if monthly_budget is None:
        monthly_budget = float(getattr(user, 'orcamento_mensal', 0) or 0)

    start, end = _month_bounds()
    bank_query = BankTransaction.query.filter(
        BankTransaction.user_id == user_id,
        BankTransaction.booked_at >= start,
        BankTransaction.booked_at < end,
        BankTransaction.amount < 0,
    )
    bank_count = bank_query.count()
    if bank_count:
        spent = sum(abs(tx.amount or 0) for tx in bank_query.all())
        source = 'open_banking'
    else:
        faturas = Fatura.query.filter_by(user_id=user_id).all()
        spent = sum(
            f.total or 0
            for f in faturas
            if (d := _date_from_fatura(f)) and start <= d < end
        )
        source = 'faturas'

    remaining = monthly_budget - spent if monthly_budget else None
    pressure = spent / monthly_budget if monthly_budget else 0
    return {
        'monthly_budget': round(monthly_budget or 0, 2),
        'spent_month': round(spent, 2),
        'remaining': round(remaining, 2) if remaining is not None else None,
        'pressure': round(pressure, 3),
        'source': source,
    }


def _online_options(product_name, category, currency):
    from app.scoring import buscar_precos_online

    result = buscar_precos_online(product_name, category, limite=8)
    options = []
    raw_items = result.get('items') or []
    for offer in raw_items:
        price = _convert_price(offer.get('preco') or 0, currency)
        days = _delivery_days(offer)
        options.append({
            'type': 'online',
            'title': offer.get('nome') or product_name,
            'merchant': offer.get('loja') or 'Loja online',
            'price': price,
            'currency': currency,
            'source_currency': offer.get('moeda') or 'EUR',
            'link': offer.get('link'),
            'thumbnail': offer.get('thumbnail'),
            'promotion_label': _promotion_label(offer),
            'delivery_days': days,
            'delivery_label': _delivery_label(days),
            'distance_km': None,
            'travel_minutes': 0,
            'stock': 'online_disponivel',
            'coupon_signal': _coupon_signal(offer),
            'price_confidence': 'high',
            'source': offer.get('fonte') or 'Google Shopping',
            'reasons': [],
        })
    return {
        'configured': bool(result.get('configured')),
        'message': result.get('message') or '',
        'options': options,
        'raw_items': raw_items,
    }


def _nearby_options(product_name, category, lat, lng, radius_km, currency, online_raw_items):
    if lat is None or lng is None:
        return {'configured': False, 'message': 'Localizacao nao fornecida.', 'options': []}

    from app.scoring import buscar_lojas_osm

    try:
        radius_m = max(500, min(int(float(radius_km or 5) * 1000), 30000))
        stores = buscar_lojas_osm(float(lat), float(lng), category, raio_m=radius_m, item=product_name)
    except Exception:
        return {'configured': True, 'message': 'Nao foi possivel procurar lojas proximas agora.', 'options': []}

    online_raw_items = online_raw_items or []
    cheapest_eur = min([float(row.get('preco') or 0) for row in online_raw_items if row.get('preco')], default=None)
    options = []
    for store in stores:
        match = _store_offer_match(store.get('nome'), online_raw_items)
        km = float(store.get('km') or 0)
        travel_minutes = max(3, int(math.ceil(km / 22 * 60 + 6)))
        estimated = False
        price_eur = None
        if match and match.get('preco') is not None:
            price_eur = float(match.get('preco') or 0)
        elif cheapest_eur:
            estimated = True
            price_eur = cheapest_eur * (1 + min(0.18, 0.04 + km * 0.012))

        price = _convert_price(price_eur, currency) if price_eur is not None else None
        options.append({
            'type': 'nearby',
            'title': store.get('nome') or product_name,
            'merchant': store.get('nome') or 'Loja proxima',
            'price': price,
            'currency': currency,
            'estimated_price': estimated,
            'distance_km': round(km, 2),
            'distance_label': store.get('distancia'),
            'travel_minutes': travel_minutes,
            'lat': store.get('lat'),
            'lng': store.get('lng'),
            'address': store.get('endereco'),
            'place_id': store.get('place_id'),
            'rating': store.get('rating'),
            'reviews': store.get('reviews'),
            'open_now': store.get('open_now'),
            'thumbnail': (match or {}).get('thumbnail') or store.get('photo_url'),
            'store_photo_url': store.get('photo_url'),
            'stock': 'por_confirmar',
            'coupon_signal': _coupon_signal(match or store),
            'promotion_label': _promotion_label(match or store),
            'price_confidence': 'medium' if match else ('low' if estimated else 'unknown'),
            'source': store.get('fonte') or 'Google Places/OSM',
            'matched_online_offer': match,
            'reasons': [],
        })
    return {'configured': True, 'message': '', 'options': options}


def _effective_cost(option, urgency, budget_context):
    price = option.get('price')
    if price is None:
        price = 999999
    effective = float(price)

    if option.get('type') == 'online':
        days = int(option.get('delivery_days') or 0)
        if urgency == 'today' and days > 0:
            effective += 45 + (days * 6)
        elif urgency == 'soon':
            effective += days * 1.5
        else:
            effective += days * 0.3
    else:
        km = float(option.get('distance_km') or 0)
        minutes = float(option.get('travel_minutes') or 0)
        effective += km * 0.35 + minutes * 0.035
        if urgency == 'today':
            effective -= 4

    remaining = budget_context.get('remaining')
    if remaining is not None and remaining > 0 and price > remaining:
        effective += min(30, (price - remaining) * 0.15)
    if budget_context.get('pressure', 0) >= 0.9:
        effective += price * 0.08
    return round(effective, 2)


def _decorate_option(option, urgency, budget_context, online_prices):
    option = dict(option)
    option['effective_cost'] = _effective_cost(option, urgency, budget_context)
    reasons = []
    if option.get('type') == 'online':
        reasons.append(f"Entrega {option.get('delivery_label')}")
        if option.get('price_confidence') == 'high':
            reasons.append('Preco real online')
    else:
        if option.get('distance_label'):
            reasons.append(f"{option.get('distance_label')} de distancia")
        if option.get('estimated_price'):
            reasons.append('Preco estimado por mercado')
        elif option.get('price') is not None:
            reasons.append('Preco associado a loja')
        reasons.append('Stock a confirmar')

    prices = [float(p) for p in online_prices if p is not None]
    if prices and option.get('price') is not None:
        median = sorted(prices)[len(prices) // 2]
        if median and option['price'] <= median * 0.92:
            reasons.append('Abaixo da mediana encontrada')
    if option.get('coupon_signal'):
        reasons.append('Sinal de promocao/cupao')
    if option.get('promotion_label'):
        reasons.append(option.get('promotion_label'))

    remaining = budget_context.get('remaining')
    if remaining is not None and option.get('price') is not None:
        if option['price'] <= remaining:
            reasons.append('Cabe no orcamento restante')
        else:
            reasons.append('Passa o orcamento restante')

    option['reasons'] = reasons[:4]
    return option


def _decision_text(best, today_best, urgency, currency):
    if not best:
        return {
            'headline': 'Ainda nao ha dados suficientes',
            'summary': 'Tenta outro nome de produto ou ativa localizacao para comparar lojas proximas.',
        }

    best_price = _money(best.get('price') or 0, currency) if best.get('price') is not None else 'preco por confirmar'
    headline = f"Melhor escolha: {best.get('merchant')} por {best_price}"
    summary = 'E a opcao com melhor equilibrio entre preco, friccao e contexto do teu orcamento.'

    if urgency == 'today' and today_best and today_best.get('type') == 'nearby':
        today_price = _money(today_best.get('price') or 0, currency) if today_best.get('price') is not None else 'preco por confirmar'
        summary = (
            f"Se precisares hoje, {today_best.get('merchant')} compensa mais: "
            f"{today_best.get('distance_label') or 'perto'} e {today_price}."
        )
    elif best.get('type') == 'online':
        summary = f"Se conseguires esperar pela entrega {best.get('delivery_label')}, e a opcao mais eficiente."
    elif best.get('type') == 'nearby':
        summary = f"Boa escolha se queres resolver ja: fica a {best.get('distance_label') or 'perto'}."

    return {'headline': headline, 'summary': summary}


def _purchase_score(user_id, product_name, category, paid_price=None, usage='weekly'):
    paid_price = _float_or_none(paid_price)
    if paid_price is None or paid_price <= 0:
        return None
    try:
        from app.scoring import calcular_score
        user = User.query.get(user_id)
        personalidade = getattr(user, 'personalidade', 'calm') or 'calm'
        result = calcular_score(category or 'Outros', paid_price, usage or 'weekly', personalidade, item=product_name)
        return {
            'score': result.get('score_final') or result.get('score'),
            'label': result.get('label') or result.get('titulo') or '',
            'summary': result.get('conselho') or result.get('comentario') or '',
            'factors': result.get('fatores') or [],
            'market': result.get('avaliacao_mercado') or {},
            'raw': result,
        }
    except Exception as exc:
        return {
            'score': None,
            'label': 'Score indisponivel',
            'summary': f'Nao foi possivel calcular o score agora: {exc}',
            'factors': [],
            'market': {},
        }


def analyze_live_deal(user_id, product_name, category='Outros', lat=None, lng=None, urgency='flexible',
                      budget_limit=None, radius_km=5, currency='EUR', paid_price=None, usage='weekly'):
    product_name = (product_name or '').strip()
    if not product_name:
        raise ValueError('Produto obrigatorio.')
    urgency = urgency if urgency in URGENCY_LABELS else 'flexible'
    currency = clean_currency(currency)

    budget_context = _budget_context(user_id, budget_limit)
    purchase_score = _purchase_score(user_id, product_name, category, paid_price, usage)
    online = _online_options(product_name, category, currency)
    nearby = _nearby_options(product_name, category, lat, lng, radius_km, currency, online.get('raw_items'))
    coupons = _coupon_options(product_name, currency)

    online_prices = [row.get('price') for row in online['options'] if row.get('price') is not None]
    all_options = [
        _decorate_option(option, urgency, budget_context, online_prices)
        for option in [*online['options'], *nearby['options']]
    ]
    all_options.sort(key=lambda row: row.get('effective_cost', 999999))

    best = all_options[0] if all_options else None
    today_candidates = [
        option for option in all_options
        if option.get('type') == 'nearby' or option.get('delivery_days') == 0
    ]
    today_best = today_candidates[0] if today_candidates else None

    decision_text = _decision_text(best, today_best, urgency, currency)
    online_sorted = sorted([o for o in all_options if o.get('type') == 'online'], key=lambda r: r.get('effective_cost', 999999))
    nearby_sorted = sorted([o for o in all_options if o.get('type') == 'nearby'], key=lambda r: r.get('effective_cost', 999999))
    promotions = [
        option for option in all_options
        if option.get('coupon_signal') or option.get('promotion_label')
    ]
    promotions = [*promotions[:5], *coupons.get('items', [])[:5]]

    return {
        'success': True,
        'product': product_name,
        'category': category or 'Outros',
        'currency': currency,
        'urgency': urgency,
        'urgency_label': URGENCY_LABELS[urgency],
        'decision': {
            'headline': decision_text['headline'],
            'summary': decision_text['summary'],
            'best': best,
            'best_today': today_best,
        },
        'options': all_options[:12],
        'online_options': online_sorted[:8],
        'nearby_options': nearby_sorted[:8],
        'promotions': promotions[:8],
        'purchase_score': purchase_score,
        'budget_context': budget_context,
        'sources': {
            'online_prices_configured': online['configured'],
            'online_message': online['message'],
            'nearby_configured': nearby['configured'],
            'nearby_message': nearby['message'],
            'coupons_configured': coupons['configured'],
            'coupons_message': coupons['message'],
        },
        'generated_at': datetime.utcnow().isoformat(),
    }


def build_watchlist_alerts(item, analysis, previous_price=None):
    best = (analysis.get('decision') or {}).get('best') or {}
    options = analysis.get('options') or []
    alerts = []
    best_price = best.get('price')
    currency = analysis.get('currency') or item.currency or 'EUR'

    if item.notify_price_drop and item.target_price and best_price is not None and best_price <= item.target_price:
        alerts.append({
            'type': 'target_price',
            'urgency': 'alta',
            'title': f'{item.product_name} baixou do teu alvo',
            'message': f'Encontrado por {_money(best_price, currency)} em {best.get("merchant")}.',
        })

    if item.notify_price_drop and previous_price and best_price and best_price <= previous_price * 0.93:
        diff = previous_price - best_price
        alerts.append({
            'type': 'price_drop',
            'urgency': 'media',
            'title': f'{item.product_name} baixou {_money(diff, currency)}',
            'message': f'Antes estava perto de {_money(previous_price, currency)}; agora aparece a {_money(best_price, currency)}.',
        })

    nearby = [o for o in options if o.get('type') == 'nearby']
    if item.notify_stock and nearby:
        nearest = sorted(nearby, key=lambda row: row.get('distance_km') or 999)[0]
        alerts.append({
            'type': 'nearby_stock',
            'urgency': 'info',
            'title': f'{item.product_name} tem loja perto',
            'message': f'{nearest.get("merchant")} fica a {nearest.get("distance_label") or "pouca distancia"}; stock a confirmar.',
        })

    coupon = next((o for o in [*options, *((analysis.get('promotions') or []))] if o.get('coupon_signal')), None)
    if item.notify_coupon and coupon:
        alerts.append({
            'type': 'coupon',
            'urgency': 'media',
            'title': f'Possivel promocao em {item.product_name}',
            'message': f'Vi sinal de promocao/cupao em {coupon.get("merchant")}.',
        })

    online_prices = [o.get('price') for o in analysis.get('online_options') or [] if o.get('price') is not None]
    if item.notify_good_time and best_price and len(online_prices) >= 3:
        median = sorted(online_prices)[len(online_prices) // 2]
        if best_price <= median * 0.9:
            alerts.append({
                'type': 'good_time',
                'urgency': 'media',
                'title': f'Boa altura para comprar {item.product_name}',
                'message': f'A melhor oferta esta abaixo da mediana encontrada: {_money(best_price, currency)}.',
            })

    return alerts[:4]


def refresh_watchlist_item(item):
    previous_price = item.last_price
    cleaned_name = clean_watch_product_name(item.product_name)
    if cleaned_name and cleaned_name != item.product_name:
        item.product_name = cleaned_name
    analysis = analyze_live_deal(
        item.user_id,
        cleaned_name or item.product_name,
        category=item.category or 'Outros',
        lat=item.lat,
        lng=item.lng,
        urgency=item.urgency or 'flexible',
        budget_limit=item.budget_limit,
        radius_km=item.radius_km or 5,
        currency=item.currency or 'EUR',
    )
    alerts = build_watchlist_alerts(item, analysis, previous_price=previous_price)
    best = (analysis.get('decision') or {}).get('best') or {}

    item.last_price = best.get('price')
    item.last_store = best.get('merchant')
    item.last_checked_at = datetime.utcnow()
    item.last_result_json = json.dumps(analysis, ensure_ascii=False)
    item.last_alerts_json = json.dumps(alerts, ensure_ascii=False)
    db.session.add(item)
    return analysis, alerts


def watchlist_item_to_dict(item, include_result=False):
    alerts = []
    result = None
    try:
        alerts = json.loads(item.last_alerts_json or '[]')
    except Exception:
        alerts = []
    if include_result:
        try:
            result = json.loads(item.last_result_json or 'null')
        except Exception:
            result = None
    return {
        'id': item.id,
        'product_name': clean_watch_product_name(item.product_name) or item.product_name,
        'category': item.category or 'Outros',
        'target_price': item.target_price,
        'currency': item.currency or 'EUR',
        'urgency': item.urgency or 'flexible',
        'budget_limit': item.budget_limit,
        'radius_km': item.radius_km,
        'lat': item.lat,
        'lng': item.lng,
        'active': bool(item.active),
        'notify_price_drop': bool(item.notify_price_drop),
        'notify_stock': bool(item.notify_stock),
        'notify_coupon': bool(item.notify_coupon),
        'notify_good_time': bool(item.notify_good_time),
        'last_price': item.last_price,
        'last_store': item.last_store,
        'last_checked_at': item.last_checked_at.isoformat() if item.last_checked_at else None,
        'alerts': alerts,
        'result': result,
        'created_at': item.criado_em.isoformat() if item.criado_em else None,
    }


def watchlist_notifications(user_id, limit=4):
    rows = (
        DealWatchlistItem.query
        .filter_by(user_id=user_id, active=True)
        .order_by(DealWatchlistItem.last_checked_at.desc().nullslast(), DealWatchlistItem.criado_em.desc())
        .limit(20)
        .all()
    )
    notifications = []
    for item in rows:
        try:
            alerts = json.loads(item.last_alerts_json or '[]')
        except Exception:
            alerts = []
        for alert in alerts:
            notifications.append({
                'tipo': f'live_deal_{alert.get("type", "watch")}',
                'titulo': alert.get('title') or item.product_name,
                'mensagem': alert.get('message') or 'A wishlist tem uma oportunidade nova.',
                'icone': 'deal',
                'urgencia': alert.get('urgency') or 'info',
                'action_route': 'LiveDeals',
                'watchlist_id': item.id,
            })
    order = {'alta': 0, 'media': 1, 'info': 2}
    notifications.sort(key=lambda n: order.get(n['urgencia'], 9))
    return notifications[:limit]


def _expense_records(user_id, start, end):
    bank_txs = BankTransaction.query.filter(
        BankTransaction.user_id == user_id,
        BankTransaction.booked_at >= start,
        BankTransaction.booked_at < end,
        BankTransaction.amount < 0,
    ).all()
    records = []
    if bank_txs:
        for tx in bank_txs:
            records.append({
                'date': tx.booked_at,
                'amount': abs(tx.amount or 0),
                'currency': tx.currency or 'EUR',
                'merchant': tx.merchant_name or tx.description or 'Movimento',
                'category': tx.categoria or 'Outros',
                'source': 'open_banking',
            })
        return records

    for fatura in Fatura.query.filter_by(user_id=user_id).all():
        d = _date_from_fatura(fatura)
        if d and start <= d < end:
            records.append({
                'date': d,
                'amount': fatura.total or 0,
                'currency': 'EUR',
                'merchant': fatura.loja or fatura.nome_ficheiro or 'Fatura',
                'category': fatura.categoria or 'Outros',
                'source': 'faturas',
            })
    return records


def monthly_replay(user_id, month=None, currency='EUR'):
    start, end = _month_bounds(month)
    currency = clean_currency(currency)
    records = _expense_records(user_id, start, end)
    for row in records:
        converted, _ = convert_currency(row.get('amount') or 0, row.get('currency') or 'EUR', currency)
        row['amount'] = round(converted, 2)
        row['currency'] = currency
    user = User.query.get(user_id)
    budget, _ = convert_currency(float(getattr(user, 'orcamento_mensal', 0) or 0), 'EUR', currency)

    daily = defaultdict(list)
    for row in records:
        daily[row['date']].append(row)

    events = []
    for d in sorted(daily):
        rows = daily[d]
        small = [r for r in rows if r['amount'] <= 15]
        if len(small) >= 3:
            events.append({
                'date': d.isoformat(),
                'day': d.day,
                'type': 'small_leak',
                'title': f'Dia {d.day}: primeira fuga',
                'message': f'{len(small)} compras pequenas somaram {_money(sum(r["amount"] for r in small), currency)}.',
                'impact': round(sum(r['amount'] for r in small), 2),
            })
            break

    subs = Subscricao.query.filter_by(user_id=user_id, ativa=True).all()
    if subs:
        sub = sorted(subs, key=lambda s: s.preco_mensal or 0, reverse=True)[0]
        event_day = min(28, max(1, int(getattr(sub, 'meses_pago', 1) or 1)))
        events.append({
            'date': date(start.year, start.month, event_day).isoformat(),
            'day': event_day,
            'type': 'subscription',
            'title': f'Dia {event_day}: subscricao esquecida',
            'message': f'{sub.nome} custa cerca de {_money(convert_currency(sub.preco_mensal or 0, "EUR", currency)[0], currency)} por mes.',
            'impact': round(convert_currency(sub.preco_mensal or 0, 'EUR', currency)[0], 2),
        })

    delivery_tokens = ('uber eats', 'glovo', 'bolt food', 'deliveroo', 'takeaway', 'delivery')
    for d in sorted(daily):
        delivery = [
            r for r in daily[d]
            if any(token in normalize_text(r['merchant']) for token in delivery_tokens)
            or normalize_text(r['category']) in ('alimentacao', 'restaurantes')
        ]
        total_delivery = sum(r['amount'] for r in delivery)
        if len(delivery) >= 2 or total_delivery >= 35:
            events.append({
                'date': d.isoformat(),
                'day': d.day,
                'type': 'delivery_spike',
                'title': f'Dia {d.day}: delivery pesou',
                'message': f'{len(delivery)} gasto(s) de comida somaram {_money(total_delivery, currency)}.',
                'impact': round(total_delivery, 2),
            })
            break

    weekday_totals = [sum(r['amount'] for r in rows) for d, rows in daily.items() if d.weekday() < 5]
    avg_weekday = sum(weekday_totals) / len(weekday_totals) if weekday_totals else 0
    weekend_days = [
        (d, sum(r['amount'] for r in rows))
        for d, rows in daily.items()
        if d.weekday() >= 5
    ]
    if weekend_days:
        d, total = max(weekend_days, key=lambda item: item[1])
        if total >= max(25, avg_weekday * 1.25):
            events.append({
                'date': d.isoformat(),
                'day': d.day,
                'type': 'weekend',
                'title': f'Dia {d.day}: fim de semana caro',
                'message': f'Esse dia somou {_money(total, currency)}, acima do ritmo normal do mes.',
                'impact': round(total, 2),
            })

    if budget > 0:
        running = 0
        for d in sorted(daily):
            running += sum(r['amount'] for r in daily[d])
            if running >= budget * 0.8:
                events.append({
                    'date': d.isoformat(),
                    'day': d.day,
                    'type': 'budget_tight',
                    'title': f'Dia {d.day}: saldo apertou',
                    'message': f'Ja tinhas usado {round((running / budget) * 100)}% do orcamento mensal.',
                    'impact': round(running, 2),
                })
                break

    if not events and records:
        top = max(records, key=lambda row: row['amount'])
        events.append({
            'date': top['date'].isoformat(),
            'day': top['date'].day,
            'type': 'top_spend',
            'title': f'Dia {top["date"].day}: maior compra',
            'message': f'{top["merchant"]} foi o maior impacto: {_money(top["amount"], currency)}.',
            'impact': round(top['amount'], 2),
        })

    events.sort(key=lambda row: row['date'])
    total = sum(row['amount'] for row in records)
    return {
        'success': True,
        'month': start.strftime('%Y-%m'),
        'currency': currency,
        'total_spent': round(total, 2),
        'events': events[:8],
        'summary': {
            'days_with_spend': len(daily),
            'records': len(records),
            'budget': budget,
            'budget_used_pct': round((total / budget) * 100, 1) if budget else None,
        },
    }

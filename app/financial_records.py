import re
import unicodedata
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime

from app.models import BankTransaction, CATEGORIAS, Fatura


DEFAULT_CATEGORY = 'Outros'
TRANSFER_CATEGORY = 'Transferencias'
SAVINGS_CATEGORY = 'Poupanca'


def clean_currency(value):
    return (str(value or 'EUR').strip().upper() or 'EUR')[:10]


def normalize_text(value):
    text = str(value or '').casefold()
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', text).strip()


def category_label(key):
    wanted = normalize_text(key)
    aliases = {
        'alimentacao': ('alimentacao', 'aliment'),
        'eletronica': ('tecnologia', 'eletronica'),
        'vestuario': ('vestuario', 'vestu'),
        'casa': ('casa', 'decor'),
        'saude': ('saude', 'beleza'),
        'desporto': ('desporto',),
        'entretenimento': ('entretenimento',),
        'transportes': ('transportes', 'transporte'),
        'educacao': ('educacao',),
        'tecnologia': ('tecnologia',),
        'outros': ('outros',),
    }
    keys = aliases.get(wanted, (wanted,))
    for categoria in CATEGORIAS:
        normalized = normalize_text(categoria)
        if any(item in normalized for item in keys):
            return categoria
    return DEFAULT_CATEGORY


_CATEGORY_RULES = [
    ('alimentacao', [
        'continente', 'pingo doce', 'lidl', 'aldi', 'auchan', 'mercadona',
        'intermarche', 'mini preco', 'el corte ingles supermercado',
        'restaurante', 'restaurant', 'cafe', 'pastelaria', 'padaria',
        'mcdonald', 'burger king', 'kfc', 'pizza', 'sushi', 'takeaway',
        'uber eats', 'glovo', 'bolt food', 'wolt', 'food',
        'mad', 'madklubben', 'superbrugsen', 'netto', 'foetex', 'fotex',
        'føtex', 'rema', 'irma', 'bilka', 'meny', 'restaurant &',
    ]),
    ('transportes', [
        'uber', 'bolt', 'taxi', 'cp ', 'comboios', 'fertagus', 'metro',
        'carris', 'stcp', 'rede expressos', 'flibco', 'via verde',
        'galp', 'repsol', 'bp ', 'prio', 'cepsa', 'combustivel',
        'gasolina', 'diesel', 'parking', 'parque', 'portagem',
        'dsb', 'rejsekort', 'taxa', 'ok tank', 'circle k',
    ]),
    ('vestuario', [
        'zara', 'hm ', 'h&m', 'bershka', 'pullbear', 'pull&bear',
        'stradivarius', 'mango', 'shein', 'nike', 'adidas', 'primark',
        'springfield', 'lefties', 'calzedonia',
    ]),
    ('casa', [
        'ikea', 'leroy merlin', 'conforama', 'bricomarche', 'worten casa',
        'homing', 'casa ', 'jysk', 'maxmat',
    ]),
    ('saude', [
        'farmacia', 'wells', 'hospital', 'clinica', 'dentista',
        'medico', 'saude', 'sephora', 'primor', 'perfumaria',
    ]),
    ('desporto', [
        'gym', 'ginasio', 'fitness', 'solinca', 'holmes place',
        'fitness hut', 'decathlon', 'sport zone',
    ]),
    ('entretenimento', [
        'netflix', 'spotify', 'disney', 'hbo', 'max.com', 'prime video',
        'cinema', 'nos cinemas', 'playstation', 'xbox', 'nintendo',
        'steam', 'twitch', 'ticketline', 'bol',
    ]),
    ('educacao', [
        'universidade', 'escola', 'curso', 'coursera', 'udemy',
        'duolingo', 'bertrand', 'wook', 'livraria',
    ]),
    ('tecnologia', [
        'apple', 'google', 'microsoft', 'adobe', 'github', 'figma',
        'canva', 'notion', 'icloud', 'dropbox', 'one drive', 'onedrive',
        'worten', 'fnac', 'radio popular', 'mediamarkt', 'amazon',
        'vodafone', 'meo', 'nos comunicacoes', 'nowo', 'digi',
        'eletronica', 'electronics', 'elgiganten', 'power', 'proshop',
        'otay-shop.dk',
    ]),
]


_SAVINGS_KEYWORDS = [
    'opsparing', 'faelles opsparing', 'fælles opsparing', 'poupanca',
    'poupança', 'savings', 'saving account', 'investimento', 'investment',
    'reserva', 'mealheiro',
]

_TRANSFER_KEYWORDS = [
    'til firma konto', 'firma konto', 'egen konto', 'kontooverforsel',
    'kontooverførsel', 'overforsel', 'overførsel', 'bank transfer',
    'internal transfer', 'transferencia', 'transferência', 'transf.',
    'sepa transfer', 'wire transfer', 'paypal transfer', 'wise transfer',
    'revolut transfer', 'mb way', 'mbway', 'we share', 'weshare',
]


def _has_keyword(text, keywords):
    return any(normalize_text(keyword) in text for keyword in keywords)


def classify_bank_movement(description=None, merchant_name=None, amount=None, raw_code=None, categoria=None):
    text = normalize_text(' '.join(str(part or '') for part in (
        merchant_name,
        description,
        raw_code,
        categoria,
    )))
    category = normalize_text(categoria)
    amount_provided = amount not in (None, '')
    try:
        amount_value = float(amount or 0)
    except (TypeError, ValueError):
        amount_value = 0

    if amount_provided and amount_value > 0:
        return 'income'
    if category == normalize_text(SAVINGS_CATEGORY) or _has_keyword(text, _SAVINGS_KEYWORDS):
        return 'savings'
    if category == normalize_text(TRANSFER_CATEGORY) or _has_keyword(text, _TRANSFER_KEYWORDS):
        return 'transfer'
    return 'spending'


def categorize_transaction(description=None, merchant_name=None, amount=None, raw_code=None):
    text = normalize_text(' '.join(str(part or '') for part in (
        merchant_name,
        description,
        raw_code,
    )))
    if not text:
        return DEFAULT_CATEGORY

    movement_kind = classify_bank_movement(description, merchant_name, amount, raw_code)
    if movement_kind == 'savings':
        return SAVINGS_CATEGORY
    if movement_kind == 'transfer':
        return TRANSFER_CATEGORY

    for category_key, keywords in _CATEGORY_RULES:
        if _has_keyword(text, keywords):
            return category_label(category_key)
    return DEFAULT_CATEGORY


def parse_fatura_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = str(value).strip()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def record_month(record_date):
    if not record_date:
        return None
    return f'{record_date.year}-{record_date.month:02d}'


def month_label(month_key):
    if not month_key or '-' not in month_key:
        return month_key or ''
    labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
              'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    try:
        month = int(month_key.split('-')[1])
        return labels[month - 1]
    except (ValueError, IndexError):
        return month_key


def add_months(year, month, delta):
    month += delta
    while month <= 0:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    return year, month


def month_window(year, month):
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    return start, end


def get_expense_records(
    user_id,
    include_faturas=True,
    include_bank=True,
    include_non_spending=False,
    currency=None,
):
    records = []
    selected_currency = clean_currency(currency) if currency else None

    if include_faturas:
        for fatura in Fatura.query.filter_by(user_id=user_id).all():
            value = float(fatura.total or 0)
            if value <= 0:
                continue
            record_date = (
                parse_fatura_date(fatura.data_compra)
                or parse_fatura_date(fatura.data_upload)
            )
            records.append({
                'source': 'fatura',
                'id': fatura.id,
                'date': record_date,
                'month': record_month(record_date),
                'merchant': fatura.loja or fatura.nome_ficheiro or 'Desconhecida',
                'description': fatura.nome_ficheiro or fatura.loja or '',
                'categoria': fatura.categoria or DEFAULT_CATEGORY,
                'value': value,
                'signed_amount': value,
                'currency': 'EUR',
                'kind': 'spending',
                'is_spending': True,
            })

    if include_bank:
        query = BankTransaction.query.filter(BankTransaction.user_id == user_id)
        for transaction in query.all():
            record_date = transaction.booked_at or transaction.value_date
            amount = float(transaction.amount or 0)
            computed_category = categorize_transaction(
                transaction.description,
                transaction.merchant_name,
                amount,
            )
            category = transaction.categoria or computed_category
            if (
                normalize_text(category) == normalize_text(DEFAULT_CATEGORY)
                or computed_category in (TRANSFER_CATEGORY, SAVINGS_CATEGORY)
            ):
                category = computed_category

            kind = classify_bank_movement(
                transaction.description,
                transaction.merchant_name,
                amount,
                categoria=category,
            )
            if kind == 'savings':
                category = SAVINGS_CATEGORY
            elif kind == 'transfer':
                category = TRANSFER_CATEGORY

            is_spending = amount < 0 and kind == 'spending'
            if not is_spending and not include_non_spending:
                continue

            record_currency = clean_currency(transaction.currency)
            records.append({
                'source': 'open_banking',
                'id': transaction.id,
                'date': record_date,
                'month': record_month(record_date),
                'merchant': (
                    transaction.merchant_name
                    or transaction.description
                    or 'Movimento bancario'
                ),
                'description': transaction.description or transaction.merchant_name or '',
                'categoria': category,
                'value': abs(amount),
                'signed_amount': amount,
                'currency': record_currency,
                'kind': kind,
                'is_spending': is_spending,
            })

    if selected_currency:
        records = [record for record in records if record['currency'] == selected_currency]

    records.sort(key=lambda item: (item['date'] or date.min, item['id']), reverse=True)
    return records


def _sum_by_currency(records):
    totals = defaultdict(lambda: {'total': 0.0, 'count': 0})
    for record in records:
        bucket = totals[record['currency']]
        bucket['total'] += record['value']
        bucket['count'] += 1
    return [
        {
            'currency': currency,
            'total': round(values['total'], 2),
            'count': values['count'],
        }
        for currency, values in sorted(totals.items(), key=lambda item: -item[1]['total'])
    ]


def _primary_currency(records, current_start, current_end, requested=None):
    if requested:
        return clean_currency(requested)
    current_totals = defaultdict(float)
    all_totals = defaultdict(float)
    for record in records:
        all_totals[record['currency']] += record['value']
        if record['date'] and current_start <= record['date'] <= current_end:
            current_totals[record['currency']] += record['value']
    if current_totals:
        return max(current_totals, key=current_totals.get)
    if all_totals:
        return max(all_totals, key=all_totals.get)
    return 'EUR'


def summarize_expenses(user_id, months=12, today=None, currency=None):
    today = today or datetime.utcnow().date()
    current_start, current_end = month_window(today.year, today.month)
    prev_year, prev_month = add_months(today.year, today.month, -1)
    previous_start, previous_end = month_window(prev_year, prev_month)

    all_records = get_expense_records(user_id, include_non_spending=True)
    spending_records = [record for record in all_records if record.get('is_spending')]
    non_spending_records = [
        record for record in all_records
        if record['source'] == 'open_banking'
        and not record.get('is_spending')
        and record.get('signed_amount', 0) < 0
    ]
    selected_currency = _primary_currency(
        spending_records,
        current_start,
        current_end,
        requested=currency,
    )
    records = [
        record for record in spending_records
        if record['currency'] == selected_currency
    ]
    other_currency_records = [
        record for record in spending_records
        if record['currency'] != selected_currency
    ]

    por_categoria = defaultdict(float)
    por_categoria_count = defaultdict(int)
    por_mes = defaultdict(float)
    por_loja = defaultdict(float)
    por_fonte = defaultdict(float)
    por_fonte_count = defaultdict(int)

    fonte_currency = defaultdict(lambda: {'total': 0.0, 'count': 0})
    for record in spending_records:
        key = (record['source'], record['currency'])
        fonte_currency[key]['total'] += record['value']
        fonte_currency[key]['count'] += 1

    for record in records:
        value = record['value']
        categoria = record['categoria'] or DEFAULT_CATEGORY
        merchant = record['merchant'] or 'Desconhecida'
        por_categoria[categoria] += value
        por_categoria_count[categoria] += 1
        por_loja[merchant] += value
        por_fonte[record['source']] += value
        por_fonte_count[record['source']] += 1
        if record['month']:
            por_mes[record['month']] += value

    current_records = [
        item for item in records
        if item['date'] and current_start <= item['date'] <= current_end
    ]
    previous_records = [
        item for item in records
        if item['date'] and previous_start <= item['date'] <= previous_end
    ]

    def aggregate(items):
        cats = defaultdict(float)
        items_by_cat = defaultdict(list)
        sources = defaultdict(float)
        total = 0.0
        for item in items:
            total += item['value']
            cats[item['categoria']] += item['value']
            sources[item['source']] += item['value']
            key = normalize_text(item['categoria'])
            items_by_cat[key].append({
                'loja': item['merchant'],
                'valor': round(item['value'], 2),
                'currency': item['currency'],
                'data': item['date'].strftime('%d/%m/%Y') if item['date'] else None,
                'fonte': item['source'],
                'tipo': item.get('kind', 'spending'),
            })
        for key in items_by_cat:
            items_by_cat[key].sort(key=lambda entry: entry['valor'], reverse=True)
        return {
            'total': total,
            'categorias': cats,
            'sources': sources,
            'items_by_category': dict(items_by_cat),
        }

    current = aggregate(current_records)
    previous = aggregate(previous_records)

    month_keys = []
    for offset in range(months - 1, -1, -1):
        year, month = add_months(today.year, today.month, -offset)
        month_keys.append(f'{year}-{month:02d}')

    total_geral = sum(item['value'] for item in records)
    variacao_pct = None
    if previous['total'] > 0:
        variacao_pct = round(((current['total'] - previous['total']) / previous['total']) * 100, 1)

    forecast = None
    if today.day > 0 and current['total'] > 0:
        forecast = round((current['total'] / today.day) * monthrange(today.year, today.month)[1], 2)

    def examples(items):
        return [
            {
                'loja': item['merchant'],
                'valor': round(item['value'], 2),
                'currency': item['currency'],
                'categoria': item['categoria'],
                'tipo': item.get('kind'),
                'data': item['date'].isoformat() if item['date'] else None,
            }
            for item in sorted(items, key=lambda entry: entry['value'], reverse=True)[:5]
        ]

    currency_totals = _sum_by_currency(spending_records)
    excluded_totals = _sum_by_currency(non_spending_records)
    other_currency_totals = _sum_by_currency(other_currency_records)

    return {
        'records': records,
        'currency': selected_currency,
        'available_currencies': currency_totals,
        'currency_totals': currency_totals,
        'other_currencies': {
            'count': len(other_currency_records),
            'total_by_currency': other_currency_totals,
            'examples': examples(other_currency_records),
        },
        'excluded': {
            'count': len(non_spending_records),
            'total_by_currency': excluded_totals,
            'examples': examples(non_spending_records),
        },
        'total_geral': round(total_geral, 2),
        'num_registos': len(records),
        'num_registos_total': len(spending_records),
        'por_categoria': [
            {
                'categoria': key,
                'total': round(value, 2),
                'count': por_categoria_count[key],
                'currency': selected_currency,
            }
            for key, value in sorted(por_categoria.items(), key=lambda item: -item[1])
        ],
        'por_mes': [
            {'mes': key, 'total': round(por_mes.get(key, 0), 2), 'currency': selected_currency}
            for key in month_keys
            if por_mes.get(key, 0) > 0
        ],
        'historico_mensal': [
            {'mes': month_label(key), 'valor': round(por_mes.get(key, 0), 2), 'currency': selected_currency}
            for key in month_keys[-6:]
        ],
        'top_lojas': [
            {'loja': key, 'total': round(value, 2), 'currency': selected_currency}
            for key, value in sorted(por_loja.items(), key=lambda item: -item[1])[:8]
        ],
        'fontes': [
            {
                'fonte': key,
                'total': round(value, 2),
                'count': por_fonte_count[key],
                'currency': selected_currency,
            }
            for key, value in sorted(por_fonte.items(), key=lambda item: item[0])
        ],
        'fontes_por_moeda': [
            {
                'fonte': source,
                'currency': item_currency,
                'total': round(values['total'], 2),
                'count': values['count'],
            }
            for (source, item_currency), values in sorted(
                fonte_currency.items(),
                key=lambda item: (item[0][1], item[0][0]),
            )
        ],
        'mes_atual': {
            'total': round(current['total'], 2),
            'num_registos': len(current_records),
            'currency': selected_currency,
            'por_categoria': [
                {
                    'categoria': key,
                    'valor': round(value, 2),
                    'total': round(value, 2),
                    'currency': selected_currency,
                }
                for key, value in sorted(current['categorias'].items(), key=lambda item: -item[1])
            ],
            'por_fonte': [
                {'fonte': key, 'total': round(value, 2), 'currency': selected_currency}
                for key, value in sorted(current['sources'].items(), key=lambda item: item[0])
            ],
            'itens_por_categoria': current['items_by_category'],
        },
        'mes_anterior': {
            'total': round(previous['total'], 2),
            'num_registos': len(previous_records),
            'currency': selected_currency,
        },
        'variacao_pct': variacao_pct,
        'previsao_mensal': forecast,
        'previsao_currency': selected_currency if forecast is not None else None,
        'dias_no_mes': monthrange(today.year, today.month)[1],
    }


def json_safe_financial_summary(summary, include_records=False):
    def convert(value):
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, dict):
            return {key: convert(item) for key, item in value.items()}
        if isinstance(value, list):
            return [convert(item) for item in value]
        return value

    payload = convert(summary)
    if not include_records:
        payload.pop('records', None)
    return payload

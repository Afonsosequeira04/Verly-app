import re
import unicodedata
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime

from app.models import BankTransaction, CATEGORIAS, Fatura


DEFAULT_CATEGORY = 'Outros'


def normalize_text(value):
    text = str(value or '').casefold()
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', text).strip()


def category_label(key):
    wanted = normalize_text(key)
    aliases = {
        'alimentacao': ('alimentacao', 'aliment'),
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
    ]),
    ('transportes', [
        'uber', 'bolt', 'taxi', 'cp ', 'comboios', 'fertagus', 'metro',
        'carris', 'stcp', 'rede expressos', 'flibco', 'via verde',
        'galp', 'repsol', 'bp ', 'prio', 'cepsa', 'combustivel',
        'gasolina', 'diesel', 'parking', 'parque', 'portagem',
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
    ]),
]


def categorize_transaction(description=None, merchant_name=None, amount=None, raw_code=None):
    text = normalize_text(' '.join(str(part or '') for part in (
        merchant_name,
        description,
        raw_code,
    )))
    if not text:
        return DEFAULT_CATEGORY

    for category_key, keywords in _CATEGORY_RULES:
        if any(keyword in text for keyword in keywords):
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


def get_expense_records(user_id, include_faturas=True, include_bank=True):
    records = []

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
                'currency': 'EUR',
            })

    if include_bank:
        query = BankTransaction.query.filter(
            BankTransaction.user_id == user_id,
            BankTransaction.amount < 0,
        )
        for transaction in query.all():
            record_date = transaction.booked_at or transaction.value_date
            category = transaction.categoria or categorize_transaction(
                transaction.description,
                transaction.merchant_name,
                transaction.amount,
            )
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
                'value': abs(float(transaction.amount or 0)),
                'currency': transaction.currency or 'EUR',
            })

    records.sort(key=lambda item: (item['date'] or date.min, item['id']), reverse=True)
    return records


def summarize_expenses(user_id, months=12, today=None):
    today = today or datetime.utcnow().date()
    records = get_expense_records(user_id)

    por_categoria = defaultdict(float)
    por_categoria_count = defaultdict(int)
    por_mes = defaultdict(float)
    por_loja = defaultdict(float)
    por_fonte = defaultdict(float)
    por_fonte_count = defaultdict(int)

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

    current_start, current_end = month_window(today.year, today.month)
    prev_year, prev_month = add_months(today.year, today.month, -1)
    previous_start, previous_end = month_window(prev_year, prev_month)

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
                'data': item['date'].strftime('%d/%m/%Y') if item['date'] else None,
                'fonte': item['source'],
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

    return {
        'records': records,
        'total_geral': round(total_geral, 2),
        'num_registos': len(records),
        'por_categoria': [
            {
                'categoria': key,
                'total': round(value, 2),
                'count': por_categoria_count[key],
            }
            for key, value in sorted(por_categoria.items(), key=lambda item: -item[1])
        ],
        'por_mes': [
            {'mes': key, 'total': round(por_mes.get(key, 0), 2)}
            for key in month_keys
            if por_mes.get(key, 0) > 0
        ],
        'historico_mensal': [
            {'mes': month_label(key), 'valor': round(por_mes.get(key, 0), 2)}
            for key in month_keys[-6:]
        ],
        'top_lojas': [
            {'loja': key, 'total': round(value, 2)}
            for key, value in sorted(por_loja.items(), key=lambda item: -item[1])[:8]
        ],
        'fontes': [
            {
                'fonte': key,
                'total': round(value, 2),
                'count': por_fonte_count[key],
            }
            for key, value in sorted(por_fonte.items(), key=lambda item: item[0])
        ],
        'mes_atual': {
            'total': round(current['total'], 2),
            'num_registos': len(current_records),
            'por_categoria': [
                {'categoria': key, 'valor': round(value, 2), 'total': round(value, 2)}
                for key, value in sorted(current['categorias'].items(), key=lambda item: -item[1])
            ],
            'por_fonte': [
                {'fonte': key, 'total': round(value, 2)}
                for key, value in sorted(current['sources'].items(), key=lambda item: item[0])
            ],
            'itens_por_categoria': current['items_by_category'],
        },
        'mes_anterior': {
            'total': round(previous['total'], 2),
            'num_registos': len(previous_records),
        },
        'variacao_pct': variacao_pct,
        'previsao_mensal': forecast,
        'dias_no_mes': monthrange(today.year, today.month)[1],
    }

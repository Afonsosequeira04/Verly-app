"""
scoring.py — "Was It Worth It?" AI Scoring
Score inteligente: combina algoritmo base com avaliação de mercado via Groq.
Inclui route /scoring/lojas-proximas para mapa de lojas via Overpass API.
"""
import os
import json
import math
import requests
from flask import Blueprint, request, jsonify, render_template
from flask_login import login_required, current_user
from app.models import Fatura
from app import db

scoring_bp = Blueprint('scoring', __name__)

# ─── CONSTANTES ───────────────────────────────────────────────────────────────

CATEGORY_WEIGHTS = {
    'Alimentação':      1.15,
    'Saúde & Beleza':   1.10,
    'Educação':         1.10,
    'Desporto':         1.05,
    'Casa & Decoração': 1.00,
    'Vestuário':        0.95,
    'Tecnologia':       0.90,
    'Entretenimento':   0.85,
    'Transportes':      1.00,
    'Outros':           0.90,
}

USAGE_BASE = {
    'daily':   80,
    'weekly':  65,
    'monthly': 45,
    'rarely':  22,
    'never':   5,
}

USAGE_LABELS = {
    'daily':   'Uso diário',
    'weekly':  'Uso regular',
    'monthly': 'Uso ocasional',
    'rarely':  'Raramente usado',
    'never':   'Nunca utilizado',
}

# Mapeamento categoria → tipos de loja OSM para pesquisa
CATEGORIA_OSM = {
    'Tecnologia': [
        'shop=electronics', 'shop=computer', 'shop=mobile_phone',
        'shop=telephone', 'shop=hifi', 'shop=camera',
        'shop=video_games', 'shop=appliance',
        'name=Worten', 'name=MediaMarkt', 'name=Radio Popular',
        'name=Apple Store', 'name=Samsung', 'name=FNAC',
    ],
    'Alimentação': [
        'shop=supermarket', 'shop=convenience', 'shop=grocery',
        'shop=bakery', 'shop=butcher', 'shop=seafood',
        'shop=greengrocer', 'shop=deli', 'shop=food',
        'shop=pastry', 'shop=chocolate', 'shop=confectionery',
        'amenity=marketplace', 'amenity=food_court',
        'name=Continente', 'name=Pingo Doce', 'name=Lidl',
        'name=Aldi', 'name=Mercadona', 'name=Minipreço',
    ],
    'Vestuário': [
        'shop=clothes', 'shop=shoes', 'shop=boutique',
        'shop=fashion', 'shop=accessories', 'shop=bag',
        'shop=jewelry', 'shop=watches', 'shop=leather',
        'shop=underwear', 'shop=sports', 'shop=outdoor',
        'name=Zara', 'name=H&M', 'name=Pull&Bear',
        'name=Bershka', 'name=Mango', 'name=C&A',
        'name=Springfield', 'name=Stradivarius',
    ],
    'Desporto': [
        'shop=sports', 'shop=outdoor', 'shop=bicycle',
        'shop=fishing', 'shop=golf', 'shop=ski',
        'shop=swimming', 'shop=surf',
        'leisure=sports_centre', 'leisure=fitness_centre',
        'leisure=swimming_pool', 'leisure=stadium',
        'name=Decathlon', 'name=Sport Zone', 'name=Nike',
        'name=Adidas', 'name=Intersport',
    ],
    'Saúde & Beleza': [
        'amenity=pharmacy', 'amenity=hospital', 'amenity=clinic',
        'amenity=dentist', 'amenity=doctors',
        'shop=beauty', 'shop=cosmetics', 'shop=hairdresser',
        'shop=optician', 'shop=hearing_aids', 'shop=medical_supply',
        'shop=perfumery', 'shop=wellness',
        'name=Wells', 'name=Perfumes & Companhia',
        'name=Droga Raia', 'name=Farmácia',
    ],
    'Casa & Decoração': [
        'shop=furniture', 'shop=interior_decoration', 'shop=houseware',
        'shop=hardware', 'shop=doityourself', 'shop=paint',
        'shop=curtain', 'shop=carpet', 'shop=lighting',
        'shop=kitchen', 'shop=bathroom', 'shop=bed',
        'shop=garden', 'shop=florist',
        'name=IKEA', 'name=Leroy Merlin', 'name=AKI',
        'name=Conforama', 'name=El Corte Inglés',
    ],
    'Educação': [
        'shop=books', 'shop=stationery', 'shop=art',
        'shop=music', 'shop=musical_instrument',
        'amenity=library', 'amenity=school', 'amenity=university',
        'amenity=college', 'amenity=language_school',
        'amenity=music_school', 'amenity=driving_school',
        'name=FNAC', 'name=Bertrand', 'name=Livraria',
    ],
    'Entretenimento': [
        'amenity=cinema', 'amenity=theatre', 'amenity=nightclub',
        'amenity=bar', 'amenity=pub', 'amenity=casino',
        'amenity=arts_centre', 'amenity=music_venue',
        'leisure=bowling_alley', 'leisure=escape_game',
        'leisure=miniature_golf', 'leisure=amusement_arcade',
        'shop=video_games', 'shop=games', 'shop=toys',
        'name=NOS', 'name=Cinemas NOS', 'name=UCI',
    ],
    'Transportes': [
        'amenity=fuel', 'amenity=parking', 'amenity=car_rental',
        'amenity=car_wash', 'amenity=car_repair',
        'shop=car', 'shop=car_parts', 'shop=car_repair',
        'shop=bicycle', 'shop=motorcycle',
        'amenity=taxi', 'amenity=bus_station',
        'amenity=train_station', 'amenity=ferry_terminal',
        'name=Repsol', 'name=BP', 'name=Galp', 'name=Cepsa',
    ],
    'Outros': [
        'shop=general', 'shop=department_store', 'shop=variety_store',
        'shop=second_hand', 'shop=charity', 'shop=gift',
        'shop=newsagent', 'shop=tobacco', 'shop=lottery',
        'amenity=post_office', 'amenity=bank', 'amenity=atm',
        'shop=laundry', 'shop=dry_cleaning',
        'name=El Corte Inglés', 'name=Fnac',
    ],
}


# ─── AVALIAÇÃO DE MERCADO ─────────────────────────────────────────────────────

def _avaliar_preco_mercado(item: str, preco: float, categoria: str) -> dict:
    """Pede ao Groq o preço médio de mercado e calcula o ajuste ao score."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {'preco_medio': None, 'avaliacao': 'justo', 'ajuste_score': 0, 'comentario': ''}

    prompt = (
        f"Qual é o preço médio de mercado atual deste produto em Portugal ou Europa?\n\n"
        f"Produto: {item}\nCategoria: {categoria}\n\n"
        f"Responde APENAS com JSON válido, sem markdown, sem texto extra:\n"
        f'{{"preco_medio_mercado": <número em euros>, '
        f'"comentario": "<frase curta max 10 palavras sobre o preço típico>"}}\n\n'
        f"Exemplos: PS5->499, iPhone 16 Pro->1199, Nike Air Max->120, Café->1, MacBook Pro 14->1999"
    )

    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": prompt}],
                  "temperature": 0.1, "max_tokens": 150},
            timeout=15,
        )
        if r.status_code != 200:
            raise ValueError("Groq error")

        text = r.json()["choices"][0]["message"]["content"].strip()
        if '```' in text:
            parts = text.split('```')
            text = parts[1] if len(parts) > 1 else text
            if text.startswith('json'):
                text = text[4:]
        text = text.strip().strip('`')
        start, end = text.find('{'), text.rfind('}') + 1
        if start != -1 and end > start:
            text = text[start:end]

        data = json.loads(text)
        preco_medio = float(data.get('preco_medio_mercado') or 0)
        comentario  = data.get('comentario', '')

        if preco_medio > 0:
            ratio = preco / preco_medio
            if ratio < 0.70:
                avaliacao, ajuste = 'barato', +20
            elif ratio <= 1.15:
                avaliacao, ajuste = 'justo', 0
            elif ratio <= 1.50:
                avaliacao, ajuste = 'caro', -15
            else:
                avaliacao, ajuste = 'muito_caro', -30
        else:
            avaliacao, ajuste = 'justo', 0

        return {'preco_medio': preco_medio, 'avaliacao': avaliacao,
                'ajuste_score': ajuste, 'comentario': comentario}

    except Exception:
        return {'preco_medio': None, 'avaliacao': 'justo', 'ajuste_score': 0, 'comentario': ''}


# ─── LOJAS PRÓXIMAS ───────────────────────────────────────────────────────────

def _distancia_km(lat1, lng1, lat2, lng2) -> float:
    """Distância em km entre dois pontos (fórmula de Haversine)."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _distancia_label(km: float) -> str:
    if km < 1:
        return f"{int(km * 1000)} m"
    return f"{km:.1f} km"


def _lojas_overpass(lat: float, lng: float, categoria: str, raio_m: int = 5000) -> list:
    filtros = CATEGORIA_OSM.get(categoria) or CATEGORIA_OSM['Outros']
    clauses = []
    for filtro in filtros[:16]:
        if '=' not in filtro:
            continue
        key, value = filtro.split('=', 1)
        if key == 'name':
            selector = f'["name"~"{value}",i]'
        else:
            selector = f'["{key}"="{value}"]'
        clauses.extend([
            f'node{selector}(around:{raio_m},{lat},{lng});',
            f'way{selector}(around:{raio_m},{lat},{lng});',
            f'relation{selector}(around:{raio_m},{lat},{lng});',
        ])

    query = f"""
    [out:json][timeout:12];
    (
      {' '.join(clauses)}
    );
    out center tags 30;
    """

    try:
        r = requests.post('https://overpass-api.de/api/interpreter', data={'data': query}, timeout=16)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        print(f"[OVERPASS] erro: {exc}")
        return []

    lojas = []
    seen = set()
    for element in data.get('elements', []):
        tags = element.get('tags') or {}
        nome = tags.get('name')
        if not nome:
            continue
        elat = element.get('lat') or element.get('center', {}).get('lat')
        elng = element.get('lon') or element.get('center', {}).get('lon')
        if elat is None or elng is None:
            continue
        key = (nome.lower(), round(float(elat), 4), round(float(elng), 4))
        if key in seen:
            continue
        seen.add(key)
        km = _distancia_km(lat, lng, float(elat), float(elng))
        endereco = ', '.join(filter(None, [
            tags.get('addr:street'),
            tags.get('addr:city'),
        ]))
        lojas.append({
            'nome': nome,
            'lat': float(elat),
            'lng': float(elng),
            'endereco': endereco,
            'distancia': _distancia_label(km),
            'km': km,
            'fonte': 'OpenStreetMap',
        })

    lojas.sort(key=lambda x: x['km'])
    return lojas[:10]


def buscar_lojas_osm(lat: float, lng: float, categoria: str, raio_m: int = 5000, item: str = '') -> list:
    """Procura lojas próximas. Usa Google Places quando configurado e OSM como fallback."""

    KEYWORDS_CATEGORIA = {
        'Tecnologia':       'loja tecnologia eletrónica telemóvel computador',
        'Alimentação':      'supermercado mercearia padaria alimentação',
        'Vestuário':        'loja roupa calçado moda vestuário',
        'Desporto':         'loja desporto ginásio fitness',
        'Saúde & Beleza':   'farmácia beleza cosméticos saúde',
        'Casa & Decoração': 'mobiliário decoração casa bricolage',
        'Educação':         'livraria papelaria escola biblioteca',
        'Entretenimento':   'cinema bar entretenimento jogos',
        'Transportes':      'combustível posto gasolina automóvel',
        'Outros':           'loja geral',
    }

    api_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not api_key:
        print("[MAPA] GOOGLE_PLACES_API_KEY não configurada")
        return _lojas_overpass(lat, lng, categoria, raio_m)

    # Usa o nome do produto se disponível — muito mais específico do que a categoria
    if item and item.strip() and item.lower() not in ('item', ''):
        keyword = item.strip()
    else:
        keyword = KEYWORDS_CATEGORIA.get(categoria, 'loja')

    print(f"[GOOGLE PLACES] keyword usada: '{keyword}'")

    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
            params={
                'location': f"{lat},{lng}",
                'radius':   raio_m,
                'keyword':  keyword,
                'language': 'pt',
                'key':      api_key,
            },
            timeout=10,
        )

        print(f"[GOOGLE PLACES] status HTTP: {r.status_code}")
        data = r.json()
        print(f"[GOOGLE PLACES] status API: {data.get('status')}")

        if data.get('status') not in ('OK', 'ZERO_RESULTS'):
            print(f"[GOOGLE PLACES] erro: {data.get('error_message', '')}")
            return _lojas_overpass(lat, lng, categoria, raio_m)

        lojas = []
        seen = set()

        for place in data.get('results', []):
            nome = place.get('name')
            if not nome or nome in seen:
                continue
            seen.add(nome)

            loc = place['geometry']['location']
            elat, elng = loc['lat'], loc['lng']
            km = _distancia_km(lat, lng, elat, elng)

            lojas.append({
                'nome':      nome,
                'lat':       elat,
                'lng':       elng,
                'endereco':  place.get('vicinity', ''),
                'distancia': _distancia_label(km),
                'km':        km,
            })

        lojas.sort(key=lambda x: x['km'])
        print(f"[GOOGLE PLACES] lojas encontradas: {len(lojas)}")
        return lojas[:10] if lojas else _lojas_overpass(lat, lng, categoria, raio_m)

    except Exception as e:
        print(f"[GOOGLE PLACES] exceção: {e}")
        return _lojas_overpass(lat, lng, categoria, raio_m)


def buscar_precos_online(item: str, categoria: str = '', limite: int = 8) -> dict:
    """Pesquisa preços reais via SerpAPI Google Shopping quando configurado."""
    api_key = os.getenv('SERPAPI_KEY') or os.getenv('SERP_API_KEY')
    item = (item or '').strip()
    if not item:
        return {'configured': False, 'items': [], 'message': 'Produto vazio.'}
    if not api_key:
        return {
            'configured': False,
            'items': [],
            'message': 'Configura SERPAPI_KEY para mostrar preços reais de outras lojas.',
        }

    try:
        response = requests.get(
            'https://serpapi.com/search.json',
            params={
                'engine': 'google_shopping',
                'q': item,
                'gl': 'pt',
                'hl': 'pt',
                'api_key': api_key,
            },
            timeout=16,
        )
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        print(f"[PREÇOS] erro SerpAPI: {exc}")
        return {'configured': True, 'items': [], 'message': 'Não foi possível obter preços agora.'}

    results = []
    for raw in (data.get('shopping_results') or [])[:limite * 2]:
        price = raw.get('extracted_price')
        if price is None:
            continue
        try:
            price = float(price)
        except (TypeError, ValueError):
            continue
        results.append({
            'nome': raw.get('title') or item,
            'loja': raw.get('source') or raw.get('seller') or 'Loja online',
            'preco': round(price, 2),
            'moeda': 'EUR',
            'link': raw.get('link') or raw.get('product_link'),
            'thumbnail': raw.get('thumbnail'),
            'rating': raw.get('rating'),
            'reviews': raw.get('reviews'),
            'fonte': 'Google Shopping',
        })
        if len(results) >= limite:
            break

    results.sort(key=lambda row: row['preco'])
    for index, row in enumerate(results):
        row['mais_barato'] = index == 0

    return {
        'configured': True,
        'items': results,
        'message': '' if results else 'Sem preços encontrados para este produto.',
    }

# ─── SCORE ────────────────────────────────────────────────────────────────────

def _score_label(score: int, personalidade: str) -> dict:
    personas = {
        'savage': {
            (80, 101): ('Decisão Sólida',  'green',  'Raro. Até tu fizeste bem desta vez.'),
            (60,  80): ('Aceitável',        'brand2', 'Passável. Mas não te gabares.'),
            (40,  60): ('Duvidoso',         'yellow', 'Sabes que não precisavas disto.'),
            (20,  40): ('Regret Incoming',  'orange', 'O teu futuro eu vai mandar-te mensagens de ódio.'),
            (0,   20): ('Dinheiro Ardido',  'red',    'Parabéns. Transformaste euros em remorso puro.'),
        },
        'sarcastic': {
            (80, 101): ('Uau, bem feito',   'green',  'Quem diria. Uma decisão financeira adulta.'),
            (60,  80): ('Mais ou menos',    'brand2', 'Podias ter poupado, mas pronto.'),
            (40,  60): ('Interessante...',  'yellow', 'Tenho a certeza que tinhas mesmo de comprar isto.'),
            (20,  40): ('Boa sorte aí',     'orange', 'Espero que o remorso venha com brinde.'),
            (0,   20): ('Magistral',        'red',    'Ninguém te bate nisto. Literalmente ninguém.'),
        },
        'calm': {
            (80, 101): ('Boa decisão',      'green',  'Esta compra alinha com os teus objetivos. Bem feito.'),
            (60,  80): ('Razoável',         'brand2', 'Há melhores opções, mas não foi má escolha.'),
            (40,  60): ('Reconsiderar',     'yellow', 'Vale a pena refletir se isto era mesmo necessário.'),
            (20,  40): ('Risco elevado',    'orange', 'Esta compra pode gerar arrependimento.'),
            (0,   20): ('Evitar repetir',   'red',    'Esta decisão não ajuda os teus objetivos financeiros.'),
        },
        'pro': {
            (80, 101): ('ROI Positivo',     'green',  'Investimento justificado. Custo-benefício favorável.'),
            (60,  80): ('ROI Neutro',       'brand2', 'Dentro do aceitável. Monitorizar uso.'),
            (40,  60): ('ROI Baixo',        'yellow', 'Retorno questionável. Rever prioridades.'),
            (20,  40): ('Capital em Risco', 'orange', 'Desperdício provável. Ajustar comportamento.'),
            (0,   20): ('Prejuízo Total',   'red',    'Gasto sem retorno mensurável.'),
        },
    }
    p = personalidade if personalidade in personas else 'calm'
    for (low, high), (label, color, msg) in personas[p].items():
        if low <= score < high:
            return {'label': label, 'color': color, 'message': msg}
    return {'label': '—', 'color': 'muted', 'message': ''}


def _chip_preco(avaliacao: str, preco_medio: float) -> dict:
    labels = {
        'barato':     ('💚 Preço barato',    'good'),
        'justo':      ('✓ Preço justo',      'mid'),
        'caro':       ('⚠ Preço acima',      'bad'),
        'muito_caro': ('🔴 Preço excessivo', 'bad'),
    }
    text, tipo = labels.get(avaliacao, ('Preço desconhecido', 'mid'))
    if preco_medio and preco_medio > 0:
        text += f' (mercado ~{preco_medio:.0f}€)'
    return {'text': text, 'type': tipo}


def calcular_score(categoria: str, preco: float, uso: str,
                   personalidade: str = 'calm', item: str = '') -> dict:
    base     = USAGE_BASE.get(uso, 40)
    weight   = CATEGORY_WEIGHTS.get(categoria, 0.90)
    raw_base = base * weight

    mercado = {'preco_medio': None, 'avaliacao': 'justo', 'ajuste_score': 0, 'comentario': ''}
    if item and item.strip() and item.lower() != 'item':
        mercado = _avaliar_preco_mercado(item, preco, categoria)

    score = int(max(0, min(100, raw_base + mercado['ajuste_score'])))
    label_info = _score_label(score, personalidade)
    price_score = 75
    if mercado['avaliacao'] == 'barato':
        price_score = 92
    elif mercado['avaliacao'] == 'justo':
        price_score = 74
    elif mercado['avaliacao'] == 'caro':
        price_score = 45
    elif mercado['avaliacao'] == 'muito_caro':
        price_score = 20

    chips = [
        {'text': USAGE_LABELS.get(uso, uso), 'type': 'good' if score >= 60 else 'bad'},
        {'text': f'{preco:.2f}€', 'type': 'bad' if preco > 300 else 'mid'},
        {'text': categoria, 'type': 'mid'},
    ]
    if mercado['comentario']:
        chips.append(_chip_preco(mercado['avaliacao'], mercado['preco_medio']))
    if score < 40:
        chips.append({'text': 'Alto arrependimento', 'type': 'bad'})
    elif score >= 80:
        chips.append({'text': 'Compra validada', 'type': 'good'})

    mensagem = label_info['message']
    if mercado['comentario']:
        mensagem += ' ' + mercado['comentario']

    return {
        'score':               score,
        'score_final':         score,
        'label':               label_info['label'],
        'color':               label_info['color'],
        'message':             mensagem,
        'conselho':            mensagem,
        'chips':               chips,
        'preco_medio_mercado': mercado['preco_medio'],
        'avaliacao_mercado':   {
            'preco_medio': mercado['preco_medio'],
            'avaliacao': mercado['avaliacao'],
            'comentario': mercado['comentario'],
        },
        'fatores': [
            {'nome': 'Uso previsto', 'score': int(max(0, min(100, base)))},
            {'nome': 'Categoria', 'score': int(max(0, min(100, weight * 75)))},
            {'nome': 'Preço vs mercado', 'score': price_score},
        ],
    }


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@scoring_bp.route('/scoring')
@login_required
def analisar():
    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'
    return render_template('scoring.html', personalidade=personalidade)


@scoring_bp.route('/scoring/analisar', methods=['POST'])
@login_required
def analisar_post():
    data      = request.json or {}
    item      = (data.get('item') or 'Item').strip() or 'Item'
    preco     = float(data.get('preco') or 0)
    categoria = data.get('categoria', 'Outros')
    uso       = data.get('uso', 'monthly')
    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'

    resultado = calcular_score(categoria, preco, uso, personalidade, item=item)
    resultado['item'] = item
    return jsonify({'success': True, 'resultado': resultado})


@scoring_bp.route('/scoring/lojas-proximas', methods=['POST'])
@login_required
def lojas_proximas():
    print("=== LOJAS ROUTE HIT ===")
    data      = request.json or {}
    lat       = data.get('lat')
    lng       = data.get('lng')
    categoria = data.get('categoria', 'Outros')
    item      = data.get('item', '')

    print(f"[MAPA] lat={lat}, lng={lng}, categoria={categoria}")

    if lat is None or lng is None:
        return jsonify({'success': False, 'message': 'Localização não fornecida.', 'lojas': []})

    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'Coordenadas inválidas.', 'lojas': []})

    lojas = buscar_lojas_osm(lat, lng, categoria, item=item)
    print(f"[MAPA] lojas encontradas: {len(lojas)}")

    return jsonify({'success': True, 'lojas': lojas, 'item': item})


@scoring_bp.route('/scoring/fatura/<int:fatura_id>', methods=['GET'])
@login_required
def score_fatura(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Fatura não encontrada.'})

    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'
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

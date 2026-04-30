"""
scoring.py — "Was It Worth It?" AI Scoring
Score inteligente: combina algoritmo base com avaliação de mercado via Groq.
"""
import os
import json
import requests
from flask import Blueprint, request, jsonify, render_template
from flask_login import login_required, current_user
from app.models import Fatura
from app import db

scoring_bp = Blueprint('scoring', __name__)

# Pesos por categoria
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

# Score base por frequência de uso
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


def _avaliar_preco_mercado(item: str, preco: float, categoria: str) -> dict:
    """
    Pede ao Groq apenas o preço médio de mercado do produto.
    Calculamos nós próprios o ajuste ao score com base no rácio preço pago / mercado.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {'preco_medio': None, 'avaliacao': 'justo', 'ajuste_score': 0, 'comentario': ''}

    prompt = f"""Qual é o preço médio de mercado atual deste produto em Portugal ou Europa?

Produto: {item}
Categoria: {categoria}

Responde APENAS com JSON válido, sem markdown, sem texto extra:
{{
  "preco_medio_mercado": <número em euros>,
  "comentario": "<frase curta max 10 palavras sobre o preço típico deste produto>"
}}

Exemplos de referência:
- PS5 -> 499
- iPhone 16 Pro -> 1199
- Nike Air Max -> 120
- Cafe expresso -> 1
- MacBook Pro 14 -> 1999"""

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 150,
            },
            timeout=15,
        )

        if response.status_code != 200:
            return {'preco_medio': None, 'avaliacao': 'justo', 'ajuste_score': 0, 'comentario': ''}

        text = response.json()["choices"][0]["message"]["content"].strip()

        # Limpar markdown se vier
        if '```' in text:
            parts = text.split('```')
            text = parts[1] if len(parts) > 1 else text
            if text.startswith('json'):
                text = text[4:]
        text = text.strip().strip('`')

        start = text.find('{')
        end   = text.rfind('}') + 1
        if start != -1 and end > start:
            text = text[start:end]

        data        = json.loads(text)
        preco_medio = float(data.get('preco_medio_mercado') or 0)
        comentario  = data.get('comentario', '')

        # Calculamos o ajuste com base no rácio preço pago / preço médio de mercado
        if preco_medio > 0:
            ratio = preco / preco_medio
            if ratio < 0.70:
                avaliacao = 'barato'
                ajuste    = +20
            elif ratio <= 1.15:
                avaliacao = 'justo'
                ajuste    = 0
            elif ratio <= 1.50:
                avaliacao = 'caro'
                ajuste    = -15
            else:
                avaliacao = 'muito_caro'
                ajuste    = -30
        else:
            avaliacao = 'justo'
            ajuste    = 0

        return {
            'preco_medio':  preco_medio,
            'avaliacao':    avaliacao,
            'ajuste_score': ajuste,
            'comentario':   comentario,
        }

    except Exception:
        return {'preco_medio': None, 'avaliacao': 'justo', 'ajuste_score': 0, 'comentario': ''}


def _score_label(score: int, personalidade: str) -> dict:
    personas = {
        'savage': {
            (80, 101): ('Decisão Sólida',   'green',  'Raro. Até tu fizeste bem desta vez.'),
            (60,  80): ('Aceitável',         'brand2', 'Passável. Mas não te gabares.'),
            (40,  60): ('Duvidoso',          'yellow', 'Sabes que não precisavas disto.'),
            (20,  40): ('Regret Incoming',   'orange', 'O teu futuro eu vai mandar-te mensagens de ódio.'),
            (0,   20): ('Dinheiro Ardido',   'red',    'Parabéns. Transformaste euros em remorso puro.'),
        },
        'sarcastic': {
            (80, 101): ('Uau, bem feito',    'green',  'Quem diria. Uma decisão financeira adulta.'),
            (60,  80): ('Mais ou menos',     'brand2', 'Podias ter poupado, mas pronto.'),
            (40,  60): ('Interessante...',   'yellow', 'Tenho a certeza que tinhas mesmo de comprar isto.'),
            (20,  40): ('Boa sorte aí',      'orange', 'Espero que o remorso venha com brinde.'),
            (0,   20): ('Magistral',         'red',    'Ninguém te bate nisto. Literalmente ninguém.'),
        },
        'calm': {
            (80, 101): ('Boa decisão',       'green',  'Esta compra alinha com os teus objetivos. Bem feito.'),
            (60,  80): ('Razoável',          'brand2', 'Ha melhores opcoes, mas nao foi ma escolha.'),
            (40,  60): ('Reconsiderar',      'yellow', 'Vale a pena refletir se isto era mesmo necessario.'),
            (20,  40): ('Risco elevado',     'orange', 'Esta compra pode gerar arrependimento. Aprende para a proxima.'),
            (0,   20): ('Evitar repetir',    'red',    'Esta decisao nao ajuda os teus objetivos financeiros.'),
        },
        'pro': {
            (80, 101): ('ROI Positivo',      'green',  'Investimento justificado. Custo-beneficio favoravel.'),
            (60,  80): ('ROI Neutro',        'brand2', 'Dentro do aceitavel. Monitorizar uso.'),
            (40,  60): ('ROI Baixo',         'yellow', 'Retorno questionavel. Rever prioridades.'),
            (20,  40): ('Capital em Risco',  'orange', 'Desperdicio provavel. Ajustar comportamento.'),
            (0,   20): ('Prejuizo Total',    'red',    'Gasto sem retorno mensuravel. Reclassificar como custo de oportunidade perdida.'),
        },
    }

    p = personalidade if personalidade in personas else 'calm'
    for (low, high), (label, color, msg) in personas[p].items():
        if low <= score < high:
            return {'label': label, 'color': color, 'message': msg}
    return {'label': '—', 'color': 'muted', 'message': ''}


def _chip_preco(avaliacao: str, preco_medio: float) -> dict:
    labels = {
        'barato':     ('Preco barato',    'good'),
        'justo':      ('Preco justo',     'mid'),
        'caro':       ('Preco acima',     'bad'),
        'muito_caro': ('Preco excessivo', 'bad'),
    }
    text, tipo = labels.get(avaliacao, ('Preco desconhecido', 'mid'))
    if preco_medio and preco_medio > 0:
        text += f' (mercado ~{preco_medio:.0f}€)'
    return {'text': text, 'type': tipo}


def calcular_score(categoria: str, preco: float, uso: str,
                   personalidade: str = 'calm', item: str = '') -> dict:
    """Calcula o score com avaliacao de mercado via IA."""

    base     = USAGE_BASE.get(uso, 40)
    weight   = CATEGORY_WEIGHTS.get(categoria, 0.90)
    raw_base = base * weight

    # Avaliacao de mercado via Groq
    mercado = {'preco_medio': None, 'avaliacao': 'justo', 'ajuste_score': 0, 'comentario': ''}
    if item and item.strip() and item.lower() != 'item':
        mercado = _avaliar_preco_mercado(item, preco, categoria)

    raw_final = raw_base + mercado['ajuste_score']
    score     = int(max(0, min(100, raw_final)))

    label_info = _score_label(score, personalidade)

    # Chips
    chips = []
    chips.append({
        'text': USAGE_LABELS.get(uso, uso),
        'type': 'good' if score >= 60 else 'bad'
    })
    chips.append({
        'text': f'{preco:.2f}€',
        'type': 'bad' if preco > 300 else 'mid'
    })
    chips.append({'text': categoria, 'type': 'mid'})

    if mercado['comentario']:
        chips.append(_chip_preco(mercado['avaliacao'], mercado['preco_medio']))

    if score < 40:
        chips.append({'text': 'Alto arrependimento', 'type': 'bad'})
    elif score >= 80:
        chips.append({'text': 'Compra validada', 'type': 'good'})

    mensagem_final = label_info['message']
    if mercado['comentario']:
        mensagem_final += ' ' + mercado['comentario']

    return {
        'score':               score,
        'label':               label_info['label'],
        'color':               label_info['color'],
        'message':             mensagem_final,
        'chips':               chips,
        'preco_medio_mercado': mercado['preco_medio'],
        'avaliacao_mercado':   mercado['avaliacao'],
    }


# ─── ROUTES ──────────────────────────────────────────────────────────────────

@scoring_bp.route('/scoring')
@login_required
def analisar():
    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'
    return render_template('scoring.html', personalidade=personalidade)


@scoring_bp.route('/scoring/analisar', methods=['POST'])
@login_required
def analisar_post():
    data      = request.json or {}
    item      = data.get('item', 'Item').strip() or 'Item'
    preco     = float(data.get('preco') or 0)
    categoria = data.get('categoria', 'Outros')
    uso       = data.get('uso', 'monthly')

    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'

    resultado = calcular_score(categoria, preco, uso, personalidade, item=item)
    resultado['item'] = item

    return jsonify({'success': True, 'resultado': resultado})


@scoring_bp.route('/scoring/fatura/<int:fatura_id>', methods=['GET'])
@login_required
def score_fatura(fatura_id):
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Fatura nao encontrada.'})

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
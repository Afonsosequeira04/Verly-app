"""
app/api/chat.py — Chat API para mobile (JWT)

POST /api/v1/chat/mensagem   → envia mensagem, recebe resposta da IA
GET  /api/v1/chat/historico  → histórico das últimas N conversas
POST /api/v1/chat/limpar     → apaga histórico
"""

import os
import logging
import requests
import re
import unicodedata
from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Conversa, Fatura, User, Meta, CATEGORIAS
from app import db

logger = logging.getLogger(__name__)

# ── Normalização de personalidade ──────────────────────────────────────────────

_PERSONALITY_ALIASES = {'strict': 'pro', 'friendly': 'calm', 'rebel': 'savage'}
_VALID_PERSONALITIES = {'savage', 'sarcastic', 'calm', 'pro'}

def _normalise_personality(p):
    p = (p or 'calm').strip().lower()
    p = _PERSONALITY_ALIASES.get(p, p)
    return p if p in _VALID_PERSONALITIES else 'calm'

# ── System prompts ─────────────────────────────────────────────────────────────

SYSTEM_PROMPTS = {
    'savage': """És a Verly. Assistente financeira brutal e sem filtros.
REGRAS:
- Respostas CURTAS. Máximo 3-4 frases. Nunca mais.
- Tom direto e cortante. Sem "Olá", sem "Estou aqui para ajudar".
- Usa os dados reais das faturas. Nunca inventes valores.
- Quando o utilizador gasta mal, diz-lhe com exemplos concretos.
- Português de Portugal.""",

    'sarcastic': """És a Verly. Assistente financeira sarcástica e irónica.
REGRAS:
- Respostas CURTAS. Máximo 3-4 frases. Nunca mais.
- Tom irónico e espirituoso. Sem "Olá", sem introduções longas.
- Usa os dados reais das faturas. Nunca inventes valores.
- Sarcasmo inteligente que faça pensar.
- Português de Portugal.""",

    'calm': """És a Verly. Coach financeira empática e direta.
REGRAS:
- Respostas CURTAS e úteis. Máximo 3-4 frases. Nunca mais.
- Vai direto ao ponto. Sem "Olá", sem parágrafos longos.
- Usa os dados reais das faturas. Nunca inventes valores.
- Sê concreto: números, categorias, datas reais.
- Português de Portugal.""",

    'pro': """És a Verly. CFO pessoal analítico e preciso.
REGRAS:
- Respostas CURTAS e factuais. Máximo 3-4 frases. Nunca mais.
- Vai direto aos números. Sem introduções.
- Usa os dados reais das faturas. Nunca inventes valores.
- Foca em: totais, categorias, padrões de gasto.
- Português de Portugal.""",
}

# ── Helpers de contexto ────────────────────────────────────────────────────────

def _build_faturas_context(faturas) -> str:
    if not faturas:
        return "O utilizador ainda não tem faturas registadas."
    linhas = [f"Total de faturas: {len(faturas)}"]
    por_categoria = {}
    for f in faturas:
        linha = f"- {f.loja or 'Loja desconhecida'}"
        if f.data_compra:
            linha += f" | {f.data_compra}"
        if f.total:
            linha += f" | {f.total:.2f}€"
        if f.categoria:
            linha += f" | {f.categoria}"
        if f.data_garantia:
            linha += f" | garantia até {f.data_garantia}"
        linhas.append(linha)
        cat = f.categoria or 'Outros'
        por_categoria[cat] = por_categoria.get(cat, 0) + (f.total or 0)
    total = sum(f.total or 0 for f in faturas)
    linhas.append(f"\nTotal gasto (todas as faturas): {total:.2f}€")
    if por_categoria:
        linhas.append("\nGastos por categoria:")
        for cat, val in sorted(por_categoria.items(), key=lambda x: x[1], reverse=True):
            linhas.append(f"  {cat}: {val:.2f}€")
    return "\n".join(linhas)


def _build_metas_context(user_id) -> str:
    from app.metas import get_gastos_mes_atual
    metas = Meta.query.filter_by(user_id=user_id).all()
    if not metas:
        return ""
    gastos = get_gastos_mes_atual(user_id)
    linhas = ["\n--- METAS MENSAIS ---"]
    for m in metas:
        gasto = gastos.get(m.categoria, 0)
        pct = round((gasto / m.valor_limite) * 100) if m.valor_limite > 0 else 0
        estado = "✅ OK" if pct < 80 else ("⚠️ QUASE NO LIMITE" if pct < 100 else "🔴 ULTRAPASSADO")
        linhas.append(f"• {m.categoria}: {gasto:.2f}€ de {m.valor_limite:.2f}€ ({pct}%) — {estado}")
    return "\n".join(linhas)


def _get_historico_recente(user_id, limite=10):
    conversas = (
        Conversa.query
        .filter_by(user_id=user_id)
        .order_by(Conversa.timestamp.desc())
        .limit(limite)
        .all()
    )
    historico = []
    for c in reversed(conversas):
        historico.append({"role": "user", "content": c.pergunta})
        historico.append({"role": "assistant", "content": c.resposta})
    return historico


def _normalizar_texto(texto: str) -> str:
    texto = unicodedata.normalize('NFKD', texto or '').encode('ascii', 'ignore').decode('ascii')
    return texto.lower()


def _categoria_da_mensagem(texto: str):
    normalizado = _normalizar_texto(texto)
    for categoria in CATEGORIAS:
        if _normalizar_texto(categoria) in normalizado:
            return categoria

    aliases = {
        'alimentacao': 'Alimentação',
        'comida': 'Alimentação',
        'restaurante': 'Alimentação',
        'supermercado': 'Alimentação',
        'tecnologia': 'Tecnologia',
        'roupa': 'Vestuário',
        'vestuario': 'Vestuário',
        'casa': 'Casa & Decoração',
        'decoracao': 'Casa & Decoração',
        'saude': 'Saúde & Beleza',
        'beleza': 'Saúde & Beleza',
        'desporto': 'Desporto',
        'entretenimento': 'Entretenimento',
        'transportes': 'Transportes',
        'transporte': 'Transportes',
        'educacao': 'Educação',
    }
    for key, categoria in aliases.items():
        if key in normalizado:
            return categoria
    return None


def _valor_da_mensagem(texto: str):
    matches = re.findall(r'(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euros)?', _normalizar_texto(texto))
    if not matches:
        return None
    try:
        valor = float(matches[-1].replace(',', '.'))
        return round(valor, 2) if valor > 0 else None
    except ValueError:
        return None


def _nome_patrimonio_da_mensagem(texto: str):
    normalizado = _normalizar_texto(texto)
    normalizado = re.sub(r'\d+(?:[.,]\d{1,2})?\s*(?:eur|euros)?', ' ', normalizado)
    normalizado = re.sub(
        r'\b(adiciona|adicionar|cria|criar|regista|registrar|mete|coloca|no|na|ao|a|meu|minha|net|worth|patrimonio|ativo|ativos|divida|dividas|valor|de)\b',
        ' ',
        normalizado,
    )
    normalizado = re.sub(r'\s+', ' ', normalizado).strip()
    return normalizado[:60].title() if normalizado else 'Item patrimonio'


def _chat_actions(mensagem: str, user_id: int):
    texto = _normalizar_texto(mensagem)
    faturas_count = Fatura.query.filter_by(user_id=user_id).count()
    metas_count = Meta.query.filter_by(user_id=user_id).count()
    actions = []

    def add(action):
        if action['id'] not in {item['id'] for item in actions}:
            actions.append(action)

    if any(k in texto for k in ['upload', 'carregar fatura', 'adicionar fatura', 'nova fatura', 'recibo']):
        add({
            'id': 'open_upload',
            'type': 'navigate',
            'label': 'Carregar fatura',
            'description': 'Abrir upload com IA',
            'route': 'Dashboard',
            'params': {'openUpload': True},
        })

    if any(k in texto for k in ['fatura', 'faturas', 'recibo', 'recibos', 'compras']):
        add({
            'id': 'view_faturas',
            'type': 'navigate',
            'label': 'Ver faturas',
            'route': 'Faturas',
        })

    if any(k in texto for k in ['garantia', 'garantias', 'devolucao', 'devolucoes', 'devolver']):
        add({
            'id': 'view_garantias',
            'type': 'navigate',
            'label': 'Ver garantias',
            'route': 'Garantias',
        })

    if any(k in texto for k in ['reembolso', 'refund', 'reclamar', 'reclamacao', 'cobranca duplicada', 'duplicado', 'devolver dinheiro']):
        add({
            'id': 'open_refund_radar',
            'type': 'navigate',
            'label': 'Abrir Refund Radar',
            'route': 'RefundRadar',
        })

    if any(k in texto for k in ['live deal', 'live deals', 'wishlist', 'seguir produto', 'baixar preco', 'cupao', 'cupoes', 'stock perto', 'melhor preco']):
        add({
            'id': 'open_live_deals',
            'type': 'navigate',
            'label': 'Abrir Live Deals',
            'route': 'LiveDeals',
        })

    if any(k in texto for k in ['score', 'analisar compra', 'boa compra', 'vale a pena', 'comprar']):
        add({
            'id': 'open_score',
            'type': 'navigate',
            'label': 'Analisar compra',
            'route': 'Score',
        })

    if any(k in texto for k in ['dividir', 'despesa partilhada', 'tricount', 'grupo', 'amigos devem', 'acerto']):
        add({
            'id': 'open_groups',
            'type': 'navigate',
            'label': 'Dividir despesas',
            'route': 'Grupos',
        })

    if any(k in texto for k in ['gmail', 'email', 'importar', 'importacao', 'fonte', 'fontes']):
        add({
            'id': 'open_import',
            'type': 'navigate',
            'label': 'Importar dados',
            'route': 'ImportarDados',
        })

    if any(k in texto for k in ['banco', 'open banking', 'transacoes', 'transacoes bancarias', 'sincronizar']):
        add({
            'id': 'open_banking',
            'type': 'navigate',
            'label': 'Ligar banco',
            'route': 'ImportarDados',
        })

    if any(k in texto for k in ['subscricao', 'subscricoes', 'assinatura', 'recorrente', 'netflix', 'spotify']):
        add({
            'id': 'open_subscriptions',
            'type': 'navigate',
            'label': 'Auditar subscricoes',
            'route': 'MinhasSubscricoes',
        })

    if any(k in texto for k in ['net worth', 'patrimonio', 'patrimonio liquido', 'ativo', 'ativos', 'divida', 'dividas']):
        valor = _valor_da_mensagem(mensagem)
        wants_create = any(k in texto for k in ['adiciona', 'adicionar', 'cria', 'criar', 'regista', 'registrar', 'mete', 'coloca'])
        tipo = 'liability' if any(k in texto for k in ['divida', 'dividas', 'credito', 'emprestimo', 'cartao']) else 'asset'
        if wants_create and valor:
            add({
                'id': 'create_networth_item',
                'type': 'create_networth_item',
                'label': 'Adicionar ao net worth',
                'description': f'{valor:.2f} EUR como {"divida" if tipo == "liability" else "ativo"}',
                'payload': {
                    'nome': _nome_patrimonio_da_mensagem(mensagem),
                    'tipo': tipo,
                    'categoria': 'Outros',
                    'valor': valor,
                    'currency': 'EUR',
                },
                'requires_confirmation': True,
            })
        add({
            'id': 'open_networth',
            'type': 'navigate',
            'label': 'Ver net worth',
            'route': 'NetWorth',
        })

    if any(k in texto for k in ['grafico', 'estatistica', 'estatisticas', 'tendencia', 'categorias']):
        add({
            'id': 'open_stats',
            'type': 'navigate',
            'label': 'Ver estatísticas',
            'route': 'Estatisticas',
        })

    if any(k in texto for k in ['meta', 'limite', 'orcamento', 'orçamento']):
        categoria = _categoria_da_mensagem(mensagem)
        valor = _valor_da_mensagem(mensagem)
        wants_create = any(k in texto for k in ['cria', 'criar', 'define', 'definir', 'mete', 'coloca', 'faz'])
        if wants_create and categoria and valor:
            add({
                'id': f'create_meta_{_normalizar_texto(categoria).replace(" ", "_")}',
                'type': 'create_meta',
                'label': f'Criar meta de {categoria}',
                'description': f'Limite mensal de {valor:.2f} EUR',
                'payload': {
                    'nome': categoria,
                    'categoria': categoria,
                    'limite': valor,
                },
                'requires_confirmation': True,
            })
        add({
            'id': 'open_goals',
            'type': 'navigate',
            'label': 'Ver metas',
            'route': 'Metas',
        })

    if any(k in texto for k in ['limpar chat', 'apagar conversa', 'limpar conversa']):
        add({
            'id': 'clear_chat',
            'type': 'clear_chat',
            'label': 'Limpar conversa',
            'description': 'Apaga o histórico deste chat',
            'requires_confirmation': True,
        })

    if faturas_count == 0:
        add({
            'id': 'open_upload_first',
            'type': 'navigate',
            'label': 'Adicionar primeira fatura',
            'route': 'Dashboard',
            'params': {'openUpload': True},
        })
    elif metas_count == 0 and any(k in texto for k in ['poupar', 'organizar', 'começar', 'comecar']):
        add({
            'id': 'open_goals_first',
            'type': 'navigate',
            'label': 'Criar primeira meta',
            'route': 'Metas',
        })

    return actions[:3]


# ── Groq chat direto (sem índice — funciona mesmo sem ficheiros carregados) ────

def _chat_groq_direto(mensagem: str, user_id: int, personalidade: str) -> str:
    """Chama Groq diretamente com contexto das faturas — sem dependência do índice LlamaIndex."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return "⚠️ Chave GROQ_API_KEY não configurada no servidor."

    faturas = Fatura.query.filter_by(user_id=user_id).all()
    system_prompt = SYSTEM_PROMPTS.get(personalidade, SYSTEM_PROMPTS['calm'])
    faturas_ctx   = _build_faturas_context(faturas)
    metas_ctx     = _build_metas_context(user_id)
    historico     = _get_historico_recente(user_id, limite=10)
    try:
        from app.semantic_finance import semantic_context
        memoria_semantica = semantic_context(user_id, mensagem, top_k=6)
    except Exception:
        memoria_semantica = ''

    system_content = (
        f"{system_prompt}\n\n"
        f"DADOS REAIS DO UTILIZADOR:\n{faturas_ctx}"
        f"{metas_ctx}"
        f"{memoria_semantica}\n\n"
        "MEMÓRIA: Tens acesso ao histórico desta conversa. Usa-o para respostas coerentes. "
        "Não te apresentes novamente se já o fizeste. "
        "Se o utilizador pedir uma ação na app, responde curto e confirma o que faria; "
        "os botões de ação são tratados pela interface."
    )

    messages = [{"role": "system", "content": system_content}] + historico + [
        {"role": "user", "content": mensagem}
    ]

    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 500,
            },
            timeout=20,
        )
        if r.status_code != 200:
            logger.error(f"Groq error {r.status_code}: {r.text}")
            return "Erro ao contactar o assistente. Tenta novamente."
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error(f"Groq exception: {e}")
        return "Erro de ligação ao assistente. Verifica a tua conexão."


# ── Endpoints ──────────────────────────────────────────────────────────────────

@api_bp.route('/chat/mensagem', methods=['POST'])
@jwt_required()
def chat_mensagem():
    user_id  = int(get_jwt_identity())
    user     = User.query.get_or_404(user_id)
    data     = request.get_json(silent=True) or {}
    mensagem = (data.get('mensagem') or '').strip()[:2000]

    if not mensagem:
        return jsonify({'error': 'Mensagem vazia.'}), 400

    personalidade = _normalise_personality(getattr(user, 'personalidade', 'calm'))

    try:
        resposta = _chat_groq_direto(mensagem, user_id, personalidade)
        actions = _chat_actions(mensagem, user_id)
    except Exception as e:
        logger.error(f'Erro no chat API: {e}')
        return jsonify({'error': 'Erro ao processar a mensagem.'}), 500

    conversa = Conversa(user_id=user_id, pergunta=mensagem, resposta=resposta)
    db.session.add(conversa)
    db.session.commit()

    return jsonify({'resposta': resposta, 'id': conversa.id, 'actions': actions})


@api_bp.route('/chat/historico', methods=['GET'])
@jwt_required()
def chat_historico():
    user_id   = int(get_jwt_identity())
    limite    = min(int(request.args.get('limite', 20)), 50)
    conversas = (
        Conversa.query
        .filter_by(user_id=user_id)
        .order_by(Conversa.timestamp.desc())
        .limit(limite)
        .all()
    )
    return jsonify({'historico': [
        {
            'id':        c.id,
            'pergunta':  c.pergunta,
            'resposta':  c.resposta,
            'actions':   _chat_actions(c.pergunta, user_id),
            'timestamp': c.timestamp.isoformat() if c.timestamp else None,
        }
        for c in reversed(conversas)
    ]})


@api_bp.route('/chat/limpar', methods=['POST'])
@jwt_required()
def chat_limpar():
    user_id = int(get_jwt_identity())
    Conversa.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify({'success': True})

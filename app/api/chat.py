"""
app/api/chat.py — Chat API para mobile (JWT)

POST /api/v1/chat/mensagem   → envia mensagem, recebe resposta da IA
GET  /api/v1/chat/historico  → histórico das últimas N conversas
POST /api/v1/chat/limpar     → apaga histórico
"""

import os
import logging
import requests
from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Conversa, Fatura, User, Meta
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

    system_content = (
        f"{system_prompt}\n\n"
        f"DADOS REAIS DO UTILIZADOR:\n{faturas_ctx}"
        f"{metas_ctx}\n\n"
        "MEMÓRIA: Tens acesso ao histórico desta conversa. Usa-o para respostas coerentes. "
        "Não te apresentes novamente se já o fizeste."
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
    except Exception as e:
        logger.error(f'Erro no chat API: {e}')
        return jsonify({'error': 'Erro ao processar a mensagem.'}), 500

    conversa = Conversa(user_id=user_id, pergunta=mensagem, resposta=resposta)
    db.session.add(conversa)
    db.session.commit()

    return jsonify({'resposta': resposta, 'id': conversa.id})


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
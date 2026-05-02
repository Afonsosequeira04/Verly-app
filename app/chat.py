from flask import Blueprint, render_template, request, jsonify, Response, stream_with_context
from flask_login import login_required, current_user
from app import db
from app.models import Conversa, Fatura, User, Meta
from app.ai import SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT, _build_faturas_context
import os
import json
import requests

chat_bp = Blueprint('chat', __name__)

# ── #6 FIX: normalizar personalidades legacy antes de qualquer lookup ──────────
_PERSONALITY_ALIASES = {
    'strict':   'pro',
    'friendly': 'calm',
    'rebel':    'savage',
}
_VALID_PERSONALITIES = {'savage', 'sarcastic', 'calm', 'pro'}

def _normalise_personality(p):
    p = (p or 'calm').strip().lower()
    p = _PERSONALITY_ALIASES.get(p, p)
    return p if p in _VALID_PERSONALITIES else 'calm'


def get_personalidade():
    user = User.query.get(current_user.id)
    raw  = (user.personalidade or 'calm') if user else 'calm'
    return _normalise_personality(raw)


def get_historico_recente(user_id, limite=20):
    """
    Retorna o histórico real das últimas N conversas para injetar como contexto.
    As conversas são retornadas por ordem cronológica (mais antigas primeiro),
    para que o modelo entenda a sequência da conversa.
    """
    conversas = (
        Conversa.query
        .filter_by(user_id=user_id)
        .order_by(Conversa.timestamp.desc())
        .limit(limite)
        .all()
    )

    historico = []
    for c in reversed(conversas):  # inverter para ordem cronológica
        historico.append({"role": "user", "content": c.pergunta})
        historico.append({"role": "assistant", "content": c.resposta})
    return historico


def _build_metas_context(user_id):
    """Constrói contexto das metas do utilizador para injetar no prompt."""
    from datetime import datetime
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
        linhas.append(
            f"• {m.categoria}: {gasto:.2f}€ de {m.valor_limite:.2f}€ ({pct}%) — {estado}"
        )
    return "\n".join(linhas)


@chat_bp.route('/chat')
@login_required
def chat():
    conversas = Conversa.query.filter_by(user_id=current_user.id).order_by(Conversa.timestamp.asc()).all()

    num_faturas = Fatura.query.filter_by(user_id=current_user.id).count()
    num_metas = Meta.query.filter_by(user_id=current_user.id).count()

    if num_faturas == 0:
        sugestoes = [
            "Como funciona a Verly?",
            "Como faço upload de uma fatura?",
        ]
    else:
        sugestoes = [
            "Quanto gastei este mês?",
            "Qual a minha categoria mais cara?",
            "Tenho garantias a expirar?",
            "Estou a cumprir as minhas metas?",
        ] if num_metas > 0 else [
            "Quanto gastei este mês?",
            "Qual a minha categoria mais cara?",
            "Tenho garantias a expirar?",
        ]

    return render_template(
        'chat.html',
        conversas=conversas,
        sugestoes=sugestoes
    )


# 🔥 STREAMING REAL
@chat_bp.route('/chat/stream', methods=['POST'])
@login_required
def stream():
    user_msg = request.json.get('message', '').strip()

    if not user_msg:
        return jsonify({'response': 'Mensagem vazia.'})

    faturas = Fatura.query.filter_by(user_id=current_user.id).all()
    personalidade = get_personalidade()   # já normalizada

    # Memória real: histórico das últimas 20 trocas
    historico = get_historico_recente(current_user.id, limite=20)

    def generate():
        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            yield "data: ⚠️ Chave GROQ_API_KEY não configurada no servidor.\n\n"
            return

        system_prompt = SYSTEM_PROMPTS.get(personalidade, DEFAULT_SYSTEM_PROMPT)
        faturas_context = _build_faturas_context(faturas)
        metas_context = _build_metas_context(current_user.id)

        # System prompt enriquecido: inclui faturas + metas + instruções de memória
        system_content = (
            f"{system_prompt}\n\n"
            f"DADOS REAIS DO UTILIZADOR:\n{faturas_context}"
            f"{metas_context}\n\n"
            "MEMÓRIA: Tens acesso ao histórico desta conversa. Usa-o para dar respostas "
            "coerentes e contextualizar respostas com o que foi dito antes. "
            "Não te apresentes de novo se já te apresentaste antes."
        )

        messages = [
            {"role": "system", "content": system_content}
        ] + historico + [
            {"role": "user", "content": user_msg}
        ]

        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": messages,
            "temperature": 0.7,
            "stream": True,
            "max_tokens": 512,
        }

        full_response = ""

        try:
            with requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                stream=True,
                timeout=30,
            ) as resp:
                for line in resp.iter_lines():
                    if line:
                        line = line.decode("utf-8")
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                delta = data["choices"][0]["delta"].get("content", "")
                                if delta:
                                    full_response += delta
                                    yield f"data: {json.dumps({'delta': delta})}\n\n"
                            except (json.JSONDecodeError, KeyError):
                                continue

        except requests.exceptions.Timeout:
            yield "data: ⚠️ Tempo limite excedido. Tenta novamente.\n\n"
            return
        except Exception as e:
            yield f"data: ⚠️ Erro ao contactar a IA: {str(e)}\n\n"
            return

        # Guardar na BD
        if full_response:
            conversa = Conversa(
                user_id=current_user.id,
                pergunta=user_msg,
                resposta=full_response
            )
            db.session.add(conversa)
            db.session.commit()

        yield "data: [DONE]\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


@chat_bp.route('/chat/limpar', methods=['POST'])
@login_required
def limpar_chat():
    """Permite ao utilizador limpar o histórico do chat."""
    Conversa.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    return jsonify({'success': True})
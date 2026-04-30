from flask import Blueprint, render_template, request, jsonify, Response, stream_with_context
from flask_login import login_required, current_user
from app import db
from app.models import Conversa, Fatura, User
from app.ai import SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT, _build_faturas_context
import os
import json
import requests

chat_bp = Blueprint('chat', __name__)


def get_personalidade():
    user = User.query.get(current_user.id)
    return (user.personalidade or 'calm') if user else 'calm'


def get_historico_recente(user_id, limite=6):
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


@chat_bp.route('/chat')
@login_required
def chat():
    conversas = Conversa.query.filter_by(user_id=current_user.id).order_by(Conversa.timestamp.asc()).all()

    num_faturas = Fatura.query.filter_by(user_id=current_user.id).count()

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
    personalidade = get_personalidade()
    historico = get_historico_recente(current_user.id)

    def generate():
        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            yield "data: ⚠️ Chave GROQ_API_KEY não configurada no servidor.\n\n"
            return

        system_prompt = SYSTEM_PROMPTS.get(personalidade, DEFAULT_SYSTEM_PROMPT)
        faturas_context = _build_faturas_context(faturas)

        # O Groq usa o formato OpenAI — o "system" vai dentro de messages
        messages = [
            {"role": "system", "content": f"{system_prompt}\n\nDADOS REAIS:\n{faturas_context}"}
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
            ) as r:

                if r.status_code != 200:
                    error_body = r.text[:300]
                    yield f"data: ⚠️ Erro da API Groq ({r.status_code}): {error_body}\n\n"
                    return

                for line in r.iter_lines():
                    if not line:
                        continue

                    decoded = line.decode("utf-8")

                    if decoded.startswith("data: "):
                        data = decoded[6:]  # mais seguro que .replace("data: ", "")

                        if data == "[DONE]":
                            break

                        try:
                            json_data = json.loads(data)
                            delta = json_data["choices"][0]["delta"].get("content", "")

                            if delta:
                                full_response += delta
                                yield f"data: {delta}\n\n"

                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

        except requests.exceptions.Timeout:
            yield "data: ⚠️ O servidor demorou demasiado a responder. Tenta novamente.\n\n"
            return
        except requests.exceptions.ConnectionError:
            yield "data: ⚠️ Sem ligação ao servidor de IA. Verifica a tua internet.\n\n"
            return
        except Exception as e:
            yield f"data: ⚠️ Erro inesperado: {str(e)[:200]}\n\n"
            return

        # Só guarda se houve resposta real
        if full_response.strip():
            try:
                conversa = Conversa(
                    user_id=current_user.id,
                    pergunta=user_msg,
                    resposta=full_response
                )
                db.session.add(conversa)
                db.session.commit()
            except Exception:
                db.session.rollback()

    return Response(stream_with_context(generate()), mimetype='text/event-stream')


@chat_bp.route('/chat/clear', methods=['POST'])
@login_required
def clear_chat():
    Conversa.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    return jsonify({'success': True})
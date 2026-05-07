"""
app/email_routes.py — Rotas para gestão e teste de emails de alerta

Regista-se no __init__.py como blueprint normal.
Fornece:
  POST /alertas/teste     — envia email de teste ao utilizador autenticado
  POST /alertas/desactivar — desactiva emails (link do footer do email)
"""

import logging
from flask import Blueprint, jsonify, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app import db

logger = logging.getLogger(__name__)

email_bp = Blueprint("email", __name__)


@email_bp.route("/alertas/teste", methods=["POST"])
@login_required
def enviar_teste():
    """
    Envia um email de teste com as notificações actuais do utilizador.
    Chamado via AJAX do painel de configurações.
    """
    from app.notificacoes import gerar_notificacoes
    from app.email_service import enviar_email_alertas

    email_destino = (
        getattr(current_user, "email_notificacoes", None) or current_user.email
    ).strip()

    orcamento = getattr(current_user, "orcamento_mensal", 0) or 0
    notifs    = gerar_notificacoes(current_user.id, orcamento)

    # Para o teste, inclui também as de urgência "info"
    if not notifs:
        # Injecta uma notificação de exemplo para o utilizador ver o formato
        notifs = [{
            "tipo":     "info",
            "titulo":   "Email de alertas activo!",
            "mensagem": "Os teus alertas de garantias, orçamento e subscrições vão chegar aqui.",
            "icone":    "✅",
            "urgencia": "media",
            "link":     "/dashboard",
        }]

    sucesso = enviar_email_alertas(
        destinatario_email=email_destino,
        destinatario_nome=current_user.nome or "utilizador",
        notificacoes=notifs,
    )

    if sucesso:
        logger.info(f"Email de teste enviado — user_id={current_user.id} → {email_destino}")
        return jsonify({
            "success": True,
            "message": f"Email de teste enviado para {email_destino}!"
        })
    else:
        return jsonify({
            "success": False,
            "message": "Falha no envio. Verifica a variável RESEND_API_KEY no .env."
        }), 500


@email_bp.route("/alertas/desactivar", methods=["GET", "POST"])
@login_required
def desactivar_alertas():
    """
    Desactiva notificações por email — link no footer do email.
    Aceita GET (clique directo do email) e POST (formulário).
    """
    current_user.notificacoes_email = False
    db.session.commit()
    logger.info(f"Alertas desactivados — user_id={current_user.id}")

    if request.method == "GET":
        flash("Notificações por email desactivadas.", "info")
        return redirect(url_for("configuracoes.configuracoes"))

    return jsonify({"success": True, "message": "Notificações desactivadas."})
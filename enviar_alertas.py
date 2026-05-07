#!/usr/bin/env python3
"""
enviar_alertas.py — Script de cron para envio diário de emails de alerta

Uso:
    python enviar_alertas.py

Agendar (crontab):
    # Correr todos os dias às 9h da manhã
    0 9 * * * cd /caminho/para/verly && python enviar_alertas.py >> logs/alertas.log 2>&1

    # Ou com venv:
    0 9 * * * cd /caminho/para/verly && ./venv/bin/python enviar_alertas.py >> logs/alertas.log 2>&1

Variáveis de ambiente necessárias (no .env):
    RESEND_API_KEY   — chave da API do Resend
    EMAIL_FROM       — ex: "Verly <alertas@verly.app>"
    APP_URL          — ex: "https://verly.app"
    DATABASE_URL     — (opcional, usa SQLite por omissão)
    FLASK_ENV        — development | production
"""

import os
import sys
import logging
from datetime import datetime

# Garantir que o script encontra os módulos da app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────

os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("alertas")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    logger.info("=" * 60)
    logger.info(f"Verly Alertas — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)

    # Inicializar Flask app (necessário para SQLAlchemy)
    from app import create_app, db
    from app.models import User
    from app.notificacoes import gerar_notificacoes
    from app.email_service import enviar_email_alertas

    app = create_app()

    with app.app_context():
        # Buscar apenas utilizadores com notificações activadas
        utilizadores = User.query.filter_by(notificacoes_email=True).all()

        if not utilizadores:
            logger.info("Nenhum utilizador com notificações activadas.")
            return

        logger.info(f"{len(utilizadores)} utilizador(es) com alertas activos.")

        enviados  = 0
        saltados  = 0
        erros     = 0

        for user in utilizadores:
            try:
                # Email de destino: usa email_notificacoes se definido, senão o email da conta
                email_destino = (
                    getattr(user, "email_notificacoes", None) or user.email
                ).strip()

                if not email_destino:
                    logger.warning(f"user_id={user.id} sem email — a saltar.")
                    saltados += 1
                    continue

                orcamento = getattr(user, "orcamento_mensal", 0) or 0
                notifs    = gerar_notificacoes(user.id, orcamento)

                sucesso = enviar_email_alertas(
                    destinatario_email=email_destino,
                    destinatario_nome=user.nome or "utilizador",
                    notificacoes=notifs,
                )

                if sucesso:
                    enviados += 1
                    logger.info(f"✓ user_id={user.id} ({email_destino})")
                else:
                    erros += 1
                    logger.warning(f"✗ user_id={user.id} — falha no envio.")

            except Exception as exc:
                erros += 1
                logger.error(f"Erro inesperado para user_id={user.id}: {exc}", exc_info=True)

        # Resumo final
        logger.info("-" * 60)
        logger.info(
            f"Concluído — enviados: {enviados} | saltados: {saltados} | erros: {erros}"
        )


if __name__ == "__main__":
    main()
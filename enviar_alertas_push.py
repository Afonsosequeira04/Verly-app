#!/usr/bin/env python3
"""
enviar_alertas_push.py — Cron diário: envia push FCM reais a todos os utilizadores

Agendar (crontab):
    0 9 * * * cd /caminho/para/verly && python enviar_alertas_push.py

Requer:
    - firebase-service-account.json na raiz do projeto
    - Coluna fcm_token na tabela users (ver migration abaixo)
    - firebase-admin instalado: pip install firebase-admin

Migration (executar uma vez):
    ALTER TABLE users ADD COLUMN fcm_token VARCHAR(512);
    ALTER TABLE users ADD COLUMN fcm_token_updated TIMESTAMP;
    ALTER TABLE users ADD COLUMN push_ativas BOOLEAN DEFAULT TRUE;
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s — %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger('push_alertas')


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(str(date_str).strip(), fmt)
        except ValueError:
            continue
    return None


def gerar_alertas_push(user, faturas, orcamento, hoje):
    """
    Gera lista de pushes a enviar para um utilizador.
    Devolve lista de {'titulo': ..., 'corpo': ...}.
    """
    alertas = []
    mes_atual = hoje.month
    ano_atual = hoje.year

    # ── 1. Garantias a expirar em ≤7 dias ────────────────────────────────────
    for f in faturas:
        data_gar = _parse_date(f.data_garantia)
        if data_gar and data_gar >= hoje:
            dias = (data_gar - hoje).days
            if dias <= 7:
                loja = f.loja or f.nome_ficheiro or 'produto'
                alertas.append({
                    'titulo': f'🛡️ Garantia expira em {dias} dia{"s" if dias != 1 else ""}!',
                    'corpo': f'A garantia de {loja} termina em {data_gar.strftime("%d/%m/%Y")}. Guarda bem o teu comprovativo.',
                    'tipo': 'garantia',
                })

    # ── 2. Devoluções a expirar em ≤3 dias ───────────────────────────────────
    for f in faturas:
        data_dev = _parse_date(f.data_devolucao)
        if data_dev and data_dev >= hoje:
            dias = (data_dev - hoje).days
            if dias <= 3:
                loja = f.loja or f.nome_ficheiro or 'produto'
                alertas.append({
                    'titulo': f'↩️ Prazo de devolução termina em {dias} dia{"s" if dias != 1 else ""}!',
                    'corpo': f'{loja}: tens até {data_dev.strftime("%d/%m")} para devolver.',
                    'tipo': 'devolucao',
                })

    # ── 3. Orçamento a 80%+ ───────────────────────────────────────────────────
    if orcamento > 0:
        total_mes = sum(
            f.total or 0 for f in faturas
            if _parse_date(f.data_compra) and
               _parse_date(f.data_compra).month == mes_atual and
               _parse_date(f.data_compra).year == ano_atual
        )
        pct = (total_mes / orcamento) * 100 if orcamento > 0 else 0
        if pct >= 100:
            alertas.append({
                'titulo': '🚨 Orçamento ultrapassado!',
                'corpo': f'Gastaste {total_mes:.0f}€ de {orcamento:.0f}€ este mês ({pct:.0f}%). Hora de travar.',
                'tipo': 'orcamento',
            })
        elif pct >= 80:
            restante = orcamento - total_mes
            alertas.append({
                'titulo': f'⚠️ Já usaste {pct:.0f}% do orçamento',
                'corpo': f'Restam {restante:.0f}€ do teu orçamento mensal de {orcamento:.0f}€. Atenção aos próximos gastos.',
                'tipo': 'orcamento',
            })

    return alertas


def main():
    logger.info('=' * 60)
    logger.info(f'Verly Push Alertas — {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    logger.info('=' * 60)

    # Inicializar Firebase
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
        if not firebase_admin._apps:
            cred = credentials.Certificate('firebase-service-account.json')
            firebase_admin.initialize_app(cred)
        logger.info('Firebase Admin SDK inicializado.')
    except Exception as e:
        logger.error(f'Erro Firebase: {e}')
        logger.warning('Push não será enviada — continua com email.')

    from app import create_app, db
    from app.models import User, Fatura

    app = create_app()
    hoje = datetime.utcnow()

    with app.app_context():
        # Utilizadores com push ativas e FCM token
        try:
            utilizadores = User.query.filter(
                User.fcm_token.isnot(None),
                User.fcm_token != '',
            ).all()
        except Exception:
            # Coluna fcm_token pode ainda não existir
            logger.warning('Coluna fcm_token não encontrada. Executa a migration primeiro.')
            utilizadores = []

        logger.info(f'{len(utilizadores)} utilizador(es) com FCM token.')

        enviados = 0
        erros = 0

        for user in utilizadores:
            try:
                faturas = Fatura.query.filter_by(user_id=user.id).all()
                orcamento = getattr(user, 'orcamento_mensal', 0) or 0
                alertas = gerar_alertas_push(user, faturas, orcamento, hoje)

                if not alertas:
                    continue

                # Envia apenas o alerta mais urgente (para não spammar)
                alerta = alertas[0]
                nome = (user.nome or '').split()[0] or 'utilizador'

                try:
                    from firebase_admin import messaging
                    msg = messaging.Message(
                        notification=messaging.Notification(
                            title=alerta['titulo'],
                            body=alerta['corpo'],
                        ),
                        data={
                            'tipo': alerta.get('tipo', 'alerta'),
                            'user_id': str(user.id),
                        },
                        token=user.fcm_token,
                        android=messaging.AndroidConfig(
                            priority='high',
                            notification=messaging.AndroidNotification(
                                icon='ic_notification',
                                color='#7C6FE0',
                                channel_id='verly_alertas',
                            ),
                        ),
                        apns=messaging.APNSConfig(
                            payload=messaging.APNSPayload(
                                aps=messaging.Aps(badge=len(alertas), sound='default'),
                            ),
                        ),
                    )
                    response = messaging.send(msg)
                    logger.info(f'Push enviada para user {user.id}: {response}')
                    enviados += 1

                except Exception as e:
                    logger.error(f'Erro ao enviar push para user {user.id}: {e}')
                    erros += 1

            except Exception as e:
                logger.error(f'Erro ao processar user {user.id}: {e}')
                erros += 1

        logger.info(f'Concluído — Enviadas: {enviados} | Erros: {erros}')


if __name__ == '__main__':
    main()
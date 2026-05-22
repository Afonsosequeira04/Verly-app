"""
app/tasks/emails.py — Task Celery: envia emails via Resend em background.
"""

import logging
from run import celery

logger = logging.getLogger(__name__)


@celery.task(
    bind=True,
    name='tasks.enviar_email',
    queue='emails',
    max_retries=3,
    default_retry_delay=120,
)
def enviar_email_task(self, destinatario: str, assunto: str, html: str, texto: str = ''):
    """
    Uso:
        from app.tasks.emails import enviar_email_task
        enviar_email_task.delay('user@exemplo.com', 'Assunto', '<p>HTML</p>')
    """
    try:
        import os
        import resend

        resend.api_key = os.getenv('RESEND_API_KEY', '')
        if not resend.api_key:
            logger.warning('RESEND_API_KEY não definida — email não enviado.')
            return {'status': 'skipped', 'reason': 'no_api_key'}

        from_email = os.getenv('EMAIL_FROM', 'Verly <alertas@verly.app>')
        params = {'from': from_email, 'to': [destinatario], 'subject': assunto, 'html': html}
        if texto:
            params['text'] = texto

        resend.Emails.send(params)
        logger.info(f'Email enviado para {destinatario}: {assunto}')
        return {'status': 'sent', 'to': destinatario}

    except Exception as exc:
        logger.exception(f'Falha ao enviar email para {destinatario}: {exc}')
        raise self.retry(exc=exc)
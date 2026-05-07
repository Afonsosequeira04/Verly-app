"""
email_service.py — Serviço de envio de emails via Resend

Responsabilidades:
  - Enviar emails de alerta usando a API do Resend
  - Construir o template HTML das notificações
  - Não depende de Flask context (pode correr em cron)

Variáveis de ambiente necessárias:
  RESEND_API_KEY   — chave da API do Resend (https://resend.com)
  EMAIL_FROM       — endereço remetente (ex: verly@tuaapp.com)
  APP_URL          — URL base da app (ex: https://verly.app)
"""

import os
import logging
import resend
from datetime import datetime

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
EMAIL_FROM     = os.getenv("EMAIL_FROM", "Verly <alertas@verly.app>")
APP_URL        = os.getenv("APP_URL", "https://verly.app")


# ── Cores por urgência ────────────────────────────────────────────────────────

URGENCIA_ESTILOS = {
    "alta":  {"cor": "#E24B4A", "fundo": "#FCEBEB", "label": "URGENTE"},
    "media": {"cor": "#BA7517", "fundo": "#FAEEDA", "label": "ATENÇÃO"},
    "info":  {"cor": "#185FA5", "fundo": "#E6F1FB", "label": "INFO"},
}

ICONE_FALLBACK = {
    "garantia":  "🛡️",
    "devolucao": "↩️",
    "orcamento": "💰",
    "meta":      "📊",
    "subscricao":"💸",
}


# ── Template HTML ─────────────────────────────────────────────────────────────

def _render_notif_card(notif: dict) -> str:
    urgencia = notif.get("urgencia", "info")
    estilo   = URGENCIA_ESTILOS.get(urgencia, URGENCIA_ESTILOS["info"])
    icone    = notif.get("icone") or ICONE_FALLBACK.get(notif.get("tipo", ""), "🔔")
    link     = notif.get("link", "")
    url      = f"{APP_URL}{link}" if link else APP_URL

    return f"""
    <tr>
      <td style="padding: 0 0 12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:{estilo['fundo']};border-radius:10px;
                      border-left:4px solid {estilo['cor']};">
          <tr>
            <td style="padding:16px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:36px;vertical-align:top;font-size:22px;
                             line-height:1;padding-right:12px;">{icone}</td>
                  <td style="vertical-align:top;">
                    <div style="display:inline-block;background:{estilo['cor']};
                                color:#fff;font-size:10px;font-weight:700;
                                letter-spacing:.05em;border-radius:4px;
                                padding:2px 7px;margin-bottom:6px;">
                      {estilo['label']}
                    </div>
                    <p style="margin:0 0 4px;font-size:15px;font-weight:600;
                               color:#1a1a1a;line-height:1.3;">
                      {notif.get('titulo', '')}
                    </p>
                    <p style="margin:0 0 10px;font-size:14px;color:#555;
                               line-height:1.5;">
                      {notif.get('mensagem', '')}
                    </p>
                    <a href="{url}"
                       style="font-size:13px;color:{estilo['cor']};
                              font-weight:600;text-decoration:none;">
                      Ver detalhes →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""


def _build_html(nome: str, notificacoes: list, data_str: str) -> str:
    urgentes = [n for n in notificacoes if n.get("urgencia") == "alta"]
    resumo   = (f"<strong>{len(urgentes)} alerta(s) urgente(s)</strong> e "
                f"{len(notificacoes) - len(urgentes)} aviso(s) este mês."
                if urgentes else
                f"{len(notificacoes)} aviso(s) para o teu dia.")

    cards_html = "".join(_render_notif_card(n) for n in notificacoes)

    return f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Os teus alertas Verly</title>
</head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:
             -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">

      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background:#fff;
                    border-radius:16px;overflow:hidden;
                    box-shadow:0 2px 12px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1a1a2e;padding:32px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:22px;font-weight:700;
                             color:#fff;letter-spacing:-.3px;">
                    💰 Verly
                  </p>
                  <p style="margin:6px 0 0;font-size:13px;color:#9999bb;">
                    Os teus alertas de {data_str}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:28px 36px 20px;">
            <p style="margin:0 0 6px;font-size:16px;color:#1a1a1a;">
              Olá, <strong>{nome}</strong> 👋
            </p>
            <p style="margin:0;font-size:14px;color:#666;line-height:1.6;">
              {resumo}
            </p>
          </td>
        </tr>

        <!-- Notificações -->
        <tr>
          <td style="padding:0 36px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              {cards_html}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 36px 36px;" align="center">
            <a href="{APP_URL}/dashboard"
               style="display:inline-block;background:#534AB7;color:#fff;
                      font-size:15px;font-weight:600;text-decoration:none;
                      border-radius:10px;padding:14px 36px;
                      letter-spacing:-.1px;">
              Abrir o dashboard →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f8f4;padding:20px 36px;
                     border-top:1px solid #ebebeb;">
            <p style="margin:0;font-size:12px;color:#999;text-align:center;
                       line-height:1.6;">
              Recebeste este email porque activaste os alertas nas
              <a href="{APP_URL}/configuracoes"
                 style="color:#534AB7;text-decoration:none;">configurações</a>.
              <br>
              <a href="{APP_URL}/configuracoes"
                 style="color:#999;text-decoration:none;">Desactivar notificações</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _build_plain(nome: str, notificacoes: list) -> str:
    linhas = [f"Olá {nome},\n", "Os teus alertas Verly:\n"]
    for n in notificacoes:
        urgencia = n.get("urgencia", "info").upper()
        linhas.append(f"[{urgencia}] {n.get('titulo', '')}")
        linhas.append(f"  {n.get('mensagem', '')}")
        if n.get("link"):
            linhas.append(f"  → {APP_URL}{n['link']}\n")
    linhas.append(f"\nAbre o dashboard: {APP_URL}/dashboard")
    linhas.append(f"\nPara desactivar alertas: {APP_URL}/configuracoes")
    return "\n".join(linhas)


# ── Envio via pacote oficial Resend ───────────────────────────────────────────

def enviar_email_alertas(
    destinatario_email: str,
    destinatario_nome: str,
    notificacoes: list,
) -> bool:
    """
    Envia email de alertas para um utilizador via Resend.

    Returns:
        True se enviado com sucesso, False caso contrário.
    """
    if not RESEND_API_KEY:
        logger.error("RESEND_API_KEY não definida — email não enviado.")
        return False

    if not notificacoes:
        logger.debug(f"Sem notificações para {destinatario_email} — a saltar.")
        return True

    # Filtrar só urgentes + media (não enviar emails só com "info")
    para_enviar = [n for n in notificacoes if n.get("urgencia") in ("alta", "media")]
    if not para_enviar:
        logger.debug(f"Só notificações 'info' para {destinatario_email} — a saltar.")
        return True

    data_str = datetime.now().strftime("%d de %B de %Y").replace(
        "January", "janeiro").replace("February", "fevereiro").replace(
        "March", "março").replace("April", "abril").replace(
        "May", "maio").replace("June", "junho").replace(
        "July", "julho").replace("August", "agosto").replace(
        "September", "setembro").replace("October", "outubro").replace(
        "November", "novembro").replace("December", "dezembro")

    urgentes = sum(1 for n in para_enviar if n.get("urgencia") == "alta")
    subject  = (f"🔴 {urgentes} alerta(s) urgente(s) — Verly"
                if urgentes else
                f"⚠️ {len(para_enviar)} aviso(s) das tuas finanças — Verly")

    try:
        resend.api_key = RESEND_API_KEY

        params: resend.Emails.SendParams = {
            "from":    EMAIL_FROM,
            "to":      [destinatario_email],
            "subject": subject,
            "html":    _build_html(destinatario_nome, para_enviar, data_str),
            "text":    _build_plain(destinatario_nome, para_enviar),
        }

        email = resend.Emails.send(params)
        logger.info(f"Email enviado para {destinatario_email} — id={email.get('id')}")
        return True

    except Exception as e:
        logger.error(f"Erro ao enviar email para {destinatario_email}: {e}")
        print(f"RESEND EXCEPTION: {e}")
        return False
"""
app/api/gmail.py — Integração Gmail para importação automática de faturas

FLUXO OAUTH:
  GET  /api/v1/gmail/auth-url        → devolve URL de autorização Google
  POST /api/v1/gmail/callback        → troca código por tokens, guarda na DB
  GET  /api/v1/gmail/status          → estado da ligação Gmail do utilizador
  DELETE /api/v1/gmail/disconnect    → remove ligação

SINCRONIZAÇÃO:
  POST /api/v1/gmail/sync            → sincroniza emails de compra (manual)
  GET  /api/v1/gmail/sync/status     → estado da última sincronização

COMO ADICIONAR AO PROJETO:
  1. pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
  2. Adicionar ao .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL
  3. Em app/api/__init__.py adicionar: from app.api import gmail  # noqa
  4. Em app/models.py adicionar o modelo GmailConnection (ver models_addition.py)
  5. No Google Cloud Console:
     - Criar projeto → ativar Gmail API
     - OAuth 2.0 → Authorized redirect URIs: {APP_URL}/api/v1/gmail/callback-web
     - Scopes necessários: gmail.readonly, gmail.labels
"""

import os
import json
import logging
import base64
import re
from datetime import datetime, timedelta
from flask import request, jsonify, redirect
from flask_jwt_extended import jwt_required, get_jwt_identity, decode_token
from app.api import api_bp
from app import db

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID     = os.getenv('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
APP_URL              = os.getenv('APP_URL', 'https://verly.app')

GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
]

# Remetentes conhecidos de confirmações de compra em Portugal e internacionais
PURCHASE_SENDERS = {
    # Moda PT
    'zara.com', 'hm.com', 'pullandbear.com', 'bershka.com', 'massimodutti.com',
    'stradivarius.com', 'noreply@mango.com', 'parfois.com',
    # Electrónica PT
    'worten.pt', 'fnac.pt', 'mediamarkt.pt', 'radio-popular.pt',
    # Supermercados PT
    'continente.pt', 'pingo-doce.pt', 'minipreço.pt', 'lidl.pt', 'aldi.pt',
    # Saúde & Beleza PT
    'sephora.pt', 'notino.pt', 'pharmacia.pt',
    # Marketplace PT
    'olx.pt', 'custo-justo.pt',
    # Internacional comum
    'amazon.com', 'amazon.co.uk', 'amazon.es', 'ebay.com',
    'aliexpress.com', 'shein.com', 'temu.com', 'zalando.pt',
    # Food delivery
    'ubereats.com', 'glovo.com', 'bolt.eu',
    # Transporte
    'uber.com', 'freenow.com', 'bolt.eu', 'cp.pt', 'flixbus.pt',
    # Streaming / Digital
    'netflix.com', 'spotify.com', 'apple.com', 'google.com',
    'microsoft.com', 'adobe.com', 'dropbox.com',
    # Viagens
    'booking.com', 'airbnb.com', 'ryanair.com', 'tap.pt', 'easyjet.com',
}

# Keywords no subject que indicam email de compra
PURCHASE_SUBJECT_KEYWORDS = [
    'confirmação', 'confirmacao', 'confirmação de', 'pedido confirmado',
    'order confirmed', 'order confirmation', 'your order', 'receipt',
    'recibo', 'fatura', 'factura', 'invoice', 'compra realizada',
    'purchase confirmation', 'payment confirmation', 'pagamento confirmado',
    'encomenda', 'detalhe do pedido', 'order details', 'your receipt',
    'obrigado pela sua compra', 'thank you for your purchase',
    'resumo do pedido', 'detalhes da compra',
]


# ── Helpers OAuth ─────────────────────────────────────────────────────────────

def _build_oauth_flow(state=None):
    """Constrói o objeto OAuth2 flow do Google sem PKCE (server-side flow)."""
    from google_auth_oauthlib.flow import Flow

    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [f"{APP_URL}/api/v1/gmail/callback-web"],
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=GMAIL_SCOPES,
        state=state,
    )
    flow.redirect_uri = f"{APP_URL}/api/v1/gmail/callback-web"
    return flow


def _get_gmail_service(credentials_json: str):
    """Cria cliente Gmail API a partir das credentials guardadas."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds_data = json.loads(credentials_json)
    creds = Credentials(
        token=creds_data.get('token'),
        refresh_token=creds_data.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GMAIL_SCOPES,
    )
    return build('gmail', 'v1', credentials=creds)


def _refresh_credentials_if_needed(gmail_conn) -> bool:
    """Renova o access token se expirado. Devolve True se ok."""
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request

        creds_data = json.loads(gmail_conn.credentials_json)
        creds = Credentials(
            token=creds_data.get('token'),
            refresh_token=creds_data.get('refresh_token'),
            token_uri='https://oauth2.googleapis.com/token',
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            scopes=GMAIL_SCOPES,
        )

        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            creds_data['token'] = creds.token
            gmail_conn.credentials_json = json.dumps(creds_data)
            db.session.commit()

        return True
    except Exception as e:
        logger.error(f'Erro ao renovar credentials Gmail: {e}')
        return False


# ── Endpoints OAuth ───────────────────────────────────────────────────────────

@api_bp.route('/gmail/auth-url', methods=['GET'])
@jwt_required()
def gmail_auth_url():
    """
    Devolve a URL de autorização Google para o utilizador abrir no browser.
    URL construído manualmente para garantir que NÃO inclui PKCE (code_challenge).
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return jsonify({'error': 'Gmail não configurado no servidor.'}), 503

    user_id = get_jwt_identity()
    state = base64.urlsafe_b64encode(str(user_id).encode()).decode()

    try:
        import urllib.parse
        params = {
            'client_id':     GOOGLE_CLIENT_ID,
            'redirect_uri':  f"{APP_URL}/api/v1/gmail/callback-web",
            'response_type': 'code',
            'scope':         ' '.join(GMAIL_SCOPES),
            'access_type':   'offline',
            'prompt':        'consent',
            'state':         state,
            # Sem code_challenge nem code_challenge_method → sem PKCE
        }
        auth_url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode(params)
        return jsonify({'auth_url': auth_url, 'state': state})
    except Exception as e:
        logger.error(f'Erro ao gerar auth URL Gmail: {e}')
        return jsonify({'error': 'Erro ao gerar URL de autorização.'}), 500


@api_bp.route('/gmail/callback-web', methods=['GET'])
def gmail_callback_web():
    """
    Callback OAuth do Google — chamado pelo browser depois do utilizador autorizar.
    Troca o código por tokens e guarda na DB.
    Redireciona para deep link da app.
    """
    code  = request.args.get('code', '')
    state = request.args.get('state', '')
    error = request.args.get('error', '')

    if error:
        deep_link = f"verly://gmail/callback?error={error}"
        return redirect(deep_link)

    if not code or not state:
        return '<h2>Parâmetros inválidos.</h2>', 400

    # Recuperar user_id do state
    try:
        user_id = int(base64.urlsafe_b64decode(state.encode()).decode())
    except Exception:
        return '<h2>State inválido.</h2>', 400

    try:
        # IMPORTANTE: criar flow sem state para evitar validação PKCE no fetch_token
        flow = _build_oauth_flow()
        # Trocar o código por tokens manualmente para evitar PKCE
        import requests as req_lib
        token_response = req_lib.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'redirect_uri': f"{APP_URL}/api/v1/gmail/callback-web",
                'grant_type': 'authorization_code',
            }
        )
        token_data = token_response.json()

        if 'error' in token_data:
            logger.error(f'Erro ao trocar código Gmail: {token_data}')
            deep_link = "verly://gmail/callback?error=token_exchange_failed"
            return redirect(deep_link)

        access_token  = token_data.get('access_token')
        refresh_token = token_data.get('refresh_token')

        creds_json = json.dumps({
            'token':         access_token,
            'refresh_token': refresh_token,
            'scopes':        GMAIL_SCOPES,
        })

        # Obter email Gmail do utilizador
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri='https://oauth2.googleapis.com/token',
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            scopes=GMAIL_SCOPES,
        )
        service = build('gmail', 'v1', credentials=creds)
        profile = service.users().getProfile(userId='me').execute()
        gmail_email = profile.get('emailAddress', '')

        # Guardar ou atualizar na DB
        from app.models import GmailConnection
        conn = GmailConnection.query.filter_by(user_id=user_id).first()
        if conn:
            conn.credentials_json = creds_json
            conn.gmail_email      = gmail_email
            conn.ativa            = True
            conn.atualizado_em    = datetime.utcnow()
        else:
            conn = GmailConnection(
                user_id=user_id,
                gmail_email=gmail_email,
                credentials_json=creds_json,
                ativa=True,
            )
            db.session.add(conn)
        db.session.commit()

        deep_link = f"verly://gmail/callback?success=true&email={gmail_email}"
        return f"""
        <html>
        <head><meta http-equiv="refresh" content="2;url={deep_link}"></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px;background:#080810;color:#EEEEF8;">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <h2 style="color:#7C6FE0;">Gmail ligado!</h2>
          <p style="color:#8888B0;">A importar os teus emails de compra...</p>
          <p style="color:#8888B0;font-size:13px;">A redirecionar para a Verly...</p>
          <a href="{deep_link}" style="color:#7C6FE0;">Voltar à Verly</a>
        </body>
        </html>
        """

    except Exception as e:
        logger.error(f'Erro no callback Gmail: {e}')
        deep_link = "verly://gmail/callback?error=server_error"
        return redirect(deep_link)


@api_bp.route('/gmail/status', methods=['GET'])
@jwt_required()
def gmail_status():
    """Estado da ligação Gmail do utilizador autenticado."""
    from app.models import GmailConnection
    user_id = int(get_jwt_identity())
    conn = GmailConnection.query.filter_by(user_id=user_id).first()

    if not conn or not conn.ativa:
        return jsonify({'ligado': False})

    return jsonify({
        'ligado':          True,
        'gmail_email':     conn.gmail_email,
        'ultima_sync':     conn.ultima_sync.isoformat() if conn.ultima_sync else None,
        'faturas_importadas': conn.faturas_importadas or 0,
    })


@api_bp.route('/gmail/disconnect', methods=['DELETE'])
@jwt_required()
def gmail_disconnect():
    """Remove a ligação Gmail."""
    from app.models import GmailConnection
    user_id = int(get_jwt_identity())
    conn = GmailConnection.query.filter_by(user_id=user_id).first()
    if conn:
        conn.ativa = False
        db.session.commit()
    return jsonify({'success': True})


# ── Sincronização de Emails ───────────────────────────────────────────────────

def _is_purchase_email(headers: dict, snippet: str) -> bool:
    """Heurística para identificar emails de confirmação de compra."""
    from_header = headers.get('From', '').lower()
    subject     = headers.get('Subject', '').lower()

    # Verificar remetente conhecido
    for sender_domain in PURCHASE_SENDERS:
        if sender_domain in from_header:
            return True

    # Verificar keywords no subject
    for keyword in PURCHASE_SUBJECT_KEYWORDS:
        if keyword in subject:
            return True

    # Verificar snippet do email
    snippet_lower = snippet.lower()
    for keyword in ['total', 'subtotal', 'pagamento', 'payment', 'order', 'pedido']:
        if keyword in snippet_lower:
            return True

    return False


def _extract_email_body(payload: dict) -> str:
    """Extrai o corpo do email (texto ou HTML) de forma recursiva."""
    body = ''

    if payload.get('body', {}).get('data'):
        raw = payload['body']['data']
        body = base64.urlsafe_b64decode(raw + '==').decode('utf-8', errors='ignore')
        return body

    for part in payload.get('parts', []):
        mime_type = part.get('mimeType', '')
        if mime_type == 'text/plain':
            data = part.get('body', {}).get('data', '')
            if data:
                body = base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='ignore')
                return body
        elif mime_type == 'text/html':
            data = part.get('body', {}).get('data', '')
            if data:
                body = base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='ignore')
        elif 'multipart' in mime_type:
            sub_body = _extract_email_body(part)
            if sub_body:
                body = sub_body

    return body


def _parse_purchase_info(subject: str, from_header: str, body: str, snippet: str) -> dict:
    """
    Tenta extrair loja, total e data a partir do email.
    Devolve dicionário com os campos encontrados.
    """
    info = {
        'loja':        '',
        'total':       None,
        'data_compra': None,
        'categoria':   'outros',
    }

    # Extrair loja do remetente
    from_match = re.search(r'@([\w.-]+)', from_header)
    if from_match:
        domain = from_match.group(1).lower()
        # Limpar subdomínios (mail.amazon.com → amazon)
        parts = domain.split('.')
        if len(parts) >= 2:
            info['loja'] = parts[-2].capitalize()

    # Extrair total (€ XX.XX ou XX,XX €)
    total_patterns = [
        r'total[:\s]*€?\s*([\d]+[.,][\d]{2})',
        r'([\d]+[.,][\d]{2})\s*€',
        r'€\s*([\d]+[.,][\d]{2})',
        r'EUR\s*([\d]+[.,][\d]{2})',
        r'total[:\s]*([\d]+[.,][\d]{2})',
    ]
    text_to_search = f"{subject} {snippet} {body[:2000]}"
    for pattern in total_patterns:
        match = re.search(pattern, text_to_search, re.IGNORECASE)
        if match:
            try:
                total_str = match.group(1).replace(',', '.')
                info['total'] = float(total_str)
                break
            except ValueError:
                continue

    # Inferir categoria pela loja
    loja_lower = info['loja'].lower()
    categoria_map = {
        'alimentação':  ['continente', 'pingodoce', 'lidl', 'aldi', 'glovo', 'ubereats', 'bolt'],
        'vestuário':    ['zara', 'hm', 'mango', 'bershka', 'stradivarius', 'shein', 'zalando'],
        'electrónica':  ['fnac', 'worten', 'mediamarkt', 'amazon', 'apple'],
        'transporte':   ['uber', 'freenow', 'cp', 'ryanair', 'tap', 'easyjet', 'flixbus'],
        'lazer':        ['netflix', 'spotify', 'steam', 'adobe'],
        'saúde':        ['sephora', 'notino', 'pharmacia'],
    }
    for categoria, lojas in categoria_map.items():
        if any(l in loja_lower for l in lojas):
            info['categoria'] = categoria
            break

    return info



def _parse_with_groq(subject: str, from_header: str, body: str, snippet: str) -> dict:
    """Usa Groq para extrair informação de compra do email com IA."""
    try:
        from groq import Groq as GroqClient
        client = GroqClient(api_key=os.getenv('GROQ_API_KEY', ''))

        body_truncated = body[:3000] if body else snippet[:500]

        prompt = f"""Analisa este email de confirmação de compra e extrai as informações.

REMETENTE: {from_header}
ASSUNTO: {subject}
CORPO:
{body_truncated}

Responde APENAS com JSON valido, sem mais texto:
{{
  "loja": "nome da loja/empresa",
  "total": 12.99,
  "itens": ["item 1", "item 2"],
  "categoria": "alimentacao|vestuario|electronica|transporte|lazer|saude|outros",
  "e_compra": true,
  "confianca": 0.9
}}

Regras:
- "total" deve ser um numero (ex: 12.99). Se nao encontrares nenhum valor real, usa null.
- "itens" lista os produtos/servicos. Se for subscricao coloca o nome do plano.
- "e_compra" e false se nao for confirmacao de compra real (newsletters, promocoes sem compra).
- Se o total for 0 ou nao houver valor real, total deve ser null."""

        response = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=400,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()
        raw = re.sub(r'```json|```', '', raw).strip()
        data = json.loads(raw)

        return {
            'loja':      data.get('loja', ''),
            'total':     data.get('total'),
            'itens':     data.get('itens', []),
            'categoria': data.get('categoria', 'outros'),
            'e_compra':  data.get('e_compra', True),
            'confianca': data.get('confianca', 0.5),
        }
    except Exception as e:
        logger.warning(f'Groq parsing falhou, fallback para regex: {e}')
        info = _parse_purchase_info(subject, from_header, body, snippet)
        return {**info, 'itens': [], 'e_compra': True, 'confianca': 0.3}


@api_bp.route('/gmail/sync', methods=['POST'])
@jwt_required()
def gmail_sync():
    """
    Sincroniza emails de compra do Gmail e cria faturas automaticamente.
    Processa os ultimos 30 dias ou desde a ultima sync.
    Usa Groq para extrair loja, total, itens e categoria.
    Ignora emails sem valor real (0 euros ou sem total).
    """
    from app.models import GmailConnection, Fatura

    user_id = int(get_jwt_identity())
    conn = GmailConnection.query.filter_by(user_id=user_id, ativa=True).first()

    if not conn:
        return jsonify({'error': 'Gmail nao ligado.'}), 400

    if not _refresh_credentials_if_needed(conn):
        return jsonify({'error': 'Erro ao autenticar com Gmail. Volta a ligar a conta.'}), 401

    try:
        service = _get_gmail_service(conn.credentials_json)

        if conn.ultima_sync:
            after_date = conn.ultima_sync - timedelta(days=1)
        else:
            after_date = datetime.utcnow() - timedelta(days=30)

        after_timestamp = int(after_date.timestamp())
        query = f'after:{after_timestamp}'

        results = service.users().messages().list(
            userId='me',
            q=query,
            maxResults=100,
        ).execute()

        messages = results.get('messages', [])
        faturas_criadas = 0
        novas_faturas = []
        emails_processados = 0

        for msg_ref in messages:
            msg_id = msg_ref['id']

            existing = Fatura.query.filter_by(
                user_id=user_id,
                gmail_message_id=msg_id,
            ).first()
            if existing:
                continue

            msg = service.users().messages().get(
                userId='me',
                id=msg_id,
                format='full',
            ).execute()

            headers = {}
            for h in msg.get('payload', {}).get('headers', []):
                headers[h['name']] = h['value']

            snippet = msg.get('snippet', '')

            if not _is_purchase_email(headers, snippet):
                continue

            emails_processados += 1

            body = _extract_email_body(msg.get('payload', {}))
            subject = headers.get('Subject', '')
            from_header = headers.get('From', '')

            # Usar Groq para extrair informacao com IA
            purchase_info = _parse_with_groq(subject, from_header, body, snippet)

            # Ignorar se nao for compra real ou sem valor
            if not purchase_info.get('e_compra', True):
                continue
            if not purchase_info.get('total') or purchase_info['total'] <= 0:
                continue
            if purchase_info.get('confianca', 0) < 0.4:
                continue

            date_header = headers.get('Date', '')
            try:
                from email.utils import parsedate_to_datetime
                data_compra = parsedate_to_datetime(date_header).replace(tzinfo=None)
            except Exception:
                data_compra = datetime.utcnow()

            itens = purchase_info.get('itens', [])
            notas_parts = ['Importado automaticamente do Gmail']
            if itens:
                notas_parts.append('Itens: ' + ', '.join(itens[:10]))
            notas_parts.append(f'Assunto: {subject}')
            notas = '\n'.join(notas_parts)

            items_json = json.dumps(
                [{'nome': item, 'preco': None} for item in itens],
                ensure_ascii=False
            ) if itens else None

            fatura = Fatura(
                user_id=user_id,
                nome_ficheiro=f"Gmail: {subject[:80]}",
                loja=purchase_info['loja'] or 'Desconhecido',
                data_compra=data_compra,
                total=purchase_info['total'],
                items=items_json,
                categoria=purchase_info['categoria'],
                notas=notas,
                gmail_message_id=msg_id,
                fonte='gmail',
            )
            db.session.add(fatura)
            novas_faturas.append(fatura)
            faturas_criadas += 1

        conn.ultima_sync = datetime.utcnow()
        conn.faturas_importadas = (conn.faturas_importadas or 0) + faturas_criadas
        db.session.commit()
        if novas_faturas:
            try:
                from app.tasks.qdrant_task import indexar_fatura_task
                for fatura in novas_faturas:
                    if fatura.id:
                        indexar_fatura_task.delay(fatura.id)
            except Exception:
                logger.warning('Qdrant Gmail invoice indexing dispatch failed', exc_info=True)

        # ── Auto-deteção de subscrições após sync ─────────────────────────────
        try:
            from app.api.subscricoes import _detetar_e_guardar
            subs_novas = _detetar_e_guardar(user_id)
        except Exception as sub_err:
            logger.warning(f'Auto-deteção subscrições falhou: {sub_err}')
            subs_novas = 0

        return jsonify({
            'success': True,
            'emails_analisados': len(messages),
            'emails_compra':     emails_processados,
            'faturas_criadas':   faturas_criadas,
            'ultima_sync':       conn.ultima_sync.isoformat(),
            'subscricoes_detetadas': subs_novas,
        })

    except Exception as e:
        logger.error(f'Erro na sync Gmail: {e}')
        db.session.rollback()
        return jsonify({'error': f'Erro na sincronizacao: {str(e)}'}), 500

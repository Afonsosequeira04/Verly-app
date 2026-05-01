import os
import time
import uuid
import requests
import jwt as pyjwt
from datetime import datetime
from flask import Blueprint, render_template, redirect, request, jsonify, session, url_for, flash
from flask_login import login_required, current_user
from app import db
from app.models import Fatura, ContaBancaria

banco_bp = Blueprint('banco', __name__)

ENABLE_BANKING_BASE = "https://api.enablebanking.com"
APP_ID = "65c7b8db-de8c-478d-ad1a-198503a15cd8"


def _get_private_key():
    """Lê a chave privada RSA do ficheiro .pem."""
    pem_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        f"{APP_ID}.pem"
    )
    pem_path = os.getenv('ENABLE_BANKING_KEY_PATH', pem_path)

    if not os.path.exists(pem_path):
        return None, f"Ficheiro de chave não encontrado: {pem_path}"

    with open(pem_path, 'r') as f:
        return f.read(), None


def _make_jwt():
    private_key, err = _get_private_key()
    if err:
        return None, err

    now = int(time.time())
    jwt_body = {
        "iss": "enablebanking.com",
        "aud": "api.enablebanking.com",
        "iat": now,
        "exp": now + 3600,
    }

    try:
        token = pyjwt.encode(
            jwt_body,
            private_key,
            algorithm="RS256",
            headers={"kid": APP_ID}
        )
        return token, None
    except Exception as e:
        return None, f"Erro ao gerar JWT: {e}"


def _eb_get(path):
    """GET autenticado à API do Enable Banking."""
    token, err = _make_jwt()
    if err:
        return None, err
    resp = requests.get(
        f"{ENABLE_BANKING_BASE}{path}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    if resp.status_code not in (200, 201):
        return None, f"Erro {resp.status_code}: {resp.text[:200]}"
    return resp.json(), None


def _eb_post(path, body):
    """POST autenticado à API do Enable Banking."""
    token, err = _make_jwt()
    if err:
        return None, err
    resp = requests.post(
        f"{ENABLE_BANKING_BASE}{path}",
        json=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    if resp.status_code not in (200, 201):
        return None, f"Erro {resp.status_code}: {resp.text[:200]}"
    return resp.json(), None


def _categorizar_movimento(descricao):
    """Tenta adivinhar a categoria de um movimento pelo texto."""
    descricao = (descricao or "").lower()
    mapa = {
        'Alimentação': ['continente', 'pingo doce', 'lidl', 'aldi', 'intermarche', 'supermercado',
                        'padaria', 'restaurante', 'mcdonald', 'kfc', 'pizza', 'uber eat', 'glovo', 'bolt food'],
        'Transportes': ['uber', 'bolt', 'cp ', 'metro', 'carris', 'galp', 'bp ', 'repsol',
                        'portagem', 'autoestrada', 'parking', 'estacionamento'],
        'Saúde & Beleza': ['farmacia', 'clinica', 'hospital', 'medico', 'saude', 'sephora', 'perfumaria'],
        'Entretenimento': ['netflix', 'spotify', 'hbo', 'disney', 'apple tv', 'prime video',
                           'steam', 'playstation', 'xbox', 'fnac', 'cinema'],
        'Tecnologia': ['fnac', 'worten', 'apple', 'samsung', 'amazon', 'ebay', 'aliexpress'],
        'Vestuário': ['zara', 'h&m', 'mango', 'primark', 'pull&bear', 'bershka', 'nike', 'adidas', 'footlocker'],
        'Casa & Decoração': ['ikea', 'leroy merlin', 'aki', 'bricomarche'],
        'Educação': ['udemy', 'coursera', 'escola', 'universidade'],
    }
    for categoria, keywords in mapa.items():
        for kw in keywords:
            if kw in descricao:
                return categoria
    return 'Outros'


@banco_bp.route('/banco')
@login_required
def banco():
    contas = ContaBancaria.query.filter_by(user_id=current_user.id).all()
    _, err = _get_private_key()
    configurado = err is None
    return render_template('banco.html', contas=contas, token_configurado=configurado)


@banco_bp.route('/banco/paises')
@login_required
def listar_paises():
    pais = request.args.get('pais', 'PT')
    data, err = _eb_get(f"/aspsps?country={pais}&sandbox=true")
    
    if err or not data:
        # Fallback: busca sem filtro de país
        data, err = _eb_get("/aspsps?sandbox=true")
    
    if err:
        return jsonify({'error': err}), 500

    aspsps = data if isinstance(data, list) else data.get('aspsps', [])
    
    resultado = [
        {'id': b.get('name'), 'name': b.get('name'), 'logo': b.get('logo', '')}
        for b in aspsps
    ]
    return jsonify(resultado)

@banco_bp.route('/banco/conectar', methods=['POST'])
@login_required
def conectar():
    """Inicia o fluxo de ligação a um banco via Enable Banking."""
    aspsp_name = request.json.get('institution_id')
    pais = request.json.get('pais', 'PT')
    if not aspsp_name:
        return jsonify({'error': 'Banco não selecionado'}), 400

    state = str(uuid.uuid4())
    session['eb_state'] = state
    session['eb_aspsp'] = aspsp_name
    session['eb_pais'] = pais

    redirect_url = url_for('banco.callback', _external=True)

    body = {
        "access": {
            "balances": True,
            "transactions": True,
        },
        "aspsp": {
            "name": aspsp_name,
            "country": pais,
        },
        "state": state,
        "redirect_url": redirect_url,
        "psu_type": "personal",
    }

    data, err = _eb_post("/auth", body)
    if err:
        return jsonify({'error': err}), 500

    auth_url = data.get('url') or data.get('redirect_url')
    if not auth_url:
        return jsonify({'error': 'URL de autenticação não recebido'}), 500

    session['eb_auth_id'] = data.get('id') or data.get('auth_id', '')
    return jsonify({'link': auth_url})


@banco_bp.route('/banco/callback')
@login_required
def callback():
    """Enable Banking redireciona aqui depois do utilizador autenticar."""
    state = request.args.get('state', '')
    code = request.args.get('code', '')
    error = request.args.get('error', '')

    if error:
        flash(f'Erro na autenticação: {error}', 'error')
        return redirect(url_for('banco.banco'))

    if state != session.get('eb_state', ''):
        flash('Estado inválido. Tenta novamente.', 'error')
        return redirect(url_for('banco.banco'))

    data, err = _eb_post("/sessions", {"code": code})
    if err:
        flash(f'Erro ao criar sessão: {err}', 'error')
        return redirect(url_for('banco.banco'))

    session_id = data.get('session_id', '')
    accounts = data.get('accounts', [])
    aspsp_name = session.get('eb_aspsp', 'Banco')

    if not accounts:
        flash('Nenhuma conta encontrada. Tenta novamente.', 'error')
        return redirect(url_for('banco.banco'))

    novas = 0
    for acc in accounts:
        acc_id = acc.get('account_id', {})
        iban = acc_id.get('iban') or str(acc_id)

        existente = ContaBancaria.query.filter_by(
            user_id=current_user.id,
            iban=iban
        ).first()

        if not existente:
            conta = ContaBancaria(
                user_id=current_user.id,
                account_id=session_id,
                requisition_id=session_id,
                institution_id=aspsp_name,
                iban=iban,
                nome_banco=aspsp_name,
                ligada_em=datetime.utcnow()
            )
            db.session.add(conta)
            novas += 1

    db.session.commit()
    flash(f'{novas} conta(s) ligada(s) com sucesso!', 'success')
    return redirect(url_for('banco.banco'))


@banco_bp.route('/banco/movimentos/<int:conta_id>')
@login_required
def movimentos(conta_id):
    """Carrega os movimentos de uma conta."""
    conta = ContaBancaria.query.filter_by(id=conta_id, user_id=current_user.id).first_or_404()

    data, err = _eb_get(f"/sessions/{conta.account_id}")
    if err:
        return jsonify({'error': err}), 500

    accounts = data.get('accounts', [])
    if not accounts:
        return jsonify({'error': 'Nenhuma conta encontrada na sessão'}), 500

    real_account_id = accounts[0].get('account_id', {}).get('iban', '')

    trans_data, err = _eb_get(f"/accounts/{real_account_id}/transactions")
    if err:
        return jsonify({'error': err}), 500

    transacoes = trans_data.get('transactions', [])

    movimentos_formatados = []
    for t in transacoes[:50]:
        amount_obj = t.get('transaction_amount') or t.get('transactionAmount') or {}
        amount = float(amount_obj.get('amount', 0))
        descricao = (
            t.get('remittance_information_unstructured') or
            t.get('remittanceInformationUnstructured') or
            t.get('creditor_name') or
            t.get('creditorName') or
            t.get('debtor_name') or
            t.get('debtorName') or
            'Movimento'
        )
        data_mov = t.get('booking_date') or t.get('bookingDate') or ''
        categoria = _categorizar_movimento(descricao)

        movimentos_formatados.append({
            'id': t.get('transaction_id') or t.get('transactionId') or str(uuid.uuid4()),
            'descricao': descricao,
            'valor': amount,
            'data': data_mov,
            'categoria': categoria,
            'tipo': 'credito' if amount > 0 else 'debito',
        })

    return jsonify({'movimentos': movimentos_formatados})


@banco_bp.route('/banco/importar', methods=['POST'])
@login_required
def importar_movimento():
    """Importa um movimento bancário como fatura."""
    data = request.json
    descricao = data.get('descricao', 'Movimento bancário')
    valor = abs(float(data.get('valor', 0)))
    data_compra = data.get('data', '')
    categoria = data.get('categoria', 'Outros')

    fatura = Fatura(
        user_id=current_user.id,
        nome_ficheiro=f"banco_{descricao[:30].replace(' ', '_')}.txt",
        loja=descricao[:150],
        data_compra=data_compra,
        total=valor,
        categoria=categoria,
        items='[]',
    )
    db.session.add(fatura)
    db.session.commit()
    return jsonify({'success': True, 'fatura_id': fatura.id})


@banco_bp.route('/banco/desligar/<int:conta_id>', methods=['POST'])
@login_required
def desligar(conta_id):
    """Remove uma conta bancária ligada."""
    conta = ContaBancaria.query.filter_by(id=conta_id, user_id=current_user.id).first_or_404()
    db.session.delete(conta)
    db.session.commit()
    return jsonify({'success': True})
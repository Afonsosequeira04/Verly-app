import os
import re
import json
import base64
import requests
from datetime import datetime, timedelta
from llama_index.core import (
    VectorStoreIndex, SimpleDirectoryReader,
    StorageContext, load_index_from_storage, Settings
)
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
Settings.llm = Groq(model="llama-3.3-70b-versatile", api_key=api_key)
Settings.embed_model = HuggingFaceEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")


# ─── SYSTEM PROMPTS ──────────────────────────────────────────────────────────

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

DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPTS['calm']

CATEGORIAS_VALIDAS = [
    'Tecnologia', 'Alimentação', 'Vestuário', 'Casa & Decoração',
    'Saúde & Beleza', 'Desporto', 'Entretenimento', 'Transportes',
    'Educação', 'Outros'
]

CATEGORIA_MAP = {
    'tecnologia': 'Tecnologia',
    'alimentacao': 'Alimentação', 'alimentação': 'Alimentação',
    'vestuario': 'Vestuário', 'vestuário': 'Vestuário',
    'casa e decoracao': 'Casa & Decoração', 'casa & decoracao': 'Casa & Decoração',
    'casa & decoração': 'Casa & Decoração',
    'saude e beleza': 'Saúde & Beleza', 'saúde e beleza': 'Saúde & Beleza',
    'saude & beleza': 'Saúde & Beleza',
    'desporto': 'Desporto',
    'entretenimento': 'Entretenimento',
    'transportes': 'Transportes',
    'educacao': 'Educação', 'educação': 'Educação',
    'outros': 'Outros',
}


# ─── CONTEXTO DE FATURAS PARA O CHAT ─────────────────────────────────────────

def _build_faturas_context(faturas) -> str:
    """Constrói um resumo textual das faturas para injetar no system prompt do chat."""
    if not faturas:
        return "O utilizador ainda não tem faturas registadas."

    linhas = [f"Total de faturas: {len(faturas)}"]

    por_categoria: dict = {}
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


# ─── EXTRAÇÃO DIRETA DO TEXTO ─────────────────────────────────────────────────

def _extrair_campo(texto, *labels):
    for label in labels:
        pattern = rf'{re.escape(label)}\s*[:\-]\s*(.+)'
        match = re.search(pattern, texto, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def _extrair_total(texto):
    patterns = [
        r'TOTAL\s+A\s+PAGAR\s*[:\-]\s*([\d]+[.,][\d]{2})',
        r'TOTAL\s*[:\-]\s*([\d]+[.,][\d]{2})\s*EUR',
        r'TOTAL\s*[:\-]\s*€?\s*([\d]+[.,][\d]{2})',
    ]
    for pattern in patterns:
        match = re.search(pattern, texto, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1).replace(',', '.'))
            except ValueError:
                continue
    return None


def _normalizar_data(data_str):
    if not data_str:
        return None
    data_str = data_str.strip()
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%y', '%Y/%m/%d']:
        try:
            return datetime.strptime(data_str, fmt).strftime('%d/%m/%Y')
        except ValueError:
            continue
    return None


def _calcular_datas(data_compra_str):
    data_norm = _normalizar_data(data_compra_str)
    if not data_norm:
        return None, None
    try:
        data = datetime.strptime(data_norm, '%d/%m/%Y')
        return (
            (data + timedelta(days=30)).strftime('%d/%m/%Y'),
            data.replace(year=data.year + 3).strftime('%d/%m/%Y'),
        )
    except Exception:
        return None, None


def _extrair_items(texto):
    patterns = [
        r'PRODUTO\s*/\s*SERVICO\s+ADQUIRIDO\s*[:\-]?\s*\n\s*(.+)',
        r'PRODUTO\s*[:\-]\s*\n\s*(.+)',
        r'DESCRI[CÇ][AÃ]O\s*[:\-]\s*\n\s*(.+)',
        r'ARTIGO\s*[:\-]\s*\n\s*(.+)',
        r'PRODUTO\s*/\s*SERVICO\s+ADQUIRIDO\s*[:\-]\s*(.+)',
        r'PRODUTO\s*[:\-]\s*(.+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, texto, re.IGNORECASE)
        if match:
            item = match.group(1).strip()
            if len(item) > 3:
                return [item]
    return []


def _parse_llm_json(text, filename):
    """Parse LLM JSON response and return normalized invoice dict."""
    if '```json' in text:
        text = text.split('```json')[1].split('```')[0].strip()
    elif '```' in text:
        text = text.split('```')[1].split('```')[0].strip()

    start = text.find('{')
    end = text.rfind('}') + 1
    if start != -1 and end > start:
        text = text[start:end]

    data = json.loads(text)
    data_compra = _normalizar_data(data.get('data_compra'))
    data_devolucao, data_garantia = _calcular_datas(data_compra)

    categoria = data.get('categoria', 'Outros')
    if categoria not in CATEGORIAS_VALIDAS:
        categoria = CATEGORIA_MAP.get(categoria.lower(), 'Outros')

    loja = data.get('loja') or ''
    if not loja or '@' in loja or 'http' in loja or loja.endswith('.pt') or loja.endswith('.com'):
        loja = os.path.splitext(filename)[0].replace('_', ' ').title()

    return {
        'loja': loja,
        'data_compra': data_compra,
        'total': float(data.get('total') or 0),
        'items': json.dumps(data.get('items') or [], ensure_ascii=False),
        'categoria': categoria,
        'data_garantia': data_garantia,
        'data_devolucao': data_devolucao,
    }


def _fallback_result(filename):
    return {
        'loja': os.path.splitext(filename)[0].replace('_', ' ').title(),
        'data_compra': None,
        'total': 0.0,
        'items': '[]',
        'categoria': 'Outros',
        'data_garantia': None,
        'data_devolucao': None,
    }


# ─── EXTRAÇÃO COM IA — IMAGEM (VISION) ───────────────────────────────────────

def extract_invoice_info_from_image(file_path, filename):
    """
    Extrai informação de uma fatura em imagem (JPG/PNG/JPEG/HEIC)
    usando Groq Vision (llama-4-scout) diretamente via base64.
    NÃO usa LlamaIndex — evita o bug de confundir com outras faturas.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return _fallback_result(filename)

    # Determinar mime type
    ext = os.path.splitext(filename)[1].lower()
    mime_map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.heic': 'image/jpeg',  # iOS HEIC enviado como JPEG
        '.heif': 'image/jpeg',
    }
    mime_type = mime_map.get(ext, 'image/jpeg')

    # Ler e codificar imagem em base64
    try:
        with open(file_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
    except Exception:
        return _fallback_result(filename)

    prompt = """Analisa esta imagem de fatura/recibo e extrai APENAS dados que estão escritos explicitamente na imagem.
Não inventes nada. Responde APENAS com JSON válido, sem texto antes ou depois:
{
  "loja": "nome exacto da loja/empresa (nunca um email ou URL)",
  "data_compra": "DD/MM/YYYY ou null",
  "total": numero decimal ou null,
  "items": ["produto ou serviço comprado"],
  "categoria": "Tecnologia|Alimentação|Vestuário|Casa & Decoração|Saúde & Beleza|Desporto|Entretenimento|Transportes|Educação|Outros"
}"""

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {groq_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "meta-llama/llama-4-scout-17b-16e-instruct",
                "max_tokens": 500,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{image_data}"
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            },
            timeout=30
        )
        response.raise_for_status()
        text = response.json()['choices'][0]['message']['content'].strip()
        return _parse_llm_json(text, filename)
    except Exception:
        return _fallback_result(filename)


# ─── EXTRAÇÃO COM IA — PDF ────────────────────────────────────────────────────

def extract_invoice_info_from_pdf(file_path, filename):
    """
    Extrai informação de uma fatura PDF:
    1. Tenta extrair texto com pdfplumber
    2. Se tiver texto suficiente, usa extract_invoice_info_from_text (regex)
    3. Se o PDF for uma imagem escaneada (sem texto), usa Vision via primeira página
    NÃO usa LlamaIndex para evitar confusão com outras faturas.
    """
    try:
        import pdfplumber
        texto = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    texto += t + "\n"

        if len(texto.strip()) > 50:
            # PDF com texto — processa directamente
            return extract_invoice_info_from_text(texto, filename)
        else:
            # PDF escaneado — converte primeira página para imagem e usa Vision
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(file_path)
                page = doc[0]
                mat = fitz.Matrix(2, 2)  # 2x zoom para melhor qualidade
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("jpeg")
                img_b64 = base64.b64encode(img_bytes).decode('utf-8')
                doc.close()

                groq_key = os.getenv("GROQ_API_KEY")
                prompt = """Analisa esta imagem de fatura/recibo e extrai APENAS dados escritos explicitamente.
Responde APENAS com JSON válido:
{
  "loja": "nome exacto da loja",
  "data_compra": "DD/MM/YYYY ou null",
  "total": numero decimal ou null,
  "items": ["produto ou serviço"],
  "categoria": "Tecnologia|Alimentação|Vestuário|Casa & Decoração|Saúde & Beleza|Desporto|Entretenimento|Transportes|Educação|Outros"
}"""
                response = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {groq_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
                        "max_tokens": 500,
                        "messages": [{
                            "role": "user",
                            "content": [
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                                {"type": "text", "text": prompt}
                            ]
                        }]
                    },
                    timeout=30
                )
                response.raise_for_status()
                text = response.json()['choices'][0]['message']['content'].strip()
                return _parse_llm_json(text, filename)
            except Exception:
                return _fallback_result(filename)
    except Exception:
        return _fallback_result(filename)


# ─── EXTRAÇÃO DIRETA DO TEXTO (sem IA) ───────────────────────────────────────

def extract_invoice_info_from_text(texto, filename):
    """Extrai info da fatura directamente por LLM — para ficheiros .txt com texto estruturado."""
    groq_key = os.getenv("GROQ_API_KEY")

    # Primeiro tenta com LLM para melhor precisão
    if groq_key and len(texto.strip()) > 20:
        prompt = f"""Lê o seguinte texto de uma fatura e extrai APENAS dados escritos explicitamente. Não inventes nada.
Responde APENAS com JSON válido:
{{
  "loja": "nome exacto da loja (nunca um email ou URL)",
  "data_compra": "DD/MM/YYYY ou null",
  "total": numero decimal ou null,
  "items": ["produto ou serviço comprado"],
  "categoria": "Tecnologia|Alimentação|Vestuário|Casa & Decoração|Saúde & Beleza|Desporto|Entretenimento|Transportes|Educação|Outros"
}}

TEXTO DA FATURA:
{texto[:3000]}"""
        try:
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "max_tokens": 500,
                    "messages": [{"role": "user", "content": prompt}]
                },
                timeout=20
            )
            response.raise_for_status()
            text = response.json()['choices'][0]['message']['content'].strip()
            return _parse_llm_json(text, filename)
        except Exception:
            pass  # Cai para regex

    # Fallback: regex
    loja = _extrair_campo(texto, 'LOJA', 'Loja / Fornecedor', 'Fornecedor', 'Empresa')
    if not loja or '@' in loja or '.pt' in loja or '.com' in loja:
        loja = os.path.splitext(filename)[0].replace('_', ' ').title()

    data_raw = _extrair_campo(texto, 'DATA DE COMPRA', 'Data de Compra', 'DATA', 'Data')
    data_compra = _normalizar_data(data_raw)
    total = _extrair_total(texto)

    cat_raw = _extrair_campo(texto, 'CATEGORIA')
    categoria = 'Outros'
    if cat_raw:
        cat_lower = cat_raw.lower().strip()
        categoria = CATEGORIA_MAP.get(cat_lower, 'Outros')
        if categoria == 'Outros':
            for key, val in CATEGORIA_MAP.items():
                if key in cat_lower:
                    categoria = val
                    break

    items = _extrair_items(texto)
    data_devolucao, data_garantia = _calcular_datas(data_compra)

    return {
        'loja': loja or 'Desconhecida',
        'data_compra': data_compra,
        'total': total or 0.0,
        'items': json.dumps(items, ensure_ascii=False),
        'categoria': categoria,
        'data_garantia': data_garantia,
        'data_devolucao': data_devolucao,
    }


# ─── ÍNDICE (mantido para o chat) ────────────────────────────────────────────

def get_user_paths(base_upload, base_storage, user_id):
    data_dir = os.path.join(base_upload, str(user_id))
    storage_dir = os.path.join(base_storage, str(user_id))
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(storage_dir, exist_ok=True)
    return data_dir, storage_dir


def get_index(data_dir, storage_dir):
    if os.path.exists(storage_dir) and os.listdir(storage_dir):
        try:
            storage_context = StorageContext.from_defaults(persist_dir=storage_dir)
            return load_index_from_storage(storage_context)
        except Exception:
            pass
    if not os.path.exists(data_dir) or not os.listdir(data_dir):
        return None
    documents = SimpleDirectoryReader(data_dir).load_data()
    if not documents:
        return None
    index = VectorStoreIndex.from_documents(documents)
    index.storage_context.persist(persist_dir=storage_dir)
    return index


def rebuild_index(data_dir, storage_dir):
    import shutil
    if os.path.exists(storage_dir):
        shutil.rmtree(storage_dir)
    os.makedirs(storage_dir, exist_ok=True)
    documents = SimpleDirectoryReader(data_dir).load_data()
    index = VectorStoreIndex.from_documents(documents)
    index.storage_context.persist(persist_dir=storage_dir)
    return index


def chat_with_index(index, user_message, personalidade='calm'):
    system = SYSTEM_PROMPTS.get(personalidade, DEFAULT_SYSTEM_PROMPT)
    full_query = f"{system}\n\nPergunta: {user_message}"
    query_engine = index.as_query_engine(streaming=False)
    response = query_engine.query(full_query)
    return str(response)


# ─── ENTRADA PRINCIPAL PARA O UPLOAD ─────────────────────────────────────────

def extract_invoice_info(file_path, filename):
    """
    Ponto de entrada único para extração de faturas.
    Despacha para o método correcto baseado na extensão do ficheiro.
    NÃO usa LlamaIndex — cada ficheiro é processado individualmente
    para evitar o bug de confundir faturas diferentes.
    """
    ext = os.path.splitext(filename)[1].lower()

    if ext in ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'):
        return extract_invoice_info_from_image(file_path, filename)
    elif ext == '.pdf':
        return extract_invoice_info_from_pdf(file_path, filename)
    elif ext == '.txt':
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                texto = f.read()
            return extract_invoice_info_from_text(texto, filename)
        except Exception:
            return _fallback_result(filename)
    else:
        return _fallback_result(filename)
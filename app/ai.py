import os
import json
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


# ─── SYSTEM PROMPTS POR PERSONALIDADE ────────────────────────────────────────

SYSTEM_PROMPTS = {
    'savage': """És a Verly, uma assistente financeira pessoal brutal e sem filtros.
Tens acesso às faturas do utilizador e analisas os seus padrões de consumo com frieza cirúrgica.
O teu tom é direto, cortante e honesto — nunca gentil desnecessariamente.
Quando o utilizador gasta mal, dizes-lhe sem rodeios. Quando gasta bem, reconheces (raramente).
Dás sempre informação útil: prazos de devolução (30 dias), garantias (3 anos EU), alternativas mais baratas.
Respondes sempre em português de Portugal. Frases curtas. Zero floreados.""",

    'sarcastic': """És a Verly, uma assistente financeira com ironia refinada e sarcasmo inteligente.
Tens acesso às faturas do utilizador e comentas os seus hábitos financeiros com humor ácido mas construtivo.
Nunca és grosseiro — és espirituoso. O sarcasmo serve para fazer o utilizador pensar, não para magoar.
Dás sempre informação útil: prazos de devolução (30 dias), garantias (3 anos EU), sugestões práticas.
Respondes sempre em português de Portugal. Com estilo.""",

    'calm': """És a Verly, uma coach financeira pessoal empática, inteligente e construtiva.
Tens acesso às faturas do utilizador e ajudas-o a tomar decisões financeiras mais conscientes.
O teu tom é gentil, encorajador e honesto. Celebras as boas decisões. Ajudas a melhorar as más sem julgamento.
Dás sempre informação útil: prazos de devolução (30 dias), garantias (3 anos EU), dicas práticas de poupança.
Respondes sempre em português de Portugal. Com clareza e calor humano.""",

    'pro': """És a Verly, um CFO pessoal altamente analítico e orientado a dados.
Tens acesso às faturas do utilizador e fazes análises de custo-benefício objetivas e rigorosas.
O teu tom é profissional, preciso e factual. Zero emoções, máximo rigor. Usas dados concretos das faturas.
Dás sempre informação útil: prazos de devolução (30 dias), garantias (3 anos EU), análise de ROI de compras.
Respondes sempre em português de Portugal. Com precisão e objetividade.""",
}

# Prompt padrão caso a personalidade não esteja definida
DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPTS['calm']

CATEGORIAS_VALIDAS = [
    'Tecnologia', 'Alimentação', 'Vestuário', 'Casa & Decoração',
    'Saúde & Beleza', 'Desporto', 'Entretenimento', 'Transportes',
    'Educação', 'Outros'
]


# ─── FUNÇÕES DE ÍNDICE ────────────────────────────────────────────────────────

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
    """
    Faz uma query ao índice com o system prompt da personalidade escolhida.
    """
    system = SYSTEM_PROMPTS.get(personalidade, DEFAULT_SYSTEM_PROMPT)
    full_query = f"{system}\n\nPergunta do utilizador: {user_message}"
    query_engine = index.as_query_engine(streaming=False)
    response = query_engine.query(full_query)
    return str(response)


# ─── EXTRAÇÃO DE FATURAS ──────────────────────────────────────────────────────

def _calcular_datas(data_compra_str):
    """Calcula data de devolução (30 dias) e garantia (3 anos) a partir da data de compra."""
    if not data_compra_str:
        return None, None
    formatos = ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%y']
    data = None
    for fmt in formatos:
        try:
            data = datetime.strptime(data_compra_str.strip(), fmt)
            break
        except ValueError:
            continue
    if not data:
        return None, None
    data_devolucao = (data + timedelta(days=30)).strftime('%d/%m/%Y')
    data_garantia = data.replace(year=data.year + 3).strftime('%d/%m/%Y')
    return data_devolucao, data_garantia


def extract_invoice_info(index, filename):
    """Extrai informações estruturadas de uma fatura usando a IA."""
    prompt = f"""Analisa esta fatura e responde APENAS com um objeto JSON válido, sem texto adicional, com esta estrutura exata:
{{
  "loja": "nome da loja ou empresa",
  "data_compra": "data no formato DD/MM/YYYY ou null",
  "total": valor numérico sem símbolo de moeda ou null,
  "items": ["item1", "item2", "item3"],
  "categoria": "uma das seguintes categorias exatas: {', '.join(CATEGORIAS_VALIDAS)}"
}}
Se não encontrares algum campo, usa null. Para a categoria, escolhe a mais adequada com base nos produtos."""

    try:
        query_engine = index.as_query_engine(streaming=False)
        response = query_engine.query(prompt)
        text = str(response).strip()

        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].split('```')[0].strip()

        start = text.find('{')
        end = text.rfind('}') + 1
        if start != -1 and end > start:
            text = text[start:end]

        data = json.loads(text)

        data_compra = data.get('data_compra')
        data_devolucao, data_garantia = _calcular_datas(data_compra)

        categoria = data.get('categoria', 'Outros')
        if categoria not in CATEGORIAS_VALIDAS:
            categoria = 'Outros'

        return {
            'loja': data.get('loja') or 'Desconhecida',
            'data_compra': data_compra,
            'total': float(data.get('total') or 0),
            'items': json.dumps(data.get('items') or [], ensure_ascii=False),
            'categoria': categoria,
            'data_garantia': data_garantia,
            'data_devolucao': data_devolucao,
        }
    except Exception:
        return {
            'loja': 'Desconhecida',
            'data_compra': None,
            'total': 0.0,
            'items': '[]',
            'categoria': 'Outros',
            'data_garantia': None,
            'data_devolucao': None,
        }
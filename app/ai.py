import os
import json
from llama_index.core import (
    VectorStoreIndex,
    SimpleDirectoryReader,
    StorageContext,
    load_index_from_storage,
    Settings
)
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from dotenv import load_dotenv

load_dotenv()

# Configuração global da IA
api_key = os.getenv("GROQ_API_KEY")
Settings.llm = Groq(model="llama-3.3-70b-versatile", api_key=api_key)
Settings.embed_model = HuggingFaceEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")

SYSTEM_PROMPT = """És o 'Shopping Police', um polícia financeiro sarcástico e implacável.
Tratas o utilizador por 'recruta' ou 'gastador'.
Analisas as faturas carregadas e respondes com base nelas.
Se o utilizador gastou muito em coisas inúteis, goza com ele de forma divertida.
Informa sempre sobre prazos de devolução (30 dias) e garantias (3 anos EU) se encontrares datas.
Responde sempre em português de Portugal.
Se não encontrares informação relevante nas faturas, diz que precisas de mais provas."""


def get_user_paths(base_upload, base_storage, user_id):
    data_dir = os.path.join(base_upload, str(user_id))
    storage_dir = os.path.join(base_storage, str(user_id))
    os.makedirs(data_dir, exist_ok=True)
    return data_dir, storage_dir


def get_index(data_dir, storage_dir):
    """Carrega ou cria o índice do utilizador."""
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
    """Reconstrói o índice após upload de nova fatura."""
    import shutil
    if os.path.exists(storage_dir):
        shutil.rmtree(storage_dir)
    os.makedirs(storage_dir, exist_ok=True)

    documents = SimpleDirectoryReader(data_dir).load_data()
    index = VectorStoreIndex.from_documents(documents)
    index.storage_context.persist(persist_dir=storage_dir)
    return index


def chat_with_index(index, user_message):
    """Faz uma pergunta ao índice."""
    full_query = SYSTEM_PROMPT + "\n\nPergunta do recruta: " + user_message
    query_engine = index.as_query_engine(streaming=False)
    response = query_engine.query(full_query)
    return str(response)


def extract_invoice_info(index, filename):
    """Extrai informações estruturadas de uma fatura usando a IA."""
    prompt = """Analisa esta fatura e responde APENAS com um objeto JSON válido, sem texto adicional, com esta estrutura exata:
{
  "loja": "nome da loja ou empresa",
  "data_compra": "data no formato DD/MM/YYYY ou null",
  "total": valor numérico sem símbolo de moeda ou null,
  "items": ["item1", "item2", "item3"]
}
Se não encontrares algum campo, usa null para strings e 0 para números."""

    try:
        query_engine = index.as_query_engine(streaming=False)
        response = query_engine.query(prompt)
        text = str(response).strip()

        # Limpar possível markdown
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].split('```')[0].strip()

        data = json.loads(text)
        return {
            'loja': data.get('loja') or 'Desconhecida',
            'data_compra': data.get('data_compra') or None,
            'total': float(data.get('total') or 0),
            'items': json.dumps(data.get('items') or [], ensure_ascii=False)
        }
    except Exception as e:
        return {
            'loja': 'Desconhecida',
            'data_compra': None,
            'total': 0.0,
            'items': '[]'
        }

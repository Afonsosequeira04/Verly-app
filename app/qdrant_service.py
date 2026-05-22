"""
app/qdrant_service.py — Integração LlamaIndex + Qdrant para RAG por utilizador.
"""

import os
import json
import logging
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from llama_index.core import Settings, VectorStoreIndex, Document
from llama_index.core.storage import StorageContext
from llama_index.vector_stores.qdrant import QdrantVectorStore

logger = logging.getLogger(__name__)

COLLECTION = os.getenv('QDRANT_COLLECTION', 'verly_docs')
VECTOR_DIM = 384

_client: QdrantClient | None = None


def get_qdrant_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(
            url=os.getenv('QDRANT_URL', 'http://localhost:6333'),
            api_key=os.getenv('QDRANT_API_KEY') or None,
        )
        _ensure_collection(_client)
    return _client


def _ensure_collection(client: QdrantClient) -> None:
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        logger.info(f'Qdrant: collection "{COLLECTION}" criada.')


def upsert_fatura(fatura) -> None:
    """Indexa / actualiza o documento de uma fatura no Qdrant."""
    client = get_qdrant_client()
    vector_store = QdrantVectorStore(client=client, collection_name=COLLECTION)
    storage_ctx  = StorageContext.from_defaults(vector_store=vector_store)

    texto = _fatura_to_text(fatura)
    doc = Document(
        text=texto,
        doc_id=f"fatura_{fatura.id}",
        metadata={
            'user_id':   fatura.user_id,
            'fatura_id': fatura.id,
            'loja':      fatura.loja      or '',
            'categoria': fatura.categoria or '',
            'total':     fatura.total     or 0,
        },
    )
    VectorStoreIndex.from_documents([doc], storage_context=storage_ctx, show_progress=False)
    logger.info(f'Qdrant: fatura {fatura.id} indexada.')


def query_user(user_id: int, query_text: str, top_k: int = 5) -> list[dict]:
    """RAG: devolve os k chunks mais relevantes para o utilizador."""
    from llama_index.core.vector_stores import MetadataFilter, MetadataFilters

    client = get_qdrant_client()
    vector_store = QdrantVectorStore(client=client, collection_name=COLLECTION)
    storage_ctx  = StorageContext.from_defaults(vector_store=vector_store)
    index = VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_ctx)

    filters = MetadataFilters(filters=[MetadataFilter(key='user_id', value=user_id)])
    retriever = index.as_retriever(similarity_top_k=top_k, filters=filters)
    nodes = retriever.retrieve(query_text)

    return [{'text': n.text, 'score': n.score, **n.metadata} for n in nodes]


def delete_fatura(fatura_id: int) -> None:
    """Remove os vectores de uma fatura apagada."""
    client = get_qdrant_client()
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key='fatura_id', match=MatchValue(value=fatura_id))]
        ),
    )
    logger.info(f'Qdrant: fatura {fatura_id} removida.')


def _fatura_to_text(f) -> str:
    try:
        items = json.loads(f.items) if f.items else []
    except Exception:
        items = []
    items_txt = '; '.join(f"{i.get('nome', '?')} {i.get('preco', 0)}€" for i in items)
    return (
        f"Loja: {f.loja or 'desconhecida'}. "
        f"Data: {f.data_compra or 'N/A'}. "
        f"Total: {f.total or 0}€. "
        f"Categoria: {f.categoria or 'Outros'}. "
        f"Items: {items_txt}."
    )
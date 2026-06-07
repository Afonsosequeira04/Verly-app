"""
Qdrant vector memory for user financial records.

PostgreSQL remains the source of truth for exact totals and filters. Qdrant is
used only for semantic retrieval: similar purchases, natural-language search
and grounding Ask Verly/Insights with concrete examples.
"""

import json
import logging
import os

from llama_index.core import Document, Settings, VectorStoreIndex
from llama_index.core.storage import StorageContext
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, FieldCondition, Filter, MatchValue, VectorParams

logger = logging.getLogger(__name__)

COLLECTION = os.getenv('QDRANT_COLLECTION', 'verly_docs')
VECTOR_DIM = 384

_client: QdrantClient | None = None
_embedding_ready = False


def _ensure_embedding_model() -> None:
    global _embedding_ready
    if _embedding_ready:
        return
    Settings.embed_model = HuggingFaceEmbedding(
        model_name=os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2')
    )
    _embedding_ready = True


def get_qdrant_client() -> QdrantClient:
    global _client
    _ensure_embedding_model()
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
        logger.info('Qdrant: collection "%s" created.', COLLECTION)


def _vector_store(client: QdrantClient) -> QdrantVectorStore:
    return QdrantVectorStore(client=client, collection_name=COLLECTION)


def _delete_by_metadata(client: QdrantClient, key: str, value) -> None:
    client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key=key, match=MatchValue(value=value))]
        ),
    )


def upsert_fatura(fatura) -> None:
    """Index or refresh one invoice document."""
    client = get_qdrant_client()
    _delete_by_metadata(client, 'fatura_id', fatura.id)
    vector_store = _vector_store(client)
    storage_ctx = StorageContext.from_defaults(vector_store=vector_store)

    doc = Document(
        text=_fatura_to_text(fatura),
        doc_id=f'fatura_{fatura.id}',
        metadata={
            'source_type': 'fatura',
            'user_id': fatura.user_id,
            'fatura_id': fatura.id,
            'loja': fatura.loja or '',
            'categoria': fatura.categoria or '',
            'total': fatura.total or 0,
            'currency': 'EUR',
            'data': fatura.data_compra or '',
        },
    )
    VectorStoreIndex.from_documents([doc], storage_context=storage_ctx, show_progress=False)
    logger.info('Qdrant: fatura %s indexed.', fatura.id)


def upsert_bank_transaction(transaction) -> None:
    """Index or refresh one Open Banking transaction."""
    client = get_qdrant_client()
    _delete_by_metadata(client, 'transaction_db_id', transaction.id)
    vector_store = _vector_store(client)
    storage_ctx = StorageContext.from_defaults(vector_store=vector_store)

    doc = Document(
        text=_bank_transaction_to_text(transaction),
        doc_id=f'bank_transaction_{transaction.id}',
        metadata={
            'source_type': 'bank_transaction',
            'user_id': transaction.user_id,
            'transaction_db_id': transaction.id,
            'transaction_id': transaction.transaction_id or '',
            'merchant': transaction.merchant_name or '',
            'description': transaction.description or '',
            'categoria': transaction.categoria or '',
            'amount': transaction.amount or 0,
            'currency': transaction.currency or 'EUR',
            'booked_at': transaction.booked_at.isoformat() if transaction.booked_at else '',
        },
    )
    VectorStoreIndex.from_documents([doc], storage_context=storage_ctx, show_progress=False)
    logger.info('Qdrant: bank transaction %s indexed.', transaction.id)


def query_user(user_id: int, query_text: str, top_k: int = 5) -> list[dict]:
    """Return the most semantically relevant records for one user."""
    from llama_index.core.vector_stores import MetadataFilter, MetadataFilters

    client = get_qdrant_client()
    vector_store = _vector_store(client)
    storage_ctx = StorageContext.from_defaults(vector_store=vector_store)
    index = VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_ctx)

    filters = MetadataFilters(filters=[MetadataFilter(key='user_id', value=user_id)])
    retriever = index.as_retriever(similarity_top_k=top_k, filters=filters)
    nodes = retriever.retrieve(query_text)

    return [
        {
            'text': node.text,
            'score': node.score,
            **node.metadata,
        }
        for node in nodes
    ]


def delete_fatura(fatura_id: int) -> None:
    """Remove vectors for one invoice."""
    client = get_qdrant_client()
    _delete_by_metadata(client, 'fatura_id', fatura_id)
    logger.info('Qdrant: fatura %s removed.', fatura_id)


def delete_bank_transaction(transaction_id: int) -> None:
    """Remove vectors for one bank transaction."""
    client = get_qdrant_client()
    _delete_by_metadata(client, 'transaction_db_id', transaction_id)
    logger.info('Qdrant: bank transaction %s removed.', transaction_id)


def _fatura_to_text(fatura) -> str:
    try:
        items = json.loads(fatura.items) if fatura.items else []
    except Exception:
        items = []
    items_txt = '; '.join(
        f"{item.get('nome', '?')} {item.get('preco', 0)} EUR"
        for item in items
        if isinstance(item, dict)
    )
    return (
        "Tipo: fatura. "
        f"Loja: {fatura.loja or 'desconhecida'}. "
        f"Data: {fatura.data_compra or 'N/A'}. "
        f"Total: {float(fatura.total or 0):.2f} EUR. "
        f"Categoria: {fatura.categoria or 'Outros'}. "
        f"Items: {items_txt or 'sem detalhe'}."
    )


def _bank_transaction_to_text(transaction) -> str:
    amount = float(transaction.amount or 0)
    direction = 'entrada' if amount > 0 else 'saida'
    merchant = transaction.merchant_name or transaction.description or 'Movimento sem comerciante'
    return (
        "Tipo: movimento bancario. "
        f"Comerciante/descricao: {merchant}. "
        f"Descricao completa: {transaction.description or ''}. "
        f"Data: {transaction.booked_at.isoformat() if transaction.booked_at else 'N/A'}. "
        f"Valor: {amount:.2f} {transaction.currency or 'EUR'} ({direction}). "
        f"Categoria: {transaction.categoria or 'Outros'}. "
        f"Provider: {transaction.provider or 'open_banking'}."
    )

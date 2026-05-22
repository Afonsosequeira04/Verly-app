"""
app/r2_service.py — Upload, download e signed URLs para o Cloudflare R2.
"""

import os
import uuid
import logging
from app.extensions import get_r2_client

logger = logging.getLogger(__name__)

BUCKET = os.getenv('R2_BUCKET_NAME', 'verly-docs')


def upload_file(file_bytes: bytes, original_name: str, user_id: int, content_type: str) -> str:
    """
    Faz upload de um ficheiro para o R2.
    Returns: key (str) — guardar em Fatura.file_key
    """
    ext = os.path.splitext(original_name)[1].lower()
    key = f"users/{user_id}/{uuid.uuid4().hex}{ext}"

    client = get_r2_client()
    client.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
        ServerSideEncryption='AES256',
    )
    logger.info(f'R2 upload OK: {key}')
    return key


def get_signed_url(key: str, expires_in: int = 3600) -> str:
    """Gera URL assinada privada para acesso temporário ao ficheiro."""
    client = get_r2_client()
    return client.generate_presigned_url(
        'get_object',
        Params={'Bucket': BUCKET, 'Key': key},
        ExpiresIn=expires_in,
    )


def delete_file(key: str) -> bool:
    """Apaga um ficheiro do R2. Retorna True se bem sucedido."""
    try:
        get_r2_client().delete_object(Bucket=BUCKET, Key=key)
        logger.info(f'R2 delete OK: {key}')
        return True
    except Exception as e:
        logger.error(f'R2 delete erro ({key}): {e}')
        return False
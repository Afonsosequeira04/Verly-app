"""
security.py — Validação segura de uploads e sanitização de inputs

Fornece:
  - validate_upload()     : valida ficheiro por extensão + magic bytes (MIME real)
  - sanitize_filename()   : limpa nomes de ficheiro para evitar path traversal
  - sanitize_text_input() : limpa strings de utilizador
  - check_rate_limit()    : rate limiting simples em memória (sem Redis)

MAGIC BYTES suportados:
  PDF  → %PDF
  PNG  → \\x89PNG
  JPEG → \\xff\\xd8\\xff
  TXT  → heurística (UTF-8 válido, sem bytes nulos)
"""

import os
import re
import unicodedata
import time
from collections import defaultdict
from threading import Lock
from typing import Tuple

from werkzeug.datastructures import FileStorage


# ── Magic bytes por tipo ──────────────────────────────────────────────────────

MAGIC_BYTES: dict[str, list[bytes]] = {
    'application/pdf': [b'%PDF'],
    'image/png':       [b'\x89PNG\r\n\x1a\n'],
    'image/jpeg':      [b'\xff\xd8\xff'],
}

EXTENSION_TO_MIME: dict[str, str] = {
    '.pdf':  'application/pdf',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.txt':  'text/plain',
}

# Máximo de bytes a ler para verificar magic bytes
MAGIC_READ_BYTES = 16

# Tamanho máximo de nome de ficheiro após sanitização
MAX_FILENAME_LENGTH = 100


# ── Rate limiting em memória ──────────────────────────────────────────────────
# Para produção com múltiplos workers, usar Flask-Limiter + Redis.

_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_lock = Lock()


def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
    """
    Verifica se a chave excedeu o rate limit.

    Args:
        key:             identificador único (ex: f'upload:{user_id}')
        max_requests:    número máximo de pedidos permitidos
        window_seconds:  janela de tempo em segundos

    Returns:
        (allowed, remaining) — se permitido e quantos pedidos restam
    """
    now = time.time()
    cutoff = now - window_seconds

    with _rate_lock:
        # Remove timestamps fora da janela
        _rate_store[key] = [t for t in _rate_store[key] if t > cutoff]

        count = len(_rate_store[key])
        remaining = max(0, max_requests - count - 1)

        if count >= max_requests:
            return False, 0

        _rate_store[key].append(now)
        return True, remaining


# ── Sanitização de nomes de ficheiro ─────────────────────────────────────────

def sanitize_filename(filename: str) -> str:
    """
    Sanitiza um nome de ficheiro para uso seguro no filesystem.

    Protege contra:
    - Path traversal (../, /etc/passwd, etc.)
    - Caracteres especiais e de controlo
    - Nomes reservados do Windows (CON, NUL, PRN, etc.)
    - Nomes excessivamente longos

    Returns:
        Nome de ficheiro seguro, ou string vazia se inválido.
    """
    if not filename or not isinstance(filename, str):
        return ''

    # Normalizar unicode (NFKC: compatibilidade + composição canónica)
    filename = unicodedata.normalize('NFKC', filename)

    # Separar nome e extensão
    name, ext = os.path.splitext(filename)
    ext = ext.lower()

    # Remover caracteres perigosos do nome
    # Manter apenas letras, números, hífens, underscores, pontos e espaços
    name = re.sub(r'[^\w\s\-.]', '', name)
    name = re.sub(r'\s+', '_', name.strip())

    # Remover pontos e hífens no início (evita ficheiros ocultos e path issues)
    name = name.lstrip('.-')

    # Nomes reservados do Windows (case-insensitive)
    reserved = {'CON', 'PRN', 'AUX', 'NUL',
                'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
                'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'}
    if name.upper() in reserved:
        name = f'ficheiro_{name}'

    # Fallback se o nome ficar vazio
    if not name:
        import time as t
        name = f'upload_{int(t.time())}'

    # Truncar se necessário (preservando extensão)
    max_name_len = MAX_FILENAME_LENGTH - len(ext)
    name = name[:max_name_len]

    return f'{name}{ext}'


# ── Validação de uploads ──────────────────────────────────────────────────────

def validate_upload(file: FileStorage, allowed_extensions: set[str]) -> Tuple[bool, str]:
    """
    Valida um ficheiro uploaded com verificação dupla:
    1. Extensão da declarada pelo cliente
    2. Magic bytes reais do conteúdo (o cliente pode mentir na extensão)

    Args:
        file:               objeto FileStorage do Flask
        allowed_extensions: conjunto de extensões permitidas (ex: {'.pdf', '.png'})

    Returns:
        (valid, error_message) — se válido e mensagem de erro (vazia se válido)
    """
    if not file or not file.filename:
        return False, 'Nenhum ficheiro enviado.'

    filename = file.filename
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    # 1. Verificar extensão
    if ext not in allowed_extensions:
        allowed_str = ', '.join(sorted(allowed_extensions))
        return False, f'Extensão não permitida: {ext}. Permitidas: {allowed_str}'

    # 2. Verificar magic bytes (conteúdo real)
    # Ler os primeiros bytes para identificar o tipo real
    file.stream.seek(0)
    header = file.stream.read(MAGIC_READ_BYTES)
    file.stream.seek(0)  # IMPORTANTE: repor o cursor para o upload funcionar

    expected_mime = EXTENSION_TO_MIME.get(ext)

    if expected_mime == 'text/plain':
        # Para TXT, verificar que é UTF-8 válido e não tem bytes nulos
        is_valid = _validate_text_content(header)
        if not is_valid:
            return False, 'O ficheiro TXT parece ser binário ou corrompido.'

    elif expected_mime in MAGIC_BYTES:
        # Para tipos com magic bytes conhecidos, verificar o header
        valid_magic = MAGIC_BYTES[expected_mime]
        if not any(header.startswith(magic) for magic in valid_magic):
            return False, (
                f'O conteúdo do ficheiro não corresponde à extensão .{ext.lstrip(".")}. '
                f'Parece ser um ficheiro diferente ou está corrompido.'
            )
    else:
        # Extensão desconhecida (não devia chegar aqui se allowed_extensions estiver correto)
        return False, f'Tipo de ficheiro não suportado: {ext}'

    return True, ''


def _validate_text_content(header: bytes) -> bool:
    """Verifica heuristicamente se o conteúdo é texto (não binário)."""
    # Bytes nulos = ficheiro binário
    if b'\x00' in header:
        return False
    # Tentar decodificar como UTF-8
    try:
        header.decode('utf-8')
        return True
    except UnicodeDecodeError:
        # Pode ser latin-1 ou outro encoding — aceitar com precaução
        # Rejeitar apenas se mais de 30% dos bytes forem não-ASCII
        non_ascii = sum(1 for b in header if b > 127)
        return non_ascii / max(len(header), 1) < 0.30


# ── Sanitização de inputs de texto ───────────────────────────────────────────

def sanitize_text_input(value: str, max_length: int = 500, allow_newlines: bool = False) -> str:
    """
    Sanitiza input de texto do utilizador.

    - Remove caracteres de controlo (exceto newlines se permitido)
    - Normaliza espaços múltiplos
    - Trunca ao comprimento máximo

    Args:
        value:          string a sanitizar
        max_length:     comprimento máximo permitido
        allow_newlines: se True, preserva \\n e \\r\\n

    Returns:
        String sanitizada.
    """
    if not value or not isinstance(value, str):
        return ''

    # Normalizar unicode
    value = unicodedata.normalize('NFKC', value)

    # Remover caracteres de controlo
    if allow_newlines:
        # Manter \n e \r, remover o resto dos caracteres de controlo
        value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
        # Normalizar quebras de linha
        value = re.sub(r'\r\n|\r', '\n', value)
    else:
        # Remover todos os caracteres de controlo incluindo \n e \r
        value = re.sub(r'[\x00-\x1f\x7f]', '', value)

    # Normalizar espaços múltiplos (preservando \n se permitido)
    if allow_newlines:
        lines = value.split('\n')
        lines = [re.sub(r'[ \t]+', ' ', line).strip() for line in lines]
        value = '\n'.join(lines)
    else:
        value = re.sub(r'\s+', ' ', value).strip()

    # Truncar
    return value[:max_length]

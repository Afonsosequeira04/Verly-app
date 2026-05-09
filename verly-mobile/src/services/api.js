/**
 * src/services/api.js
 * Serviço central de comunicação com o backend Flask.
 * Todas as chamadas à API passam por aqui.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Muda para o IP da tua máquina quando testares em dispositivo físico
// Em emulador Android: http://10.0.2.2:5000/api/v1
// Em emulador iOS:     http://localhost:5000/api/v1
const BASE_URL = 'http://192.168.1.251:5000/api/v1';

const TOKEN_KEY = '@verly_token';

// ── Token ─────────────────────────────────────────────────────────────────────

export const saveToken = async (token) => {
  await AsyncStorage.setItem(TOKEN_KEY, token);
};

export const getToken = async () => {
  return await AsyncStorage.getItem(TOKEN_KEY);
};

export const removeToken = async () => {
  await AsyncStorage.removeItem(TOKEN_KEY);
};

// ── Fetch base ────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = await getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Token expirado → logout automático
  if (response.status === 401) {
    await removeToken();
    throw new Error('UNAUTHORIZED');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Erro ${response.status}`);
  }

  return data;
}

// ── Upload (multipart) ────────────────────────────────────────────────────────

async function apiUpload(path, formData) {
  const token = await getToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // NÃO definir Content-Type aqui — o fetch define automaticamente com boundary
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authAPI = {
  login: (email, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (nome, email, password) =>
    apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nome, email, password }),
    }),

  me: () => apiFetch('/auth/me'),

  updateMe: (updates) =>
    apiFetch('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const dashboardAPI = {
  get: () => apiFetch('/dashboard'),
};

// ── Faturas ───────────────────────────────────────────────────────────────────

export const faturasAPI = {
  listar: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/faturas${query ? `?${query}` : ''}`);
  },

  detalhe: (id) => apiFetch(`/faturas/${id}`),

  apagar: (id) => apiFetch(`/faturas/${id}`, { method: 'DELETE' }),

  upload: (fileUri, fileName, fileType) => {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: fileType,
    });
    return apiUpload('/faturas/upload', formData);
  },
};

// ── Notificações ──────────────────────────────────────────────────────────────

export const notificacoesAPI = {
  listar: () => apiFetch('/notificacoes'),
};

// ── Chat ──────────────────────────────────────────────────────────────────────

export const chatAPI = {
  enviar: (mensagem) =>
    apiFetch('/chat/mensagem', {
      method: 'POST',
      body: JSON.stringify({ mensagem }),
    }),

  historico: (limite = 20) => apiFetch(`/chat/historico?limite=${limite}`),

  limpar: () => apiFetch('/chat/limpar', { method: 'POST' }),
};

// ── Subscrições ───────────────────────────────────────────────────────────────

export const subscricoesAPI = {
  listar: () => apiFetch('/subscricoes'),
};

// ── Metas ─────────────────────────────────────────────────────────────────────

export const metasAPI = {
  listar: () => apiFetch('/metas'),

  criar: (nome, limite, categoria) =>
    apiFetch('/metas', {
      method: 'POST',
      body: JSON.stringify({ nome, limite, categoria }),
    }),

  apagar: (id) => apiFetch(`/metas/${id}`, { method: 'DELETE' }),
};

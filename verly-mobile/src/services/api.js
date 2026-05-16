/**
 * src/services/api.js
 * Serviço central de comunicação com o backend Flask.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ Muda para o IP da tua máquina quando testares em dispositivo físico
const BASE_URL = 'http://192.168.1.3:5000/api/v1';

const TOKEN_KEY = '@verly_token';

// ── Token ──────────────────────────────────────────────────────────────────────

export const saveToken   = async (token) => AsyncStorage.setItem(TOKEN_KEY, token);
export const getToken    = async ()      => AsyncStorage.getItem(TOKEN_KEY);
export const removeToken = async ()      => AsyncStorage.removeItem(TOKEN_KEY);

// ── Fetch base ─────────────────────────────────────────────────────────────────

export async function apiFetch(path, options = {}) {
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

  if (response.status === 401) {
    await removeToken();
    throw new Error('UNAUTHORIZED');
  }

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.error || `Erro ${response.status}`);
    err.code = data.code;
    throw err;
  }

  return data;
}

// ── Upload (multipart) ─────────────────────────────────────────────────────────

async function apiUpload(path, formData) {
  const token = await getToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Erro ${response.status}`);
  }

  return data;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const authAPI = {
  login: (email, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (nome, email, password) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ nome, email, password }) }),

  me: () => apiFetch('/auth/me'),

  updateMe: (updates) =>
    apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify(updates) }),

  uploadAvatar: (image_base64) =>
    apiFetch('/auth/avatar', { method: 'POST', body: JSON.stringify({ image_base64 }) }),

  completeOnboarding: (answers) =>
    apiFetch('/auth/onboarding', { method: 'POST', body: JSON.stringify(answers) }),

  resendConfirm: (email) =>
    apiFetch('/auth/resend-confirm', { method: 'POST', body: JSON.stringify({ email }) }),

  firebaseLogin: (idToken) =>
    apiFetch('/auth/firebase', { method: 'POST', body: JSON.stringify({ idToken }) }),

  // ✅ Apagar conta permanentemente
  deleteAccount: () =>
    apiFetch('/auth/account', { method: 'DELETE' }),
};

// ── Onboarding (guarda rendimento + objetivo) ──────────────────────────────────

export const onboardingAPI = {
  save: (answers) =>
    apiFetch('/onboarding', { method: 'POST', body: JSON.stringify(answers) }),

  status: () => apiFetch('/onboarding/status'),
};

// ── Dashboard ──────────────────────────────────────────────────────────────────

export const dashboardAPI = {
  get: () => apiFetch('/dashboard'),
};

// ── Faturas ────────────────────────────────────────────────────────────────────

export const faturasAPI = {
  listar: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/faturas${query ? `?${query}` : ''}`);
  },

  detalhe: (id) => apiFetch(`/faturas/${id}`),

  apagar: (id) =>
    apiFetch(`/faturas/${id}`, { method: 'DELETE' }),

  upload: (fileUri, fileName, fileType) => {
    const formData = new FormData();
    formData.append('file', { uri: fileUri, name: fileName, type: fileType });
    return apiUpload('/faturas/upload', formData);
  },
};

// ── Insights (IA real) ─────────────────────────────────────────────────────────

export const insightsAPI = {
  get: () => apiFetch('/insights'),
};

// ── Notificações ───────────────────────────────────────────────────────────────

export const notificacoesAPI = {
  listar: () => apiFetch('/notificacoes'),
};

// ── Chat ───────────────────────────────────────────────────────────────────────

export const chatAPI = {
  enviar: (mensagem) =>
    apiFetch('/chat/mensagem', { method: 'POST', body: JSON.stringify({ mensagem }) }),

  historico: (limite = 20) =>
    apiFetch(`/chat/historico?limite=${limite}`),

  limpar: () =>
    apiFetch('/chat/limpar', { method: 'POST' }),
};

// ── Subscrições ────────────────────────────────────────────────────────────────

export const subscricoesAPI = {
  listar: () => apiFetch('/subscricoes'),
};

// ── Metas ──────────────────────────────────────────────────────────────────────

export const metasAPI = {
  listar: () => apiFetch('/metas'),

  criar: (nome, limite, categoria) =>
    apiFetch('/metas', { method: 'POST', body: JSON.stringify({ nome, limite, categoria }) }),

  apagar: (id) =>
    apiFetch(`/metas/${id}`, { method: 'DELETE' }),
};

// ── Estatísticas ───────────────────────────────────────────────────────────────

export const estatisticasAPI = {
  get: () => apiFetch('/estatisticas'),
};

// ── Score de Compras ───────────────────────────────────────────────────────────

export const scoreAPI = {
  analisar: ({ item, preco, categoria, uso }) =>
    apiFetch('/scoring/analisar', { method: 'POST', body: JSON.stringify({ item, preco, categoria, uso }) }),

  scoreFatura: (faturaId) =>
    apiFetch(`/scoring/fatura/${faturaId}`),

  lojasProximas: ({ item, categoria, lat, lng }) =>
    apiFetch('/scoring/lojas-proximas', { method: 'POST', body: JSON.stringify({ item, categoria, lat, lng }) }),
};

// ── Perfil ─────────────────────────────────────────────────────────────────────

export const perfilAPI = {
  get: () => apiFetch('/perfil'),

  update: (data) =>
    apiFetch('/perfil', { method: 'PATCH', body: JSON.stringify(data) }),

  // alias para compatibilidade com código antigo
  atualizar: (data) =>
    apiFetch('/perfil', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Histórico ──────────────────────────────────────────────────────────────────

export const historicoAPI = {
  get: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/historico${query ? `?${query}` : ''}`);
  },
};

// ── Relatório ──────────────────────────────────────────────────────────────────

export const relatorioAPI = {
  get: () => apiFetch('/relatorio'),
};

// ── Playlists (Criar Em) ───────────────────────────────────────────────────────

export const playlistsAPI = {
  listar: () => apiFetch('/playlists'),

  criar: (data) =>
    apiFetch('/playlists', { method: 'POST', body: JSON.stringify(data) }),

  detalhe: (id) =>
    apiFetch(`/playlists/${id}`),

  editar: (id, data) =>
    apiFetch(`/playlists/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  apagar: (id) =>
    apiFetch(`/playlists/${id}`, { method: 'DELETE' }),

  addFatura: (id, ids) =>
    apiFetch(`/playlists/${id}/faturas`, { method: 'POST', body: JSON.stringify({ fatura_ids: ids }) }),

  remFatura: (id, fid) =>
    apiFetch(`/playlists/${id}/faturas/${fid}`, { method: 'DELETE' }),

  partilhar: (id) =>
    apiFetch(`/playlists/${id}/partilhar`, { method: 'POST' }),

  juntar: (codigo) =>
    apiFetch(`/playlists/juntar/${codigo}`, { method: 'POST' }),

  membros: (id) =>
    apiFetch(`/playlists/${id}/membros`),

  sair: (id) =>
    apiFetch(`/playlists/${id}/sair`, { method: 'DELETE' }),
};

// ── Amigos / Conexões ──────────────────────────────────────────────────────────

export const amigosAPI = {
  listar: () => apiFetch('/amigos'),

  pedidos: () => apiFetch('/amigos/pedidos'),

  enviarPedido: (email) =>
    apiFetch('/amigos/pedido', { method: 'POST', body: JSON.stringify({ email }) }),

  aceitar: (id) =>
    apiFetch(`/amigos/${id}/aceitar`, { method: 'POST' }),

  rejeitar: (id) =>
    apiFetch(`/amigos/${id}/rejeitar`, { method: 'POST' }),
};
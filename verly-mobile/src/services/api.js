/**
 * src/services/api.js
 * Serviço central de comunicação com o backend Flask.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

let SecureStore = null;
try {
  SecureStore = require('expo-secure-store');
} catch (_) {
  SecureStore = null;
}

// ⚠️ Muda para o IP da tua máquina quando testares em dispositivo físico
const PROD_BASE_URL = 'https://verly-app-production.up.railway.app/api/v1';
const DEV_BASE_URL = 'http://10.0.2.2:5000/api/v1';
const ENV_BASE_URL =
  typeof process !== 'undefined'
    ? process.env?.EXPO_PUBLIC_API_URL
    : null;
const BASE_URL = ENV_BASE_URL || PROD_BASE_URL;
export const OPEN_BANKING_CALLBACK_URL = `${BASE_URL}/open-banking/callback`;

const ACCESS_TOKEN_KEY = 'verly_access_token';
const REFRESH_TOKEN_KEY = 'verly_refresh_token';
const LEGACY_TOKEN_KEY = '@verly_token';
const LEGACY_ACCESS_TOKEN_KEY = '@verly_access_token';
const LEGACY_REFRESH_TOKEN_KEY = '@verly_refresh_token';

// ── Token ──────────────────────────────────────────────────────────────────────

async function setStoredItem(key, value) {
  if (!value) return removeStoredItem(key);
  if (SecureStore?.setItemAsync) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

async function getStoredItem(key) {
  if (SecureStore?.getItemAsync) {
    const value = await SecureStore.getItemAsync(key);
    if (value) return value;
  }
  return AsyncStorage.getItem(key);
}

async function removeStoredItem(key) {
  if (SecureStore?.deleteItemAsync) {
    await SecureStore.deleteItemAsync(key);
  }
  await AsyncStorage.removeItem(key);
}

export const saveTokens = async ({ access_token, refresh_token }) => {
  if (access_token) await setStoredItem(ACCESS_TOKEN_KEY, access_token);
  if (refresh_token) await setStoredItem(REFRESH_TOKEN_KEY, refresh_token);
  await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
  await AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  await AsyncStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
};

export const saveToken = async (token) => saveTokens({ access_token: token });

export const getToken = async () => {
  const token = await getStoredItem(ACCESS_TOKEN_KEY);
  if (token) return token;

  const legacyToken = await AsyncStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken) {
    await setStoredItem(ACCESS_TOKEN_KEY, legacyToken);
    await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
    await AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
    await AsyncStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  }
  return legacyToken;
};

export const getRefreshToken = async () => getStoredItem(REFRESH_TOKEN_KEY);

export const removeTokens = async () => {
  await removeStoredItem(ACCESS_TOKEN_KEY);
  await removeStoredItem(REFRESH_TOKEN_KEY);
  await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
  await AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  await AsyncStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
};

export const removeToken = removeTokens;

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    const looksLikeHtml = /^\s*</.test(text) || /<!doctype|<html|<body/i.test(text);
    return {
      error: looksLikeHtml
        ? 'Erro interno do servidor. Tenta novamente daqui a pouco.'
        : text.slice(0, 300),
    };
  }
}

let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new Error('UNAUTHORIZED');

      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await parseJsonResponse(response);
      if (!response.ok || !data.access_token) {
        await removeTokens();
        throw new Error('UNAUTHORIZED');
      }
      await saveTokens({ access_token: data.access_token });
      return data.access_token;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function buildHeaders(options = {}, token = null) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  return {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
}

async function rawApiFetch(path, options = {}, token = null) {
  const { skipAuthRefresh, auth, ...fetchOptions } = options;
  return fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers: await buildHeaders(options, token),
  });
}

// ── Fetch base ─────────────────────────────────────────────────────────────────

export async function apiFetch(path, options = {}) {
  const token = options.auth === false ? null : await getToken();

  let response = await rawApiFetch(path, options, token);

  if (token && response.status === 401 && !options.skipAuthRefresh) {
    const nextToken = await refreshAccessToken();
    response = await rawApiFetch(path, options, nextToken);
  }

  const data = await parseJsonResponse(response);

  if (response.status === 401) {
    await removeTokens();
    throw new Error('UNAUTHORIZED');
  }

  if (!response.ok) {
    const err = new Error(data.error || data.message || `Erro ${response.status}`);
    err.code = data.code;
    throw err;
  }

  return data;
}

// ── Upload (multipart) ─────────────────────────────────────────────────────────

async function apiUpload(path, formData) {
  const token = await getToken();

  let response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (response.status === 401) {
    const nextToken = await refreshAccessToken();
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${nextToken}` },
      body: formData,
    });
  }

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data.error || data.message || `Erro ${response.status}`);
  }

  return data;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const authAPI = {
  login: (email, password) =>
    apiFetch('/auth/login', { method: 'POST', auth: false, body: JSON.stringify({ email, password }) }),

  register: (nome, email, password) =>
    apiFetch('/auth/register', { method: 'POST', auth: false, body: JSON.stringify({ nome, email, password }) }),

  me: () => apiFetch('/auth/me'),

  updateMe: (updates) =>
    apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify(updates) }),

  uploadAvatar: (image_base64) =>
    apiFetch('/auth/avatar', { method: 'POST', body: JSON.stringify({ image_base64 }) }),

  completeOnboarding: (answers) =>
    apiFetch('/auth/onboarding', { method: 'POST', body: JSON.stringify(answers) }),

  resendConfirm: (email) =>
    apiFetch('/auth/resend-confirm', { method: 'POST', auth: false, body: JSON.stringify({ email }) }),

  firebaseLogin: (idToken) =>
    apiFetch('/auth/firebase', { method: 'POST', auth: false, body: JSON.stringify({ idToken }) }),

  logout: async () => {
    const refresh_token = await getRefreshToken();
    return apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token }),
    });
  },

  deleteAccount: () =>
    apiFetch('/auth/account', { method: 'DELETE' }),
};

// ── Onboarding ─────────────────────────────────────────────────────────────────

export const onboardingAPI = {
  save: (answers) =>
    apiFetch('/onboarding', { method: 'POST', body: JSON.stringify(answers) }),

  status: () => apiFetch('/onboarding/status'),
};

// ── Dashboard ──────────────────────────────────────────────────────────────────

export const dashboardAPI = {
  get: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/dashboard${query ? `?${query}` : ''}`);
  },
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

// ── Chat (IA) ──────────────────────────────────────────────────────────────────

export const chatAPI = {
  enviar: (mensagem, thread_id) =>
    apiFetch('/chat/mensagem', { method: 'POST', body: JSON.stringify({ mensagem, thread_id }) }),

  historico: (limite = 20, thread_id) =>
    apiFetch(`/chat/historico?limite=${limite}${thread_id ? `&thread_id=${encodeURIComponent(thread_id)}` : ''}`),

  threads: (limite = 40) =>
    apiFetch(`/chat/threads?limite=${limite}`),

  apagarThread: (thread_id) =>
    apiFetch(`/chat/threads/${encodeURIComponent(thread_id)}`, { method: 'DELETE' }),

  limpar: () =>
    apiFetch('/chat/limpar', { method: 'POST' }),
};

// ── Subscrições ────────────────────────────────────────────────────────────────

export const semanticAPI = {
  search: (query, limit = 8) =>
    apiFetch(`/semantic/search?q=${encodeURIComponent(query || '')}&limit=${limit}`),

  reindex: () =>
    apiFetch('/semantic/reindex', { method: 'POST' }),
};

export const subscricoesAPI = {
  listar: () => apiFetch('/subscricoes'),
  detetar: () => apiFetch('/subscricoes/detetar', { method: 'POST' }),
  apagar: (id) => apiFetch(`/subscricoes/${id}`, { method: 'DELETE' }),
};

// ── Metas ──────────────────────────────────────────────────────────────────────

export const metasAPI = {
  listar: () => apiFetch('/metas'),

  criar: (nomeOrData, limite, categoria) => {
    const payload = typeof nomeOrData === 'object' && nomeOrData !== null
      ? {
          nome: nomeOrData.nome || nomeOrData.categoria,
          categoria: nomeOrData.categoria,
          limite: nomeOrData.limite ?? nomeOrData.valor_limite,
        }
      : { nome: nomeOrData, limite, categoria };
    return apiFetch('/metas', { method: 'POST', body: JSON.stringify(payload) });
  },

  apagar: (id) =>
    apiFetch(`/metas/${id}`, { method: 'DELETE' }),

  eliminar: (id) =>
    apiFetch(`/metas/${id}`, { method: 'DELETE' }),
};

// ── Estatísticas ───────────────────────────────────────────────────────────────

export const estatisticasAPI = {
  get: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/estatisticas${query ? `?${query}` : ''}`);
  },
};

// ── Score de Compras ───────────────────────────────────────────────────────────

export const scoreAPI = {
  analisar: ({ item, preco, categoria, uso }) =>
    apiFetch('/scoring/analisar', { method: 'POST', body: JSON.stringify({ item, preco, categoria, uso }) })
      .then(data => data.resultado || data),

  scoreFatura: (faturaId) =>
    apiFetch(`/scoring/fatura/${faturaId}`).then(data => data.resultado || data),

  lojasProximas: ({ item, categoria, lat, lng }) =>
    apiFetch('/scoring/lojas-proximas', { method: 'POST', body: JSON.stringify({ item, categoria, lat, lng }) }),

  precos: ({ item, categoria }) =>
    apiFetch('/scoring/precos', { method: 'POST', body: JSON.stringify({ item, categoria }) }),
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

// ── Playlists ──────────────────────────────────────────────────────────────────

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

  buscar: (q) => apiFetch(`/utilizadores/buscar?q=${encodeURIComponent(q)}`),

  enviarPedido: (email) =>
    apiFetch('/amigos/pedido', { method: 'POST', body: JSON.stringify({ email }) }),

  aceitar: (id) =>
    apiFetch(`/amigos/${id}/aceitar`, { method: 'POST' }),

  rejeitar: (id) =>
    apiFetch(`/amigos/${id}/rejeitar`, { method: 'POST' }),
};

// ── Gmail Import ───────────────────────────────────────────────────────────────

export const gmailAPI = {
  authUrl:    () => apiFetch('/gmail/auth-url'),
  status:     () => apiFetch('/gmail/status'),
  sync:       () => apiFetch('/gmail/sync', { method: 'POST' }),
  syncStatus: () => apiFetch('/gmail/sync/status'),
  disconnect: () => apiFetch('/gmail/disconnect', { method: 'DELETE' }),
};

export const preferencesAPI = {
  get: () => apiFetch('/preferences'),
  update: (data) =>
    apiFetch('/preferences', { method: 'PATCH', body: JSON.stringify(data) }),
};

export const billsAPI = {
  listar: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/bills${query ? `?${query}` : ''}`);
  },
  criar: (data) =>
    apiFetch('/bills', { method: 'POST', body: JSON.stringify(data) }),
  atualizar: (id, data) =>
    apiFetch(`/bills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  apagar: (id) =>
    apiFetch(`/bills/${id}`, { method: 'DELETE' }),
};

export const calendarAPI = {
  status: () => apiFetch('/calendar/status'),
  connect: (provider) =>
    apiFetch('/calendar/connect', { method: 'POST', body: JSON.stringify({ provider }) }),
  exportUrl: async () => {
    const token = await getToken();
    return `${BASE_URL}/calendar/export.ics?_token=${token}`;
  },
};

export const familiaAPI = {
  get: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/familia${query ? `?${query}` : ''}`);
  },
  criar: (data) =>
    apiFetch('/familia', { method: 'POST', body: JSON.stringify(data) }),
  atualizar: (data) =>
    apiFetch('/familia', { method: 'PATCH', body: JSON.stringify(data) }),
  convidar: (email, role = 'partner') =>
    apiFetch('/familia/invite', { method: 'POST', body: JSON.stringify({ email, role }) }),
  convites: () => apiFetch('/familia/invites'),
  aceitarConvite: (token) =>
    apiFetch(`/familia/invites/${token}/accept`, { method: 'POST' }),
  recusarConvite: (token) =>
    apiFetch(`/familia/invites/${token}/decline`, { method: 'POST' }),
  atualizarMembro: (memberId, data) =>
    apiFetch(`/familia/members/${memberId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removerMembro: (memberId) =>
    apiFetch(`/familia/members/${memberId}`, { method: 'DELETE' }),
  contas: () => apiFetch('/familia/accounts'),
  atualizarContas: (account_ids) =>
    apiFetch('/familia/accounts', { method: 'PATCH', body: JSON.stringify({ account_ids }) }),
  salvarBudgetCategoria: (data) =>
    apiFetch('/familia/category-budgets', { method: 'POST', body: JSON.stringify(data) }),
  apagarBudgetCategoria: (id) =>
    apiFetch(`/familia/category-budgets/${id}`, { method: 'DELETE' }),
  marcarDespesa: (data) =>
    apiFetch('/familia/expenses/tag', { method: 'PATCH', body: JSON.stringify(data) }),
};

export const discoverAPI = {
  news: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/discover/news${query ? `?${query}` : ''}`);
  },
};

export const refundRadarAPI = {
  listar: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/refund-radar${query ? `?${query}` : ''}`);
  },
  atualizarEstado: (data) =>
    apiFetch('/refund-radar/state', { method: 'PATCH', body: JSON.stringify(data) }),
};

export const liveDealsAPI = {
  search: (data) =>
    apiFetch('/live-deals/search', { method: 'POST', body: JSON.stringify(data) }),

  watchlist: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/live-deals/watchlist${query ? `?${query}` : ''}`);
  },

  addWatch: (data) =>
    apiFetch('/live-deals/watchlist', { method: 'POST', body: JSON.stringify(data) }),

  updateWatch: (id, data) =>
    apiFetch(`/live-deals/watchlist/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteWatch: (id) =>
    apiFetch(`/live-deals/watchlist/${id}`, { method: 'DELETE' }),

  checkWatch: (id) =>
    apiFetch(`/live-deals/watchlist/${id}/check`, { method: 'POST' }),

  replay: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/live-deals/replay${query ? `?${query}` : ''}`);
  },
};

export const replayAPI = {
  mensal: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/live-deals/replay${query ? `?${query}` : ''}`);
  },
};

export const openBankingAPI = {
  status: () => apiFetch('/open-banking/status'),

  institutions: (country = 'PT') =>
    apiFetch(`/open-banking/institutions?country=${encodeURIComponent(country)}`),

  connect: ({ institution_id, institution_name, country, redirect_url, psu_type } = {}) =>
    apiFetch('/open-banking/connect', {
      method: 'POST',
      body: JSON.stringify({ institution_id, institution_name, country, redirect_url, psu_type }),
    }),

  callback: (payload) =>
    apiFetch('/open-banking/callback', {
      method: 'POST',
      body: JSON.stringify(typeof payload === 'string' ? { reference: payload } : payload),
    }),

  accounts: () => apiFetch('/open-banking/accounts'),

  summary: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/open-banking/summary${query ? `?${query}` : ''}`);
  },

  sync: () => apiFetch('/open-banking/sync', { method: 'POST' }),

  transactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/open-banking/transactions${query ? `?${query}` : ''}`);
  },
};

// ── Garantias & Resumo ─────────────────────────────────────────────────────────

export const netWorthAPI = {
  get: () => apiFetch('/networth'),
  criarItem: (data) =>
    apiFetch('/networth/items', { method: 'POST', body: JSON.stringify(data) }),
  atualizarItem: (id, data) =>
    apiFetch(`/networth/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  apagarItem: (id) =>
    apiFetch(`/networth/items/${id}`, { method: 'DELETE' }),
};

export const garantiasAPI = {
  resumo: () => apiFetch('/exportar/resumo'),
};

// ── Exportar PDF ───────────────────────────────────────────────────────────────

export const exportarAPI = {
  pdfUrl: async () => {
    const token = await getToken();
    return `${BASE_URL}/exportar/pdf?_token=${token}`;
  },
};

// ── Push Notifications ─────────────────────────────────────────────────────────

export const pushAPI = {
  registarToken: (fcm_token) =>
    apiFetch('/push/token', { method: 'POST', body: JSON.stringify({ fcm_token }) }),

  removerToken: () =>
    apiFetch('/push/token', { method: 'DELETE' }),

  testar: () =>
    apiFetch('/push/test', { method: 'POST' }),
};

// ── Poupança ───────────────────────────────────────────────────────────────────

export const poupancaAPI = {
  get: () => apiFetch('/poupanca'),
};

// ── Grupos ─────────────────────────────────────────────────────────────────────

export const gruposAPI = {
  // CRUD base
  listar:   () => apiFetch('/grupos'),
  criar:    (data) => apiFetch('/grupos', { method: 'POST', body: JSON.stringify(data) }),
  detalhe:  (id) => apiFetch(`/grupos/${id}`),
  convidar: (id, user_id) => apiFetch(`/grupos/${id}/convidar`, { method: 'POST', body: JSON.stringify({ user_id }) }),
  sair:     (id) => apiFetch(`/grupos/${id}/sair`, { method: 'POST' }),

  despesas: (grupoId) => apiFetch(`/grupos/${grupoId}/despesas`),
  criarDespesa: (grupoId, data) =>
    apiFetch(`/grupos/${grupoId}/despesas`, { method: 'POST', body: JSON.stringify(data) }),
  apagarDespesa: (grupoId, despesaId) =>
    apiFetch(`/grupos/${grupoId}/despesas/${despesaId}`, { method: 'DELETE' }),

  // ── Chat de grupo ──────────────────────────────────────────────────────────
  // GET  /grupos/:id/chat?limite=50&antes_de=<msg_id>
  chatHistorico: (grupoId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/grupos/${grupoId}/chat${query ? `?${query}` : ''}`);
  },

  // POST /grupos/:id/chat   { texto }
  chatEnviar: (grupoId, texto) =>
    apiFetch(`/grupos/${grupoId}/chat`, { method: 'POST', body: JSON.stringify({ texto }) }),

  // POST /grupos/:id/chat/:msgId/reagir   { emoji }
  chatReagir: (grupoId, msgId, emoji) =>
    apiFetch(`/grupos/${grupoId}/chat/${msgId}/reagir`, { method: 'POST', body: JSON.stringify({ emoji }) }),

  // ── Feed de atividade ──────────────────────────────────────────────────────
  // GET  /grupos/:id/feed?limite=20
  feed: (grupoId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/grupos/${grupoId}/feed${query ? `?${query}` : ''}`);
  },

  // ── Streak de grupo ────────────────────────────────────────────────────────
  // GET  /grupos/:id/streak
  streak: (grupoId) => apiFetch(`/grupos/${grupoId}/streak`),

  // POST /grupos/:id/streak/check-in
  streakCheckIn: (grupoId) =>
    apiFetch(`/grupos/${grupoId}/streak/check-in`, { method: 'POST' }),
};

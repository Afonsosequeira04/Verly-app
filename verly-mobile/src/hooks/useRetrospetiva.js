// src/hooks/useRetrospetiva.js
// Cache local por periodo — evita fetch repetido ao navegar entre meses
// Uso:
//   const { data, loading, carregar, invalidar } = useRetrospetiva();
//   carregar(2025, 5); // so faz fetch se nao tiver em cache

import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '../services/api';

export function useRetrospetiva() {
  const cache = useRef({});  // { '2025-05': { ...dados } }
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mesesDisponiveis, setMesesDisponiveis] = useState([]);

  const carregar = useCallback(async (ano, mes, forceRefresh = false) => {
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;

    // Se tiver em cache e nao for refresh forcado, usa o cache
    if (!forceRefresh && cache.current[chave]) {
      setData(cache.current[chave]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const res = await apiFetch(`/estatisticas/mensal?ano=${ano}&mes=${mes}`);
      cache.current[chave] = res;
      setData(res);
      if (res.meses_disponiveis && res.meses_disponiveis.length) {
        setMesesDisponiveis(res.meses_disponiveis);
      }
    } catch (e) {
      console.error('useRetrospetiva:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback((ano, mes) => {
    setRefreshing(true);
    carregar(ano, mes, true); // forca novo fetch
  }, [carregar]);

  // Limpa o cache (ex: apos upload de nova fatura)
  const invalidar = useCallback((ano, mes) => {
    if (ano && mes) {
      const chave = `${ano}-${String(mes).padStart(2, '0')}`;
      delete cache.current[chave];
    } else {
      cache.current = {};
    }
  }, []);

  return { data, loading, refreshing, mesesDisponiveis, carregar, onRefresh, invalidar, setLoading };
}
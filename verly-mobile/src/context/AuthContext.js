/**
 * src/context/AuthContext.js
 * Contexto global de autenticação.
 * Disponibiliza o utilizador e as funções de login/logout para toda a app.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, saveToken, removeToken, getToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true); // a verificar token guardado

  // Ao arrancar a app: verificar se há token guardado
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const data = await authAPI.me();
          setUser(data.user);
        }
      } catch {
        // Token inválido ou expirado → ignorar
        await removeToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const data = await authAPI.login(email, password);
    await saveToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (nome, email, password) => {
    const data = await authAPI.register(nome, email, password);
    await saveToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await removeToken();
    setUser(null);
  };

  const updateUser = (updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
};

/**
 * src/context/AuthContext.js
 * Contexto global de autenticação — com Google Sign-In via Firebase
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, saveToken, removeToken, getToken } from '../services/api';

// ── Google Sign-In ────────────────────────────────────────────────────────────
let GoogleSignin, statusCodes, firebaseAuth, GoogleAuthProvider;

try {
  const googleModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleModule.GoogleSignin;
  statusCodes = googleModule.statusCodes;

  const firebaseModule = require('@react-native-firebase/auth');
  firebaseAuth = firebaseModule.default;
  GoogleAuthProvider = firebaseModule.GoogleAuthProvider;

  GoogleSignin.configure({
    webClientId: '667118060597-ki0jv2und99igqr97ar9md33nvin6e1l.apps.googleusercontent.com',
  });
} catch (_) {
  console.warn('[AuthContext] Firebase/Google Sign-In não instalado — funcionalidade desativada.');
}

// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const data = await authAPI.me();
          setUser(data.user);
        }
      } catch {
        await removeToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Login com Email + Password ────────────────────────────────────────────
  const login = async (email, password) => {
    const data = await authAPI.login(email, password);
    await saveToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  // ── Registo — NÃO faz login automático, envia email de confirmação ────────
  const register = async (nome, email, password) => {
    const data = await authAPI.register(nome, email, password);
    // Não guarda token nem atualiza user — utilizador precisa de confirmar email
    return { email, message: data.message };
  };

  // ── Google Sign-In ────────────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    if (!GoogleSignin || !firebaseAuth) {
      throw new Error('Google Sign-In não está configurado.');
    }

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const googleUser = await GoogleSignin.signIn();
      const { idToken } = googleUser;

      const googleCredential = GoogleAuthProvider.credential(idToken);
      const firebaseUserCred = await firebaseAuth().signInWithCredential(googleCredential);

      const firebaseToken = await firebaseUserCred.user.getIdToken();

      const data = await authAPI.firebaseLogin(firebaseToken);
      await saveToken(data.access_token);
      setUser(data.user);
      return data.user;
    } catch (err) {
      if (statusCodes && err.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('LOGIN_CANCELADO');
      }
      throw err;
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    await removeToken();
    setUser(null);
    try {
      if (GoogleSignin) await GoogleSignin.signOut();
    } catch (_) {}
  };

  // ── Atualizar user no contexto ────────────────────────────────────────────
  const updateUser = (updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loginWithGoogle, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
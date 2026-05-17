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

// ── FCM Push Notifications ────────────────────────────────────────────────────
let messaging;
try {
  messaging = require('@react-native-firebase/messaging').default;
} catch (_) {
  console.warn('[AuthContext] Firebase Messaging não instalado — push desativado.');
}

async function registarTokenFCM(pushAPI) {
  try {
    if (!messaging) return;

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('[FCM] Permissão de notificações não concedida.');
      return;
    }

    const token = await messaging().getToken();
    if (token) {
      await pushAPI.registarToken(token);
      console.log('[FCM] Token registado com sucesso.');
    }
  } catch (e) {
    console.warn('[FCM] Erro ao registar token:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Importação lazy do pushAPI para evitar dependência circular
  const getPushAPI = () => {
    try {
      return require('../services/api').pushAPI;
    } catch (_) {
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const data = await authAPI.me();
          setUser(data.user);
          // Re-registar token FCM ao arrancar (token pode ter mudado)
          const pushAPI = getPushAPI();
          if (pushAPI) registarTokenFCM(pushAPI);
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

    // Registar token FCM após login
    const pushAPI = getPushAPI();
    if (pushAPI) registarTokenFCM(pushAPI);

    return data.user;
  };

  // ── Registo — NÃO faz login automático, envia email de confirmação ────────
  const register = async (nome, email, password) => {
    const data = await authAPI.register(nome, email, password);
    return { email, message: data.message };
  };

  // ── Google Sign-In ────────────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    if (!GoogleSignin || !firebaseAuth) {
      throw new Error('Google Sign-In não está configurado.');
    }

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const result = await GoogleSignin.signIn();

      // Compatibilidade com v12+ (retorna { data: { idToken } }) e versões anteriores
      const idToken = result?.data?.idToken ?? result?.idToken;

      if (!idToken) {
        throw new Error('Não foi possível obter o token do Google.');
      }

      const googleCredential = GoogleAuthProvider.credential(idToken);
      const firebaseUserCred = await firebaseAuth().signInWithCredential(googleCredential);

      const firebaseToken = await firebaseUserCred.user.getIdToken();

      const data = await authAPI.firebaseLogin(firebaseToken);
      await saveToken(data.access_token);
      setUser(data.user);

      // Registar token FCM após login com Google
      const pushAPI = getPushAPI();
      if (pushAPI) registarTokenFCM(pushAPI);

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
    // Remover token FCM do backend antes de fazer logout
    try {
      const pushAPI = getPushAPI();
      if (pushAPI && messaging) {
        const fcmToken = await messaging().getToken();
        if (fcmToken) await pushAPI.removerToken(fcmToken);
      }
    } catch (_) {}

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
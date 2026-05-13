/**
 * src/context/AuthContext.js
 * Contexto global de autenticação — com Google Sign-In via Firebase
 *
 * Instalação necessária:
 *   npx expo install @react-native-firebase/app @react-native-firebase/auth
 *   npx expo install @react-native-google-signin/google-signin
 *
 * Também precisas de configurar:
 *   - google-services.json (Android) em verly-mobile/android/app/
 *   - GoogleService-Info.plist (iOS) em verly-mobile/ios/VerlyMobile/
 *   - WEB_CLIENT_ID no ficheiro abaixo (vem do Firebase Console → Auth → Google → Web client ID)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, saveToken, removeToken, getToken } from '../services/api';

// ── Google Sign-In ────────────────────────────────────────────────────────────
// Importações só ativam se os pacotes estiverem instalados.
// Se ainda não instalaste, estas linhas vão dar erro — comenta-as até instalares.
let GoogleSignin, statusCodes, firebaseAuth, GoogleAuthProvider;

try {
  const googleModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleModule.GoogleSignin;
  statusCodes = googleModule.statusCodes;

  const firebaseModule = require('@react-native-firebase/auth');
  firebaseAuth = firebaseModule.default;
  GoogleAuthProvider = firebaseModule.GoogleAuthProvider;

  // Configura Google Sign-In (substitui pelo teu Web Client ID do Firebase Console)
  GoogleSignin.configure({
    webClientId: '667118060597-ki0jv2und99igqr97ar9md33nvin6e1l.apps.googleusercontent.com',
    // Exemplo: '123456789-abc.apps.googleusercontent.com'
  });
} catch (_) {
  console.warn('[AuthContext] Firebase/Google Sign-In não instalado — funcionalidade desativada.');
}

// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Verificar token guardado ao arrancar
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

  // ── Login com Email + Password (existente) ────────────────────────────────
  const login = async (email, password) => {
    const data = await authAPI.login(email, password);
    await saveToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  // ── Registo com Email + Password (existente) ──────────────────────────────
  const register = async (nome, email, password) => {
    const data = await authAPI.register(nome, email, password);
    await saveToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  // ── Google Sign-In ────────────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    if (!GoogleSignin || !firebaseAuth) {
      throw new Error('Google Sign-In não está configurado. Instala @react-native-google-signin/google-signin e @react-native-firebase/auth.');
    }

    try {
      // 1. Verificar Google Play Services (Android)
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // 2. Login com conta Google → obter idToken do Google
      const googleUser = await GoogleSignin.signIn();
      const { idToken } = googleUser;

      // 3. Trocar idToken Google por credencial Firebase
      const googleCredential = GoogleAuthProvider.credential(idToken);
      const firebaseUserCred = await firebaseAuth().signInWithCredential(googleCredential);

      // 4. Obter idToken do Firebase (é este que mandamos ao Flask)
      const firebaseToken = await firebaseUserCred.user.getIdToken();

      // 5. Enviar ao nosso backend → receber o nosso JWT
      const data = await authAPI.firebaseLogin(firebaseToken);
      await saveToken(data.access_token);
      setUser(data.user);
      return data.user;

    } catch (error) {
      if (statusCodes && error.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('LOGIN_CANCELADO');
      } else if (statusCodes && error.code === statusCodes.IN_PROGRESS) {
        throw new Error('Login já em progresso.');
      } else if (statusCodes && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services não disponível.');
      }
      throw error;
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    await removeToken();
    // Também faz logout do Google se estava autenticado
    if (GoogleSignin) {
      try { await GoogleSignin.signOut(); } catch (_) {}
    }
    setUser(null);
  };

  // ── Atualizar dados do utilizador localmente ──────────────────────────────
  const updateUser = (updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  };

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, register, loginWithGoogle,
      logout, updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
};
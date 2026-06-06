/**
 * src/context/RevenueCatContext.js
 * Contexto global do RevenueCat — gere estado de subscrição Pro
 *
 * SETUP:
 *  1. npx expo install react-native-purchases
 *  2. Substitui REVENUECAT_API_KEY pela tua chave do dashboard RevenueCat
 *  3. Faz rebuild: npx expo run:android
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';

// ─── Chave da API RevenueCat ──────────────────────────────────────────────────
const REVENUECAT_API_KEY = 'test_PaPHjphKtBySNVRyxQMJMumfHtR';
const PRO_ENTITLEMENT = 'Verly Pro';

// ─── Import condicional (não quebra sem rebuild) ──────────────────────────────
let Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch (_) {
  console.warn('[RevenueCat] react-native-purchases não instalado — faz: npx expo install react-native-purchases && npx expo run:android');
}

// ─── Context ──────────────────────────────────────────────────────────────────
const RevenueCatContext = createContext({
  isPro:        false,
  offerings:    null,
  customerInfo: null,
  loading:      true,
  purchase:     async () => {},
  restore:      async () => {},
  refresh:      async () => {},
});

export function RevenueCatProvider({ children, userId }) {
  const [isPro,        setIsPro]        = useState(false);
  const [offerings,    setOfferings]    = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [loading,      setLoading]      = useState(true);

  // ── Inicialização ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!Purchases) { setLoading(false); return; }
    (async () => {
      try {
        Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
        await Purchases.configure({ apiKey: REVENUECAT_API_KEY });

        // Liga o utilizador ao RevenueCat se tiver ID
        if (userId) {
          await Purchases.logIn(String(userId));
        }

        await _refresh();
      } catch (e) {
        console.warn('[RevenueCat] Erro na inicialização:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // ── Refresh estado ───────────────────────────────────────────────────────
  const _refresh = async () => {
    if (!Purchases) return;
    try {
      const [info, off] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ]);
      setCustomerInfo(info);
      setOfferings(off.current);
      setIsPro(info.entitlements.active[PRO_ENTITLEMENT] !== undefined);
    } catch (e) {
      console.warn('[RevenueCat] Erro ao fazer refresh:', e);
    }
  };

  // ── Comprar pacote ───────────────────────────────────────────────────────
  const purchase = async (pkg) => {
    if (!Purchases) throw new Error('RevenueCat não inicializado');
    const { customerInfo: info } = await Purchases.purchasePackage(pkg);
    setCustomerInfo(info);
    const pro = info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
    setIsPro(pro);
    return pro;
  };

  // ── Restaurar compras ────────────────────────────────────────────────────
  const restore = async () => {
    if (!Purchases) throw new Error('RevenueCat não inicializado');
    const info = await Purchases.restorePurchases();
    setCustomerInfo(info);
    const pro = info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
    setIsPro(pro);
    return pro;
  };

  return (
    <RevenueCatContext.Provider value={{
      isPro,
      offerings,
      customerInfo,
      loading,
      purchase,
      restore,
      refresh: _refresh,
    }}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export const useRevenueCat = () => useContext(RevenueCatContext);

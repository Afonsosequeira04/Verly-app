/**
 * AdMob — Como integrar na Verly
 *
 * Instalação:
 *   npx expo install react-native-google-mobile-ads
 *
 * Em app.json, adicionar DENTRO de "expo" → "plugins":
 * {
 *   "expo": {
 *     "plugins": [
 *       [
 *         "react-native-google-mobile-ads",
 *         {
 *           "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX",
 *           "iosAppId":     "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
 *         }
 *       ]
 *     ]
 *   }
 * }
 *
 * Os IDs vêm do Google AdMob Console (admob.google.com).
 * Durante desenvolvimento usa TestIds — NUNCA uses IDs reais em debug.
 */

import React, { useEffect, useRef } from 'react';
import { View, Platform } from 'react-native';
import {
  BannerAd,
  BannerAdSize,
  TestIds,
  InterstitialAd,
  AdEventType,
  AppOpenAd,
} from 'react-native-google-mobile-ads';

// ── IDs das tuas unidades de anúncio (substitui pelos reais após aprovação) ──
const AD_UNITS = {
  banner:        __DEV__ ? TestIds.BANNER        : 'ca-app-pub-XXXX/BANNER_ID',
  interstitial:  __DEV__ ? TestIds.INTERSTITIAL  : 'ca-app-pub-XXXX/INTERSTITIAL_ID',
};

// ── 1. Banner — cola no fundo de DashboardScreen e HistoricoScreen ───────────
export function BannerAdBottom() {
  return (
    <View style={{ alignItems: 'center', paddingBottom: 8 }}>
      <BannerAd
        unitId={AD_UNITS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdFailedToLoad={(err) => console.warn('AdMob banner erro:', err)}
      />
    </View>
  );
}

// ── 2. Intersticial — mostra depois de upload de fatura ──────────────────────
//
// Como usar em FaturasScreen.js:
//
//   import { useInterstitialAd } from './AdMobConfig';   ← este ficheiro
//
//   export default function FaturasScreen() {
//     const { mostrarAnuncio } = useInterstitialAd();
//
//     const handleUploadCompleto = async () => {
//       await faturasAPI.upload(...);
//       mostrarAnuncio();  // mostra depois de carregar a fatura
//     };
//   }

export function useInterstitialAd() {
  const interstitial = useRef(
    InterstitialAd.createForAdRequest(AD_UNITS.interstitial, {
      requestNonPersonalizedAdsOnly: false,
    })
  ).current;

  const loaded = useRef(false);

  useEffect(() => {
    const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      loaded.current = true;
    });
    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      loaded.current = false;
      interstitial.load(); // pré-carregar o próximo
    });

    interstitial.load(); // carregar ao montar

    return () => {
      unsubLoaded();
      unsubClosed();
    };
  }, []);

  const mostrarAnuncio = () => {
    if (loaded.current) {
      interstitial.show();
    }
    // Se não estiver carregado, não faz nada — não bloqueia o utilizador
  };

  return { mostrarAnuncio };
}


// ── 3. Onde meter anúncios ───────────────────────────────────────────────────
//
// DashboardScreen  → <BannerAdBottom /> no fundo do ScrollView
// HistoricoScreen  → <BannerAdBottom /> no fundo do ScrollView
// FaturasScreen    → useInterstitialAd() após upload bem-sucedido
// RelatorioScreen  → useInterstitialAd() após gerar relatório
//
// NÃO meter em:
//   - OnboardingScreen (afasta utilizadores novos)
//   - ChatScreen (interrompe o fluxo principal)
//   - LoginScreen / RegisterScreen
//
// ── 4. iOS — App Tracking Transparency (obrigatório pela Apple) ──────────────
//
// Em app.json adicionar:
// {
//   "expo": {
//     "ios": {
//       "infoPlist": {
//         "NSUserTrackingUsageDescription": "Usamos os teus dados para mostrar anúncios relevantes."
//       }
//     }
//   }
// }
//
// E no App.js, ANTES de mostrar qualquer anúncio:
//
//   import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
//
//   useEffect(() => {
//     (async () => {
//       const { status } = await requestTrackingPermissionsAsync();
//       // status === 'granted' → anúncios personalizados
//       // status !== 'granted' → anúncios não personalizados (ganhas menos mas é legal)
//     })();
//   }, []);
/**
 * src/screens/SubscricoesScreen.js
 * Ecrã "Modo Pro" — paywall + estado de subscrição ativa
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Alert, TouchableOpacity, ScrollView,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, ZoomIn,
} from 'react-native-reanimated';
import { MotiView, MotiText } from 'moti';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import { useRevenueCat } from '../context/RevenueCatContext';

const C = COLORS;

// Cores por tier
const TIER = {
  MONTHLY:  { color: '#CD7F32', label: '🥉 Bronze', glow: 'rgba(205,127,50,0.15)',  border: 'rgba(205,127,50,0.35)' },
  ANNUAL:   { color: '#C0C0C0', label: '🥈 Prata',  glow: 'rgba(192,192,192,0.12)', border: 'rgba(192,192,192,0.3)' },
  LIFETIME: { color: '#FFD700', label: '🥇 Ouro',   glow: 'rgba(255,215,0,0.15)',   border: 'rgba(255,215,0,0.35)' },
};

// ─── Ecrã Pro Ativo ───────────────────────────────────────────────────────────
function ProActiveScreen({ offerings, restore }) {
  const [loading, setLoading] = useState(false);

  // Tenta encontrar o plano ativo pelo packageType
  const packages = offerings?.availablePackages || [];
  const activePkg = packages.find(p =>
    p.packageType === 'ANNUAL' || p.packageType === 'LIFETIME' || p.packageType === 'MONTHLY'
  );

  const handleRestore = async () => {
    setLoading(true);
    try {
      await restore();
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: '🔍', label: 'Leak Detector', desc: 'Deteta subscrições que drenam a tua conta' },
    { icon: '⚡', label: 'Alertas em tempo real', desc: 'Notificações de desperdício automáticas' },
    { icon: '📊', label: 'Relatórios detalhados', desc: 'Análise mensal completa das tuas despesas' },
    { icon: '🤖', label: 'Chat IA ilimitado', desc: 'Sem limites de mensagens com a IA' },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header Pro */}
      <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.proHeader}>
        <MotiView
          from={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', delay: 100, damping: 16 }}
          style={styles.proIconBox}
        >
          <Text style={{ fontSize: 44 }}>👑</Text>
        </MotiView>

        <MotiText
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', delay: 200 }}
          style={styles.proTitle}
        >
          Verly Pro
        </MotiText>

        <Animated.View entering={ZoomIn.delay(300).springify()} style={styles.proActiveBadge}>
          <Text style={styles.proActiveBadgeText}>✦ ATIVO</Text>
        </Animated.View>

        {activePkg && (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 400 }}
            style={styles.planBox}
          >
            <Text style={styles.planLabel}>O TEU PLANO</Text>
            <Text style={styles.planName}>{activePkg.product.title}</Text>
            <Text style={styles.planPrice}>
              {activePkg.product.priceString}
              {activePkg.packageType === 'ANNUAL'   ? ' / ano'  :
               activePkg.packageType === 'MONTHLY'  ? ' / mês'  :
               activePkg.packageType === 'LIFETIME' ? ' (vitalício)' : ''}
            </Text>
          </MotiView>
        )}
      </Animated.View>

      {/* Features desbloqueadas */}
      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <Text style={styles.sectionLabel}>FUNCIONALIDADES DESBLOQUEADAS</Text>
        <View style={styles.featuresGrid}>
          {features.map((f, i) => (
            <Animated.View
              key={i}
              entering={FadeInDown.delay(250 + i * 60).springify()}
              style={styles.featCard}
            >
              <Text style={{ fontSize: 26, marginBottom: 8 }}>{f.icon}</Text>
              <Text style={styles.featCardLabel}>{f.label}</Text>
              <Text style={styles.featCardDesc}>{f.desc}</Text>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      {/* Restaurar */}
      <Pressable onPress={handleRestore} disabled={loading} style={{ alignItems: 'center', marginTop: 24 }}>
        <Text style={{ fontSize: 12, color: C.textMid }}>Restaurar compras</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Paywall (não Pro) ────────────────────────────────────────────────────────
function PaywallScreen({ offerings, purchase, restore }) {
  const [loading, setLoading] = useState(false);

  const packages = offerings?.availablePackages || [];

  // Ordenar: Monthly primeiro (destaque), depois Yearly, depois Lifetime
  const order = { MONTHLY: 0, ANNUAL: 1, LIFETIME: 2 };
  const sorted = [...packages].sort((a, b) =>
    (order[a.packageType] ?? 9) - (order[b.packageType] ?? 9)
  );

  const handlePurchase = async (pkg) => {
    setLoading(true);
    try {
      const isPro = await purchase(pkg);
      if (isPro) {
        Alert.alert('🎉 Bem-vindo ao Pro!', 'A tua conta foi atualizada.');
      }
    } catch (e) {
      if (!e.userCancelled) Alert.alert('Erro na compra', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const isPro = await restore();
      if (!isPro) Alert.alert('Sem compras', 'Nenhuma subscrição ativa encontrada.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    'Deteção automática de subscrições',
    'Alertas de desperdício em tempo real',
    'Relatórios mensais detalhados',
    'Chat com IA ilimitado',
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400).springify()} style={{ alignItems: 'center', marginBottom: 32 }}>
        <MotiView
          from={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', delay: 100, damping: 16 }}
          style={styles.proIconBox}
        >
          <Text style={{ fontSize: 44 }}>👑</Text>
        </MotiView>
        <Text style={styles.proTitle}>Verly Pro</Text>
        <Text style={styles.proSubtitle}>Desbloqueia tudo. Sem limites.</Text>
      </Animated.View>

      {/* Features */}
      {features.map((feat, i) => (
        <Animated.View
          key={i}
          entering={FadeInDown.delay(150 + i * 60).springify()}
          style={styles.featRow}
        >
          <View style={styles.featDot} />
          <Text style={styles.featText}>{feat}</Text>
        </Animated.View>
      ))}

      {/* Packages */}
      <View style={{ gap: 10, marginTop: 28 }}>
        {sorted.length === 0 ? (
          <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 300 }}>
            <Pressable style={[styles.pkgBtn, styles.pkgBtnPrimary]} disabled>
              <Text style={styles.pkgBtnText}>A carregar planos...</Text>
            </Pressable>
          </MotiView>
        ) : (
          sorted.map((pkg, i) => {
            const tier = TIER[pkg.packageType] || TIER.MONTHLY;
            const period =
              pkg.packageType === 'ANNUAL'   ? '/ ano'       :
              pkg.packageType === 'LIFETIME' ? '(vitalício)' : '/ mês';
            return (
              <Animated.View key={pkg.identifier} entering={FadeInDown.delay(300 + i * 80).springify()}>
                <Pressable
                  style={[styles.pkgBtn, {
                    backgroundColor: tier.glow,
                    borderColor: tier.border,
                  }]}
                  onPress={() => handlePurchase(pkg)}
                  disabled={loading}
                >
                  <Text style={[styles.pkgTierLabel, { color: tier.color }]}>{tier.label}</Text>
                  <Text style={[styles.pkgBtnText, { color: tier.color }]}>
                    {pkg.product.title}
                  </Text>
                  <Text style={[styles.pkgBtnSub, { color: tier.color + 'bb' }]}>
                    {pkg.product.priceString} {period}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </View>

      <Pressable onPress={handleRestore} disabled={loading} style={{ alignItems: 'center', marginTop: 16 }}>
        <Text style={{ fontSize: 12, color: C.textMid }}>Restaurar compras anteriores</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function SubscricoesScreen() {
  const { isPro, offerings, purchase, restore, loading } = useRevenueCat();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <MotiView
          from={{ opacity: 0.3 }} animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 800, loop: true, repeatReverse: true }}
        >
          <Text style={{ fontSize: 32 }}>👑</Text>
        </MotiView>
      </View>
    );
  }

  if (isPro) {
    return <ProActiveScreen offerings={offerings} restore={restore} />;
  }

  return <PaywallScreen offerings={offerings} purchase={purchase} restore={restore} />;
}

const styles = StyleSheet.create({
  proHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  proIconBox: {
    width: 88, height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  proTitle: {
    fontSize: 32, fontWeight: '900', color: COLORS.text,
    letterSpacing: -0.5, textAlign: 'center',
  },
  proSubtitle: {
    fontSize: 15, color: COLORS.textSub, marginTop: 6, textAlign: 'center',
  },
  proActiveBadge: {
    marginTop: 12,
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  proActiveBadgeText: {
    fontSize: 12, fontWeight: '800', color: '#FFD700', letterSpacing: 1,
  },
  planBox: {
    marginTop: 20,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.15)',
    width: '100%',
  },
  planLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    color: COLORS.textSub, marginBottom: 4,
  },
  planName:  { fontSize: 18, fontWeight: '800', color: COLORS.text },
  planPrice: { fontSize: 14, color: '#FFD700', marginTop: 4, fontWeight: '600' },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    color: COLORS.textSub, marginBottom: 12,
  },
  featuresGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  featCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  featCardLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  featCardDesc:  { fontSize: 11, color: COLORS.textSub, lineHeight: 16 },

  featRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  featDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.brand },
  featText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },

  pkgBtn: {
    borderRadius: RADIUS.lg,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  pkgTierLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  pkgBtnText:   { fontSize: 16, fontWeight: '800' },
  pkgBtnSub:    { fontSize: 12, marginTop: 3 },
});
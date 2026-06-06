import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { MotiView } from 'moti';
import {
  RefreshCw, Repeat, ShieldCheck, Sparkles, WalletCards, Crown,
} from 'lucide-react-native';
import { COLORS, RADIUS } from '../constants/theme';
import { useRevenueCat } from '../context/RevenueCatContext';
import { subscricoesAPI } from '../services/api';
import { formatCompactMoney, formatMoney } from '../utils/money';

const C = COLORS;

const TIER = {
  MONTHLY:  { color: '#CD7F32', label: 'Bronze', glow: 'rgba(205,127,50,0.15)',  border: 'rgba(205,127,50,0.35)' },
  ANNUAL:   { color: '#C0C0C0', label: 'Prata',  glow: 'rgba(192,192,192,0.12)', border: 'rgba(192,192,192,0.3)' },
  LIFETIME: { color: '#FFD700', label: 'Ouro',   glow: 'rgba(255,215,0,0.15)',   border: 'rgba(255,215,0,0.35)' },
};

const riskMeta = (risk) => {
  if (risk === 'danger' || risk === 'high') return { color: C.red, label: 'Cortar primeiro' };
  if (risk === 'warning' || risk === 'medium') return { color: C.yellow, label: 'Verificar' };
  return { color: C.green, label: 'Parece ok' };
};

const sourceLabel = (source) => {
  if (source === 'open_banking') return 'Banco';
  if (source === 'gmail_auto') return 'Gmail';
  if (source === 'faturas') return 'Faturas';
  return source || 'Manual';
};

function EmptyAudit({ onDetect, detecting }) {
  return (
    <Animated.View entering={FadeInDown.delay(160).springify()} style={styles.emptyCard}>
      <Sparkles size={34} color={C.brand} />
      <Text style={styles.emptyTitle}>Ainda nao encontrei subscricoes</Text>
      <Text style={styles.emptySub}>Liga o banco ou analisa as faturas para apanhar pagamentos recorrentes.</Text>
      <Pressable onPress={onDetect} disabled={detecting} style={[styles.primaryBtn, detecting && { opacity: 0.6 }]}>
        {detecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>Detetar agora</Text>}
      </Pressable>
    </Animated.View>
  );
}

function SubscriptionCard({ item, idx }) {
  const currency = item.currency || 'EUR';
  const price = Number(item.preco_mensal || 0);
  const paid = Number(item.total_pago || price * (item.meses_pago || 1));
  const risk = riskMeta(item.risk);
  const intensity = Math.min(100, Math.max(8, (item.meses_pago || 1) * 18));

  return (
    <Animated.View entering={FadeInDown.delay(110 + idx * 45).springify()} style={[styles.subCard, { borderColor: risk.color + '44' }]}>
      <View style={styles.subTop}>
        <View style={[styles.subIcon, { backgroundColor: risk.color + '18' }]}>
          <Repeat size={18} color={risk.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.subName} numberOfLines={1}>{item.nome}</Text>
          <Text style={styles.subMeta}>{sourceLabel(item.fonte)} - {item.categoria || 'outro'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.subPrice, { color: risk.color }]}>{formatMoney(price, currency)}</Text>
          <Text style={styles.subMeta}>/mes</Text>
        </View>
      </View>

      <View style={styles.riskRow}>
        <Text style={[styles.riskText, { color: risk.color }]}>{risk.label}</Text>
        <Text style={styles.subMeta}>{item.meses_pago || 1} ocorrencia(s)</Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${intensity}%`, backgroundColor: risk.color }]} />
      </View>

      <View style={styles.subBottom}>
        <Text style={styles.subMeta}>Total visto</Text>
        <Text style={styles.subBottomValue}>{formatMoney(paid, currency)}</Text>
      </View>
      {!!item.alerta && <Text style={styles.alertLine} numberOfLines={2}>{item.alerta}</Text>}
    </Animated.View>
  );
}

function AuditScreen({ restore }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [data, setData] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await subscricoesAPI.listar();
      setData(res);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const detect = async () => {
    setDetecting(true);
    try {
      const res = await subscricoesAPI.detetar();
      await load(true);
      Alert.alert('Analise concluida', `${res.detetadas || 0} recorrencia(s) analisada(s).`);
    } catch (e) {
      Alert.alert('Erro ao detetar', e.message);
    } finally {
      setDetecting(false);
    }
  };

  const resumo = data?.resumo || {};
  const subs = Array.isArray(data?.subscricoes) ? data.subscricoes : [];
  const currency = resumo.moeda_principal || subs[0]?.currency || 'EUR';
  const monthly = Number(resumo.total_mensal || 0);
  const annualWaste = Number(resumo.total_anual_desperdicado || 0);
  const totals = Array.isArray(resumo.totais_por_moeda) ? resumo.totais_por_moeda : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.brand} />
        <Text style={styles.loadingText}>A analisar recorrencias...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.brand} />}
    >
      <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.header}>
        <View>
          <Text style={styles.kicker}>AUDITORIA PRO</Text>
          <Text style={styles.title}>Subscricoes</Text>
          <Text style={styles.subtitle}>Pagamentos recorrentes vindos do banco e das faturas.</Text>
        </View>
        <Pressable onPress={detect} disabled={detecting} style={[styles.iconBtn, detecting && { opacity: 0.6 }]}>
          {detecting ? <ActivityIndicator color={C.brand} /> : <RefreshCw size={18} color={C.brand} />}
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}><WalletCards size={22} color={C.brand} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Custo recorrente mensal</Text>
            <Text style={styles.heroValue}>{formatMoney(monthly, currency)}</Text>
          </View>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{subs.length}</Text>
            <Text style={styles.statLabel}>ativas</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: C.yellow }]}>{resumo.high_risk || 0}</Text>
            <Text style={styles.statLabel}>a rever</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: C.red }]}>{formatCompactMoney(annualWaste, currency)}</Text>
            <Text style={styles.statLabel}>risco/ano</Text>
          </View>
        </View>
      </Animated.View>

      {totals.length > 1 && (
        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.currencyStrip}>
          {totals.map((t) => (
            <View key={t.currency} style={styles.currencyPill}>
              <Text style={styles.currencyCode}>{t.currency}</Text>
              <Text style={styles.currencyVal}>{formatCompactMoney((t.desperdicado || 0) + (t.ok || 0), t.currency)}</Text>
            </View>
          ))}
        </Animated.View>
      )}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>RECORRENCIAS DETETADAS</Text>
        <Pressable onPress={restore}><Text style={styles.restoreTxt}>Restaurar Pro</Text></Pressable>
      </View>

      {subs.length === 0 ? (
        <EmptyAudit onDetect={detect} detecting={detecting} />
      ) : (
        subs.map((sub, idx) => <SubscriptionCard key={`${sub.db_id || sub.id || sub.nome}-${idx}`} item={sub} idx={idx} />)
      )}

      <Animated.View entering={FadeIn.delay(260)} style={styles.tipCard}>
        <ShieldCheck size={18} color={C.green} />
        <Text style={styles.tipText}>Os valores ficam separados por moeda. DKK continua DKK, EUR continua EUR.</Text>
      </Animated.View>
    </ScrollView>
  );
}

function PaywallScreen({ offerings, purchase, restore }) {
  const [loading, setLoading] = useState(false);
  const packages = offerings?.availablePackages || [];
  const order = { MONTHLY: 0, ANNUAL: 1, LIFETIME: 2 };
  const sorted = [...packages].sort((a, b) => (order[a.packageType] ?? 9) - (order[b.packageType] ?? 9));

  const handlePurchase = async (pkg) => {
    setLoading(true);
    try {
      const isPro = await purchase(pkg);
      if (isPro) Alert.alert('Bem-vindo ao Pro', 'A auditoria de subscricoes ficou desbloqueada.');
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
      if (!isPro) Alert.alert('Sem compras', 'Nenhuma subscricao ativa encontrada.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.payHeader}>
        <MotiView
          from={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', delay: 100, damping: 16 }}
          style={styles.proIconBox}
        >
          <Crown size={40} color="#FFD700" />
        </MotiView>
        <Text style={styles.payTitle}>Verly Pro</Text>
        <Text style={styles.paySubtitle}>Auditoria real de subscricoes, alertas e insights ilimitados.</Text>
      </Animated.View>

      {['Detecao automatica por banco e faturas', 'Risco mensal por moeda', 'Alertas de desperdicio', 'Chat IA ilimitado'].map((feat, i) => (
        <Animated.View key={feat} entering={FadeInDown.delay(150 + i * 60).springify()} style={styles.featRow}>
          <View style={styles.featDot} />
          <Text style={styles.featText}>{feat}</Text>
        </Animated.View>
      ))}

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
            const period = pkg.packageType === 'ANNUAL' ? '/ ano' : pkg.packageType === 'LIFETIME' ? '(vitalicio)' : '/ mes';
            return (
              <Animated.View key={pkg.identifier} entering={FadeInDown.delay(300 + i * 80).springify()}>
                <Pressable
                  style={[styles.pkgBtn, { backgroundColor: tier.glow, borderColor: tier.border }]}
                  onPress={() => handlePurchase(pkg)}
                  disabled={loading}
                >
                  <Text style={[styles.pkgTierLabel, { color: tier.color }]}>{tier.label}</Text>
                  <Text style={[styles.pkgBtnText, { color: tier.color }]}>{pkg.product.title}</Text>
                  <Text style={[styles.pkgBtnSub, { color: tier.color + 'bb' }]}>{pkg.product.priceString} {period}</Text>
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

export default function SubscricoesScreen() {
  const { isPro, offerings, purchase, restore, loading } = useRevenueCat();

  if (loading) {
    return (
      <View style={styles.center}>
        <MotiView
          from={{ opacity: 0.3 }} animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 800, loop: true, repeatReverse: true }}
        >
          <Crown size={34} color="#FFD700" />
        </MotiView>
      </View>
    );
  }

  if (isPro) return <AuditScreen restore={restore} />;
  return <PaywallScreen offerings={offerings} purchase={purchase} restore={restore} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.textMid, marginTop: 12, fontSize: 13 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 18 },
  kicker: { fontSize: 10, fontWeight: '900', color: C.brand, letterSpacing: 1.1, marginBottom: 4 },
  title: { fontSize: 30, fontWeight: '900', color: C.text },
  subtitle: { fontSize: 13, color: C.textMid, marginTop: 4, maxWidth: 250, lineHeight: 18 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  hero: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 12,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 46, height: 46, borderRadius: 16, backgroundColor: C.brandDim,
    justifyContent: 'center', alignItems: 'center',
  },
  heroLabel: { fontSize: 11, color: C.textMid, fontWeight: '800', letterSpacing: 0.8 },
  heroValue: { fontSize: 30, color: C.text, fontWeight: '900', marginTop: 2 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statBox: { flex: 1, backgroundColor: C.surface2, borderRadius: 14, padding: 10 },
  statValue: { fontSize: 16, color: C.text, fontWeight: '900' },
  statLabel: { fontSize: 10, color: C.textMid, marginTop: 2, fontWeight: '700' },
  currencyStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  currencyPill: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
  },
  currencyCode: { color: C.brand, fontSize: 11, fontWeight: '900' },
  currencyVal: { color: C.text, fontSize: 11, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: C.textSub },
  restoreTxt: { fontSize: 11, color: C.textMid, fontWeight: '700' },
  subCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, padding: 14, marginBottom: 10,
  },
  subTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subIcon: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  subName: { color: C.text, fontSize: 15, fontWeight: '800' },
  subMeta: { color: C.textMid, fontSize: 11, marginTop: 2 },
  subPrice: { fontSize: 14, fontWeight: '900' },
  riskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  riskText: { fontSize: 12, fontWeight: '900' },
  meterTrack: { height: 6, borderRadius: 999, backgroundColor: C.surface3, overflow: 'hidden', marginTop: 7 },
  meterFill: { height: '100%', borderRadius: 999 },
  subBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  subBottomValue: { color: C.text, fontSize: 12, fontWeight: '800' },
  alertLine: { color: C.textMid, fontSize: 11, lineHeight: 16, marginTop: 8 },
  emptyCard: {
    alignItems: 'center', backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.border, padding: 24, gap: 10,
  },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: C.textMid, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  primaryBtn: { backgroundColor: C.brand, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 6, minWidth: 140, alignItems: 'center' },
  primaryTxt: { color: '#fff', fontWeight: '900', fontSize: 13 },
  tipCard: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.green + '12', borderColor: C.green + '33',
    borderWidth: 1, borderRadius: 14, padding: 12,
  },
  tipText: { flex: 1, color: C.textMid, fontSize: 12, lineHeight: 17 },
  payHeader: { alignItems: 'center', marginBottom: 28 },
  proIconBox: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: 'rgba(255,215,0,0.1)', borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.25)', justifyContent: 'center',
    alignItems: 'center', marginBottom: 16,
  },
  payTitle: { fontSize: 32, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  paySubtitle: { fontSize: 15, color: COLORS.textSub, marginTop: 6, textAlign: 'center', lineHeight: 21 },
  featRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  featDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.brand },
  featText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  pkgBtn: { borderRadius: RADIUS.lg, padding: 18, alignItems: 'center', borderWidth: 1.5 },
  pkgBtnPrimary: { backgroundColor: C.brandDim, borderColor: C.brand + '44' },
  pkgTierLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  pkgBtnText: { fontSize: 16, fontWeight: '800', color: C.text },
  pkgBtnSub: { fontSize: 12, marginTop: 3 },
});

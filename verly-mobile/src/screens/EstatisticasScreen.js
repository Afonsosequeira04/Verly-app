/**
 * src/screens/EstatisticasScreen.js — FASE 2
 * Estatísticas com dados reais da API + barras animadas
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, Pressable, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, FadeInDown,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import { BarChart2, Receipt, Star, ShoppingBag, WalletCards } from 'lucide-react-native';
import { estatisticasAPI } from '../services/api';
import { COLORS, RADIUS, FONT } from '../constants/theme';
import { formatCompactMoney, formatMoney } from '../utils/money';

const C = COLORS;
const W = Dimensions.get('window').width;

const BAR_COLORS = [
  '#6C5CE7','#00C896','#22D4FD','#FFB300',
  '#FF5370','#C264DE','#FF8C42','#4ECDC4','#96CEB4','#45B7D1',
];

// ─── Barra horizontal animada ─────────────────────────────────────────────────
function AnimHorizBar({ categoria, total, max, color, index, currency = 'EUR', selected, onPress }) {
  const width = useSharedValue(0);

  React.useEffect(() => {
    const pct = max > 0 ? (total / max) * 100 : 0;
    width.value = withDelay(
      index * 80,
      withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [total, max]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(350).springify()}>
      <Pressable onPress={onPress} style={[styles.barRow, selected && styles.barRowSelected]}>
        <View style={styles.barLabelRow}>
          <Text style={styles.barLabel} numberOfLines={1}>{categoria}</Text>
          <Text style={[styles.barVal, { color }]}>{formatMoney(total, currency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}</Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { backgroundColor: color }, barStyle]} />
        </View>
        {selected && (
          <Text style={[styles.barHint, { color }]}>
            {Math.round((total / Math.max(max, 1)) * 100)}% da maior categoria
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Barra vertical animada ───────────────────────────────────────────────────
function AnimVertBar({ mes, total, max, chartH, index, currency = 'EUR', selected, onPress }) {
  const height = useSharedValue(0);

  React.useEffect(() => {
    const h = max > 0 ? (total / max) * chartH : 0;
    height.value = withDelay(
      index * 60,
      withTiming(Math.max(h, 4), { duration: 650, easing: Easing.out(Easing.cubic) }),
    );
  }, [total, max]);

  const barStyle = useAnimatedStyle(() => ({ height: height.value }));

  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const m = parseInt(mes.split('-')[1], 10) - 1;

  return (
    <Pressable onPress={onPress} style={[styles.vertBarCol, selected && styles.vertBarColSelected]}>
      <Text style={styles.vertBarVal}>
        {formatCompactMoney(total, currency)}
      </Text>
      <View style={{ justifyContent: 'flex-end', flex: 1 }}>
        <Animated.View style={[styles.vertBar, barStyle]} />
      </View>
      <Text style={styles.vertBarLabel}>{nomes[m] || mes}</Text>
    </Pressable>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, delay }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(380).springify()} style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>{icon}</View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function EstatisticasScreen() {
  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  const fetchData = async () => {
    try {
      const result = await estatisticasAPI.get();
      setData(result);
    } catch (e) {
      console.error('EstatisticasScreen:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  const maxCat = data?.por_categoria?.[0]?.total || 1;
  const maxMes = data?.por_mes?.length
    ? Math.max(...data.por_mes.map(d => d.total), 1)
    : 1;
  const chartH = 100;
  const activeCurrency = data?.currency || 'EUR';
  const bankSource = data?.fontes?.find(item => item.fonte === 'open_banking');
  const bankTotal = bankSource?.total || 0;
  const bankCurrency = bankSource?.currency || activeCurrency;
  const recordCount = data?.num_registos ?? data?.num_faturas ?? 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchData(); }}
          tintColor={C.brand}
        />
      }
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Text style={styles.pageTitle}>Estatísticas</Text>
        <Text style={styles.pageSubtitle}>Visão geral dos teus gastos</Text>
      </Animated.View>

      {/* Stats resumo */}
      <View style={styles.statsRow}>
        <StatCard
          icon={<Receipt size={16} color={C.brand} />}
          label="Total gasto"
          value={formatMoney(data?.total_geral || 0, activeCurrency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}
          color={C.brand}
          delay={60}
        />
        <StatCard
          icon={<ShoppingBag size={16} color={C.green} />}
          label="Registos"
          value={recordCount}
          color={C.green}
          delay={120}
        />
        <StatCard
          icon={<WalletCards size={16} color={C.yellow} />}
          label="Banco"
          value={formatMoney(bankTotal, bankCurrency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}
          color={C.yellow}
          delay={180}
        />
      </View>

      {(data?.available_currencies?.length > 0 || data?.excluded?.count > 0) && (
        <Animated.View entering={FadeInDown.delay(190).duration(360).springify()} style={styles.contextCard}>
          <View style={styles.contextRow}>
            {(data.available_currencies || []).slice(0, 3).map(item => (
              <View key={item.currency} style={[styles.currencyPill, item.currency === activeCurrency && styles.currencyPillActive]}>
                <Text style={[styles.currencyCode, item.currency === activeCurrency && styles.currencyCodeActive]}>{item.currency}</Text>
                <Text style={styles.currencyValue}>{formatCompactMoney(item.total, item.currency)}</Text>
              </View>
            ))}
          </View>
          {data?.excluded?.count > 0 && (
            <Text style={styles.contextText}>
              {data.excluded.count} movimentos de poupança/transferência fora dos gastos
            </Text>
          )}
        </Animated.View>
      )}

      {/* Evolução mensal */}
      {data?.por_mes?.length > 0 && (
        <Animated.View entering={FadeInDown.delay(200).duration(400).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <BarChart2 size={14} color={C.brand} />
            <Text style={styles.sectionTitle}>EVOLUÇÃO MENSAL</Text>
          </View>
          <View style={[styles.card, { paddingTop: 20 }]}>
            <View style={{ flexDirection: 'row', height: chartH + 40, alignItems: 'flex-end', justifyContent: 'space-around' }}>
              {data.por_mes.map((d, i) => (
                <AnimVertBar
                  key={d.mes}
                  mes={d.mes}
                  total={d.total}
                  max={maxMes}
                  chartH={chartH}
                  index={i}
                  currency={d.currency || activeCurrency}
                  selected={selectedMonth === i}
                  onPress={() => setSelectedMonth(selectedMonth === i ? null : i)}
                />
              ))}
            </View>
            {selectedMonth != null && data.por_mes[selectedMonth] && (
              <Text style={styles.selectionText}>
                {data.por_mes[selectedMonth].mes}: {formatMoney(data.por_mes[selectedMonth].total, data.por_mes[selectedMonth].currency || activeCurrency)}
              </Text>
            )}
          </View>
        </Animated.View>
      )}

      {/* Por categoria */}
      {data?.por_categoria?.length > 0 && (
        <Animated.View entering={FadeInDown.delay(300).duration(400).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Star size={14} color={C.brand} />
            <Text style={styles.sectionTitle}>POR CATEGORIA</Text>
          </View>
          <View style={styles.card}>
            {data.por_categoria.map((d, i) => (
              <AnimHorizBar
                key={d.categoria}
                categoria={d.categoria}
                total={d.total}
                max={maxCat}
                color={BAR_COLORS[i % BAR_COLORS.length]}
                index={i}
                currency={d.currency || activeCurrency}
                selected={selectedCat === i}
                onPress={() => setSelectedCat(selectedCat === i ? null : i)}
              />
            ))}
          </View>
        </Animated.View>
      )}

      {/* Top lojas */}
      {data?.top_lojas?.length > 0 && (
        <Animated.View entering={FadeInDown.delay(400).duration(400).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <ShoppingBag size={14} color={C.brand} />
            <Text style={styles.sectionTitle}>TOP LOJAS</Text>
          </View>
          <View style={styles.card}>
            {data.top_lojas.map((d, i) => (
              <Animated.View
                key={d.loja}
                entering={FadeInDown.delay(i * 50).duration(300).springify()}
                style={styles.lojaRow}
              >
                <View style={[styles.lojaBadge, { backgroundColor: BAR_COLORS[i % BAR_COLORS.length] + '20' }]}>
                  <Text style={[styles.lojaBadgeText, { color: BAR_COLORS[i % BAR_COLORS.length] }]}>
                    #{i + 1}
                  </Text>
                </View>
                <Text style={styles.lojaNome} numberOfLines={1}>{d.loja}</Text>
                <Text style={styles.lojaTotal}>
                  {formatMoney(d.total, d.currency || activeCurrency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}
                </Text>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Sem dados */}
      {!recordCount && (
        <MotiView
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 18 }}
          style={styles.emptyState}
        >
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>Sem dados ainda</Text>
          <Text style={styles.emptySub}>Adiciona faturas ou liga o banco para ver estatísticas.</Text>
        </MotiView>
      )}
    </ScrollView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },
  center:  { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },

  pageTitle:    { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: C.textSub, marginTop: 4, marginBottom: 20 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: RADIUS.lg,
    padding: 14, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.border,
  },
  statIcon:  { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.5 },
  contextCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 20,
  },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currencyPillActive: { borderColor: C.brand + '66', backgroundColor: C.brand + '18' },
  currencyCode: { color: C.textSub, fontSize: 11, fontWeight: '900' },
  currencyCodeActive: { color: C.brand },
  currencyValue: { color: C.textMid, fontSize: 11, fontWeight: '700' },
  contextText: { color: C.textSub, fontSize: 12, fontWeight: '600', marginTop: 10 },

  section:       { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle:  { fontSize: 11, fontWeight: '800', color: C.textMid, letterSpacing: 1.2 },

  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.lg,
    padding: 16, borderWidth: 1, borderColor: C.border,
  },

  // Barras horizontais
  barRow:      { marginBottom: 14, borderRadius: 10, padding: 6 },
  barRowSelected: { backgroundColor: C.surface2 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barLabel:    { fontSize: 13, color: C.textMid, fontWeight: '600', flex: 1, marginRight: 8 },
  barVal:      { fontSize: 13, fontWeight: '800' },
  barTrack:    { height: 6, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: 3 },
  barHint:     { fontSize: 11, fontWeight: '700', marginTop: 6 },

  // Barras verticais
  vertBarCol:   { alignItems: 'center', flex: 1, gap: 4, borderRadius: 10, paddingVertical: 4 },
  vertBarColSelected: { backgroundColor: C.brand + '12' },
  vertBarVal:   { fontSize: 9, color: C.textSub, fontWeight: '700' },
  vertBar:      { width: 18, backgroundColor: C.brand, borderRadius: 4 },
  vertBarLabel: { fontSize: 9, color: C.textSub, fontWeight: '600' },
  selectionText: { color: C.text, fontSize: 12, fontWeight: '800', marginTop: 12, textAlign: 'center' },

  // Lojas
  lojaRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  lojaBadge:     { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  lojaBadgeText: { fontSize: 11, fontWeight: '900' },
  lojaNome:      { flex: 1, fontSize: 14, color: C.text, fontWeight: '600' },
  lojaTotal:     { fontSize: 14, fontWeight: '800', color: C.text },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  emptySub:   { fontSize: 14, color: C.textSub, textAlign: 'center' },
});

/**
 * src/screens/EstatisticasScreen.js — FASE 2
 * Estatísticas com dados reais da API + barras animadas
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Pressable, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MotiView } from 'moti';
import { Receipt, ShoppingBag, WalletCards } from 'lucide-react-native';
import { estatisticasAPI } from '../services/api';
import { COLORS, RADIUS, FONT } from '../constants/theme';
import { formatCompactMoney, formatMoney } from '../utils/money';
import { FinancialChartsPanel, FinancialChartsSkeleton } from '../components/FinancialCharts';
import IntelligenceDeck from '../components/IntelligenceDeck';
import RefinedEmptyState from '../components/RefinedEmptyState';

const C = COLORS;
const BAR_COLORS = [
  '#6C5CE7','#00C896','#22D4FD','#FFB300',
  '#FF5370','#C264DE','#FF8C42','#4ECDC4','#96CEB4','#45B7D1',
];

function StatCard({ icon, label, value, color, delay }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 360, delay }}
      style={styles.statCard}
    >
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>{icon}</View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </MotiView>
  );
}

export default function EstatisticasScreen({ navigation }) {
  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(null);

  const fetchData = async (currency = selectedCurrency) => {
    try {
      const params = currency ? { currency } : {};
      const result = await estatisticasAPI.get(params);
      setData(result);
      if (!currency && result?.currency) setSelectedCurrency(result.currency);
    } catch (e) {
      console.error('EstatisticasScreen:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [selectedCurrency]));

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <FinancialChartsSkeleton title="A montar estatisticas" />
      </View>
    );
  }

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
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 400 }}
      >
        <Text style={styles.pageTitle}>Estatísticas</Text>
        <Text style={styles.pageSubtitle}>Visão geral dos teus gastos</Text>
      </MotiView>

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
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 360, delay: 190 }}
          style={styles.contextCard}
        >
          <View style={styles.contextRow}>
            {(data.available_currencies || []).slice(0, 3).map(item => (
              <Pressable
                key={item.currency}
                onPress={() => {
                  setSelectedCurrency(item.currency);
                  setLoading(true);
                  fetchData(item.currency);
                }}
                style={[styles.currencyPill, item.currency === activeCurrency && styles.currencyPillActive]}
              >
                <Text style={[styles.currencyCode, item.currency === activeCurrency && styles.currencyCodeActive]}>{item.currency}</Text>
                <Text style={styles.currencyValue}>{formatCompactMoney(item.total, item.currency)}</Text>
              </Pressable>
            ))}
          </View>
          {data?.conversion?.enabled && (
            <Text style={styles.contextText}>
              {data.conversion.converted_count} movimento(s) convertidos para {data.conversion.display_currency}.
            </Text>
          )}
          {data?.excluded?.count > 0 && (
            <Text style={styles.contextText}>
              {data.excluded.count} movimentos de poupança/transferência fora dos gastos
            </Text>
          )}
        </MotiView>
      )}

      <IntelligenceDeck
        intelligence={data?.financial_intelligence}
        navigation={navigation}
        compact
        title="Leitura inteligente"
      />

      <View style={styles.chartPanelWrap}>
        <FinancialChartsPanel
          title="Analise financeira"
          subtitle="Explora tendencia, categorias e impacto real com um unico grafico interativo."
          categories={data?.por_categoria || []}
          months={data?.por_mes || []}
          itemsByCategory={data?.itens_por_categoria || {}}
          sources={data?.fontes || []}
          currency={activeCurrency}
        />
      </View>

      {/* Top lojas */}
      {data?.top_lojas?.length > 0 && (
        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400, delay: 400 }}
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <ShoppingBag size={14} color={C.brand} />
            <Text style={styles.sectionTitle}>TOP LOJAS</Text>
          </View>
          <View style={styles.card}>
            {data.top_lojas.map((d, i) => (
              <MotiView
                key={d.loja}
                from={{ opacity: 0, translateY: 8 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 300, delay: i * 50 }}
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
              </MotiView>
            ))}
          </View>
        </MotiView>
      )}

      {/* Sem dados */}
      {!recordCount && (
        <RefinedEmptyState
          variant="stack"
          accent={C.cyan}
          icon={<WalletCards size={22} color={C.cyan} />}
          title="Sem dados ainda"
          subtitle="Adiciona faturas ou liga o banco para ver estatisticas com categorias, tendencias e fontes."
          style={styles.emptyState}
        />
      )}
    </ScrollView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },
  loadingRoot: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 20 },

  pageTitle:    { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: 0 },
  pageSubtitle: { fontSize: 14, color: C.textSub, marginTop: 4, marginBottom: 20 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: RADIUS.lg,
    padding: 14, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.border,
  },
  statIcon:  { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900', letterSpacing: 0 },
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
  chartPanelWrap: { marginBottom: 20 },
  section:       { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle:  { fontSize: 11, fontWeight: '800', color: C.textMid, letterSpacing: 1.2 },

  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.lg,
    padding: 16, borderWidth: 1, borderColor: C.border,
  },

  // Lojas
  lojaRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  lojaBadge:     { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  lojaBadgeText: { fontSize: 11, fontWeight: '900' },
  lojaNome:      { flex: 1, fontSize: 14, color: C.text, fontWeight: '600' },
  lojaTotal:     { fontSize: 14, fontWeight: '800', color: C.text },

  // Empty state
  emptyState: { marginTop: 18 },
});

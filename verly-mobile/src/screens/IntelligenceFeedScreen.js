// src/screens/IntelligenceFeedScreen.js — Verly Fase 5B: Feed de Inteligência
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Dimensions, RefreshControl, ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { MotiView } from 'moti';
import { useFocusEffect } from '@react-navigation/native';
import {
  Zap, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Target, Calendar, BarChart2,
  ChevronRight, RefreshCw, Brain, Flame, ArrowUpRight,
} from 'lucide-react-native';
import { dashboardAPI, insightsAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');

const FEED_TIPOS = {
  alerta:    { cor: C.red,     icon: AlertTriangle, bg: '#FF4D6D15' },
  positivo:  { cor: '#00D68F', icon: CheckCircle,   bg: '#00D68F15' },
  tendencia: { cor: C.yellow,  icon: TrendingUp,    bg: '#FFB30015' },
  dica:      { cor: C.brand,   icon: Zap,           bg: C.brand + '15' },
  previsao:  { cor: '#22D4FD', icon: Calendar,      bg: '#22D4FD15' },
};

function FeedCard({ item, index, onPress }) {
  const tipo = FEED_TIPOS[item.tipo] || FEED_TIPOS.dica;
  const Icon = tipo.icon;
  const isUrgente = item.tipo === 'alerta';

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
      <Pressable
        onPress={onPress}
        style={[styles.feedCard, {
          borderLeftColor: tipo.cor,
          backgroundColor: isUrgente ? tipo.bg : C.surface,
        }]}
      >
        <View style={[styles.feedIconWrap, { backgroundColor: tipo.cor + '20' }]}>
          <Icon size={16} color={tipo.cor} />
        </View>
        <View style={{ flex: 1 }}>
          {item.icone && <Text style={styles.feedEmoji}>{item.icone}</Text>}
          <Text style={[styles.feedTexto, isUrgente && { color: C.text, fontWeight: '700' }]}>
            {item.texto}
          </Text>
          {item.valor != null && (
            <Text style={[styles.feedValor, { color: tipo.cor }]}>{fmt(item.valor)}€</Text>
          )}
        </View>
        {onPress && <ChevronRight size={14} color={C.textMid} />}
      </Pressable>
    </Animated.View>
  );
}

function CockpitHeader({ data, resumo }) {
  const gasto = data?.total_gasto || 0;
  const orcamento = data?.orcamento || 0;
  const pct = orcamento > 0 ? Math.round((gasto / orcamento) * 100) : 0;
  const cor = pct > 100 ? C.red : pct > 80 ? C.yellow : '#00D68F';
  const mood = data?.mood;

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.cockpit}>
      <View style={styles.cockpitTop}>
        <View>
          <Text style={styles.cockpitLabel}>COCKPIT FINANCEIRO</Text>
          <Text style={[styles.cockpitGasto, { color: cor }]}>{fmt(gasto)}€</Text>
          {orcamento > 0 && (
            <Text style={styles.cockpitSub}>{pct}% do orçamento de {fmt(orcamento)}€</Text>
          )}
        </View>
        <View style={[styles.cockpitBadge, { backgroundColor: cor + '20', borderColor: cor + '40' }]}>
          <Text style={[styles.cockpitPct, { color: cor }]}>{pct}%</Text>
          {pct > 100 ? <TrendingUp size={14} color={cor} /> : <TrendingDown size={14} color={cor} />}
        </View>
      </View>
      <View style={styles.cockpitBarBg}>
        <MotiView
          from={{ width: '0%' }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ type: 'timing', duration: 800 }}
          style={[styles.cockpitBarFill, { backgroundColor: cor }]}
        />
      </View>
      {mood?.frase && (
        <View style={styles.cockpitMood}>
          <Brain size={12} color={C.brand} />
          <Text style={styles.cockpitMoodText} numberOfLines={2}>{mood.frase}</Text>
        </View>
      )}
    </Animated.View>
  );
}

function QuickMetrics({ data, resumo }) {
  const comparacao = data?.comparacao || {};
  const variacao = comparacao.variacao_pct;
  const subiu = comparacao.subiu;
  const streak = data?.streak || 0;
  const previsao = resumo?.previsao_mensal;

  const metricas = [
    { label: 'vs. mês anterior', valor: variacao != null ? `${subiu ? '+' : ''}${variacao}%` : '—', cor: subiu ? C.red : '#00D68F', icon: subiu ? TrendingUp : TrendingDown },
    { label: 'streak', valor: `${streak}d`, cor: '#FF7340', icon: Flame },
    { label: 'previsão fim mês', valor: previsao ? `${fmt(previsao)}€` : '—', cor: C.brand, icon: Calendar },
  ];

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(400).springify()} style={styles.metricsRow}>
      {metricas.map((m, i) => {
        const Icon = m.icon;
        return (
          <View key={i} style={styles.metricCard}>
            <Icon size={13} color={m.cor} />
            <Text style={[styles.metricValor, { color: m.cor }]}>{m.valor}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

function GraphTeaser({ data, navigation }) {
  const cats = data?.categorias || [];
  const top = cats.slice(0, 3);
  if (!top.length) return null;
  const maxVal = Math.max(...top.map(c => c.total || 0), 1);
  const cores = ['#7C6FE0', '#FF4D6D', '#FFB300'];

  return (
    <Animated.View entering={FadeInDown.delay(150).duration(400).springify()} style={styles.graphTeaser}>
      <Pressable onPress={() => navigation?.navigate?.('FinancialGraph')} style={{ padding: SPACE.md }}>
        <View style={styles.graphTeaserHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BarChart2 size={14} color={C.brand} />
            <Text style={styles.graphTeaserTitle}>Padrões comportamentais</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: FONT.xs, color: C.brand, fontWeight: '700' }}>Ver gráfico</Text>
            <ArrowUpRight size={12} color={C.brand} />
          </View>
        </View>
        <View style={{ gap: 8, marginTop: 12 }}>
          {top.map((cat, i) => (
            <View key={i} style={styles.miniBarRow}>
              <Text style={styles.miniBarLabel} numberOfLines={1}>{cat.nome || cat.categoria}</Text>
              <View style={styles.miniBarBg}>
                <MotiView
                  from={{ width: '0%' }}
                  animate={{ width: `${(cat.total / maxVal) * 100}%` }}
                  transition={{ type: 'timing', duration: 600, delay: i * 100 }}
                  style={[styles.miniBarFill, { backgroundColor: cores[i] }]}
                />
              </View>
              <Text style={[styles.miniBarVal, { color: cores[i] }]}>{fmt(cat.total)}€</Text>
            </View>
          ))}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function IntelligenceFeedScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [resumo, setResumo] = useState(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [dashData, insightsData] = await Promise.all([
        dashboardAPI.get(),
        insightsAPI.get(),
      ]);
      setData(dashData);
      if (insightsData?.resumo) setResumo(insightsData.resumo);
    } catch (e) {}
    finally { setLoading(false); setRefreshing(false); }
  };

  const feed = data?.feed || [];
  const alertas = feed.filter(f => f.tipo === 'alerta');
  const insights = feed.filter(f => f.tipo !== 'alerta');

  if (loading) return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="large" color={C.brand} />
      <Text style={styles.loadingText}>A analisar os teus padrões...</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Feed de Inteligência</Text>
          <Text style={styles.headerSub}>O teu cockpit financeiro em tempo real</Text>
        </View>
        <Pressable onPress={() => load(true)} style={styles.refreshBtn}>
          <RefreshCw size={16} color={C.brand} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} colors={[C.brand]} />}
      >
        <View style={{ paddingHorizontal: SPACE.lg }}>
          <CockpitHeader data={data} resumo={resumo} />
          <QuickMetrics data={data} resumo={resumo} />
        </View>

        {alertas.length > 0 && (
          <View style={{ paddingHorizontal: SPACE.lg }}>
            <View style={styles.sectionHeader}>
              <AlertTriangle size={14} color={C.red} />
              <Text style={styles.sectionTitle}>Alertas prioritários</Text>
              <Text style={[styles.sectionCount, { backgroundColor: C.red + '20', color: C.red }]}>{alertas.length}</Text>
            </View>
            {alertas.map((item, i) => (
              <FeedCard key={i} item={item} index={i} onPress={() => navigation?.navigate?.('Faturas')} />
            ))}
          </View>
        )}

        <View style={{ paddingHorizontal: SPACE.lg }}>
          <GraphTeaser data={data} navigation={navigation} />
        </View>

        {insights.length > 0 && (
          <View style={{ paddingHorizontal: SPACE.lg }}>
            <View style={styles.sectionHeader}>
              <Zap size={14} color={C.brand} />
              <Text style={styles.sectionTitle}>Insights do dia</Text>
              <Text style={styles.sectionCount}>{insights.length}</Text>
            </View>
            {insights.map((item, i) => (
              <FeedCard key={i} item={item} index={i} onPress={null} />
            ))}
          </View>
        )}

        {!feed.length && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
            <Text style={{ fontSize: 48 }}>🧘</Text>
            <Text style={styles.emptyTitle}>Tudo sob controlo</Text>
            <Text style={styles.emptySub}>Sem alertas por agora. Adiciona mais faturas para análise.</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, gap: 12 },
  loadingText: { color: C.textMid, fontSize: FONT.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingTop: SPACE.xl, paddingBottom: SPACE.md },
  headerTitle: { fontSize: FONT.xxl, fontWeight: '800', color: C.text },
  headerSub: { fontSize: FONT.sm, color: C.textMid, marginTop: 2 },
  refreshBtn: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: C.brand + '15', justifyContent: 'center', alignItems: 'center' },
  cockpit: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm },
  cockpitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cockpitLabel: { fontSize: 9, fontWeight: '800', color: C.brand, letterSpacing: 1.5, marginBottom: 4 },
  cockpitGasto: { fontSize: 32, fontWeight: '900' },
  cockpitSub: { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },
  cockpitBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1 },
  cockpitPct: { fontSize: FONT.md, fontWeight: '800' },
  cockpitBarBg: { height: 4, backgroundColor: C.surface3, borderRadius: 2, overflow: 'hidden', marginBottom: 10 },
  cockpitBarFill: { height: '100%', borderRadius: 2 },
  cockpitMood: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 8, backgroundColor: C.brandDim, borderRadius: RADIUS.xs },
  cockpitMoodText: { fontSize: FONT.xs, color: C.textMid, flex: 1, lineHeight: 16, fontStyle: 'italic' },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: SPACE.sm },
  metricCard: { flex: 1, backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: 10, alignItems: 'center', gap: 4 },
  metricValor: { fontSize: FONT.md, fontWeight: '800' },
  metricLabel: { fontSize: 9, color: C.textMid, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
  sectionTitle: { fontSize: FONT.sm, fontWeight: '700', color: C.text, flex: 1 },
  sectionCount: { fontSize: FONT.xs, color: C.brand, fontWeight: '700', backgroundColor: C.brandDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill },
  feedCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, marginBottom: 6 },
  feedIconWrap: { width: 32, height: 32, borderRadius: RADIUS.xs, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  feedEmoji: { fontSize: 14, marginBottom: 2 },
  feedTexto: { fontSize: FONT.sm, color: C.textMid, lineHeight: 18 },
  feedValor: { fontSize: FONT.md, fontWeight: '800', marginTop: 3 },
  graphTeaser: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.brand + '30', marginBottom: SPACE.sm },
  graphTeaserHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  graphTeaserTitle: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  miniBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBarLabel: { fontSize: 10, color: C.textMid, width: 80 },
  miniBarBg: { flex: 1, height: 4, backgroundColor: C.surface3, borderRadius: 2, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 2 },
  miniBarVal: { fontSize: 10, fontWeight: '700', width: 60, textAlign: 'right' },
  emptyWrap: { alignItems: 'center', padding: 40, gap: 10 },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '800', color: C.text },
  emptySub: { fontSize: FONT.sm, color: C.textMid, textAlign: 'center', lineHeight: 20 },
});
// src/screens/FinancialGraphScreen.js — Verly Fase 5B: Financial Graph
// Visualização de padrões comportamentais do utilizador
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Dimensions, ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { MotiView } from 'moti';
import { useFocusEffect } from '@react-navigation/native';
import {
  BarChart2, TrendingUp, TrendingDown, Calendar,
  ShoppingBag, Clock, Target, Zap, Brain,
} from 'lucide-react-native';
import { dashboardAPI, insightsAPI } from '../services/api';
import { AIStateBanner } from '../components/DynamicDashboardEngine';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const { width: W } = Dimensions.get('window');
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const CHART_COLORS = ['#7C6FE0', '#FF4D6D', '#FFB300', '#00D68F', '#22D4FD', '#FF7340'];

// ─── Gráfico de barras por categoria ─────────────────────────────────────────
function CategoriasBars({ categorias = [] }) {
  const [selected, setSelected] = useState(null);
  if (!categorias.length) return null;
  const maxVal = Math.max(...categorias.map(c => c.total || 0), 1);
  const BAR_W = W - SPACE.lg * 2 - 32;

  return (
    <Animated.View entering={FadeInDown.delay(50).duration(400).springify()} style={styles.card}>
      <View style={styles.cardHeader}>
        <ShoppingBag size={14} color={C.brand} />
        <Text style={styles.cardTitle}>Gastos por categoria</Text>
      </View>
      <View style={{ gap: 8, marginTop: 8 }}>
        {categorias.slice(0, 6).map((cat, i) => {
          const pct = (cat.total / maxVal) * 100;
          const cor = CHART_COLORS[i % CHART_COLORS.length];
          const isSel = selected === i;
          return (
            <Pressable key={i} onPress={() => setSelected(isSel ? null : i)}>
              <View style={[styles.barRow, isSel && { backgroundColor: cor + '10', borderRadius: RADIUS.xs, padding: 6, margin: -6 }]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={[styles.barLabel, isSel && { color: C.text, fontWeight: '800' }]}>
                      {cat.nome || cat.categoria}
                    </Text>
                    <Text style={[styles.barVal, { color: cor }]}>{fmt(cat.total)}€</Text>
                  </View>
                  <View style={styles.barBg}>
                    <MotiView
                      from={{ width: '0%' }}
                      animate={{ width: `${pct}%` }}
                      transition={{ type: 'timing', duration: 600, delay: i * 80 }}
                      style={[styles.barFill, { backgroundColor: cor, height: isSel ? 8 : 5 }]}
                    />
                  </View>
                  {isSel && (
                    <Animated.View entering={FadeIn.duration(200)}>
                      <Text style={[styles.barPct, { color: cor }]}>
                        {Math.round(pct)}% do maior gasto
                      </Text>
                    </Animated.View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Gráfico de evolução mensal ───────────────────────────────────────────────
function EvolucaoMensal({ evolucao }) {
  const [selectedIdx, setSelectedIdx] = useState(null);
  if (!evolucao?.labels?.length) return null;

  const labels = evolucao.labels.slice(-6);
  const values = evolucao.values.slice(-6);
  const maxVal = Math.max(...values, 1);
  const CHART_H = 80;
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(400).springify()} style={styles.card}>
      <View style={styles.cardHeader}>
        <TrendingUp size={14} color={C.brand} />
        <Text style={styles.cardTitle}>Evolução mensal</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 16, height: CHART_H + 40 }}>
        {labels.map((label, i) => {
          const val = values[i] || 0;
          const h = Math.max((val / maxVal) * CHART_H, 4);
          const m = parseInt(label.split('-')[1], 10) - 1;
          const labelStr = meses[m] ?? label.slice(-2);
          const isSel = selectedIdx === i;
          const cor = isSel ? C.brand : C.brand + '55';

          return (
            <Pressable
              key={i}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: CHART_H + 40 }}
              onPress={() => setSelectedIdx(isSel ? null : i)}
            >
              {isSel && (
                <Animated.View entering={FadeIn.duration(150)}>
                  <Text style={{ fontSize: 9, color: C.brand, fontWeight: '800', marginBottom: 3 }}>
                    {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : fmt(val)}€
                  </Text>
                </Animated.View>
              )}
              <MotiView
                from={{ height: 0 }}
                animate={{ height: h }}
                transition={{ type: 'timing', duration: 500, delay: i * 60 }}
                style={{ width: '80%', backgroundColor: cor, borderRadius: 4, marginBottom: 6 }}
              />
              <Text style={{ fontSize: 10, fontWeight: isSel ? '800' : '600', color: isSel ? C.text : C.textMid }}>
                {labelStr}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Padrões comportamentais ──────────────────────────────────────────────────
function PadroesComportamentais({ data, resumo }) {
  const faturas = data?.ultimas_faturas || [];
  const cats = data?.categorias || [];
  const comparacao = data?.comparacao || {};
  const totalSubs = data?.subscricoes?.total_mensal || 0;

  const padroes = [];

  // Padrão de dia da semana (simulado a partir das últimas faturas)
  if (faturas.length >= 3) {
    padroes.push({
      icon: Clock,
      titulo: 'Frequência de compras',
      descricao: `${faturas.length} compras registadas`,
      cor: C.brand,
      valor: `${faturas.length} faturas`,
    });
  }

  // Padrão de categoria dominante
  if (cats.length > 0) {
    const top = cats[0];
    const total = cats.reduce((s, c) => s + (c.total || 0), 0);
    const pct = total > 0 ? Math.round((top.total / total) * 100) : 0;
    padroes.push({
      icon: ShoppingBag,
      titulo: 'Categoria dominante',
      descricao: `${top.nome || top.categoria} representa ${pct}% dos teus gastos`,
      cor: '#FF4D6D',
      valor: `${pct}%`,
    });
  }

  // Padrão de subscrições
  if (totalSubs > 0) {
    padroes.push({
      icon: Zap,
      titulo: 'Custo de subscrições',
      descricao: `${fmt(totalSubs)}€/mês = ${fmt(totalSubs * 12)}€/ano em serviços recorrentes`,
      cor: C.orange,
      valor: `${fmt(totalSubs)}€/mês`,
    });
  }

  // Tendência
  if (comparacao.variacao_pct != null) {
    const subiu = comparacao.subiu;
    padroes.push({
      icon: subiu ? TrendingUp : TrendingDown,
      titulo: 'Tendência de gastos',
      descricao: subiu
        ? `Gastos subiram ${comparacao.variacao_pct}% vs mês passado`
        : `Gastos desceram ${Math.abs(comparacao.variacao_pct)}% vs mês passado`,
      cor: subiu ? C.red : '#00D68F',
      valor: `${subiu ? '+' : ''}${comparacao.variacao_pct}%`,
    });
  }

  if (!padroes.length) return null;

  return (
    <Animated.View entering={FadeInDown.delay(150).duration(400).springify()} style={styles.card}>
      <View style={styles.cardHeader}>
        <Brain size={14} color={C.brand} />
        <Text style={styles.cardTitle}>Padrões detetados</Text>
      </View>
      <View style={{ gap: 10, marginTop: 8 }}>
        {padroes.map((p, i) => {
          const Icon = p.icon;
          return (
            <View key={i} style={[styles.padraoRow, { borderLeftColor: p.cor }]}>
              <View style={[styles.padraoIcon, { backgroundColor: p.cor + '20' }]}>
                <Icon size={14} color={p.cor} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.padraoTitulo}>{p.titulo}</Text>
                  <Text style={[styles.padraoValor, { color: p.cor }]}>{p.valor}</Text>
                </View>
                <Text style={styles.padraoDesc}>{p.descricao}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Score de saúde financeira ────────────────────────────────────────────────
function HealthScore({ data, resumo }) {
  const gasto = data?.total_gasto || 0;
  const orcamento = data?.orcamento || 0;
  const subs = data?.subscricoes?.total_mensal || 0;
  const streak = data?.streak || 0;

  // Score simples de 0-100
  let score = 70;
  if (orcamento > 0) {
    const pct = gasto / orcamento;
    if (pct > 1.2) score -= 30;
    else if (pct > 1) score -= 15;
    else if (pct < 0.7) score += 15;
  }
  if (subs > 100) score -= 10;
  if (streak > 7) score += 10;
  score = Math.min(100, Math.max(0, score));

  const cor = score >= 75 ? '#00D68F' : score >= 50 ? C.yellow : C.red;
  const label = score >= 75 ? 'Excelente' : score >= 50 ? 'Razoável' : 'Atenção necessária';

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(400).springify()} style={styles.card}>
      <View style={styles.cardHeader}>
        <Target size={14} color={C.brand} />
        <Text style={styles.cardTitle}>Score de saúde financeira</Text>
      </View>
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Text style={[styles.scoreNum, { color: cor }]}>{score}</Text>
        <Text style={[styles.scoreLabel, { color: cor }]}>{label}</Text>
        <View style={[styles.scoreBarBg, { marginTop: 12 }]}>
          <MotiView
            from={{ width: '0%' }}
            animate={{ width: `${score}%` }}
            transition={{ type: 'timing', duration: 900 }}
            style={[styles.scoreBarFill, { backgroundColor: cor }]}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: C.textMid }}>0</Text>
          <Text style={{ fontSize: 9, color: C.textMid }}>100</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function FinancialGraphScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [resumo, setResumo] = useState(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    setLoading(true);
    try {
      const [dashData, insightsData] = await Promise.all([
        dashboardAPI.get(),
        insightsAPI.get(),
      ]);
      setData(dashData);
      if (insightsData?.resumo) setResumo(insightsData.resumo);
    } catch (e) {}
    finally { setLoading(false); }
  };

  if (loading) return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="large" color={C.brand} />
      <Text style={styles.loadingText}>A mapear os teus padrões...</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Padrões Financeiros</Text>
          <Text style={styles.headerSub}>Visualização do teu comportamento</Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: C.brand + '20' }]}>
          <BarChart2 size={18} color={C.brand} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <AIStateBanner resumo={resumo} />
        <HealthScore data={data} resumo={resumo} />
        <EvolucaoMensal evolucao={data?.evolucao} />
        <CategoriasBars categorias={data?.categorias} />
        <PadroesComportamentais data={data} resumo={resumo} />
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
  headerBadge: { width: 44, height: 44, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  barRow: { gap: 4 },
  barLabel: { fontSize: FONT.xs, color: C.textMid, fontWeight: '600' },
  barVal: { fontSize: FONT.xs, fontWeight: '800' },
  barBg: { height: 5, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' },
  barFill: { borderRadius: 3 },
  barPct: { fontSize: 10, marginTop: 3, fontWeight: '600' },
  padraoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 8, borderLeftWidth: 2, paddingVertical: 4 },
  padraoIcon: { width: 30, height: 30, borderRadius: RADIUS.xs, justifyContent: 'center', alignItems: 'center' },
  padraoTitulo: { fontSize: FONT.xs, fontWeight: '700', color: C.text },
  padraoValor: { fontSize: FONT.xs, fontWeight: '800' },
  padraoDesc: { fontSize: 10, color: C.textMid, marginTop: 2, lineHeight: 14 },
  scoreNum: { fontSize: 56, fontWeight: '900' },
  scoreLabel: { fontSize: FONT.sm, fontWeight: '700', marginTop: -4 },
  scoreBarBg: { width: '100%', height: 6, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3 },
});
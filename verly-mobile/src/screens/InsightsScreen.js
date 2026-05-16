// src/screens/InsightsScreen.js — Análise de padrões, tendências e IA
// DIFERENTE do Dashboard: aqui é o PORQUÊ e O QUE FAZER, não o resumo rápido
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, RefreshControl, ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import {
  Zap, TrendingUp, TrendingDown, AlertCircle,
  CheckCircle, Brain, BarChart2, Target,
  RefreshCw, Flame, Clock, Award, ArrowRight,
  ShoppingBag, CreditCard, Repeat,
} from 'lucide-react-native';
import { insightsAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import { Reveal, Skeleton, SectionHeader, AnimatedListItem } from '../components/UI';

const C   = COLORS;
const W   = Dimensions.get('window').width;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');

// ─── Score de saúde financeira ────────────────────────────────────────────────
function ScoreFinanceiro({ resumo }) {
  if (!resumo) return null;

  const { pct_orcamento, pct_rendimento, variacao_subiu, variacao_pct } = resumo;

  // Calcula score de 0-100
  let score = 75; // base
  if (pct_orcamento != null) {
    if (pct_orcamento > 100) score -= 30;
    else if (pct_orcamento > 80) score -= 15;
    else if (pct_orcamento < 60) score += 10;
  }
  if (pct_rendimento != null) {
    if (pct_rendimento > 80) score -= 20;
    else if (pct_rendimento < 40) score += 10;
  }
  if (variacao_pct != null) {
    if (variacao_subiu && variacao_pct > 20) score -= 10;
    else if (!variacao_subiu && variacao_pct > 10) score += 10;
  }
  score = Math.max(10, Math.min(100, score));

  const getScoreConfig = (s) => {
    if (s >= 80) return { label: 'Excelente', color: C.green,  emoji: '🏆' };
    if (s >= 60) return { label: 'Bom',       color: C.brand,  emoji: '✅' };
    if (s >= 40) return { label: 'Atenção',   color: C.yellow, emoji: '⚠️' };
    return         { label: 'Crítico',         color: C.red,    emoji: '🚨' };
  };

  const cfg = getScoreConfig(score);

  return (
    <Animated.View entering={FadeInDown.delay(50).duration(400).springify()}
      style={{ marginHorizontal: SPACE.lg, marginBottom: 20 }}>
      <View style={[s.card, { padding: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={[s.microText, { marginBottom: 4 }]}>Score de saúde financeira</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={[s.bigNum, { fontSize: 42, color: cfg.color }]}>{score}</Text>
              <Text style={[s.microText, { fontSize: 14 }]}>/100</Text>
            </View>
            <View style={[s.badge, { backgroundColor: cfg.color + '20', marginTop: 6 }]}>
              <Text style={[s.label, { color: cfg.color, fontSize: 11 }]}>
                {cfg.emoji}  {cfg.label}
              </Text>
            </View>
          </View>
          <View style={s.scoreDial}>
            <Text style={{ fontSize: 36 }}>{cfg.emoji}</Text>
          </View>
        </View>

        {/* Barra de score */}
        <View style={{ marginTop: 16 }}>
          <View style={{ height: 8, backgroundColor: C.surface3, borderRadius: 4, overflow: 'hidden' }}>
            <ScoreBar pct={score} color={cfg.color} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function ScoreBar({ pct, color }) {
  const width = useSharedValue(0);
  React.useEffect(() => {
    width.value = withDelay(400, withTiming(pct, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [pct]);
  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return <Animated.View style={[{ height: '100%', backgroundColor: color, borderRadius: 4 }, barStyle]} />;
}

// ─── Comparação mês a mês ─────────────────────────────────────────────────────
function TendenciaMensal({ resumo }) {
  if (!resumo?.variacao_pct == null && !resumo?.total_gasto) return null;

  const { total_gasto, variacao_pct, variacao_subiu } = resumo;
  const subiu = variacao_subiu;
  const color = subiu ? C.red : C.green;
  const Icon = subiu ? TrendingUp : TrendingDown;

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}
      style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Tendência" />
      <View style={[s.card, { padding: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={[s.iconWrap, { backgroundColor: color + '18' }]}>
            <Icon size={20} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.bodyText, { color: C.text }]}>
              {variacao_pct != null
                ? `Gastaste ${subiu ? 'mais' : 'menos'} ${Math.abs(variacao_pct)}% vs. mês anterior`
                : `Gastaste ${fmt(total_gasto)} € este mês`}
            </Text>
            <Text style={[s.microText, { marginTop: 3 }]}>
              {subiu
                ? 'Os teus gastos estão a aumentar. Hora de rever o orçamento.'
                : variacao_pct != null
                  ? 'Boa tendência! Continua assim.'
                  : 'Ainda sem dados do mês anterior para comparar.'}
            </Text>
          </View>
          {variacao_pct != null && (
            <Text style={[s.bigNum, { color, fontSize: 18 }]}>
              {subiu ? '+' : ''}{variacao_pct}%
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Top categorias com barras visuais ────────────────────────────────────────
function TopCategorias({ resumo }) {
  if (!resumo?.top_categorias?.length) return null;

  const cats = resumo.top_categorias.slice(0, 5);
  const maxVal = cats[0]?.valor || 1;

  const ICONS = {
    'Alimentação':    '🛒',
    'Transporte':     '🚗',
    'Saúde':          '🏥',
    'Lazer':          '🎮',
    'Vestuário':      '👕',
    'Tecnologia':     '💻',
    'Casa':           '🏠',
    'Educação':       '📚',
    'Subscricoes':    '🔄',
    'Beleza':         '💄',
  };

  return (
    <Animated.View entering={FadeInDown.delay(150).duration(400).springify()}
      style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Onde gastas mais" />
      <View style={[s.card, { padding: 16 }]}>
        {cats.map((cat, i) => {
          const pct = (cat.valor / maxVal) * 100;
          const emoji = ICONS[cat.categoria] || '📦';
          return (
            <Animated.View key={cat.categoria}
              entering={FadeInDown.delay(160 + i * 50).duration(300)}>
              <View style={{ marginBottom: i < cats.length - 1 ? 14 : 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[s.bodyText, { color: C.text }]}>
                    {emoji}  {cat.categoria}
                  </Text>
                  <Text style={[s.label, { color: C.brand }]}>{fmt(cat.valor)} €</Text>
                </View>
                <View style={{ height: 5, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' }}>
                  <CatBar pct={pct} delay={200 + i * 60} />
                </View>
              </View>
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}

function CatBar({ pct, delay }) {
  const width = useSharedValue(0);
  React.useEffect(() => {
    width.value = withDelay(delay, withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [pct]);
  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return <Animated.View style={[{ height: '100%', backgroundColor: C.brand, borderRadius: 3 }, barStyle]} />;
}

// ─── Metas vs gastos ─────────────────────────────────────────────────────────
function MetasProgress({ resumo }) {
  if (!resumo?.metas?.length) return null;

  const metas = resumo.metas.slice(0, 4);

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}
      style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Metas vs. Gastos reais" />
      <View style={[s.card, { padding: 16 }]}>
        {metas.map((meta, i) => {
          const pct = Math.min(meta.pct || 0, 100);
          const over = meta.ultrapassou;
          const color = over ? C.red : pct > 80 ? C.yellow : C.green;
          return (
            <View key={meta.categoria}
              style={{ marginBottom: i < metas.length - 1 ? 16 : 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={[s.bodyText, { color: C.text }]}>{meta.categoria}</Text>
                <Text style={[s.microText, { color }]}>
                  {fmt(meta.gasto)} / {fmt(meta.limite)} €
                </Text>
              </View>
              <View style={{ height: 6, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' }}>
                <MetaBar pct={pct} color={color} delay={220 + i * 70} />
              </View>
              {over && (
                <Text style={[s.microText, { color: C.red, marginTop: 4 }]}>
                  ⚠️  Excedeste em {fmt(meta.gasto - meta.limite)} €
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

function MetaBar({ pct, color, delay }) {
  const width = useSharedValue(0);
  React.useEffect(() => {
    width.value = withDelay(delay, withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [pct]);
  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return <Animated.View style={[{ height: '100%', backgroundColor: color, borderRadius: 3 }, barStyle]} />;
}

// ─── Cartão de insight da IA ──────────────────────────────────────────────────
function InsightCard({ item, index }) {
  const config = {
    alerta:    { icon: <AlertCircle size={16} color={C.red}    />, color: C.red,    label: 'Alerta'    },
    tendencia: { icon: <TrendingUp  size={16} color={C.yellow} />, color: C.yellow, label: 'Tendência' },
    positivo:  { icon: <CheckCircle size={16} color={C.green}  />, color: C.green,  label: 'Positivo'  },
    dica:      { icon: <Zap         size={16} color={C.brand}  />, color: C.brand,  label: 'Dica da IA' },
  };

  const tipo = item.tipo || 'dica';
  const cfg  = config[tipo] || config.dica;

  return (
    <AnimatedListItem index={index}>
      <View style={[s.card, { marginBottom: 10, borderLeftWidth: 3, borderLeftColor: cfg.color }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <View style={[s.iconWrap, { backgroundColor: cfg.color + '18', width: 30, height: 30 }]}>
            {cfg.icon}
          </View>
          <Text style={[s.label, { color: cfg.color, textTransform: 'uppercase', letterSpacing: 0.8 }]}>
            {cfg.label}
          </Text>
        </View>
        <Text style={[s.bodyText, { color: C.textMid, lineHeight: 20 }]}>
          {item.texto || ''}
        </Text>
        {item.valor != null && (
          <Text style={[s.microText, { marginTop: 8, color: cfg.color, fontWeight: '700' }]}>
            {fmt(item.valor)} €
          </Text>
        )}
      </View>
    </AnimatedListItem>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function InsightsSkeleton() {
  return (
    <View style={{ paddingHorizontal: SPACE.lg }}>
      {[0, 1, 2, 3, 4].map(i => (
        <MotiView
          key={i}
          from={{ opacity: 0.3 }}
          animate={{ opacity: 0.7 }}
          transition={{ type: 'timing', duration: 900, loop: true, delay: i * 130 }}
          style={[s.card, { height: i === 0 ? 130 : 80, marginBottom: 12 }]}
        />
      ))}
    </View>
  );
}

// ─── Estado vazio ─────────────────────────────────────────────────────────────
function EmptyState({ onRefresh, semDados }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={s.emptyWrap}>
      <View style={s.emptyIcon}>
        <Brain size={28} color={C.brand} />
      </View>
      <Text style={s.emptyTitle}>
        {semDados ? 'Adiciona dados para começar' : 'A Verly está a analisar'}
      </Text>
      <Text style={s.emptySub}>
        {semDados
          ? 'Regista algumas faturas e define o teu orçamento no Perfil. A IA precisa de dados para te ajudar.'
          : 'Ainda sem padrões suficientes. Volta em breve ou adiciona mais faturas.'}
      </Text>
      <Pressable style={s.emptyBtn} onPress={onRefresh}>
        <RefreshCw size={14} color={C.brand} />
        <Text style={[s.label, { color: C.brand }]}>Atualizar</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function InsightsScreen() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);

  const fetchInsights = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await insightsAPI.get();
      setData(result);
    } catch (e) {
      setError(e.message || 'Erro ao carregar insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchInsights(); }, []));

  const insights = data?.insights || [];
  const resumo   = data?.resumo;
  const semDados = data?.sem_dados;

  const hasContent = insights.length > 0 || resumo;

  return (
    <View style={s.root}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(300)} style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[s.iconWrap, { backgroundColor: C.brand + '20' }]}>
            <Brain size={18} color={C.brand} />
          </View>
          <View>
            <Text style={s.headerTitle}>Análise da IA</Text>
            <Text style={s.headerSub}>Padrões, tendências e recomendações</Text>
          </View>
        </View>
        <Pressable onPress={() => fetchInsights(true)} style={s.refreshBtn}>
          <RefreshCw size={16} color={C.textMid} />
        </Pressable>
      </Animated.View>

      {/* Conteúdo */}
      {loading ? (
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ height: 16 }} />
          <InsightsSkeleton />
        </ScrollView>
      ) : error ? (
        <View style={s.emptyWrap}>
          <AlertCircle size={28} color={C.red} />
          <Text style={[s.emptyTitle, { color: C.red }]}>Erro ao carregar</Text>
          <Text style={s.emptySub}>{error}</Text>
          <Pressable style={s.emptyBtn} onPress={() => fetchInsights()}>
            <RefreshCw size={14} color={C.brand} />
            <Text style={[s.label, { color: C.brand }]}>Tentar de novo</Text>
          </Pressable>
        </View>
      ) : !hasContent ? (
        <EmptyState onRefresh={() => fetchInsights(true)} semDados={semDados} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchInsights(true)}
              tintColor={C.brand}
              colors={[C.brand]}
            />
          }
          contentContainerStyle={{ paddingBottom: 40, paddingTop: 16 }}
        >
          {/* Score de saúde */}
          <ScoreFinanceiro resumo={resumo} />

          {/* Tendência mês a mês */}
          <TendenciaMensal resumo={resumo} />

          {/* Top categorias */}
          <TopCategorias resumo={resumo} />

          {/* Metas vs gastos */}
          <MetasProgress resumo={resumo} />

          {/* Insights da IA */}
          {insights.length > 0 && (
            <Animated.View entering={FadeInDown.delay(250).duration(400).springify()}
              style={{ marginHorizontal: SPACE.lg }}>
              <SectionHeader title="Recomendações da IA" />
              {insights.map((item, i) => (
                <InsightCard key={i} item={item} index={i} />
              ))}
            </Animated.View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontFamily: FONT.bold,
    fontSize: 17,
    color: C.text,
  },
  headerSub: {
    fontFamily: FONT.regular,
    fontSize: 12,
    color: C.textMid,
    marginTop: 1,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.surface2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreDial: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: C.surface3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigNum: {
    fontFamily: FONT.bold,
    fontSize: 24,
    color: C.text,
  },
  label: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: C.textMid,
  },
  bodyText: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: C.text,
  },
  microText: {
    fontFamily: FONT.regular,
    fontSize: 11,
    color: C.textSub,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: C.brand + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FONT.bold,
    fontSize: 16,
    color: C.text,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: C.textMid,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.brand + '50',
    backgroundColor: C.brand + '12',
  },
});
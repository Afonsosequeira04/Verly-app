// src/screens/RetrospetivaMensalScreen.js
// Retrospetiva Mensal — com navegação mês a mês

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, Dimensions,
  Share, RefreshControl, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown, FadeIn, ZoomIn,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import {
  TrendingUp, TrendingDown, Award, Flame, Target,
  BarChart2, Download, Share2, Calendar, Zap,
  ChevronLeft, ChevronRight,
} from 'lucide-react-native';
import { apiFetch, getToken } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const W = Dimensions.get('window').width;
const fmt  = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const fmtK = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmt(n);

const MESES_PT    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun',
                     'Jul','Ago','Set','Out','Nov','Dez'];

const CAT_COLORS = [
  '#7C6FE0','#E24B4A','#00D68F','#FFB300',
  '#45B7D1','#FF7340','#B06FE0','#E07090',
];

const BASE_URL = 'https://verly-app-production.up.railway.app/api/v1';

// ─── Mini bar chart horizontal ────────────────────────────────────────────────
function MiniBarChart({ dados }) {
  if (!dados || dados.length === 0) return null;
  const maxVal = Math.max(...dados.map(d => d.total), 1);

  return (
    <View style={{ gap: 10 }}>
      {dados.map((d, i) => {
        const pct = d.total / maxVal;
        const cor = CAT_COLORS[i % CAT_COLORS.length];
        return (
          <View key={i}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 12, color: C.textMid, fontWeight: '600' }} numberOfLines={1}>
                {d.categoria}
              </Text>
              <Text style={{ fontSize: 12, color: cor, fontWeight: '800' }}>{fmt(d.total)} €</Text>
            </View>
            <View style={{ height: 5, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' }}>
              <Animated.View
                entering={FadeIn.delay(i * 80)}
                style={{
                  height: '100%',
                  width: `${pct * 100}%`,
                  backgroundColor: cor,
                  borderRadius: 3,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Histograma de 6 meses ────────────────────────────────────────────────────
function Histograma({ historico, mesAtivo }) {
  if (!historico || historico.length === 0) return null;
  const maxVal = Math.max(...historico.map(d => d.total), 1);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 }}>
      {historico.map((d, i) => {
        const pct = d.total / maxVal;
        const isAtivo = d.mes === mesAtivo;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Animated.View
              entering={FadeIn.delay(i * 60)}
              style={{
                width: '100%',
                height: Math.max(pct * 64, 4),
                backgroundColor: isAtivo ? C.brand : C.surface3,
                borderRadius: 4,
              }}
            />
            <Text style={{
              fontSize: 9,
              color: isAtivo ? C.brand : C.textSub,
              fontWeight: isAtivo ? '800' : '500',
            }}>
              {d.mes}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function RetrospetivaMensalScreen({ navigation }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // índice do mês selecionado dentro do historico (começa no penúltimo = mês anterior)
  const [mesIdx, setMesIdx] = useState(null);

  const carregar = useCallback(async (isRefresh = false) => {
    try {
      const res = await apiFetch('/exportar/resumo');
      setData(res);
      // ao carregar, posicionar no penúltimo mês (mês anterior ao atual)
      const hist = res?.historico_mensal || [];
      if (mesIdx === null && hist.length >= 2) {
        setMesIdx(hist.length - 2);
      }
    } catch (e) {
      console.error('RetrospetivaMensal:', e);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const onRefresh = () => { setRefreshing(true); carregar(true); };

  const partilhar = async () => {
    if (!data) return;
    const historico = data.historico_mensal || [];
    const mesRef    = historico[mesIdx ?? historico.length - 2];
    const total     = mesRef?.total || 0;
    const topCat    = data.top_categorias?.[0];
    try {
      await Share.share({
        message: `O meu resumo Verly de ${mesRef?.mes || 'este mês'}:\n💸 ${fmt(total)} € gastos\n🏆 Categoria top: ${topCat?.categoria || '—'}\n📱 Baixa a Verly em verly.app`,
      });
    } catch (e) {}
  };

  const exportarPDF = async () => {
    try {
      const token = await getToken();
      Linking.openURL(`${BASE_URL}/exportar/pdf?_token=${token}`);
    } catch (e) {
      console.error('Exportar PDF:', e);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  const historico   = data?.historico_mensal || [];
  const idx         = mesIdx ?? historico.length - 2;
  const mesAtual_   = historico[idx];
  const mesAnterior = historico[idx - 1];

  const totalMes    = mesAtual_?.total || 0;
  const totalAnt    = mesAnterior?.total || 0;
  const variacao    = totalAnt > 0
    ? ((totalMes - totalAnt) / totalAnt) * 100
    : null;

  const topCats     = (data?.top_categorias || []).slice(0, 5);
  const streak      = data?.streak_dias || 0;
  const rendimento  = data?.rendimento_mensal || 0;
  const pctRend     = rendimento > 0 ? (totalMes / rendimento) * 100 : null;

  const nomeMes = mesAtual_?.mes
    ? MESES_PT[MESES_SHORT.indexOf(mesAtual_.mes)] ?? mesAtual_.mes
    : 'Mês';

  const mesProximo  = MESES_PT[(MESES_SHORT.indexOf(mesAtual_?.mes) + 1) % 12] || 'próximo mês';

  const podePrev = idx > 0;
  const podeNext = idx < historico.length - 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
      >
        {/* Header */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
          <View style={styles.headerTop}>

            {/* Botão voltar */}
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronLeft size={24} color={C.text} />
            </Pressable>

            {/* Navegação mês */}
            <View style={styles.mesNav}>
              <Pressable
                onPress={() => podePrev && setMesIdx(idx - 1)}
                style={[styles.navBtn, !podePrev && styles.navBtnDisabled]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ChevronLeft size={18} color={podePrev ? C.text : C.textSub} />
              </Pressable>

              <View style={{ alignItems: 'center' }}>
                <Text style={styles.headerLabel}>Retrospetiva de</Text>
                <Text style={styles.headerMes}>{nomeMes}</Text>
              </View>

              <Pressable
                onPress={() => podeNext && setMesIdx(idx + 1)}
                style={[styles.navBtn, !podeNext && styles.navBtnDisabled]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ChevronRight size={18} color={podeNext ? C.text : C.textSub} />
              </Pressable>
            </View>

            {/* Partilhar */}
            <Pressable onPress={partilhar} style={styles.shareBtn}>
              <Share2 size={16} color={C.brand} />
            </Pressable>
          </View>
        </Animated.View>

        {/* Hero — total gasto */}
        <Animated.View entering={ZoomIn.delay(100).duration(500)} style={styles.heroCard}>
          <Text style={styles.heroLabel}>Total gasto em {nomeMes}</Text>
          <Text style={styles.heroValor}>{fmt(totalMes)} €</Text>

          {variacao !== null && (
            <View style={styles.variacaoRow}>
              {variacao > 0
                ? <TrendingUp size={14} color={C.red} />
                : <TrendingDown size={14} color={C.green} />
              }
              <Text style={[styles.variacaoText, { color: variacao > 0 ? C.red : C.green }]}>
                {variacao > 0 ? '+' : ''}{variacao.toFixed(1)}% vs {mesAnterior?.mes || 'mês anterior'}
              </Text>
            </View>
          )}

          {pctRend !== null && (
            <Text style={styles.heroSub}>
              {pctRend.toFixed(0)}% do teu rendimento mensal
            </Text>
          )}
        </Animated.View>

        {/* Histograma 6 meses */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.card}>
          <View style={styles.cardTitleRow}>
            <BarChart2 size={16} color={C.brand} />
            <Text style={styles.cardTitle}>Evolução dos últimos 6 meses</Text>
          </View>
          <Histograma historico={historico} mesAtivo={mesAtual_?.mes} />
        </Animated.View>

        {/* Top categorias */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Target size={16} color={C.brand} />
            <Text style={styles.cardTitle}>Onde gastaste mais</Text>
          </View>
          {topCats.length > 0
            ? <MiniBarChart dados={topCats} />
            : <Text style={{ fontSize: FONT.sm, color: C.textSub }}>Sem dados para este mês ainda.</Text>
          }
        </Animated.View>

        {/* Streak */}
        {streak > 0 && (
          <Animated.View entering={FadeInDown.delay(400)} style={[styles.card, styles.streakCard]}>
            <View style={styles.cardTitleRow}>
              <Flame size={18} color='#FF7340' />
              <Text style={[styles.cardTitle, { color: '#FF7340' }]}>Streak de {streak} dia{streak !== 1 ? 's' : ''}!</Text>
            </View>
            <Text style={styles.streakSub}>
              Mantiveste a disciplina financeira durante {streak} dia{streak !== 1 ? 's' : ''} consecutivos.
              {streak >= 7 ? ' Impressionante! 🔥' : ' Continua assim!'}
            </Text>
          </Animated.View>
        )}

        {/* Dica da Verly */}
        <Animated.View entering={FadeInDown.delay(450)} style={[styles.card, styles.dicaCard]}>
          <View style={styles.cardTitleRow}>
            <Zap size={16} color={C.brand} />
            <Text style={styles.cardTitle}>O que melhorar em {mesProximo}</Text>
          </View>
          {variacao !== null && variacao > 15 ? (
            <Text style={styles.dicaText}>
              Gastaste {variacao.toFixed(0)}% mais do que em {mesAnterior?.mes || 'mês anterior'}.
              Tenta identificar o que mudou — a Lei de Parkinson diz que os gastos expandem para o dinheiro disponível.
              Define um limite concreto para o próximo mês.
            </Text>
          ) : variacao !== null && variacao < -10 ? (
            <Text style={styles.dicaText}>
              Excelente! Reduziste {Math.abs(variacao).toFixed(0)}% face ao mês anterior.
              Mantém este ritmo e considera direcionar a poupança para um fundo de emergência
              (objetivo: 3-6 meses de despesas, i.e., {fmt(totalMes * 4)}€).
            </Text>
          ) : (
            <Text style={styles.dicaText}>
              Os teus gastos mantêm-se estáveis. Bom sinal de consistência.
              A regra 50/30/20 sugere: 50% necessidades, 30% desejos, 20% poupança.
              {rendimento > 0 ? ` Objetivo de poupança: ${fmt(rendimento * 0.20)}€/mês.` : ''}
            </Text>
          )}
        </Animated.View>

        {/* Botão exportar PDF */}
        <Animated.View entering={FadeInDown.delay(500)}>
          <Pressable onPress={exportarPDF} style={styles.exportBtn}>
            <Download size={18} color="#fff" />
            <Text style={styles.exportBtnText}>Exportar Relatório PDF</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: SPACE.lg, paddingBottom: 40 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  header:    { marginBottom: SPACE.lg, paddingTop: 4 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.surface2,
    justifyContent: 'center', alignItems: 'center',
  },

  mesNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginHorizontal: 8,
  },
  navBtn:         { padding: 4 },
  navBtnDisabled: { opacity: 0.3 },

  headerLabel: { fontSize: FONT.xs, color: C.textSub, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  headerMes:   { fontSize: FONT.h2, fontWeight: '900', color: C.text, marginTop: 2, textAlign: 'center' },

  shareBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand + '40',
    justifyContent: 'center', alignItems: 'center',
  },

  heroCard: {
    backgroundColor: C.brand,
    borderRadius: RADIUS.lg,
    padding: 24,
    marginBottom: SPACE.lg,
    alignItems: 'center',
  },
  heroLabel:   { fontSize: FONT.sm, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  heroValor:   { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1, marginTop: 8 },
  variacaoRow: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 10 },
  variacaoText:{ fontSize: FONT.sm, fontWeight: '700' },
  heroSub:     { fontSize: FONT.xs, color: 'rgba(255,255,255,0.6)', marginTop: 8 },

  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: SPACE.md,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle:    { fontSize: FONT.sm, fontWeight: '700', color: C.text },

  streakCard: { borderColor: '#FF7340' + '40', backgroundColor: '#FF7340' + '0F' },
  streakSub:  { fontSize: FONT.sm, color: C.textMid, lineHeight: 20 },

  dicaCard: { borderColor: C.brand + '30' },
  dicaText: { fontSize: FONT.sm, color: C.textMid, lineHeight: 20 },

  exportBtn: {
    backgroundColor: C.brand,
    borderRadius: RADIUS.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  exportBtnText: { color: '#fff', fontWeight: '800', fontSize: FONT.md },
});
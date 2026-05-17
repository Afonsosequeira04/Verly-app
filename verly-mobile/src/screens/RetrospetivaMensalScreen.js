// src/screens/RetrospetivaMensalScreen.js
// Retrospetiva Mensal — resumo do mês anterior estilo Spotify Wrapped
// Mostra: total gasto, categoria top, comparação com mês antes, streak, dica da Verly

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, Dimensions,
  Share, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  FadeInDown, FadeIn, ZoomIn,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import {
  TrendingUp, TrendingDown, Award, Flame, Target,
  BarChart2, Download, Share2, Calendar, Zap,
} from 'lucide-react-native';
import { apiFetch } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const W = Dimensions.get('window').width;
const fmt  = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const fmtK = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmt(n);

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                     'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const CAT_COLORS = [
  '#7C6FE0', '#E24B4A', '#00D68F', '#FFB300',
  '#45B7D1', '#FF7340', '#B06FE0', '#E07090',
];

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
function Histograma({ historico }) {
  if (!historico || historico.length === 0) return null;
  const maxVal = Math.max(...historico.map(d => d.total), 1);
  const BAR_H = 80;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: BAR_H + 30 }}>
      {historico.map((d, i) => {
        const h = Math.max((d.total / maxVal) * BAR_H, 4);
        const isCurrent = i === historico.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: C.textSub, marginBottom: 4 }}>
              {d.total > 0 ? `${(d.total / 1000).toFixed(d.total >= 1000 ? 1 : 0)}${d.total >= 1000 ? 'k' : ''}` : ''}
            </Text>
            <MotiView
              from={{ height: 4 }}
              animate={{ height: h }}
              transition={{ type: 'spring', delay: i * 60 }}
              style={{
                width: '100%',
                backgroundColor: isCurrent ? C.brand : C.surface3,
                borderRadius: 4,
              }}
            />
            <Text style={{ fontSize: 9, color: isCurrent ? C.brand : C.textSub, marginTop: 5, fontWeight: isCurrent ? '800' : '500' }}>
              {d.mes}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function RetrospetivaMensalScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const hoje = new Date();
  const mesAtual = hoje.getMonth(); // 0-indexed
  const nomesMesAtual = MESES_PT[mesAtual];

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      const res = await apiFetch('/exportar/resumo');
      if (res.success) setData(res);
    } catch (e) {
      console.error('RetrospetivaMensal:', e);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetch(); }, [fetch]));

  const onRefresh = () => { setRefreshing(true); fetch(true); };

  const partilhar = async () => {
    if (!data) return;
    const historico = data.historico_mensal || [];
    const mesRef = historico[historico.length - 2];
    const total = mesRef?.total || 0;
    const topCat = data.top_categorias?.[0];

    try {
      await Share.share({
        message: `O meu resumo Verly de ${mesRef?.mes || 'este mês'}:\n💸 ${fmt(total)} € gastos\n🏆 Categoria top: ${topCat?.categoria || '—'}\n📱 Baixa a Verly em verly.app`,
      });
    } catch (e) {}
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  const historico = data?.historico_mensal || [];
  const mesAnterior = historico[historico.length - 2];
  const mesAtualData = historico[historico.length - 1];
  const mesAntAnterior = historico[historico.length - 3];

  const totalMesAnt = mesAnterior?.total || 0;
  const totalMesAntAnt = mesAntAnterior?.total || 0;
  const variacao = totalMesAntAnt > 0
    ? ((totalMesAnt - totalMesAntAnt) / totalMesAntAnt) * 100
    : null;

  const topCats = (data?.top_categorias || []).slice(0, 5);
  const streak = data?.streak_dias || 0;
  const rendimento = data?.rendimento_mensal || 0;
  const pctRendimento = rendimento > 0 ? (totalMesAnt / rendimento) * 100 : null;
  const nome = data?.nome || 'utilizador';

  const nomeMesAnt = mesAnterior?.mes
    ? MESES_PT[MESES_SHORT.indexOf(mesAnterior.mes)] || mesAnterior.mes
    : 'Mês anterior';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
    >
      {/* Header */}
      <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerLabel}>Retrospetiva de</Text>
            <Text style={styles.headerMes}>{nomeMesAnt}</Text>
          </View>
          <Pressable onPress={partilhar} style={styles.shareBtn}>
            <Share2 size={16} color={C.brand} />
          </Pressable>
        </View>
      </Animated.View>

      {/* Hero — total gasto */}
      <Animated.View entering={ZoomIn.delay(100).duration(500)} style={styles.heroCard}>
        <Text style={styles.heroLabel}>Total gasto em {nomeMesAnt}</Text>
        <Text style={styles.heroValor}>{fmt(totalMesAnt)} €</Text>

        {variacao !== null && (
          <View style={styles.variacaoRow}>
            {variacao > 0
              ? <TrendingUp size={14} color={C.red} />
              : <TrendingDown size={14} color={C.green} />
            }
            <Text style={[styles.variacaoText, { color: variacao > 0 ? C.red : C.green }]}>
              {variacao > 0 ? '+' : ''}{variacao.toFixed(1)}% vs {mesAntAnterior?.mes || 'mês anterior'}
            </Text>
          </View>
        )}

        {pctRendimento !== null && (
          <Text style={styles.heroSub}>
            {pctRendimento.toFixed(0)}% do teu rendimento mensal
          </Text>
        )}
      </Animated.View>

      {/* Histograma 6 meses */}
      <Animated.View entering={FadeInDown.delay(200)} style={styles.card}>
        <View style={styles.cardTitleRow}>
          <BarChart2 size={16} color={C.brand} />
          <Text style={styles.cardTitle}>Evolução dos últimos 6 meses</Text>
        </View>
        <Histograma historico={historico} />
      </Animated.View>

      {/* Top categorias */}
      <Animated.View entering={FadeInDown.delay(300)} style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Target size={16} color={C.brand} />
          <Text style={styles.cardTitle}>Onde gastaste mais</Text>
        </View>
        <MiniBarChart dados={topCats} />
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

      {/* Dica da Verly para este mês */}
      <Animated.View entering={FadeInDown.delay(450)} style={[styles.card, styles.dicaCard]}>
        <View style={styles.cardTitleRow}>
          <Zap size={16} color={C.brand} />
          <Text style={styles.cardTitle}>O que melhorar em {nomesMesAtual}</Text>
        </View>
        {variacao !== null && variacao > 15 ? (
          <Text style={styles.dicaText}>
            Gastaste {variacao.toFixed(0)}% mais do que em {mesAntAnterior?.mes || 'mês anterior'}.
            Tenta identificar o que mudou — a Lei de Parkinson diz que os gastos expandem para o dinheiro disponível.
            Define um limite concreto para este mês.
          </Text>
        ) : variacao !== null && variacao < -10 ? (
          <Text style={styles.dicaText}>
            Excelente! Reduziu{Math.abs(variacao).toFixed(0)}% face ao mês anterior.
            Mantém este ritmo e considera direcionar a poupança para um fundo de emergência
            (objetivo: 3-6 meses de despesas, i.e., {fmt(totalMesAnt * 4)}€).
          </Text>
        ) : (
          <Text style={styles.dicaText}>
            Os teus gastos mantêm-se estáveis. Bom sinal de consistência.
            A regra 50/30/20 de Elizabeth Warren sugere: 50% necessidades, 30% desejos, 20% poupança.
            {rendimento > 0 ? ` Objetivo de poupança: ${fmt(rendimento * 0.20)}€/mês.` : ''}
          </Text>
        )}
      </Animated.View>

      {/* Botão exportar PDF */}
      <Animated.View entering={FadeInDown.delay(500)}>
        <Pressable
          onPress={async () => {
            try {
              const { getToken } = await import('../services/api');
              const token = await getToken();
              const BASE_URL = 'https://verly-app-production.up.railway.app/api/v1';
              // Abre o PDF no browser externo (RN não tem download direto sem expo-file-system)
              const { Linking } = require('react-native');
              Linking.openURL(`${BASE_URL}/exportar/pdf?token=${token}`);
            } catch (e) {
              console.error(e);
            }
          }}
          style={styles.exportBtn}
        >
          <Download size={18} color="#fff" />
          <Text style={styles.exportBtnText}>Exportar Relatório PDF</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: SPACE.lg, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  header: { marginBottom: SPACE.lg, paddingTop: 8 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLabel: { fontSize: FONT.xs, color: C.textSub, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  headerMes: { fontSize: FONT.h2, fontWeight: '900', color: C.text, marginTop: 2 },
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
  heroLabel: { fontSize: FONT.sm, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  heroValor: { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1, marginTop: 8 },
  variacaoRow: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 10 },
  variacaoText: { fontSize: FONT.sm, fontWeight: '700' },
  heroSub: { fontSize: FONT.xs, color: 'rgba(255,255,255,0.6)', marginTop: 8 },

  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: SPACE.md,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { fontSize: FONT.sm, fontWeight: '700', color: C.text },

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
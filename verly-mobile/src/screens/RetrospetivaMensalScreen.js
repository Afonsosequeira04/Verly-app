// src/screens/RetrospetivaMensalScreen.js — FASE 2 + cache + haptics

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, Dimensions,
  Share, RefreshControl, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withDelay,
  FadeInDown, FadeIn, ZoomIn,
  Easing,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import {
  TrendingUp, TrendingDown, Award,
  Target, BarChart2, Download, Share2, Zap,
  ChevronLeft, ChevronRight, ShoppingBag,
} from 'lucide-react-native';
import { getToken } from '../services/api';
import { useRetrospetiva } from '../hooks/useRetrospetiva';
import { haptic } from '../utils/haptics';
import { COLORS, RADIUS } from '../constants/theme';

const C = COLORS;
const W = Dimensions.get('window').width;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');

const MESES_PT = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const CAT_COLORS = [
  '#7C6FE0','#00D68F','#FFB300','#FF5370',
  '#45B7D1','#FF7340','#B06FE0','#E07090',
];

const BASE_URL = 'https://verly-app-production.up.railway.app/api/v1';

// Barra horizontal animada
function AnimBar({ categoria, total, max, color, index }) {
  const width = useSharedValue(0);

  React.useEffect(() => {
    const pct = max > 0 ? (total / max) * 100 : 0;
    width.value = withDelay(
      index * 80,
      withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [total, max]);

  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <Animated.View entering={FadeIn.delay(index * 60)}>
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
          <Text style={{ fontSize: 12, color: C.textMid, fontWeight: '600' }} numberOfLines={1}>
            {categoria}
          </Text>
          <Text style={{ fontSize: 12, color, fontWeight: '800' }}>{fmt(total)} €</Text>
        </View>
        <View style={{ height: 6, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', backgroundColor: color, borderRadius: 3 }, barStyle]} />
        </View>
      </View>
    </Animated.View>
  );
}

// Barra do histograma (componente proprio para evitar hooks em loops)
function HistogramaBar({ d, i, maxVal, mesAtivo }) {
  const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const pct = d.total / maxVal;
  const isAtivo = d.mes === mesAtivo;
  const m = parseInt(d.mes.split('-')[1], 10) - 1;
  const label = MESES_SHORT[m] || d.mes;
  const height = useSharedValue(4);

  React.useEffect(() => {
    height.value = withDelay(i * 60, withTiming(Math.max(pct * 64, 4), {
      duration: 650, easing: Easing.out(Easing.cubic),
    }));
  }, [d.total]);

  const barStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      <Animated.View style={[{
        width: '100%',
        backgroundColor: isAtivo ? C.brand : C.surface3,
        borderRadius: 4,
      }, barStyle]} />
      <Text style={{
        fontSize: 9,
        fontWeight: isAtivo ? '800' : '500',
        color: isAtivo ? C.brand : C.textSub,
      }}>
        {label}
      </Text>
    </View>
  );
}

function Histograma({ historico, mesAtivo }) {
  if (!historico || historico.length === 0) return null;
  const maxVal = Math.max(...historico.map(d => d.total), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 }}>
      {historico.map((d, i) => (
        <HistogramaBar key={i} d={d} i={i} maxVal={maxVal} mesAtivo={mesAtivo} />
      ))}
    </View>
  );
}

// Componente principal
export default function RetrospetivaMensalScreen({ navigation }) {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);

  const {
    data, loading, refreshing, mesesDisponiveis,
    carregar, onRefresh, setLoading,
  } = useRetrospetiva();

  useFocusEffect(useCallback(() => {
    setLoading(true);
    carregar(ano, mes);
  }, [ano, mes]));

  const mesKey = `${ano}-${String(mes).padStart(2, '0')}`;
  const idxAtual = mesesDisponiveis.indexOf(mesKey);
  const podePrev = idxAtual > 0 || (idxAtual === -1 && mesesDisponiveis.length > 0);
  const podeNext = idxAtual < mesesDisponiveis.length - 1;

  const irParaMes = (chave) => {
    const parts = chave.split('-');
    const a = Number(parts[0]);
    const m = Number(parts[1]);
    setAno(a);
    setMes(m);
    setLoading(true);
  };

  const navPrev = () => {
    if (!podePrev) return;
    haptic.select();
    const idx = idxAtual === -1 ? mesesDisponiveis.length - 1 : idxAtual - 1;
    irParaMes(mesesDisponiveis[idx]);
  };

  const navNext = () => {
    if (!podeNext) return;
    haptic.select();
    irParaMes(mesesDisponiveis[idxAtual + 1]);
  };

  const partilhar = async () => {
    if (!data) return;
    haptic.medium();
    try {
      await Share.share({
        message: `O meu resumo Verly de ${data.mes_nome} ${data.ano}:\n💸 ${fmt(data.total)} euros gastos\n🏆 Categoria top: ${data.por_categoria && data.por_categoria[0] ? data.por_categoria[0].categoria : '-'}\n📱 verly.app`,
      });
    } catch (e) {}
  };

  const exportarPDF = async () => {
    haptic.medium();
    try {
      const token = await getToken();
      Linking.openURL(`${BASE_URL}/exportar/pdf?_token=${token}`);
    } catch (e) {
      haptic.error();
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

  const total    = data ? data.total || 0 : 0;
  const comp     = data ? data.comparacao || {} : {};
  const variacao = comp.variacao_pct;
  const subiu    = comp.subiu;
  const topCats  = data ? (data.por_categoria || []).slice(0, 6) : [];
  const maxCat   = topCats.length > 0 ? topCats[0].total || 1 : 1;
  const historico = data ? data.historico || [] : [];
  const meta     = data ? data.meta_orcamento : null;
  const topLoja  = data ? data.top_loja : null;
  const maiscara = data ? data.fatura_mais_cara : null;
  const nomeMes  = data ? data.mes_nome || MESES_PT[mes - 1] : MESES_PT[mes - 1];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => onRefresh(ano, mes)}
            tintColor={C.brand}
          />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <Pressable
            onPress={() => { haptic.light(); navigation && navigation.goBack(); }}
            style={styles.backBtn}
            hitSlop={10}
          >
            <ChevronLeft size={22} color={C.text} />
          </Pressable>

          <View style={styles.mesNav}>
            <Pressable
              onPress={navPrev}
              style={[styles.navBtn, !podePrev && styles.navBtnDisabled]}
              hitSlop={10}
            >
              <ChevronLeft size={18} color={podePrev ? C.text : C.textSub} />
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.headerLabel}>RETROSPETIVA</Text>
              <Text style={styles.headerMes}>{nomeMes} {ano}</Text>
            </View>
            <Pressable
              onPress={navNext}
              style={[styles.navBtn, !podeNext && styles.navBtnDisabled]}
              hitSlop={10}
            >
              <ChevronRight size={18} color={podeNext ? C.text : C.textSub} />
            </Pressable>
          </View>

          <Pressable onPress={partilhar} style={styles.shareBtn}>
            <Share2 size={16} color={C.brand} />
          </Pressable>
        </Animated.View>

        {/* Hero total gasto */}
        <Animated.View entering={ZoomIn.delay(80).duration(500)} style={styles.heroCard}>
          <Text style={styles.heroLabel}>Total gasto em {nomeMes}</Text>
          <Text style={styles.heroValor}>{fmt(total)} €</Text>

          {variacao != null && (
            <View style={styles.variacaoRow}>
              {subiu
                ? <TrendingUp size={14} color={C.red} />
                : <TrendingDown size={14} color={C.green} />
              }
              <Text style={[styles.variacaoText, { color: subiu ? C.red : C.green }]}>
                {subiu ? '+' : '-'}{variacao}% vs mes anterior ({fmt(comp.total_anterior)} €)
              </Text>
            </View>
          )}

          {data && data.num_faturas > 0 && (
            <Text style={styles.heroSub}>
              {data.num_faturas} fatura{data.num_faturas !== 1 ? 's' : ''} · media {fmt(data.media_fatura)} €
            </Text>
          )}
        </Animated.View>

        {/* Orcamento */}
        {meta && (
          <Animated.View entering={FadeInDown.delay(140).duration(380).springify()} style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Target size={15} color={meta.excedeu ? C.red : C.green} />
              <Text style={styles.cardTitle}>Orcamento mensal</Text>
              <Text style={[styles.pill, {
                backgroundColor: (meta.excedeu ? C.red : C.green) + '20',
                color: meta.excedeu ? C.red : C.green,
              }]}>
                {meta.excedeu ? 'Excedido' : 'Dentro do limite'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: C.textSub }}>{fmt(meta.gasto)} € de {fmt(meta.orcamento)} €</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: meta.excedeu ? C.red : C.green }}>{meta.pct}%</Text>
            </View>
            <View style={{ height: 8, backgroundColor: C.surface3, borderRadius: 4, overflow: 'hidden' }}>
              <MotiView
                from={{ width: '0%' }}
                animate={{ width: `${Math.min(meta.pct, 100)}%` }}
                transition={{ type: 'timing', duration: 800, delay: 300 }}
                style={{ height: '100%', backgroundColor: meta.excedeu ? C.red : C.green, borderRadius: 4 }}
              />
            </View>
          </Animated.View>
        )}

        {/* Histograma */}
        {historico.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(380).springify()} style={styles.card}>
            <View style={styles.cardTitleRow}>
              <BarChart2 size={15} color={C.brand} />
              <Text style={styles.cardTitle}>Evolucao dos ultimos 6 meses</Text>
            </View>
            <Histograma historico={historico} mesAtivo={mesKey} />
          </Animated.View>
        )}

        {/* Categorias */}
        {topCats.length > 0 && (
          <Animated.View entering={FadeInDown.delay(260).duration(380).springify()} style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Target size={15} color={C.brand} />
              <Text style={styles.cardTitle}>Onde gastaste mais</Text>
            </View>
            {topCats.map((d, i) => (
              <AnimBar
                key={d.categoria}
                categoria={d.categoria}
                total={d.total}
                max={maxCat}
                color={CAT_COLORS[i % CAT_COLORS.length]}
                index={i}
              />
            ))}
          </Animated.View>
        )}

        {/* Destaques */}
        {(topLoja || maiscara) && (
          <Animated.View entering={FadeInDown.delay(320).duration(380).springify()} style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Award size={15} color={C.yellow} />
              <Text style={styles.cardTitle}>Destaques do mes</Text>
            </View>
            {topLoja && (
              <View style={styles.destaqueRow}>
                <ShoppingBag size={14} color={C.brand} />
                <Text style={styles.destaqueLabel}>Loja favorita</Text>
                <Text style={styles.destaqueVal}>{topLoja.nome} · {fmt(topLoja.total)} €</Text>
              </View>
            )}
            {maiscara && (
              <View style={styles.destaqueRow}>
                <Zap size={14} color={C.yellow} />
                <Text style={styles.destaqueLabel}>Compra mais cara</Text>
                <Text style={styles.destaqueVal}>{maiscara.loja} · {fmt(maiscara.total)} €</Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* Dica */}
        <Animated.View entering={FadeInDown.delay(380).duration(380).springify()} style={[styles.card, styles.dicaCard]}>
          <View style={styles.cardTitleRow}>
            <Zap size={15} color={C.brand} />
            <Text style={styles.cardTitle}>Dica para o proximo mes</Text>
          </View>
          {variacao != null && subiu && variacao > 15 ? (
            <Text style={styles.dicaText}>
              Gastaste {variacao}% mais do que no mes anterior. Tenta identificar o que mudou e define um teto concreto para o mes que vem.
            </Text>
          ) : variacao != null && !subiu && variacao > 10 ? (
            <Text style={styles.dicaText}>
              Excelente! Poupaste {variacao}% face ao mes anterior. Considera direcionar essa diferenca para poupanca ou investimento.
            </Text>
          ) : (
            <Text style={styles.dicaText}>
              Gastos estaveis - sinal de consistencia. A regra 50/30/20 sugere 20% do rendimento em poupanca. Estas no caminho certo?
            </Text>
          )}
        </Animated.View>

        {/* Sem dados */}
        {data && data.num_faturas === 0 && (
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 18 }}
            style={styles.emptyState}
          >
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 }}>
              Sem faturas em {nomeMes}
            </Text>
            <Text style={{ fontSize: 13, color: C.textSub, marginTop: 6, textAlign: 'center' }}>
              Navega para outro mes ou adiciona faturas.
            </Text>
          </MotiView>
        )}

        {/* Exportar PDF */}
        <Animated.View entering={FadeInDown.delay(440).duration(380).springify()}>
          <Pressable onPress={exportarPDF} style={styles.exportBtn}>
            <Download size={18} color="#fff" />
            <Text style={styles.exportBtnText}>Exportar Relatorio PDF</Text>
          </Pressable>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },
  center:  { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },

  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn:   { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface2, justifyContent: 'center', alignItems: 'center' },
  mesNav:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginHorizontal: 8 },
  navBtn:    { padding: 4 },
  navBtnDisabled: { opacity: 0.3 },
  headerLabel: { fontSize: 10, color: C.textSub, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  headerMes:   { fontSize: 20, fontWeight: '900', color: C.text },
  shareBtn:  { width: 36, height: 36, borderRadius: 10, backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand + '40', justifyContent: 'center', alignItems: 'center' },

  heroCard:    { backgroundColor: C.brand, borderRadius: RADIUS.lg, padding: 24, marginBottom: 16, alignItems: 'center' },
  heroLabel:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  heroValor:   { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: 0, marginTop: 8 },
  variacaoRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10 },
  variacaoText: { fontSize: 13, fontWeight: '700' },
  heroSub:     { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 },

  card:         { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle:    { fontSize: 13, fontWeight: '700', color: C.text, flex: 1 },
  pill:         { fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },

  destaqueRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  destaqueLabel: { fontSize: 12, color: C.textSub, fontWeight: '600', width: 100 },
  destaqueVal:   { fontSize: 13, color: C.text, fontWeight: '700', flex: 1 },

  dicaCard: { borderColor: C.brand + '30' },
  dicaText: { fontSize: 13, color: C.textMid, lineHeight: 21 },

  emptyState: { alignItems: 'center', paddingVertical: 40 },

  exportBtn:     { backgroundColor: C.brand, borderRadius: RADIUS.lg, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6 },
  exportBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

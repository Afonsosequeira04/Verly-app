/**
 * src/screens/RelatorioScreen.js
 * Relatório Mensal — design luxury dark · sem emojis · Lucide icons
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  TrendingDown, TrendingUp, Percent, Receipt,
  ChevronLeft, ChevronRight, Award, BarChart2,
} from 'lucide-react-native';
import { relatorioAPI } from '../services/api';

const C = {
  bg:      '#0A0A12',
  surface: '#111120',
  surface2:'#181828',
  surface3:'#1E1E32',
  border:  '#22223A',
  brand:   '#6C5CE7',
  text:    '#F0F0F8',
  textSub: '#6A6A90',
  textMid: '#9898C0',
  green:   '#00C896',
  red:     '#FF5370',
  yellow:  '#FFB300',
};

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const BAR_COLORS = ['#6C5CE7','#00C896','#22D4FD','#FFB300','#FF5370','#C264DE','#FF8C42','#4ECDC4'];

const W = Dimensions.get('window').width;

// ── Barra horizontal ──────────────────────────────────────────────────────────
function HorizBar({ categoria, total, max, color }) {
  const pct = max > 0 ? total / max : 0;
  const barW = (W - 80) * pct;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>{categoria}</Text>
      <View style={styles.barTrackWrap}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: Math.max(barW, 4), backgroundColor: color }]} />
        </View>
        <Text style={styles.barVal}>{total.toFixed(0)}€</Text>
      </View>
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ Icon, label, value, sub, accent }) {
  return (
    <View style={[styles.statCard, accent && { borderColor: accent + '40' }]}>
      {accent && <View style={[styles.statAccent, { backgroundColor: accent }]} />}
      <View style={[styles.statIconWrap, { backgroundColor: (accent || C.brand) + '18' }]}>
        <Icon size={16} color={accent || C.brand} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

// ── Ecrã ──────────────────────────────────────────────────────────────────────
export default function RelatorioScreen() {
  const now = new Date();
  const [mes,  setMes]  = useState(now.getMonth() + 1);
  const [ano,  setAno]  = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const result = await relatorioAPI.get({ mes, ano });
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchData();
  }, [mes, ano]));

  const prevMes = () => {
    if (mes === 1) { setMes(12); setAno(a => a - 1); }
    else setMes(m => m - 1);
  };
  const nextMes = () => {
    if (mes === 12) { setMes(1); setAno(a => a + 1); }
    else setMes(m => m + 1);
  };

  const maxCat = data?.por_categoria?.[0]?.total || 1;

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
      {/* Seletor de mês */}
      <View style={styles.mesNav}>
        <TouchableOpacity onPress={prevMes} style={styles.mesNavBtn}>
          <ChevronLeft size={20} color={C.textMid} />
        </TouchableOpacity>
        <Text style={styles.mesTitulo}>{MESES[mes - 1]} {ano}</Text>
        <TouchableOpacity onPress={nextMes} style={styles.mesNavBtn}>
          <ChevronRight size={20} color={C.textMid} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadBox}>
          <ActivityIndicator size="large" color={C.brand} />
        </View>
      ) : !data || data.total_gasto === 0 ? (
        <View style={styles.emptyBox}>
          <BarChart2 size={44} color={C.border} />
          <Text style={styles.emptyTitle}>Sem dados este mês</Text>
          <Text style={styles.emptySub}>Carrega faturas para ver o relatório.</Text>
        </View>
      ) : (
        <>
          {/* Roast / frase da Verly */}
          {data.roast_phrase && (
            <View style={styles.roastCard}>
              <Award size={16} color={C.brand} />
              <Text style={styles.roastText}>"{data.roast_phrase}"</Text>
            </View>
          )}

          {/* Stats principais */}
          <View style={styles.statsGrid}>
            <StatCard
              Icon={Receipt}
              label="Total Gasto"
              value={`${(data.total_gasto || 0).toFixed(2)}€`}
              sub={`${data.num_faturas} fatura${data.num_faturas !== 1 ? 's' : ''}`}
              accent={C.brand}
            />
            <StatCard
              Icon={TrendingDown}
              label="Desperdício"
              value={`${(data.desperdicado || 0).toFixed(0)}€`}
              sub={`${((data.desperdicado / (data.total_gasto || 1)) * 100).toFixed(0)}% do total`}
              accent={C.red}
            />
            <StatCard
              Icon={Percent}
              label="Compras úteis"
              value={`${data.pct_util ?? 0}%`}
              sub="score médio"
              accent={C.green}
            />
            <StatCard
              Icon={TrendingUp}
              label="Média/fatura"
              value={`${(data.media_fatura || 0).toFixed(0)}€`}
              accent={C.yellow}
            />
          </View>

          {/* Por categoria */}
          {data.por_categoria?.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Por categoria</Text>
              {data.por_categoria.map((item, i) => (
                <HorizBar
                  key={item.categoria}
                  categoria={item.categoria}
                  total={item.total}
                  max={maxCat}
                  color={BAR_COLORS[i % BAR_COLORS.length]}
                />
              ))}
            </View>
          )}

          {/* Comparação */}
          {data.comparacao && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Vs. mês anterior</Text>
              <View style={styles.compRow}>
                <View style={styles.compSide}>
                  <Text style={styles.compLabel}>Mês anterior</Text>
                  <Text style={styles.compVal}>{(data.comparacao.mes_anterior || 0).toFixed(2)}€</Text>
                </View>
                <View style={styles.compArrow}>
                  {data.comparacao.subiu
                    ? <TrendingUp size={22} color={C.red} />
                    : <TrendingDown size={22} color={C.green} />
                  }
                  <Text style={[styles.compPct, { color: data.comparacao.subiu ? C.red : C.green }]}>
                    {data.comparacao.variacao_pct > 0 ? '+' : ''}{data.comparacao.variacao_pct}%
                  </Text>
                </View>
                <View style={styles.compSide}>
                  <Text style={styles.compLabel}>Este mês</Text>
                  <Text style={styles.compVal}>{(data.total_gasto || 0).toFixed(2)}€</Text>
                </View>
              </View>
            </View>
          )}

          {/* Categorias detalhadas */}
          {data.por_categoria?.length > 0 && (
            <View style={[styles.card, { marginBottom: 40 }]}>
              <Text style={styles.cardTitle}>Detalhe</Text>
              {data.por_categoria.map((item, i) => (
                <View key={item.categoria} style={styles.detalheRow}>
                  <View style={[styles.detalheDot, { backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }]} />
                  <Text style={styles.detalheCat}>{item.categoria}</Text>
                  <Text style={styles.detalheCount}>{item.count}x</Text>
                  <Text style={styles.detalheTotal}>{item.total.toFixed(2)}€</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 32 },

  // Seletor mês
  mesNav:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 18 },
  mesNavBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  mesTitulo: { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: 0 },

  loadBox:    { padding: 60, alignItems: 'center' },

  emptyBox:   { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.textSub, marginTop: 16, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20 },

  // Roast
  roastCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3, borderLeftColor: C.brand,
  },
  roastText: { flex: 1, fontSize: 14, color: C.textMid, fontStyle: 'italic', lineHeight: 22 },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginBottom: 14 },
  statCard:  { width: '47.5%', backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', gap: 6 },
  statAccent:{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  statIconWrap:{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statLabel: { fontSize: 11, color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: '900', color: C.text, letterSpacing: 0 },
  statSub:   { fontSize: 11, color: C.textSub },

  // Card
  card:     { backgroundColor: C.surface, borderRadius: 18, padding: 18, marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  cardTitle:{ fontSize: 13, fontWeight: '700', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },

  // Bar chart
  barRow:      { marginBottom: 14 },
  barLabel:    { fontSize: 12, color: C.textMid, marginBottom: 6 },
  barTrackWrap:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTrack:    { flex: 1, height: 7, backgroundColor: C.surface3, borderRadius: 4, overflow: 'hidden' },
  barFill:     { height: 7, borderRadius: 4 },
  barVal:      { fontSize: 12, fontWeight: '700', color: C.text, minWidth: 44, textAlign: 'right' },

  // Comparação
  compRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compSide:  { alignItems: 'center', gap: 6 },
  compLabel: { fontSize: 11, color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.5 },
  compVal:   { fontSize: 18, fontWeight: '800', color: C.text },
  compArrow: { alignItems: 'center', gap: 4 },
  compPct:   { fontSize: 14, fontWeight: '800' },

  // Detalhe
  detalheRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.border, gap: 10 },
  detalheDot:   { width: 7, height: 7, borderRadius: 4 },
  detalheCat:   { flex: 1, fontSize: 13, color: C.text, fontWeight: '600' },
  detalheCount: { fontSize: 12, color: C.textSub, minWidth: 24 },
  detalheTotal: { fontSize: 14, fontWeight: '800', color: C.brand, minWidth: 70, textAlign: 'right' },
});

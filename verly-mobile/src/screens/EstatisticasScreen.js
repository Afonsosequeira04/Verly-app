/**
 * src/screens/EstatisticasScreen.js
 * Estatísticas — design luxury dark · sem emojis · Lucide icons
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart2, TrendingUp, Receipt, Star } from 'lucide-react-native';
import { estatisticasAPI } from '../services/api';

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

const BAR_COLORS = ['#6C5CE7','#00C896','#22D4FD','#FFB300','#FF5370','#C264DE','#FF8C42','#4ECDC4','#96CEB4','#45B7D1'];
const W = Dimensions.get('window').width;

function HorizBar({ categoria, total, max, color }) {
  const pct = max > 0 ? total / max : 0;
  const barW = (W - 80) * pct;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>{categoria}</Text>
      <View style={styles.barTrackRow}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: Math.max(barW, 4), backgroundColor: color }]} />
        </View>
        <Text style={styles.barVal}>{total.toFixed(0)}€</Text>
      </View>
    </View>
  );
}

function VertBar({ mes, total, max, chartH }) {
  const h = Math.max((total / max) * chartH, 4);
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const m = parseInt(mes.split('-')[1], 10) - 1;
  return (
    <View style={styles.vertBarCol}>
      <Text style={styles.vertBarVal}>
        {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total.toFixed(0)}€
      </Text>
      <View style={[styles.vertBar, { height: h }]} />
      <Text style={styles.vertBarLabel}>{nomes[m] || mes}</Text>
    </View>
  );
}

export default function EstatisticasScreen() {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefresh]   = useState(false);

  const fetchData = async () => {
    try {
      const result = await estatisticasAPI.get();
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>;
  }

  const maxCat = data?.por_categoria?.[0]?.total || 1;
  const maxMes = data?.por_mes?.length ? Math.max(...data.por_mes.map(d => d.total), 1) : 1;
  const chartH = 110;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); fetchData(); }} tintColor={C.brand} />
      }
    >
      {/* Resumo */}
      <View style={styles.resumoRow}>
        {[
          { Icon: Receipt,   label: 'Total gasto',  value: `${(data?.total_geral || 0).toFixed(2)}€`, color: C.brand },
          { Icon: TrendingUp,label: 'Média/mês',    value: `${(data?.media_mensal || 0).toFixed(0)}€`, color: C.green },
          { Icon: BarChart2, label: 'Faturas',      value: `${data?.num_faturas || 0}`,                color: C.yellow },
        ].map(s => (
          <View key={s.label} style={styles.resumoCard}>
            <View style={[styles.resumoIconWrap, { backgroundColor: s.color + '18' }]}>
              <s.Icon size={16} color={s.color} />
            </View>
            <Text style={styles.resumoVal}>{s.value}</Text>
            <Text style={styles.resumoLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Categoria top */}
      {data?.categoria_top && (
        <View style={styles.topCard}>
          <Star size={16} color={C.brand} />
          <View>
            <Text style={styles.topLabel}>Categoria com mais gastos</Text>
            <Text style={styles.topVal}>{data.categoria_top}</Text>
          </View>
        </View>
      )}

      {/* Gastos por mês */}
      {data?.por_mes?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gastos por mês</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vertBarsScroll}>
            <View style={[styles.vertBarsWrap, { height: chartH + 50 }]}>
              {data.por_mes.slice(-8).map(item => (
                <VertBar key={item.mes} mes={item.mes} total={item.total} max={maxMes} chartH={chartH} />
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Por categoria */}
      {data?.por_categoria?.length > 0 && (
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

      {/* Lista detalhe */}
      {data?.por_categoria?.length > 0 && (
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

      {(!data || data.num_faturas === 0) && (
        <View style={styles.empty}>
          <BarChart2 size={44} color={C.border} />
          <Text style={styles.emptyTitle}>Sem dados ainda</Text>
          <Text style={styles.emptySub}>Carrega faturas para ver as tuas estatísticas.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  resumoRow:   { flexDirection: 'row', gap: 10, marginBottom: 14 },
  resumoCard:  { flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border, gap: 6 },
  resumoIconWrap:{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  resumoVal:   { fontSize: 16, fontWeight: '900', color: C.text },
  resumoLabel: { fontSize: 10, color: C.textSub, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },

  topCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3, borderLeftColor: C.brand,
  },
  topLabel: { fontSize: 11, color: C.textSub, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  topVal:   { fontSize: 16, fontWeight: '800', color: C.brand },

  card:      { backgroundColor: C.surface, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 11, fontWeight: '700', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 18 },

  // Vert bars (mês)
  vertBarsScroll: { alignItems: 'flex-end' },
  vertBarsWrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  vertBarCol:     { alignItems: 'center', gap: 4, minWidth: 44 },
  vertBarVal:     { fontSize: 9, color: C.textSub },
  vertBar:        { width: 22, borderRadius: 5, backgroundColor: C.brand, minHeight: 4 },
  vertBarLabel:   { fontSize: 10, color: C.textSub },

  // Horiz bars (cat)
  barRow:      { marginBottom: 14 },
  barLabel:    { fontSize: 12, color: C.textMid, marginBottom: 6 },
  barTrackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTrack:    { flex: 1, height: 7, backgroundColor: C.surface3, borderRadius: 4, overflow: 'hidden' },
  barFill:     { height: 7, borderRadius: 4 },
  barVal:      { fontSize: 12, fontWeight: '700', color: C.text, minWidth: 44, textAlign: 'right' },

  // Detalhe
  detalheRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.border, gap: 10 },
  detalheDot:   { width: 7, height: 7, borderRadius: 4 },
  detalheCat:   { flex: 1, fontSize: 13, color: C.text, fontWeight: '600' },
  detalheCount: { fontSize: 12, color: C.textSub, minWidth: 24 },
  detalheTotal: { fontSize: 14, fontWeight: '800', color: C.brand, minWidth: 70, textAlign: 'right' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.textSub },
  emptySub:   { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20 },
});
/**
 * src/screens/SubscricoesScreen.js
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { subscricoesAPI } from '../services/api';
import { COLORS } from '../constants/theme';

const RISK_COLORS = { danger: COLORS.red, warning: COLORS.yellow, ok: COLORS.green };

function SubCard({ sub }) {
  const riskColor = RISK_COLORS[sub.risk] || COLORS.textSub;
  return (
    <View style={[styles.card, { borderLeftColor: riskColor, borderLeftWidth: 3 }]}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardIcon}>{sub.icone}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardNome}>{sub.nome}</Text>
        <Text style={styles.cardAlerta}>{sub.alerta}</Text>
        <View style={[styles.badge, { backgroundColor: `${riskColor}22` }]}>
          <Text style={[styles.badgeText, { color: riskColor }]}>{sub.risk_label}</Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={[styles.cardPreco, { color: riskColor }]}>{sub.preco_mensal.toFixed(2)}€</Text>
        <Text style={styles.cardPrecoPeriod}>/mês</Text>
      </View>
    </View>
  );
}

export default function SubscricoesScreen() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh]= useState(false);

  const fetchData = async () => {
    try {
      const result = await subscricoesAPI.listar();
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
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brand} /></View>;
  }

  const subs = data?.subscriptions || [];
  const totalMensal = data?.total_mensal_desperdicado || 0;
  const countDanger = data?.count_danger || 0;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Leak Detector</Text>
        <Text style={styles.sub}>Subscrições que drenam a tua conta</Text>
      </View>

      {/* Resumo */}
      {totalMensal > 0 && (
        <View style={styles.wasteBox}>
          <View>
            <Text style={styles.wasteLabel}>DESPERDÍCIO / MÊS</Text>
            <Text style={styles.wasteVal}>{totalMensal.toFixed(2)}€</Text>
            <Text style={styles.wasteAnual}>≈ {Math.round(totalMensal * 12)}€/ano</Text>
          </View>
          {countDanger > 0 && (
            <View style={styles.dangerBadge}>
              <Text style={styles.dangerBadgeNum}>{countDanger}</Text>
              <Text style={styles.dangerBadgeLabel}>para cancelar</Text>
            </View>
          )}
        </View>
      )}

      {/* Lista */}
      <FlatList
        data={subs}
        keyExtractor={(item, i) => item.db_id?.toString() || item.nome + i}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); fetchData(); }} tintColor={COLORS.brand} />}
        renderItem={({ item }) => <SubCard sub={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🛡️</Text>
            <Text style={styles.emptyTitle}>Sem subscrições detetadas</Text>
            <Text style={styles.emptySub}>Carrega um extrato bancário na app web para detetar subscrições automáticas.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  header: { padding: 20, paddingBottom: 12 },
  title:  { fontSize: 28, fontWeight: '800', color: COLORS.text },
  sub:    { fontSize: 13, color: COLORS.textSub, marginTop: 4 },
  wasteBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,71,87,0.07)', borderWidth: 1, borderColor: 'rgba(255,71,87,0.15)', borderRadius: 14, marginHorizontal: 20, marginBottom: 16, padding: 16 },
  wasteLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: COLORS.red, marginBottom: 4 },
  wasteVal:   { fontSize: 28, fontWeight: '800', color: COLORS.red },
  wasteAnual: { fontSize: 11, color: COLORS.red, opacity: 0.7, marginTop: 2 },
  dangerBadge: { backgroundColor: 'rgba(255,71,87,0.12)', borderWidth: 1, borderColor: 'rgba(255,71,87,0.2)', borderRadius: 12, padding: 12, alignItems: 'center' },
  dangerBadgeNum: { fontSize: 22, fontWeight: '800', color: COLORS.red },
  dangerBadgeLabel: { fontSize: 10, color: COLORS.red },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  cardLeft: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center' },
  cardIcon: { fontSize: 20 },
  cardInfo: { flex: 1, gap: 3 },
  cardNome:   { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardAlerta: { fontSize: 12, color: COLORS.textSub },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cardRight: { alignItems: 'flex-end' },
  cardPreco:  { fontSize: 16, fontWeight: '800' },
  cardPrecoPeriod: { fontSize: 11, color: COLORS.textSub },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 12, opacity: 0.3 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: COLORS.textSub, textAlign: 'center', lineHeight: 20 },
});
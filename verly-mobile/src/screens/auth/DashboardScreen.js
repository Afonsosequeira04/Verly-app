/**
 * src/screens/DashboardScreen.js
 * Ecrã principal — dashboard financeiro.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../services/api';
import { COLORS } from '../navigation/AppNavigator';

// ── Sub-componentes ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, subColor }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {sub && <Text style={[styles.metricSub, { color: subColor || COLORS.textSub }]}>{sub}</Text>}
    </View>
  );
}

function AlertaBanner({ alerta }) {
  const isUrgente = alerta.urgencia === 'critico';
  return (
    <View style={[styles.alertaBanner, { borderLeftColor: isUrgente ? COLORS.red : COLORS.yellow }]}>
      <Text style={styles.alertaIcon}>{alerta.tipo === 'devolucao' ? '↩️' : '🛡️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.alertaTitulo}>
          {alerta.tipo === 'devolucao' ? 'Devolução expira' : 'Garantia expira'} em {alerta.dias} dia(s)
        </Text>
        <Text style={styles.alertaSub}>{alerta.loja} · até {alerta.data}</Text>
      </View>
    </View>
  );
}

function MoodCard({ mood, streak, orcamento, totalGasto }) {
  const pct = orcamento > 0 ? Math.min((totalGasto / orcamento) * 100, 100) : 0;
  return (
    <View style={[styles.card, styles.moodCard]}>
      <View style={styles.moodRow}>
        <Text style={styles.moodIcon}>{mood.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.moodNivel, { color: mood.cor }]}>{mood.nivel.toUpperCase()}</Text>
          <Text style={styles.moodFrase}>"{mood.frase}"</Text>
        </View>
        <View style={styles.streakBadge}>
          <Text style={styles.streakFire}>🔥</Text>
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={styles.streakLabel}>dias</Text>
        </View>
      </View>
      {orcamento > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: mood.cor }]} />
          </View>
          <Text style={styles.progressLabel}>{Math.round(pct)}% do orçamento</Text>
        </View>
      )}
    </View>
  );
}

function FaturaMini({ fatura, onPress }) {
  return (
    <TouchableOpacity style={styles.faturaRow} onPress={onPress}>
      <View style={styles.faturaCat}>
        <Text style={styles.faturaCatText}>{fatura.categoria?.[0] || '📄'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.faturaLoja} numberOfLines={1}>{fatura.loja}</Text>
        <Text style={styles.faturaData}>{fatura.data_compra || fatura.data_upload?.slice(0, 10)}</Text>
      </View>
      <Text style={styles.faturaTotal}>{fatura.total.toFixed(2)}€</Text>
    </TouchableOpacity>
  );
}

// ── Ecrã principal ────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const result = await dashboardAPI.get();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Recarregar sempre que o ecrã ganha foco
  useFocusEffect(useCallback(() => { fetchData(); }, []));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Erro: {error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData()}>
          <Text style={styles.retryText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={COLORS.brand} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSub}>Olá, {user?.nome}! 👋</Text>
        </View>
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => navigation.navigate('Notificacoes')}
        >
          <Text style={styles.notifIcon}>🔔</Text>
          {data?.notificacoes?.length > 0 && <View style={styles.notifDot} />}
        </TouchableOpacity>
      </View>

      {/* Alertas urgentes */}
      {data?.alertas?.slice(0, 2).map((a, i) => (
        <AlertaBanner key={i} alerta={a} />
      ))}

      {/* Mood + Streak */}
      {data?.mood && (
        <MoodCard
          mood={data.mood}
          streak={data.streak}
          orcamento={data.orcamento}
          totalGasto={data.total_gasto}
        />
      )}

      {/* Métricas */}
      <View style={styles.metricsRow}>
        <MetricCard
          label="Total Gasto"
          value={`${(data?.total_gasto || 0).toFixed(2)}€`}
          sub={data?.comparacao?.variacao_pct != null
            ? `${data.comparacao.variacao_pct > 0 ? '+' : ''}${data.comparacao.variacao_pct}% vs mês anterior`
            : 'primeiro mês'}
          subColor={data?.comparacao?.subiu ? COLORS.red : COLORS.green}
        />
        <MetricCard
          label="Faturas"
          value={data?.num_faturas || 0}
          sub="registadas"
        />
        <MetricCard
          label="Desperdício"
          value={`${(data?.desperdicado_mes || 0).toFixed(0)}€`}
          sub="este mês"
          subColor={(data?.desperdicado_mes || 0) > 100 ? COLORS.red : COLORS.textSub}
        />
      </View>

      {/* Subscrições leak */}
      {data?.subscricoes?.total_mensal > 0 && (
        <View style={[styles.card, styles.subsCard]}>
          <Text style={styles.subsLabel}>💸 Leak de subscrições</Text>
          <Text style={styles.subsValue}>{data.subscricoes.total_mensal.toFixed(2)}€/mês</Text>
          <Text style={styles.subsSub}>≈ {Math.round(data.subscricoes.total_mensal * 12)}€/ano</Text>
        </View>
      )}

      {/* Últimas faturas */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Últimas faturas</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Faturas')}>
            <Text style={styles.cardLink}>Ver tudo →</Text>
          </TouchableOpacity>
        </View>
        {data?.ultimas_faturas?.length > 0
          ? data.ultimas_faturas.map((f) => (
              <FaturaMini
                key={f.id}
                fatura={f}
                onPress={() => navigation.navigate('FaturaDetalhe', { id: f.id })}
              />
            ))
          : <Text style={styles.empty}>Ainda sem faturas. Carrega a primeira!</Text>
        }
      </View>

      {/* Feed Verly */}
      {data?.feed?.length > 0 && (
        <View style={[styles.card, { marginBottom: 32 }]}>
          <Text style={styles.cardTitle}>O que a Verly pensa</Text>
          {data.feed.map((item, i) => (
            <View key={i} style={styles.feedItem}>
              <Text style={styles.feedIcon}>{item.icone}</Text>
              <Text style={styles.feedText}>{item.texto}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },

  // Header
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  headerTitle:{ fontSize: 28, fontWeight: '800', color: COLORS.text },
  headerSub:  { fontSize: 14, color: COLORS.textSub, marginTop: 4 },
  notifBtn:   { padding: 8, position: 'relative' },
  notifIcon:  { fontSize: 22 },
  notifDot:   { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red },

  // Alertas
  alertaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 12,
    borderLeftWidth: 4, padding: 14, marginBottom: 10,
  },
  alertaIcon:   { fontSize: 20 },
  alertaTitulo: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  alertaSub:    { fontSize: 12, color: COLORS.textSub, marginTop: 2 },

  // Mood
  card:      { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  moodCard:  {},
  moodRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moodIcon:  { fontSize: 32 },
  moodNivel: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  moodFrase: { fontSize: 13, color: COLORS.textSub, marginTop: 4, fontStyle: 'italic' },
  streakBadge: { alignItems: 'center', backgroundColor: COLORS.surface2, borderRadius: 12, padding: 10 },
  streakFire: { fontSize: 18 },
  streakNum:  { fontSize: 20, fontWeight: '800', color: COLORS.text },
  streakLabel:{ fontSize: 10, color: COLORS.textSub },
  progressWrap: { marginTop: 14 },
  progressBg:   { height: 6, backgroundColor: COLORS.surface2, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 4 },
  progressLabel:{ fontSize: 11, color: COLORS.textSub, marginTop: 6 },

  // Métricas
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  metricLabel:{ fontSize: 11, color: COLORS.textSub, marginBottom: 6 },
  metricValue:{ fontSize: 18, fontWeight: '800', color: COLORS.text },
  metricSub:  { fontSize: 11, marginTop: 4 },

  // Subs
  subsCard:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subsLabel: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  subsValue: { fontSize: 18, fontWeight: '800', color: COLORS.red },
  subsSub:   { fontSize: 11, color: COLORS.textSub },

  // Card genérico
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardLink:   { fontSize: 13, color: COLORS.brand, fontWeight: '600' },

  // Fatura mini
  faturaRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  faturaCat:     { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center' },
  faturaCatText: { fontSize: 18 },
  faturaLoja:    { fontSize: 14, fontWeight: '600', color: COLORS.text },
  faturaData:    { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  faturaTotal:   { fontSize: 15, fontWeight: '800', color: COLORS.text },

  // Feed
  feedItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 10 },
  feedIcon: { fontSize: 16 },
  feedText: { flex: 1, fontSize: 13, color: COLORS.textSub, lineHeight: 20 },

  // Estados
  empty:     { fontSize: 13, color: COLORS.textSub, textAlign: 'center', padding: 20 },
  errorText: { color: COLORS.red, fontSize: 14, marginBottom: 16 },
  retryBtn:  { backgroundColor: COLORS.brand, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#fff', fontWeight: '700' },
});

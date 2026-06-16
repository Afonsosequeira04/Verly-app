// src/screens/GarantiasScreen.js
// Centro de Garantias — todas as garantias ativas e expiradas num só sítio

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import {
  Shield, ShieldCheck, ShieldOff, ShieldAlert,
  ChevronRight, Package, Calendar, AlertTriangle, Upload,
} from 'lucide-react-native';
import { apiFetch } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const W = Dimensions.get('window').width;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');

function diasLabel(dias) {
  if (dias === 0) return 'Expira hoje!';
  if (dias === 1) return 'Expira amanhã!';
  if (dias < 0) return `Expirou há ${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? 's' : ''}`;
  return `${dias} dias restantes`;
}

function diasColor(dias) {
  if (dias < 0) return C.textSub;
  if (dias <= 7) return C.red;
  if (dias <= 30) return C.yellow;
  return C.green;
}

function GarantiaCard({ item, idx }) {
  const dias = item.dias_restantes;
  const cor = diasColor(dias);
  const expirou = dias < 0;

  return (
    <Animated.View entering={FadeInDown.delay(idx * 60).duration(350).springify()}>
      <View style={[styles.card, expirou && { opacity: 0.55 }]}>
        {/* Linha esquerda colorida */}
        <View style={[styles.cardAccent, { backgroundColor: cor }]} />

        <View style={{ flex: 1, paddingLeft: 14 }}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: cor + '22' }]}>
              {expirou
                ? <ShieldOff size={18} color={cor} />
                : dias <= 7
                  ? <ShieldAlert size={18} color={cor} />
                  : <ShieldCheck size={18} color={cor} />
              }
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.cardLoja} numberOfLines={1}>{item.loja}</Text>
              <Text style={[styles.cardDias, { color: cor }]}>{diasLabel(dias)}</Text>
            </View>
            {/* CORRIGIDO: item.total em vez de item.valor */}
            {item.total > 0 && (
              <Text style={styles.cardValor}>{fmt(item.total)} €</Text>
            )}
          </View>

          {/* Detalhes */}
          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Calendar size={12} color={C.textSub} />
              {/* CORRIGIDO: item.data_fim em vez de item.data_garantia */}
              <Text style={styles.detailText}>
                Válida até {item.data_fim}
              </Text>
            </View>
            {item.categoria && (
              <View style={[styles.badge, { backgroundColor: C.brand + '22' }]}>
                <Text style={[styles.badgeText, { color: C.brand }]}>{item.categoria}</Text>
              </View>
            )}
          </View>

          {/* Barra de progresso restante */}
          {!expirou && dias <= 365 && (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(2, Math.min(100, (dias / 365) * 100))}%`,
                    backgroundColor: cor,
                  },
                ]}
              />
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export default function GarantiasScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState('ativas'); // 'ativas' | 'todas' | 'urgentes'

  const carregar = useCallback(async (isRefresh = false) => {
    try {
      const res = await apiFetch('/exportar/resumo');
      setData(res);
    } catch (e) {
      console.error('GarantiasScreen:', e);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const onRefresh = () => { setRefreshing(true); carregar(true); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  const todas = data?.garantias_ativas || [];
  const ativas = todas.filter(g => g.dias_restantes >= 0);
  const urgentes = todas.filter(g => g.dias_restantes >= 0 && g.dias_restantes <= 30);
  const expiradas = todas.filter(g => g.dias_restantes < 0);

  const listaFiltrada =
    filtro === 'ativas'   ? ativas :
    filtro === 'urgentes' ? urgentes :
    todas;

  const totalAtivas = ativas.length;
  const totalUrgentes = urgentes.length;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
    >
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronRight size={22} color={C.text} style={{ transform: [{ rotate: '180deg' }] }} />
          </Pressable>
          <Shield size={28} color={C.brand} style={{ marginLeft: 8 }} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Centro de Garantias</Text>
            <Text style={styles.headerSub}>
              {totalAtivas} ativ{totalAtivas !== 1 ? 'as' : 'a'}
              {totalUrgentes > 0 ? ` · ${totalUrgentes} urgente${totalUrgentes !== 1 ? 's' : ''}` : ''}
            </Text>
          </View>
        </View>

        {/* Stats rápidas */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: C.green + '40' }]}>
            <ShieldCheck size={20} color={C.green} />
            <Text style={[styles.statNum, { color: C.green }]}>{totalAtivas}</Text>
            <Text style={styles.statLabel}>Ativas</Text>
          </View>
          <View style={[styles.statCard, { borderColor: C.yellow + '40' }]}>
            <ShieldAlert size={20} color={C.yellow} />
            <Text style={[styles.statNum, { color: C.yellow }]}>{urgentes.length}</Text>
            <Text style={styles.statLabel}>30 dias</Text>
          </View>
          <View style={[styles.statCard, { borderColor: C.red + '40' }]}>
            <AlertTriangle size={20} color={C.red} />
            <Text style={[styles.statNum, { color: C.red }]}>{urgentes.filter(g => g.dias_restantes <= 7).length}</Text>
            <Text style={styles.statLabel}>7 dias</Text>
          </View>
          <View style={[styles.statCard, { borderColor: C.textSub + '30' }]}>
            <ShieldOff size={20} color={C.textSub} />
            <Text style={[styles.statNum, { color: C.textSub }]}>{expiradas.length}</Text>
            <Text style={styles.statLabel}>Expiradas</Text>
          </View>
        </View>

        {/* Filtros */}
        <View style={styles.filtros}>
          {[
            { key: 'ativas',   label: `Ativas (${ativas.length})` },
            { key: 'urgentes', label: `Urgentes (${urgentes.length})` },
            { key: 'todas',    label: `Todas (${todas.length})` },
          ].map(f => (
            <Pressable
              key={f.key}
              onPress={() => setFiltro(f.key)}
              style={[styles.filtroBtn, filtro === f.key && styles.filtroBtnActive]}
            >
              <Text style={[styles.filtroText, filtro === f.key && styles.filtroTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      {/* Lista */}
      {listaFiltrada.length === 0 ? (
        <Animated.View entering={FadeIn.delay(200)} style={styles.emptyBox}>
          <ShieldCheck size={48} color={C.green} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>
            {filtro === 'urgentes' ? 'Nenhuma garantia urgente' : 'Nenhuma garantia aqui'}
          </Text>
          <Text style={styles.emptySub}>
            {filtro === 'urgentes'
              ? 'Boa notícia — não tens garantias a expirar nos próximos 30 dias.'
              : 'Quando fizeres upload de faturas com data de garantia, aparecem aqui automaticamente.'}
          </Text>
          {filtro !== 'urgentes' && (
            <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('Faturas')}>
              <Upload size={14} color="#fff" />
              <Text style={styles.emptyBtnText}>Carregar fatura</Text>
            </Pressable>
          )}
        </Animated.View>
      ) : (
        listaFiltrada.map((item, idx) => (
          <GarantiaCard key={`${item.id}-${idx}`} item={item} idx={idx} />
        ))
      )}

      {/* Dica */}
      <Animated.View entering={FadeInDown.delay(400)} style={styles.dicaBox}>
        <Package size={16} color={C.textSub} />
        <Text style={styles.dicaText}>
          A Verly extrai automaticamente datas de garantia das tuas faturas.
          Guarda sempre o PDF original para reclamar quando necessário.
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: SPACE.lg, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  backBtn: { padding: 4, marginRight: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.lg,
    paddingTop: 8,
  },
  headerTitle: { fontSize: FONT.lg, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: FONT.sm, color: C.textMid, marginTop: 2 },

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACE.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  statNum:   { fontSize: FONT.lg, fontWeight: '900', color: C.text },
  statLabel: { fontSize: 10, color: C.textSub, fontWeight: '600' },

  filtros: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACE.lg,
  },
  filtroBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  filtroBtnActive: {
    backgroundColor: C.brandDim,
    borderColor: C.brand + '60',
  },
  filtroText:       { fontSize: FONT.xs, color: C.textMid, fontWeight: '600' },
  filtroTextActive: { color: C.brand },

  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardAccent: { width: 4, minHeight: '100%' },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLoja:  { fontSize: FONT.md, fontWeight: '700', color: C.text },
  cardDias:  { fontSize: FONT.xs, fontWeight: '700', marginTop: 2 },
  cardValor: { fontSize: FONT.sm, fontWeight: '800', color: C.text },

  cardDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: { fontSize: 11, color: C.textSub },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },

  progressTrack: {
    height: 3,
    backgroundColor: C.surface3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
    marginBottom: 12,
  },
  progressFill: { height: '100%', borderRadius: 2 },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: FONT.lg,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: FONT.sm,
    color: C.textMid,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    minHeight: 42,
    marginTop: 16,
    borderRadius: RADIUS.sm,
    backgroundColor: C.brand,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyBtnText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },

  dicaBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 16,
    alignItems: 'flex-start',
  },
  dicaText: {
    flex: 1,
    fontSize: 11,
    color: C.textSub,
    lineHeight: 17,
  },
});

// src/screens/RecompensasScreen.js — Verly Social: Recompensas & XP
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { recompensasAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

const C = COLORS;

const NIVEIS = [
  { nivel: 1, titulo: 'Iniciante',    icone: '🌱', xp_min: 0,    xp_max: 99   },
  { nivel: 2, titulo: 'Poupador',     icone: '💰', xp_min: 100,  xp_max: 299  },
  { nivel: 3, titulo: 'Estrategista', icone: '📊', xp_min: 300,  xp_max: 599  },
  { nivel: 4, titulo: 'Expert',       icone: '🎯', xp_min: 600,  xp_max: 999  },
  { nivel: 5, titulo: 'Mestre',       icone: '🏆', xp_min: 1000, xp_max: 9999 },
];

function XPBar({ xp, nivel }) {
  const nivelInfo = NIVEIS.find(n => n.nivel === nivel?.nivel) || NIVEIS[0];
  const pct = Math.min(100, ((xp - nivelInfo.xp_min) / (nivelInfo.xp_max - nivelInfo.xp_min)) * 100);
  const xpProximo = nivelInfo.xp_max - xp;
  const proximo   = NIVEIS.find(n => n.nivel === nivelInfo.nivel + 1);

  return (
    <View style={styles.xpCard}>
      <View style={styles.xpTop}>
        <Text style={styles.xpIcone}>{nivelInfo.icone}</Text>
        <View>
          <Text style={styles.xpNivel}>Nível {nivelInfo.nivel} — {nivelInfo.titulo}</Text>
          <Text style={styles.xpTotal}>{xp} XP total</Text>
        </View>
        <View style={styles.xpBadge}>
          <Text style={styles.xpBadgeTxt}>{Math.round(pct)}%</Text>
        </View>
      </View>
      <View style={styles.xpBarBg}>
        <Animated.View entering={FadeIn.duration(800)} style={[styles.xpBarFill, { width: `${pct}%` }]} />
      </View>
      {proximo && (
        <Text style={styles.xpProximo}>Faltam {xpProximo} XP para {proximo.icone} {proximo.titulo}</Text>
      )}
    </View>
  );
}

function RecompensaCard({ r, index }) {
  const tipoColor = {
    vencedor_desafio: C.yellow,
    streak_7:         C.brand,
    streak_30:        C.orange,
    meta_atingida:    C.green,
    primeiro_grupo:   C.brand,
  }[r.tipo] || C.brand;

  const data = new Date(r.ganhou_em).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });

  return (
    <Animated.View entering={FadeInDown.delay(index * 50)}>
      <View style={[styles.recompCard, { borderLeftColor: tipoColor, borderLeftWidth: 3 }]}>
        <View style={[styles.recompIcone, { backgroundColor: tipoColor + '20' }]}>
          <Text style={{ fontSize: 28 }}>{r.icone}</Text>
        </View>
        <View style={styles.recompBody}>
          <Text style={styles.recompTitulo}>{r.titulo}</Text>
          {r.descricao && <Text style={styles.recompDesc}>{r.descricao}</Text>}
          <Text style={styles.recompData}>{data}</Text>
        </View>
        <View style={styles.recompXP}>
          <Text style={styles.recompXPTxt}>+{r.xp}</Text>
          <Text style={styles.recompXPLabel}>XP</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function RecompensasScreen({ navigation }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const d = await recompensasAPI.listar();
      setData(d);
    } catch (e) {
      console.log('recompensas err', e);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return (
    <View style={styles.center}><ActivityIndicator color={C.brand} size="large" /></View>
  );

  const recompensas = data?.recompensas || [];
  const totalXP     = data?.total_xp || 0;
  const nivel       = data?.nivel;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Recompensas</Text>
          <Text style={styles.headerSub}>O teu progresso financeiro</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(true); }} tintColor={C.brand} />}
      >
        {/* XP Bar */}
        <XPBar xp={totalXP} nivel={nivel} />

        {/* Como ganhar XP */}
        <View style={styles.comoCard}>
          <Text style={styles.comoTitle}>COMO GANHAR XP</Text>
          {[
            { icone: '🏆', titulo: 'Ganhar um desafio',     xp: '+100 XP' },
            { icone: '🎯', titulo: 'Atingir uma meta',      xp: '+50 XP'  },
            { icone: '👥', titulo: 'Criar um grupo',        xp: '+50 XP'  },
            { icone: '🔥', titulo: 'Streak de 7 dias',      xp: '+30 XP'  },
            { icone: '⚡', titulo: 'Streak de 30 dias',     xp: '+100 XP' },
          ].map((item, i) => (
            <View key={i} style={styles.comoRow}>
              <Text style={styles.comoIcone}>{item.icone}</Text>
              <Text style={styles.comoTxt}>{item.titulo}</Text>
              <Text style={styles.comoXP}>{item.xp}</Text>
            </View>
          ))}
        </View>

        {/* Lista de recompensas */}
        <Text style={styles.sectionTitle}>AS TUAS CONQUISTAS ({recompensas.length})</Text>

        {recompensas.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyTitle}>Ainda sem conquistas</Text>
            <Text style={styles.emptySub}>Participa em desafios, cria grupos e atinge as tuas metas para ganhar recompensas</Text>
            <Pressable onPress={() => navigation.navigate('Amigos')} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnTxt}>Ver Amigos & Grupos</Text>
            </Pressable>
          </View>
        ) : (
          recompensas.map((r, i) => <RecompensaCard key={r.id} r={r} index={i} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, gap: 12 },
  backBtn:      { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  backTxt:      { fontSize: 18, color: C.text },
  headerTitle:  { fontSize: FONT.xl, fontWeight: '800', color: C.text },
  headerSub:    { fontSize: FONT.xs, color: C.textMid, marginTop: 1 },
  scroll:       { padding: SPACE.lg, paddingBottom: 100 },
  sectionTitle: { fontSize: FONT.xs, fontWeight: '800', color: C.textMid, letterSpacing: 1.2, marginBottom: 12, marginTop: 8 },
  // XP Card
  xpCard:       { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.brand + '30', padding: SPACE.md, marginBottom: SPACE.sm, gap: 10 },
  xpTop:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  xpIcone:      { fontSize: 36 },
  xpNivel:      { fontSize: FONT.md, fontWeight: '800', color: C.text },
  xpTotal:      { fontSize: FONT.sm, color: C.brand, fontWeight: '700', marginTop: 2 },
  xpBadge:      { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.brandDim, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.brand },
  xpBadgeTxt:   { fontSize: FONT.sm, color: C.brand, fontWeight: '800' },
  xpBarBg:      { height: 8, backgroundColor: C.surface3, borderRadius: 4, overflow: 'hidden' },
  xpBarFill:    { height: '100%', backgroundColor: C.brand, borderRadius: 4 },
  xpProximo:    { fontSize: FONT.xs, color: C.textMid, textAlign: 'center' },
  // Como ganhar
  comoCard:     { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.lg },
  comoTitle:    { fontSize: FONT.xs, fontWeight: '800', color: C.textMid, letterSpacing: 1, marginBottom: 12 },
  comoRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  comoIcone:    { fontSize: 18, width: 28 },
  comoTxt:      { flex: 1, fontSize: FONT.sm, color: C.text },
  comoXP:       { fontSize: FONT.sm, color: C.green, fontWeight: '800' },
  // Recompensa card
  recompCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm, gap: 12 },
  recompIcone:  { width: 52, height: 52, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  recompBody:   { flex: 1, gap: 2 },
  recompTitulo: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  recompDesc:   { fontSize: FONT.xs, color: C.textMid, lineHeight: 16 },
  recompData:   { fontSize: FONT.xs, color: C.textSub, marginTop: 2 },
  recompXP:     { alignItems: 'center' },
  recompXPTxt:  { fontSize: FONT.lg, fontWeight: '900', color: C.yellow },
  recompXPLabel:{ fontSize: FONT.xs, color: C.textSub, fontWeight: '700' },
  // Empty
  empty:        { alignItems: 'center', paddingTop: 40 },
  emptyEmoji:   { fontSize: 48, marginBottom: 16 },
  emptyTitle:   { fontSize: FONT.lg, fontWeight: '800', color: C.text, marginBottom: 8 },
  emptySub:     { fontSize: FONT.sm, color: C.textMid, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20, marginBottom: 24 },
  emptyBtn:     { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: C.brand, borderRadius: RADIUS.pill },
  emptyBtnTxt:  { fontSize: FONT.sm, fontWeight: '800', color: '#fff' },
});
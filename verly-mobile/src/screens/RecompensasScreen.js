// src/screens/RecompensasScreen.js
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
  { nivel: 1, titulo: 'Iniciante',    icone: '🌱', cor: '#81C784', xp: 0 },
  { nivel: 2, titulo: 'Poupador',     icone: '💰', cor: '#FFD54F', xp: 100 },
  { nivel: 3, titulo: 'Estrategista', icone: '📊', cor: '#4FC3F7', xp: 300 },
  { nivel: 4, titulo: 'Expert',       icone: '🎯', cor: '#FF8A65', xp: 600 },
  { nivel: 5, titulo: 'Mestre',       icone: '🏆', cor: '#CE93D8', xp: 1000 },
];

export default function RecompensasScreen({ navigation }) {
  const [dados, setDados]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [tabHistorico, setTabHistorico] = useState(false);

  const xpAnim = useSharedValue(0);
  const barraStyle = useAnimatedStyle(() => ({ width: `${xpAnim.value}%` }));

  const carregar = useCallback(async () => {
    try {
      const d = await recompensasAPI.listar();
      setDados(d);
      const nivelAtual = d.nivel;
      const xpNivelAtual = NIVEIS.find(n => n.nivel === nivelAtual.nivel)?.xp || 0;
      const xpRange = (d.xp_proximo_nivel + xpNivelAtual) - xpNivelAtual || 100;
      const xpNoNivel = d.total_xp - xpNivelAtual;
      const pct = Math.min(100, Math.max(0, (xpNoNivel / xpRange) * 100));
      setTimeout(() => { xpAnim.value = withTiming(pct, { duration: 900 }); }, 300);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.brand} /></View>;
  }

  const nivel        = dados?.nivel || { nivel: 1, titulo: 'Iniciante', icone: '🌱', cor: '#81C784' };
  const totalXP      = dados?.total_xp || 0;
  const proximoXP    = dados?.xp_proximo_nivel || 0;
  const recompensas  = dados?.recompensas || [];
  const badges       = dados?.badges_disponiveis || {};
  const historico    = dados?.historico_desafios || [];

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} tintColor={C.brand} />}
      contentContainerStyle={{ padding: SPACE.md, paddingBottom: 60 }}
    >
      {/* Cartão nível */}
      <Animated.View entering={FadeIn} style={[s.nivelCard, { borderColor: nivel.cor }]}>
        <Text style={s.nivelEmoji}>{nivel.icone}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.nivelTitulo}>{nivel.titulo}</Text>
          <Text style={s.nivelSub}>Nível {nivel.nivel} · {totalXP} XP</Text>
          <View style={s.barraContainer}>
            <Animated.View style={[s.barraXP, { backgroundColor: nivel.cor }, barraStyle]} />
          </View>
          <Text style={s.proxXPTxt}>
            {proximoXP > 0 ? `${proximoXP} XP para o próximo nível` : '🏆 Nível máximo!'}
          </Text>
        </View>
      </Animated.View>

      {/* Tabs */}
      <View style={s.tabs}>
        <Pressable onPress={() => setTabHistorico(false)} style={[s.tab, !tabHistorico && s.tabAtivo]}>
          <Text style={[s.tabTxt, !tabHistorico && s.tabTxtAtivo]}>🏅 Conquistas</Text>
        </Pressable>
        <Pressable onPress={() => setTabHistorico(true)} style={[s.tab, tabHistorico && s.tabAtivo]}>
          <Text style={[s.tabTxt, tabHistorico && s.tabTxtAtivo]}>📋 Histórico</Text>
        </Pressable>
      </View>

      {!tabHistorico && (
        <>
          {recompensas.length > 0 && (
            <>
              <Text style={s.secTitulo}>✅ Conquistados</Text>
              <View style={s.grid}>
                {recompensas.map((r, i) => (
                  <Animated.View key={r.id} entering={FadeInDown.delay(i * 60)} style={[s.badgeCard, { borderColor: r.cor }]}>
                    <View style={[s.badgeIconBox, { backgroundColor: r.cor + '25' }]}>
                      <Text style={s.badgeIconTxt}>{r.icone}</Text>
                    </View>
                    <Text style={s.badgeTitulo} numberOfLines={2}>{r.titulo}</Text>
                    <Text style={s.badgeDesc} numberOfLines={2}>{r.descricao}</Text>
                    <View style={[s.xpChip, { backgroundColor: r.cor + '30' }]}>
                      <Text style={[s.xpChipTxt, { color: r.cor }]}>+{r.xp} XP</Text>
                    </View>
                    <Text style={s.badgeData}>
                      {new Date(r.ganhou_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                    </Text>
                  </Animated.View>
                ))}
              </View>
            </>
          )}

          {Object.keys(badges).length > 0 && (
            <>
              <Text style={s.secTitulo}>🔒 Por desbloquear</Text>
              <View style={s.grid}>
                {Object.entries(badges).map(([tipo, badge], i) => (
                  <Animated.View key={tipo} entering={FadeInDown.delay(i * 60)} style={[s.badgeCard, s.badgeLocked]}>
                    <View style={s.badgeIconBox}>
                      <Text style={[s.badgeIconTxt, { opacity: 0.3 }]}>{badge.icone}</Text>
                    </View>
                    <Text style={[s.badgeTitulo, { color: C.textMid }]} numberOfLines={2}>{badge.titulo}</Text>
                    <Text style={s.badgeDesc} numberOfLines={2}>{badge.descricao}</Text>
                    <View style={s.xpChip}><Text style={s.xpChipTxt}>🔒</Text></View>
                  </Animated.View>
                ))}
              </View>
            </>
          )}

          {recompensas.length === 0 && Object.keys(badges).length === 0 && (
            <View style={s.vazioBox}>
              <Text style={{ fontSize: 40 }}>🏅</Text>
              <Text style={s.vazioTxt}>Ainda não tens conquistas.</Text>
              <Text style={s.vazioSub}>Participa em desafios para ganhar badges!</Text>
            </View>
          )}

          {/* Mapa de níveis */}
          <Text style={s.secTitulo}>🗺️ Mapa de níveis</Text>
          <View style={s.niveisContainer}>
            {NIVEIS.map((n, i) => {
              const ativo    = n.nivel === nivel.nivel;
              const concluido = n.nivel < nivel.nivel;
              return (
                <View key={n.nivel} style={s.nivelRow}>
                  <View style={[s.nivelCirculo, ativo && { borderColor: n.cor, borderWidth: 3 }, concluido && { backgroundColor: n.cor }]}>
                    <Text style={{ fontSize: 20 }}>{n.icone}</Text>
                  </View>
                  {i < NIVEIS.length - 1 && <View style={[s.nivelLinha, concluido && { backgroundColor: n.cor }]} />}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.nivelNome, ativo && { color: n.cor }]}>Nível {n.nivel}: {n.titulo}</Text>
                    <Text style={s.nivelXP}>{n.xp} XP{n.xp === 0 ? ' (início)' : ''}</Text>
                  </View>
                  {ativo && <Text style={[s.atualTag, { color: n.cor }]}>← Estás aqui</Text>}
                </View>
              );
            })}
          </View>
        </>
      )}

      {tabHistorico && (
        <>
          <Text style={s.secTitulo}>📋 Desafios em que participaste</Text>
          {historico.length === 0 && (
            <View style={s.vazioBox}>
              <Text style={{ fontSize: 40 }}>⚡</Text>
              <Text style={s.vazioTxt}>Nenhum desafio ainda.</Text>
              <Text style={s.vazioSub}>Junta-te a um grupo e cria o teu primeiro desafio!</Text>
            </View>
          )}
          {historico.map((item, i) => (
            <Animated.View key={item.desafio_id} entering={FadeInDown.delay(i * 60)} style={s.historicoCard}>
              <View style={s.historicoTop}>
                <Text style={s.historicoEmoji}>{item.grupo_emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.historicoTitulo}>{item.titulo}</Text>
                  <Text style={s.historicoGrupo}>{item.grupo_nome}</Text>
                </View>
                {item.ganhou && <Text style={s.vencedorTag}>🏆 Venceu</Text>}
              </View>
              <View style={s.historicoBottom}>
                <Text style={[s.estadoTag, item.estado === 'ativo' ? s.estadoAtivo : s.estadoTerminado]}>
                  {item.estado === 'ativo' ? '🟢 Ativo' : '🏁 Terminado'}
                </Text>
                <Text style={s.progressoHist}>{item.progresso.toFixed(2)}€</Text>
                <Text style={s.dataHist}>{new Date(item.fim).toLocaleDateString('pt-PT')}</Text>
              </View>
            </Animated.View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: COLORS.bg },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  nivelCard:      { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 2 },
  nivelEmoji:     { fontSize: 44, marginRight: 14 },
  nivelTitulo:    { fontSize: 20, fontWeight: '700', color: COLORS.text },
  nivelSub:       { fontSize: 13, color: COLORS.textMid, marginBottom: 8 },
  barraContainer: { height: 8, backgroundColor: COLORS.surface2, borderRadius: 4, marginBottom: 4, overflow: 'hidden' },
  barraXP:        { height: '100%', borderRadius: 4 },
  proxXPTxt:      { fontSize: 11, color: COLORS.textMid },
  tabs:           { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 16, padding: 4 },
  tab:            { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.md },
  tabAtivo:       { backgroundColor: COLORS.brand },
  tabTxt:         { fontSize: 13, color: COLORS.textMid, fontWeight: '500' },
  tabTxtAtivo:    { color: '#fff', fontWeight: '700' },
  secTitulo:      { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 10, marginTop: 6 },
  grid:           { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  badgeCard:      { width: '30%', margin: '1.5%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 10, alignItems: 'center', borderWidth: 1.5 },
  badgeLocked:    { borderColor: COLORS.border, opacity: 0.7 },
  badgeIconBox:   { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  badgeIconTxt:   { fontSize: 26 },
  badgeTitulo:    { fontSize: 11, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 2 },
  badgeDesc:      { fontSize: 10, color: COLORS.textMid, textAlign: 'center', marginBottom: 4 },
  xpChip:         { backgroundColor: COLORS.surface2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  xpChipTxt:      { fontSize: 10, fontWeight: '700', color: COLORS.brand },
  badgeData:      { fontSize: 9, color: COLORS.textSub, marginTop: 4 },
  vazioBox:       { alignItems: 'center', paddingVertical: 32 },
  vazioTxt:       { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 10 },
  vazioSub:       { fontSize: 13, color: COLORS.textMid, marginTop: 4, textAlign: 'center' },
  niveisContainer:{ backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 16, marginBottom: 16 },
  nivelRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  nivelCirculo:   { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  nivelLinha:     { position: 'absolute', left: 22, top: 52, width: 4, height: 20, backgroundColor: COLORS.border, zIndex: -1 },
  nivelNome:      { fontSize: 14, fontWeight: '700', color: COLORS.text },
  nivelXP:        { fontSize: 12, color: COLORS.textMid },
  atualTag:       { fontSize: 11, fontWeight: '700' },
  historicoCard:  { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, marginBottom: 8 },
  historicoTop:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  historicoEmoji: { fontSize: 24, marginRight: 10 },
  historicoTitulo:{ fontSize: 14, fontWeight: '700', color: COLORS.text },
  historicoGrupo: { fontSize: 12, color: COLORS.textMid },
  vencedorTag:    { fontSize: 12, fontWeight: '700', color: '#FFD700' },
  historicoBottom:{ flexDirection: 'row', alignItems: 'center' },
  estadoTag:      { fontSize: 11, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginRight: 10, fontWeight: '500' },
  estadoAtivo:    { backgroundColor: `${COLORS.green}20`, color: COLORS.green },
  estadoTerminado:{ backgroundColor: COLORS.surface2, color: COLORS.textMid },
  progressoHist:  { fontSize: 13, fontWeight: '700', color: COLORS.brand, flex: 1 },
  dataHist:       { fontSize: 11, color: COLORS.textMid },
});
// src/screens/RecompensasScreen.js — Badges visuais, XP, histórico de desafios
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { recompensasAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';

const NIVEIS = [
  { nivel: 1, titulo: 'Iniciante',    icone: '🌱', cor: '#81C784', xp: 0 },
  { nivel: 2, titulo: 'Poupador',     icone: '💰', cor: '#FFD54F', xp: 100 },
  { nivel: 3, titulo: 'Estrategista', icone: '📊', cor: '#4FC3F7', xp: 300 },
  { nivel: 4, titulo: 'Expert',       icone: '🎯', cor: '#FF8A65', xp: 600 },
  { nivel: 5, titulo: 'Mestre',       icone: '🏆', cor: '#CE93D8', xp: 1000 },
];

export default function RecompensasScreen({ navigation }) {
  const [dados, setDados]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tabHistorico, setTabHistorico] = useState(false);

  const xpAnim = useSharedValue(0);
  const barraStyle = useAnimatedStyle(() => ({
    width: `${xpAnim.value}%`,
  }));

  const carregar = useCallback(async () => {
    try {
      const d = await recompensasAPI.listar();
      setDados(d);
      // Animar barra XP
      const proxNivel = d.xp_proximo_nivel;
      const total = d.total_xp;
      const nivelAtual = d.nivel;
      const xpNivelAtual = NIVEIS.find(n => n.nivel === nivelAtual.nivel)?.xp || 0;
      const xpRange = (xpNivelAtual + proxNivel) - xpNivelAtual || 100;
      const xpNoNivel = total - xpNivelAtual;
      const pct = Math.min(100, Math.max(0, (xpNoNivel / xpRange) * 100));
      setTimeout(() => { xpAnim.value = withTiming(pct, { duration: 900 }); }, 300);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    carregar();
  }, [carregar]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  const nivel = dados?.nivel || { nivel: 1, titulo: 'Iniciante', icone: '🌱', cor: '#81C784' };
  const totalXP = dados?.total_xp || 0;
  const proximoXP = dados?.xp_proximo_nivel || 0;
  const recompensas = dados?.recompensas || [];
  const badgesDisponiveis = dados?.badges_disponiveis || {};
  const historico = dados?.historico_desafios || [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} />}
      contentContainerStyle={{ padding: SPACE.md, paddingBottom: 60 }}
    >
      {/* Cartão de nível */}
      <Animated.View entering={FadeIn} style={[styles.nivelCard, { borderColor: nivel.cor }]}>
        <Text style={styles.nivelEmoji}>{nivel.icone}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.nivelTitulo}>{nivel.titulo}</Text>
          <Text style={styles.nivelSub}>Nível {nivel.nivel} · {totalXP} XP total</Text>
          {/* Barra XP */}
          <View style={styles.barraContainer}>
            <Animated.View style={[styles.barraXP, { backgroundColor: nivel.cor }, barraStyle]} />
          </View>
          {proximoXP > 0 && (
            <Text style={styles.proxXPTxt}>{proximoXP} XP para o próximo nível</Text>
          )}
          {proximoXP === 0 && (
            <Text style={styles.proxXPTxt}>🏆 Nível máximo atingido!</Text>
          )}
        </View>
      </Animated.View>

      {/* Tabs: Conquistas / Histórico */}
      <View style={styles.tabs}>
        <Pressable onPress={() => setTabHistorico(false)} style={[styles.tab, !tabHistorico && styles.tabAtivo]}>
          <Text style={[styles.tabTxt, !tabHistorico && styles.tabTxtAtivo]}>🏅 Conquistas</Text>
        </Pressable>
        <Pressable onPress={() => setTabHistorico(true)} style={[styles.tab, tabHistorico && styles.tabAtivo]}>
          <Text style={[styles.tabTxt, tabHistorico && styles.tabTxtAtivo]}>📋 Histórico</Text>
        </Pressable>
      </View>

      {!tabHistorico && (
        <>
          {/* Badges ganhos */}
          {recompensas.length > 0 && (
            <>
              <Text style={styles.secTitulo}>✅ Conquistados</Text>
              <View style={styles.badgesGrid}>
                {recompensas.map((r, i) => (
                  <Animated.View key={r.id} entering={FadeInDown.delay(i * 60)} style={[styles.badgeCard, { borderColor: r.cor }]}>
                    <View style={[styles.badgeIconBox, { backgroundColor: r.cor + '25' }]}>
                      <Text style={styles.badgeIconTxt}>{r.icone}</Text>
                    </View>
                    <Text style={styles.badgeTitulo} numberOfLines={2}>{r.titulo}</Text>
                    <Text style={styles.badgeDesc} numberOfLines={2}>{r.descricao}</Text>
                    <View style={[styles.xpChip, { backgroundColor: r.cor + '30' }]}>
                      <Text style={[styles.xpChipTxt, { color: r.cor }]}>+{r.xp} XP</Text>
                    </View>
                    <Text style={styles.badgeData}>
                      {new Date(r.ganhou_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                    </Text>
                  </Animated.View>
                ))}
              </View>
            </>
          )}

          {/* Badges por desbloquear */}
          {Object.keys(badgesDisponiveis).length > 0 && (
            <>
              <Text style={styles.secTitulo}>🔒 Por desbloquear</Text>
              <View style={styles.badgesGrid}>
                {Object.entries(badgesDisponiveis).map(([tipo, badge], i) => (
                  <Animated.View key={tipo} entering={FadeInDown.delay(i * 60)} style={[styles.badgeCard, styles.badgeLocked]}>
                    <View style={styles.badgeIconBox}>
                      <Text style={[styles.badgeIconTxt, { opacity: 0.3 }]}>{badge.icone}</Text>
                    </View>
                    <Text style={[styles.badgeTitulo, { color: COLORS.textSecondary }]} numberOfLines={2}>{badge.titulo}</Text>
                    <Text style={styles.badgeDesc} numberOfLines={2}>{badge.descricao}</Text>
                    <View style={styles.xpChip}>
                      <Text style={styles.xpChipTxt}>🔒</Text>
                    </View>
                  </Animated.View>
                ))}
              </View>
            </>
          )}

          {recompensas.length === 0 && Object.keys(badgesDisponiveis).length === 0 && (
            <View style={styles.vazioBox}>
              <Text style={{ fontSize: 40 }}>🏅</Text>
              <Text style={styles.vazioTxt}>Ainda não tens conquistas.</Text>
              <Text style={styles.vazioSub}>Participa em desafios e cria grupos para ganhar badges!</Text>
            </View>
          )}

          {/* Mapa de níveis */}
          <Text style={styles.secTitulo}>🗺️ Mapa de níveis</Text>
          <View style={styles.niveisContainer}>
            {NIVEIS.map((n, i) => {
              const ativo = n.nivel === nivel.nivel;
              const concluido = n.nivel < nivel.nivel;
              return (
                <View key={n.nivel} style={styles.nivelRow}>
                  <View style={[styles.nivelCirculo, ativo && { borderColor: n.cor, borderWidth: 3 }, concluido && { backgroundColor: n.cor }]}>
                    <Text style={{ fontSize: 20 }}>{n.icone}</Text>
                  </View>
                  {i < NIVEIS.length - 1 && <View style={[styles.nivelLinha, concluido && { backgroundColor: n.cor }]} />}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.nivelNome, ativo && { color: n.cor }]}>Nível {n.nivel}: {n.titulo}</Text>
                    <Text style={styles.nivelXP}>{n.xp} XP{n.xp > 0 ? '' : ' (início)'}</Text>
                  </View>
                  {ativo && <Text style={[styles.atualTag, { color: n.cor }]}>← Estás aqui</Text>}
                </View>
              );
            })}
          </View>
        </>
      )}

      {tabHistorico && (
        <>
          <Text style={styles.secTitulo}>📋 Desafios em que participaste</Text>
          {historico.length === 0 && (
            <View style={styles.vazioBox}>
              <Text style={{ fontSize: 40 }}>⚡</Text>
              <Text style={styles.vazioTxt}>Nenhum desafio ainda.</Text>
              <Text style={styles.vazioSub}>Junta-te a um grupo e cria o teu primeiro desafio!</Text>
            </View>
          )}
          {historico.map((item, i) => (
            <Animated.View key={item.desafio_id} entering={FadeInDown.delay(i * 60)} style={styles.historicoCard}>
              <View style={styles.historicoTop}>
                <Text style={styles.historicoEmoji}>{item.grupo_emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historicoTitulo}>{item.titulo}</Text>
                  <Text style={styles.historicoGrupo}>{item.grupo_nome}</Text>
                </View>
                {item.ganhou && <Text style={styles.vencedorTag}>🏆 Venceu</Text>}
              </View>
              <View style={styles.historicoBottom}>
                <Text style={[styles.estadoTag, item.estado === 'ativo' ? styles.estadoAtivo : styles.estadoTerminado]}>
                  {item.estado === 'ativo' ? '🟢 Ativo' : '🏁 Terminado'}
                </Text>
                <Text style={styles.progressoHist}>{item.progresso.toFixed(2)}€</Text>
                <Text style={styles.dataHist}>{new Date(item.fim).toLocaleDateString('pt-PT')}</Text>
              </View>
            </Animated.View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.background },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  nivelCard:   { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 2 },
  nivelEmoji:  { fontSize: 44, marginRight: 14 },
  nivelTitulo: { fontSize: 20, fontFamily: FONT.bold, color: COLORS.text },
  nivelSub:    { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 },
  barraContainer: { height: 8, backgroundColor: COLORS.background, borderRadius: 4, marginBottom: 4, overflow: 'hidden' },
  barraXP:     { height: '100%', borderRadius: 4 },
  proxXPTxt:   { fontSize: 11, color: COLORS.textSecondary },

  tabs:        { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 16, padding: 4 },
  tab:         { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.md },
  tabAtivo:    { backgroundColor: COLORS.primary },
  tabTxt:      { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONT.medium },
  tabTxtAtivo: { color: '#fff', fontFamily: FONT.bold },

  secTitulo:   { fontSize: 15, fontFamily: FONT.bold, color: COLORS.text, marginBottom: 10, marginTop: 6 },

  badgesGrid:  { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  badgeCard:   { width: '30%', margin: '1.5%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 10, alignItems: 'center', borderWidth: 1.5 },
  badgeLocked: { borderColor: COLORS.border, opacity: 0.7 },
  badgeIconBox: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  badgeIconTxt: { fontSize: 26 },
  badgeTitulo: { fontSize: 11, fontFamily: FONT.bold, color: COLORS.text, textAlign: 'center', marginBottom: 2 },
  badgeDesc:   { fontSize: 10, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 4 },
  xpChip:      { backgroundColor: COLORS.background, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  xpChipTxt:   { fontSize: 10, fontFamily: FONT.bold, color: COLORS.primary },
  badgeData:   { fontSize: 9, color: COLORS.textSecondary, marginTop: 4 },

  vazioBox:    { alignItems: 'center', paddingVertical: 32 },
  vazioTxt:    { fontSize: 16, fontFamily: FONT.bold, color: COLORS.text, marginTop: 10 },
  vazioSub:    { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },

  niveisContainer: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 16, marginBottom: 16 },
  nivelRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  nivelCirculo: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  nivelLinha:  { position: 'absolute', left: 22, top: 52, width: 4, height: 20, backgroundColor: COLORS.border, zIndex: -1 },
  nivelNome:   { fontSize: 14, fontFamily: FONT.bold, color: COLORS.text },
  nivelXP:     { fontSize: 12, color: COLORS.textSecondary },
  atualTag:    { fontSize: 11, fontFamily: FONT.bold },

  historicoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, marginBottom: 8 },
  historicoTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  historicoEmoji: { fontSize: 24, marginRight: 10 },
  historicoTitulo: { fontSize: 14, fontFamily: FONT.bold, color: COLORS.text },
  historicoGrupo: { fontSize: 12, color: COLORS.textSecondary },
  vencedorTag: { fontSize: 12, fontFamily: FONT.bold, color: '#FFD700' },
  historicoBottom: { flexDirection: 'row', alignItems: 'center' },
  estadoTag:   { fontSize: 11, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginRight: 10, fontFamily: FONT.medium },
  estadoAtivo: { backgroundColor: '#00B89420', color: '#00B894' },
  estadoTerminado: { backgroundColor: COLORS.background, color: COLORS.textSecondary },
  progressoHist: { fontSize: 13, fontFamily: FONT.bold, color: COLORS.primary, flex: 1 },
  dataHist:    { fontSize: 11, color: COLORS.textSecondary },
});
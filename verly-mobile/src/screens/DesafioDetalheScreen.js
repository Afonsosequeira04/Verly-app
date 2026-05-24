// src/screens/DesafioDetalheScreen.js — Verly Social: Detalhe do Desafio
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { desafiosAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const C   = COLORS;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const initials = (n = '') =>
  n.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

function Avatar({ nome, size = 38, color = C.brand }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.3,
      backgroundColor: color + '22', borderWidth: 1.5, borderColor: color,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{ fontSize: size * 0.36, fontWeight: '900', color }}>{initials(nome)}</Text>
    </View>
  );
}

function ProgressBar({ value, max, color = C.brand }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={{ height: 6, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

const TIPO_INFO = {
  gastar_menos:     { label: 'Quem gastar menos',        emoji: '💸', desc: 'Ganha quem tiver o menor gasto total no período' },
  categoria_limite: { label: 'Limite numa categoria',    emoji: '🛒', desc: 'Ganha quem gastar menos nessa categoria' },
  poupar_valor:     { label: 'Poupar o máximo',          emoji: '💰', desc: 'Ganha quem poupar mais vs o seu orçamento' },
  streak_dias:      { label: 'Streak de dias',           emoji: '🔥', desc: 'Ganha quem tiver mais dias consecutivos sem gastar' },
};

export default function DesafioDetalheScreen({ route, navigation }) {
  const { desafioId } = route.params;
  const [desafio,    setDesafio]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refresh,    setRefresh]    = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [terminando,  setTerminando]  = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const d = await desafiosAPI.detalhe(desafioId);
      setDesafio(d);
    } catch (e) {
      console.log('desafio err', e);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [desafioId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const atualizarProgresso = async () => {
    setAtualizando(true);
    try {
      await desafiosAPI.progresso(desafioId);
      await load(true);
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar');
    } finally {
      setAtualizando(false);
    }
  };

  const terminarDesafio = async () => {
    Alert.alert('Terminar desafio', 'Isto vai calcular o vencedor e atribuir a recompensa. Tens a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Terminar', style: 'destructive',
        onPress: async () => {
          setTerminando(true);
          try {
            const result = await desafiosAPI.terminar(desafioId);
            await load(true);
            if (result.vencedor) {
              Alert.alert('🏆 Desafio terminado!', `Vencedor: ${result.vencedor.nome}\n\n${desafio?.recompensa || ''}`);
            }
          } catch {
            Alert.alert('Erro', 'Não foi possível terminar o desafio');
          } finally {
            setTerminando(false);
          }
        },
      },
    ]);
  };

  if (loading) return (
    <View style={styles.center}><ActivityIndicator color={C.brand} size="large" /></View>
  );
  if (!desafio) return null;

  const hoje        = new Date();
  const fim         = new Date(desafio.fim);
  const inicio      = new Date(desafio.inicio);
  const ativo       = desafio.estado === 'ativo' && fim > hoje;
  const terminado   = desafio.estado === 'terminado';
  const diasRestantes = Math.max(0, Math.ceil((fim - hoje) / 86400000));
  const duracaoTotal  = Math.ceil((fim - inicio) / 86400000);
  const progTempo     = Math.min(100, ((hoje - inicio) / (fim - inicio)) * 100);
  const tipoInfo      = TIPO_INFO[desafio.tipo] || TIPO_INFO.gastar_menos;
  const maxProgresso  = Math.max(...(desafio.ranking || []).map(r => r.progresso), 1);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={2}>{desafio.titulo}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(true); }} tintColor={C.brand} />}
      >
        {/* Status card */}
        <Animated.View entering={FadeIn} style={[styles.statusCard, terminado && styles.statusCardTerminado]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: ativo ? C.brandDim : terminado ? C.yellowDim : C.surface3 }]}>
              <Text style={[styles.statusBadgeTxt, { color: ativo ? C.brand : terminado ? C.yellow : C.textSub }]}>
                {ativo ? '⚡ Ativo' : terminado ? '✅ Terminado' : '❌ Cancelado'}
              </Text>
            </View>
            <Text style={styles.statusDias}>
              {ativo ? `${diasRestantes} dias restantes` : `${duracaoTotal} dias`}
            </Text>
          </View>

          {ativo && (
            <>
              <Text style={styles.statusProgLabel}>Tempo decorrido</Text>
              <ProgressBar value={progTempo} max={100} color={C.brand} />
            </>
          )}

          {/* Tipo */}
          <View style={styles.tipoRow}>
            <Text style={styles.tipoEmoji}>{tipoInfo.emoji}</Text>
            <View>
              <Text style={styles.tipoLabel}>{tipoInfo.label}</Text>
              <Text style={styles.tipoDesc}>{tipoInfo.desc}</Text>
              {desafio.categoria && <Text style={styles.tipoCategoria}>Categoria: {desafio.categoria}</Text>}
              {desafio.valor_alvo && <Text style={styles.tipoCategoria}>Alvo: {fmt(desafio.valor_alvo)}€</Text>}
            </View>
          </View>

          {/* Recompensa */}
          {desafio.recompensa && (
            <View style={styles.recompensaRow}>
              <Text style={styles.recompensaLabel}>🎁 Recompensa</Text>
              <Text style={styles.recompensaTxt}>{desafio.recompensa}</Text>
            </View>
          )}
        </Animated.View>

        {/* A minha posição */}
        {desafio.minha_posicao && (
          <Animated.View entering={FadeInDown.delay(100)} style={styles.minhaCard}>
            <Text style={styles.minhaLabel}>A TUA POSIÇÃO</Text>
            <View style={styles.minhaRow}>
              <Text style={styles.minhaMedal}>
                {desafio.minha_posicao === 1 ? '🥇' : desafio.minha_posicao === 2 ? '🥈' : desafio.minha_posicao === 3 ? '🥉' : `#${desafio.minha_posicao}`}
              </Text>
              <View>
                <Text style={styles.minhaPosicao}>#{desafio.minha_posicao} de {desafio.total_participantes}</Text>
                <Text style={styles.minhaProgresso}>Progresso: {fmt(desafio.meu_progresso)}€</Text>
              </View>
              {ativo && (
                <Pressable onPress={atualizarProgresso} disabled={atualizando} style={styles.atualizarBtn}>
                  {atualizando ? <ActivityIndicator color={C.brand} size="small" /> : <Text style={styles.atualizarTxt}>↻ Atualizar</Text>}
                </Pressable>
              )}
            </View>
          </Animated.View>
        )}

        {/* Ranking */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.rankingCard}>
          <Text style={styles.rankingTitle}>🏆 RANKING</Text>
          {(desafio.ranking || []).map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            return (
              <View key={p.user_id} style={[styles.rankRow, i === 0 && styles.rankRowFirst]}>
                <Text style={styles.rankMedal}>{medal}</Text>
                <Avatar nome={p.nome} size={34} color={p.ganhou ? C.yellow : i === 0 ? C.brand : C.textMid} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.rankNome, i === 0 && { color: C.brand }]}>{p.nome}</Text>
                    <Text style={[styles.rankProg, i === 0 && { color: C.brand }]}>{fmt(p.progresso)}€</Text>
                  </View>
                  <ProgressBar value={p.progresso} max={maxProgresso} color={i === 0 ? C.brand : C.textSub} />
                </View>
                {p.ganhou && <Text style={{ fontSize: 18, marginLeft: 6 }}>🏆</Text>}
              </View>
            );
          })}
        </Animated.View>

        {/* Ações admin */}
        {ativo && (
          <Pressable onPress={terminarDesafio} disabled={terminando} style={[styles.terminarBtn, terminando && { opacity: 0.5 }]}>
            {terminando ? <ActivityIndicator color={C.red} size="small" /> : <Text style={styles.terminarTxt}>Terminar e declarar vencedor</Text>}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:               { flex: 1, backgroundColor: C.bg },
  center:             { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header:             { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, gap: 12 },
  backBtn:            { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  backTxt:            { fontSize: 18, color: C.text },
  headerTitle:        { fontSize: FONT.lg, fontWeight: '800', color: C.text },
  scroll:             { padding: SPACE.lg, paddingBottom: 100 },
  // Status
  statusCard:         { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm, gap: 12 },
  statusCardTerminado:{ borderColor: C.yellow + '40' },
  statusRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  statusBadgeTxt:     { fontSize: FONT.xs, fontWeight: '700' },
  statusDias:         { fontSize: FONT.xs, color: C.textMid },
  statusProgLabel:    { fontSize: FONT.xs, color: C.textMid, marginTop: 4 },
  tipoRow:            { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.surface2, borderRadius: RADIUS.sm, padding: 10 },
  tipoEmoji:          { fontSize: 24 },
  tipoLabel:          { fontSize: FONT.sm, fontWeight: '700', color: C.text, marginBottom: 2 },
  tipoDesc:           { fontSize: FONT.xs, color: C.textMid, lineHeight: 16 },
  tipoCategoria:      { fontSize: FONT.xs, color: C.brand, fontWeight: '600', marginTop: 2 },
  recompensaRow:      { backgroundColor: C.yellowDim, borderRadius: RADIUS.sm, padding: 10, gap: 3 },
  recompensaLabel:    { fontSize: FONT.xs, fontWeight: '700', color: C.yellow },
  recompensaTxt:      { fontSize: FONT.sm, color: C.text },
  // Minha posição
  minhaCard:          { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.brand + '30', padding: SPACE.md, marginBottom: SPACE.sm },
  minhaLabel:         { fontSize: FONT.xs, fontWeight: '700', color: C.textMid, letterSpacing: 1, marginBottom: 10 },
  minhaRow:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  minhaMedal:         { fontSize: 32 },
  minhaPosicao:       { fontSize: FONT.lg, fontWeight: '800', color: C.text },
  minhaProgresso:     { fontSize: FONT.sm, color: C.textMid },
  atualizarBtn:       { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.brandDim, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.brand },
  atualizarTxt:       { fontSize: FONT.xs, color: C.brand, fontWeight: '700' },
  // Ranking
  rankingCard:        { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm },
  rankingTitle:       { fontSize: FONT.xs, fontWeight: '800', color: C.textMid, letterSpacing: 1, marginBottom: 12 },
  rankRow:            { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  rankRowFirst:       { backgroundColor: C.brandDim, borderRadius: RADIUS.sm, paddingHorizontal: 8, borderBottomWidth: 0 },
  rankMedal:          { fontSize: 20, width: 30, textAlign: 'center' },
  rankNome:           { fontSize: FONT.sm, fontWeight: '600', color: C.text },
  rankProg:           { fontSize: FONT.sm, fontWeight: '700', color: C.textMid },
  // Terminar
  terminarBtn:        { borderWidth: 1, borderColor: C.red + '40', borderRadius: RADIUS.pill, padding: 14, alignItems: 'center', marginTop: 8 },
  terminarTxt:        { fontSize: FONT.sm, color: C.red, fontWeight: '700' },
});
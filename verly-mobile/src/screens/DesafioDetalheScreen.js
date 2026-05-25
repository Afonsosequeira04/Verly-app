// src/screens/DesafioDetalheScreen.js — Countdown em tempo real, ranking, atualizar progresso
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { desafiosAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

const MEDALHAS = ['🥇', '🥈', '🥉'];

export default function DesafioDetalheScreen({ route, navigation }) {
  const { desafio_id } = route.params;

  const [desafio, setDesafio]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [agora, setAgora]           = useState(new Date());

  // Countdown em tempo real
  useEffect(() => {
    const interval = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const d = await desafiosAPI.detalhe(desafio_id);
      setDesafio(d);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [desafio_id]);

  useFocusEffect(useCallback(() => {
    carregar();
  }, [carregar]));

  const atualizarProgresso = async () => {
    setAtualizando(true);
    try {
      const res = await desafiosAPI.progresso(desafio_id);
      setDesafio(prev => ({
        ...prev,
        meu_progresso: res.progresso,
        minha_posicao: res.minha_posicao,
        ranking: res.ranking,
      }));
      Alert.alert('✅ Atualizado!', `O teu progresso é ${res.progresso.toFixed(2)}€. Posição: #${res.minha_posicao}`);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setAtualizando(false);
    }
  };

  const terminarDesafio = async () => {
    Alert.alert('Terminar desafio', 'Tens a certeza? Isto calcula o vencedor agora.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Terminar',
        style: 'destructive',
        onPress: async () => {
          setTerminando(true);
          try {
            const res = await desafiosAPI.terminar(desafio_id);
            const v = res.vencedor;
            Alert.alert(
              '🏆 Desafio terminado!',
              v ? `${v.nome} venceu com ${v.progresso.toFixed(2)}€ poupados!` : 'Nenhum participante.',
              [{ text: 'OK', onPress: carregar }]
            );
          } catch (e) {
            Alert.alert('Erro', e.message);
          } finally {
            setTerminando(false);
          }
        },
      },
    ]);
  };

  const formatarContagem = (fim) => {
    const segsTotal = Math.max(0, Math.floor((new Date(fim) - agora) / 1000));
    if (segsTotal === 0) return { texto: 'Terminado', urgente: false };
    const d = Math.floor(segsTotal / 86400);
    const h = Math.floor((segsTotal % 86400) / 3600);
    const m = Math.floor((segsTotal % 3600) / 60);
    const s = segsTotal % 60;
    const urgente = segsTotal < 3600; // menos de 1h
    if (d > 0) return { texto: `${d}d ${h}h ${m}m restantes`, urgente: false };
    if (h > 0) return { texto: `${h}h ${m}m ${s}s restantes`, urgente: urgente };
    return { texto: `${m}m ${s.toString().padStart(2,'0')}s restantes`, urgente: true };
  };

  const tipoLabel = (tipo) => {
    const map = {
      gastar_menos: '📉 Gastar menos',
      categoria_limite: '🏷️ Limite por categoria',
      poupar_valor: '💰 Poupar valor',
      streak_dias: '🔥 Streak de dias',
    };
    return map[tipo] || tipo;
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  if (!desafio) return null;

  const { texto: contagemTxt, urgente } = formatarContagem(desafio.fim);
  const terminado = desafio.estado === 'terminado';
  const progressoPct = desafio.valor_alvo
    ? Math.min(100, (desafio.meu_progresso / desafio.valor_alvo) * 100)
    : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} />}
      contentContainerStyle={{ padding: SPACE.md, paddingBottom: 60 }}
    >
      <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backTxt}>← Voltar</Text>
      </Pressable>

      {/* Header do desafio */}
      <Animated.View entering={FadeIn} style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Text style={styles.titulo}>{desafio.titulo}</Text>
          {desafio.gerado_ia && (
            <View style={styles.iaBadge}>
              <Text style={styles.iaBadgeTxt}>🤖 IA</Text>
            </View>
          )}
        </View>
        {desafio.descricao ? <Text style={styles.descricao}>{desafio.descricao}</Text> : null}

        <View style={styles.infoRow}>
          <Text style={styles.infoChip}>{tipoLabel(desafio.tipo)}</Text>
          {desafio.valor_alvo && <Text style={styles.infoChip}>Alvo: {desafio.valor_alvo}€</Text>}
          <Text style={styles.infoChip}>👥 {desafio.total_participantes}</Text>
        </View>

        {/* Countdown */}
        {!terminado && (
          <View style={[styles.countdownBox, urgente && styles.countdownUrgente]}>
            <Text style={[styles.countdownTxt, urgente && styles.countdownUrgenteTxt]}>
              ⏱️ {contagemTxt}
            </Text>
          </View>
        )}
        {terminado && (
          <View style={styles.terminadoBox}>
            <Text style={styles.terminadoTxt}>🏁 Desafio terminado</Text>
          </View>
        )}
      </Animated.View>

      {/* O meu progresso */}
      <Animated.View entering={FadeInDown.delay(100)} style={styles.progressoCard}>
        <Text style={styles.secTitulo}>O meu progresso</Text>
        <View style={styles.progressoRow}>
          <Text style={styles.progressoVal}>{desafio.meu_progresso?.toFixed(2) || '0.00'}€</Text>
          {desafio.minha_posicao && (
            <Text style={styles.posicaoTxt}>
              {MEDALHAS[desafio.minha_posicao - 1] || `#${desafio.minha_posicao}`}
            </Text>
          )}
        </View>
        {desafio.valor_alvo && (
          <View style={styles.barraContainer}>
            <View style={[styles.barraPreenchida, { width: `${progressoPct}%` }]} />
          </View>
        )}
        {!terminado && (
          <Pressable
            onPress={atualizarProgresso}
            style={[styles.btnAtualizar, atualizando && { opacity: 0.6 }]}
          >
            {atualizando
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.btnAtualizarTxt}>🔄 Atualizar progresso</Text>
            }
          </Pressable>
        )}
      </Animated.View>

      {/* Ranking */}
      <Animated.View entering={FadeInDown.delay(200)} style={styles.rankingCard}>
        <Text style={styles.secTitulo}>🏆 Ranking</Text>
        {(desafio.ranking || []).map((p, i) => (
          <View key={p.user_id} style={[styles.rankRow, i === 0 && styles.rankRow1]}>
            <Text style={styles.rankMedalha}>{MEDALHAS[i] || `#${i + 1}`}</Text>
            <Text style={styles.rankNome} numberOfLines={1}>{p.nome}</Text>
            <Text style={styles.rankVal}>{p.progresso.toFixed(2)}€</Text>
            {p.ganhou && <Text style={styles.vencedorBadge}>🏆</Text>}
          </View>
        ))}
      </Animated.View>

      {/* Recompensa */}
      {desafio.recompensa && (
        <Animated.View entering={FadeInDown.delay(300)} style={styles.recompensaCard}>
          <Text style={styles.recompensaTxt}>{desafio.recompensa}</Text>
        </Animated.View>
      )}

      {/* Datas */}
      <View style={styles.datasRow}>
        <Text style={styles.dataTxt}>
          Início: {new Date(desafio.inicio).toLocaleDateString('pt-PT')}
        </Text>
        <Text style={styles.dataTxt}>
          Fim: {new Date(desafio.fim).toLocaleDateString('pt-PT')}
        </Text>
      </View>

      {/* Botão terminar (só criador) */}
      {!terminado && (
        <Pressable
          onPress={terminarDesafio}
          style={[styles.btnTerminar, terminando && { opacity: 0.5 }]}
        >
          {terminando
            ? <ActivityIndicator size="small" color={COLORS.danger || '#E74C3C'} />
            : <Text style={styles.btnTerminarTxt}>🏁 Terminar desafio</Text>
          }
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.background },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  backBtn:     { marginBottom: 12 },
  backTxt:     { color: COLORS.primary, fontSize: 15, fontFamily: FONT.medium },

  headerCard:  { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 18, marginBottom: 12 },
  headerTop:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  titulo:      { fontSize: 20, fontFamily: FONT.bold, color: COLORS.text, flex: 1 },
  descricao:   { fontSize: 14, color: COLORS.textSecondary, marginBottom: 10 },
  iaBadge:     { backgroundColor: '#A29BFE22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  iaBadgeTxt:  { color: '#A29BFE', fontSize: 12, fontFamily: FONT.bold },
  infoRow:     { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  infoChip:    { backgroundColor: COLORS.background, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 4, fontSize: 12, color: COLORS.text, fontFamily: FONT.medium },

  countdownBox: { backgroundColor: `${COLORS.primary}20`, borderRadius: RADIUS.md, padding: 10, alignItems: 'center' },
  countdownUrgente: { backgroundColor: '#FF636320' },
  countdownTxt: { fontSize: 16, fontFamily: FONT.bold, color: COLORS.primary },
  countdownUrgenteTxt: { color: '#E74C3C' },
  terminadoBox: { backgroundColor: '#00B89420', borderRadius: RADIUS.md, padding: 10, alignItems: 'center' },
  terminadoTxt: { fontSize: 14, fontFamily: FONT.bold, color: '#00B894' },

  progressoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 18, marginBottom: 12 },
  secTitulo:   { fontSize: 15, fontFamily: FONT.bold, color: COLORS.text, marginBottom: 10 },
  progressoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressoVal: { fontSize: 28, fontFamily: FONT.bold, color: COLORS.primary },
  posicaoTxt:  { fontSize: 32 },
  barraContainer: { height: 8, backgroundColor: COLORS.background, borderRadius: 4, marginBottom: 14, overflow: 'hidden' },
  barraPreenchida: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  btnAtualizar: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center' },
  btnAtualizarTxt: { color: '#fff', fontSize: 14, fontFamily: FONT.bold },

  rankingCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 18, marginBottom: 12 },
  rankRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  rankRow1:    { paddingVertical: 12 },
  rankMedalha: { fontSize: 22, marginRight: 10, width: 30, textAlign: 'center' },
  rankNome:    { flex: 1, fontSize: 14, color: COLORS.text, fontFamily: FONT.medium },
  rankVal:     { fontSize: 14, fontFamily: FONT.bold, color: COLORS.primary, marginRight: 6 },
  vencedorBadge: { fontSize: 18 },

  recompensaCard: { backgroundColor: '#FFD70015', borderRadius: RADIUS.lg, padding: 14, marginBottom: 12, alignItems: 'center' },
  recompensaTxt: { fontSize: 15, fontFamily: FONT.bold, color: '#B8860B' },

  datasRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  dataTxt:     { fontSize: 12, color: COLORS.textSecondary },

  btnTerminar: { borderWidth: 1, borderColor: '#E74C3C', borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center' },
  btnTerminarTxt: { color: '#E74C3C', fontSize: 14, fontFamily: FONT.bold },
});
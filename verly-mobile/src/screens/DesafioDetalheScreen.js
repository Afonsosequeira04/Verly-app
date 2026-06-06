// src/screens/DesafioDetalheScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { desafiosAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import { formatMoney } from '../utils/money';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const C = COLORS;
const MEDALHAS = ['🥇', '🥈', '🥉'];

export default function DesafioDetalheScreen({ route, navigation }) {
  const { desafio_id } = route.params;

  const [desafio, setDesafio]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [terminando, setTerminando]   = useState(false);
  const [agora, setAgora]             = useState(new Date());

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

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const atualizarProgresso = async () => {
    setAtualizando(true);
    try {
      const res = await desafiosAPI.progresso(desafio_id);
      setDesafio(prev => ({
        ...prev,
        meu_progresso: res.progresso,
        minha_posicao: res.minha_posicao,
        ranking: res.ranking,
        currency: res.currency || prev?.currency,
      }));
      Alert.alert('✅ Atualizado!', `Progresso: ${formatMoney(res.progresso, res.currency || desafio?.currency || 'EUR')}  ·  #${res.minha_posicao}`);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setAtualizando(false);
    }
  };

  const terminarDesafio = async () => {
    Alert.alert('Terminar desafio', 'Isto calcula o vencedor agora.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Terminar', style: 'destructive',
        onPress: async () => {
          setTerminando(true);
          try {
            const res = await desafiosAPI.terminar(desafio_id);
            const v = res.vencedor;
            Alert.alert(
              '🏆 Desafio terminado!',
              v ? `${v.nome} venceu com ${formatMoney(v.progresso, res.currency || desafio?.currency || 'EUR')}!` : 'Nenhum participante.',
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
    const urgente = segsTotal < 3600;
    if (d > 0) return { texto: `${d}d ${h}h ${m}m restantes`, urgente: false };
    if (h > 0) return { texto: `${h}h ${m}m ${s}s restantes`, urgente };
    return { texto: `${m}m ${s.toString().padStart(2,'0')}s restantes`, urgente: true };
  };

  const tipoLabel = (tipo) => ({
    gastar_menos: '📉 Gastar menos',
    categoria_limite: '🏷️ Limite por categoria',
    poupar_valor: '💰 Poupar valor',
    streak_dias: '🔥 Streak de dias',
  }[tipo] || tipo);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.brand} /></View>;
  }
  if (!desafio) return null;

  const { texto: contagemTxt, urgente } = formatarContagem(desafio.fim);
  const terminado = desafio.estado === 'terminado';
  const currency = desafio.currency || 'EUR';
  const progressoPct = desafio.valor_alvo
    ? Math.min(100, (desafio.meu_progresso / desafio.valor_alvo) * 100) : 0;

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} tintColor={C.brand} />}
      contentContainerStyle={{ padding: SPACE.md, paddingBottom: 60 }}
    >
      <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
        <Text style={s.backTxt}>← Voltar</Text>
      </Pressable>

      {/* Header */}
      <Animated.View entering={FadeIn} style={s.card}>
        <View style={s.headerTop}>
          <Text style={s.titulo}>{desafio.titulo}</Text>
          {desafio.gerado_ia && (
            <View style={s.iaBadge}><Text style={s.iaBadgeTxt}>🤖 IA</Text></View>
          )}
        </View>
        {desafio.descricao ? <Text style={s.descricao}>{desafio.descricao}</Text> : null}
        <View style={s.infoRow}>
          <Text style={s.chip}>{tipoLabel(desafio.tipo)}</Text>
          {desafio.valor_alvo && <Text style={s.chip}>Alvo: {formatMoney(desafio.valor_alvo, currency)}</Text>}
          <Text style={s.chip}>👥 {desafio.total_participantes}</Text>
        </View>
        {!terminado && (
          <View style={[s.countdownBox, urgente && s.countdownUrgente]}>
            <Text style={[s.countdownTxt, urgente && s.countdownUrgenteTxt]}>⏱️ {contagemTxt}</Text>
          </View>
        )}
        {terminado && (
          <View style={s.terminadoBox}>
            <Text style={s.terminadoTxt}>🏁 Desafio terminado</Text>
          </View>
        )}
      </Animated.View>

      {/* Progresso */}
      <Animated.View entering={FadeInDown.delay(100)} style={s.card}>
        <Text style={s.secTitulo}>O meu progresso</Text>
        <View style={s.progressoRow}>
          <Text style={s.progressoVal}>{formatMoney(desafio.meu_progresso || 0, currency)}</Text>
          {desafio.minha_posicao && (
            <Text style={s.posicaoTxt}>{MEDALHAS[desafio.minha_posicao - 1] || `#${desafio.minha_posicao}`}</Text>
          )}
        </View>
        {desafio.valor_alvo && (
          <View style={s.barraContainer}>
            <View style={[s.barraPreenchida, { width: `${progressoPct}%` }]} />
          </View>
        )}
        {!terminado && (
          <Pressable onPress={atualizarProgresso} style={[s.btnPrimary, atualizando && { opacity: 0.6 }]}>
            {atualizando
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.btnPrimaryTxt}>🔄 Atualizar progresso</Text>
            }
          </Pressable>
        )}
      </Animated.View>

      {/* Ranking */}
      <Animated.View entering={FadeInDown.delay(200)} style={s.card}>
        <Text style={s.secTitulo}>🏆 Ranking</Text>
        {(desafio.ranking || []).map((p, i) => (
          <View key={p.user_id} style={[s.rankRow, i === 0 && s.rankRow1]}>
            <Text style={s.rankMedalha}>{MEDALHAS[i] || `#${i + 1}`}</Text>
            <Text style={s.rankNome} numberOfLines={1}>{p.nome}</Text>
            <Text style={s.rankVal}>{formatMoney(p.progresso || 0, currency)}</Text>
            {p.ganhou && <Text style={{ fontSize: 18 }}>🏆</Text>}
          </View>
        ))}
      </Animated.View>

      {desafio.recompensa && (
        <Animated.View entering={FadeInDown.delay(300)} style={s.recompensaCard}>
          <Text style={s.recompensaTxt}>🏆 {desafio.recompensa}</Text>
        </Animated.View>
      )}

      <View style={s.datasRow}>
        <Text style={s.dataTxt}>Início: {new Date(desafio.inicio).toLocaleDateString('pt-PT')}</Text>
        <Text style={s.dataTxt}>Fim: {new Date(desafio.fim).toLocaleDateString('pt-PT')}</Text>
      </View>

      {!terminado && (
        <Pressable onPress={terminarDesafio} style={[s.btnTerminar, terminando && { opacity: 0.5 }]}>
          {terminando
            ? <ActivityIndicator size="small" color={C.red} />
            : <Text style={s.btnTerminarTxt}>🏁 Terminar desafio</Text>
          }
        </Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: COLORS.bg },
  center:             { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  backBtn:            { marginBottom: 12 },
  backTxt:            { color: COLORS.brand, fontSize: 15, fontWeight: '600' },
  card:               { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 18, marginBottom: 12 },
  headerTop:          { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  titulo:             { fontSize: 20, fontWeight: '700', color: COLORS.text, flex: 1 },
  descricao:          { fontSize: 14, color: COLORS.textMid, marginBottom: 10 },
  iaBadge:            { backgroundColor: '#A29BFE22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  iaBadgeTxt:         { color: '#A29BFE', fontSize: 12, fontWeight: '700' },
  infoRow:            { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  chip:               { backgroundColor: COLORS.surface2, borderRadius: RADIUS.xs, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 4, fontSize: 12, color: COLORS.text },
  countdownBox:       { backgroundColor: `${COLORS.brand}20`, borderRadius: RADIUS.md, padding: 10, alignItems: 'center' },
  countdownUrgente:   { backgroundColor: `${COLORS.red}20` },
  countdownTxt:       { fontSize: 16, fontWeight: '700', color: COLORS.brand },
  countdownUrgenteTxt:{ color: COLORS.red },
  terminadoBox:       { backgroundColor: `${COLORS.green}20`, borderRadius: RADIUS.md, padding: 10, alignItems: 'center' },
  terminadoTxt:       { fontSize: 14, fontWeight: '700', color: COLORS.green },
  secTitulo:          { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  progressoRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressoVal:       { fontSize: 28, fontWeight: '700', color: COLORS.brand },
  posicaoTxt:         { fontSize: 32 },
  barraContainer:     { height: 8, backgroundColor: COLORS.surface2, borderRadius: 4, marginBottom: 14, overflow: 'hidden' },
  barraPreenchida:    { height: '100%', backgroundColor: COLORS.brand, borderRadius: 4 },
  btnPrimary:         { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryTxt:      { color: '#fff', fontSize: 14, fontWeight: '700' },
  rankRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rankRow1:           { paddingVertical: 12 },
  rankMedalha:        { fontSize: 22, marginRight: 10, width: 30, textAlign: 'center' },
  rankNome:           { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },
  rankVal:            { fontSize: 14, fontWeight: '700', color: COLORS.brand, marginRight: 6 },
  recompensaCard:     { backgroundColor: '#FFD70015', borderRadius: RADIUS.lg, padding: 14, marginBottom: 12, alignItems: 'center' },
  recompensaTxt:      { fontSize: 15, fontWeight: '700', color: '#B8860B' },
  datasRow:           { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  dataTxt:            { fontSize: 12, color: COLORS.textMid },
  btnTerminar:        { borderWidth: 1, borderColor: COLORS.red, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center' },
  btnTerminarTxt:     { color: COLORS.red, fontSize: 14, fontWeight: '700' },
});

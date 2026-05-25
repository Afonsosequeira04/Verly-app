// src/screens/GrupoDetalheScreen.js — Chat, Feed, Streak, Countdown, IA
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, TextInput,
  Alert, ActivityIndicator, StyleSheet, RefreshControl,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { gruposAPI, desafiosAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const TABS = ['Feed', 'Chat', 'Desafios', 'Streak'];
const REACAO_EMOJIS = ['👀', '🔥', '💸', '💪', '😅', '🏆'];

export default function GrupoDetalheScreen({ route, navigation }) {
  // ✅ FIX: usar grupoId (camelCase) igual ao que GruposScreen passa
  const { grupoId } = route.params;

  const [grupo, setGrupo]           = useState(null);
  const [tab, setTab]               = useState('Feed');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Feed
  const [feed, setFeed]             = useState([]);

  // Chat
  const [mensagens, setMensagens]   = useState([]);
  const [texto, setTexto]           = useState('');
  const [enviando, setEnviando]     = useState(false);
  const [mostrarReacoes, setMostrarReacoes] = useState(null);
  const chatRef = useRef(null);

  // Desafios
  const [desafios, setDesafios]     = useState([]);
  const [modalDesafio, setModalDesafio] = useState(false);
  const [sugestaoIA, setSugestaoIA] = useState(null);
  const [loadingIA, setLoadingIA]   = useState(false);
  const [formDesafio, setFormDesafio] = useState({
    titulo: '', descricao: '', tipo: 'gastar_menos',
    valor_alvo: '', dias: '14', recompensa: '🏆 Vencedor',
  });

  // Streak
  const [streakInfo, setStreakInfo] = useState(null);
  const [fazendoCheckIn, setFazendoCheckIn] = useState(false);

  // Countdown timer
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const carregar = useCallback(async () => {
    try {
      // ✅ FIX: usar gruposAPI em vez de chatGrupoAPI
      const [g, f, d, s] = await Promise.all([
        gruposAPI.detalhe(grupoId),
        gruposAPI.feed(grupoId),
        desafiosAPI.listar(grupoId),
        gruposAPI.streak(grupoId),
      ]);
      setGrupo(g);
      setFeed(Array.isArray(f) ? f : []);
      setDesafios(Array.isArray(d) ? d : []);
      setStreakInfo(s);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [grupoId]);

  const carregarChat = useCallback(async () => {
    try {
      // ✅ FIX: usar gruposAPI.chatHistorico
      const msgs = await gruposAPI.chatHistorico(grupoId);
      setMensagens(Array.isArray(msgs) ? msgs : []);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (e) {}
  }, [grupoId]);

  useFocusEffect(useCallback(() => {
    carregar();
  }, [carregar]));

  useEffect(() => {
    if (tab === 'Chat') {
      carregarChat();
      const interval = setInterval(carregarChat, 5000);
      return () => clearInterval(interval);
    }
  }, [tab, carregarChat]);

  const onRefresh = () => { setRefreshing(true); carregar(); };

  const enviarMensagem = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      // ✅ FIX: usar gruposAPI.chatEnviar
      const msg = await gruposAPI.chatEnviar(grupoId, texto.trim());
      setMensagens(prev => [...prev, msg]);
      setTexto('');
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setEnviando(false);
    }
  };

  const reagir = async (msg_id, emoji) => {
    try {
      // ✅ FIX: usar gruposAPI.chatReagir
      const updated = await gruposAPI.chatReagir(grupoId, msg_id, emoji);
      setMensagens(prev => prev.map(m => m.id === msg_id ? updated : m));
    } catch (e) {}
    setMostrarReacoes(null);
  };

  const pedirDesafioIA = async () => {
    setLoadingIA(true);
    try {
      // ✅ FIX: usar desafiosAPI.criarComIA
      const res = await desafiosAPI.criarComIA(grupoId);
      setSugestaoIA(res.sugestao);
      const s = res.sugestao;
      setFormDesafio({
        titulo: s.titulo || '',
        descricao: s.descricao || '',
        tipo: s.tipo || 'gastar_menos',
        valor_alvo: String(s.valor_alvo || ''),
        dias: String(s.dias || '14'),
        recompensa: s.recompensa || '🏆',
      });
    } catch (e) {
      Alert.alert('Erro IA', e.message);
    } finally {
      setLoadingIA(false);
    }
  };

  const criarDesafio = async () => {
    if (!formDesafio.titulo.trim()) {
      Alert.alert('Falta o título');
      return;
    }
    try {
      const inicio = new Date();
      const fim    = new Date(inicio.getTime() + parseInt(formDesafio.dias || 14) * 86400000);
      await desafiosAPI.criar(grupoId, {
        titulo: formDesafio.titulo,
        descricao: formDesafio.descricao,
        tipo: formDesafio.tipo,
        valor_alvo: parseFloat(formDesafio.valor_alvo) || null,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        recompensa: formDesafio.recompensa,
        gerado_ia: !!sugestaoIA,
      });
      setModalDesafio(false);
      setSugestaoIA(null);
      await carregar();
      Alert.alert('✅ Desafio criado!', 'Todos os membros já foram adicionados.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  const fazerCheckIn = async () => {
    setFazendoCheckIn(true);
    try {
      // ✅ FIX: usar gruposAPI.streakCheckIn
      const res = await gruposAPI.streakCheckIn(grupoId);
      setStreakInfo(prev => ({ ...prev, ...res, eu_cumpri_hoje: true, check_ins_hoje: res.check_ins_hoje }));
      if (res.streak_aumentou) {
        Alert.alert('🔥 Streak do grupo!', `O grupo tem agora ${res.streak_dias} dias seguidos!`);
      } else {
        Alert.alert('✅ Check-in feito!', `${res.check_ins_hoje}/${res.total_membros} membros cumpriram hoje.`);
      }
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setFazendoCheckIn(false);
    }
  };

  const formatarContagem = (segundos) => {
    if (segundos <= 0) return 'Terminado';
    const d = Math.floor(segundos / 86400);
    const h = Math.floor((segundos % 86400) / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>←</Text>
          </Pressable>
          <Text style={styles.headerEmoji}>{grupo?.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerNome}>{grupo?.nome}</Text>
            <Text style={styles.headerSub}>{grupo?.total_membros} membros · 🔥 {grupo?.streak_dias || 0} dias</Text>
          </View>
          <Pressable onPress={() => setModalDesafio(true)} style={styles.btnNovo}>
            <Text style={styles.btnNovoTxt}>+ Desafio</Text>
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {TABS.map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabAtivo]}>
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtAtivo]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Feed ── */}
        {tab === 'Feed' && (
          <ScrollView
            style={{ flex: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ padding: SPACE.md }}
          >
            {feed.length === 0 && (
              <Text style={styles.vazio}>Ainda não há atividade. Cria um desafio!</Text>
            )}
            {feed.map((item, i) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 50)} style={styles.feedCard}>
                <Text style={styles.feedEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.feedDesc}>{item.descricao}</Text>
                  <Text style={styles.feedData}>{new Date(item.criada_em).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              </Animated.View>
            ))}
          </ScrollView>
        )}

        {/* ── Chat ── */}
        {tab === 'Chat' && (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={chatRef}
              data={mensagens}
              keyExtractor={m => String(m.id)}
              contentContainerStyle={{ padding: SPACE.md }}
              renderItem={({ item }) => (
                <View style={[styles.msgRow, item.minha && styles.msgRowMinha]}>
                  {!item.minha && (
                    <View style={styles.msgAvatar}>
                      <Text style={{ fontSize: 18 }}>
                        {item.nome_autor?.[0]?.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Pressable
                    onLongPress={() => setMostrarReacoes(item.id)}
                    style={[styles.msgBubble, item.minha && styles.msgBubbleMinha]}
                  >
                    {!item.minha && <Text style={styles.msgNome}>{item.nome_autor}</Text>}
                    <Text style={styles.msgTexto}>{item.texto}</Text>
                    <Text style={styles.msgHora}>
                      {new Date(item.enviada_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {Object.keys(item.reacoes || {}).length > 0 && (
                      <View style={styles.reacoesRow}>
                        {Object.entries(item.reacoes).map(([emoji, users]) => (
                          <Pressable key={emoji} onPress={() => reagir(item.id, emoji)} style={styles.reacaoChip}>
                            <Text style={{ fontSize: 13 }}>{emoji} {users.length}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </Pressable>
                </View>
              )}
              onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: false })}
            />
            {mostrarReacoes && (
              <View style={styles.reacoesBar}>
                {REACAO_EMOJIS.map(e => (
                  <Pressable key={e} onPress={() => reagir(mostrarReacoes, e)} style={styles.reacaoBtnBar}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setMostrarReacoes(null)} style={styles.reacaoBtnBar}>
                  <Text style={{ fontSize: 18, color: COLORS.textSecondary }}>✕</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={texto}
                onChangeText={setTexto}
                placeholder="Mensagem..."
                placeholderTextColor={COLORS.textSecondary}
                multiline
              />
              <Pressable onPress={enviarMensagem} style={[styles.sendBtn, enviando && { opacity: 0.5 }]}>
                {enviando
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.sendTxt}>↑</Text>
                }
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Desafios ── */}
        {tab === 'Desafios' && (
          <ScrollView
            style={{ flex: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ padding: SPACE.md }}
          >
            {desafios.length === 0 && (
              <View style={styles.vazioCard}>
                <Text style={{ fontSize: 40, textAlign: 'center' }}>⚡</Text>
                <Text style={styles.vazioTxt}>Sem desafios ainda.</Text>
                <Text style={styles.vazioSub}>Cria um ou deixa a IA sugerir um!</Text>
              </View>
            )}
            {desafios.map((d, i) => {
              const fim = new Date(d.fim);
              const segsRestantes = Math.max(0, Math.floor((fim - agora) / 1000));
              const terminado = d.estado === 'terminado';
              return (
                <Animated.View key={d.id} entering={FadeInDown.delay(i * 60)}>
                  <Pressable
                    style={[styles.desafioCard, terminado && { opacity: 0.6 }]}
                    onPress={() => navigation.navigate('DesafioDetalhe', { desafio_id: d.id })}
                  >
                    <View style={styles.desafioTop}>
                      <Text style={styles.desafioTitulo}>{d.titulo}</Text>
                      {d.gerado_ia && <Text style={styles.iaBadge}>🤖 IA</Text>}
                    </View>
                    {!terminado && (
                      <View style={styles.countdownRow}>
                        <Text style={styles.countdownEmoji}>⏱️</Text>
                        <Text style={styles.countdownTxt}>{formatarContagem(segsRestantes)}</Text>
                      </View>
                    )}
                    {terminado && <Text style={styles.terminadoTxt}>Terminado</Text>}
                    <View style={styles.rankRow}>
                      {(d.ranking || []).slice(0, 3).map((r, pos) => (
                        <View key={r.user_id} style={styles.rankItem}>
                          <Text style={styles.rankPos}>{['🥇','🥈','🥉'][pos]}</Text>
                          <Text style={styles.rankNome} numberOfLines={1}>{r.nome}</Text>
                          <Text style={styles.rankVal}>{r.progresso.toFixed(0)}€</Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </ScrollView>
        )}

        {/* ── Streak ── */}
        {tab === 'Streak' && streakInfo && (
          <ScrollView contentContainerStyle={{ padding: SPACE.md }}>
            <Animated.View entering={FadeIn} style={styles.streakCard}>
              <Text style={styles.streakEmoji}>🔥</Text>
              <Text style={styles.streakNum}>{streakInfo.streak_dias}</Text>
              <Text style={styles.streakLabel}>dias seguidos</Text>
              <Text style={styles.streakSub}>
                {streakInfo.check_ins_hoje}/{streakInfo.total_membros} cumpriram hoje
              </Text>
              {!streakInfo.eu_cumpri_hoje ? (
                <Pressable
                  onPress={fazerCheckIn}
                  style={[styles.checkInBtn, fazendoCheckIn && { opacity: 0.6 }]}
                >
                  {fazendoCheckIn
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.checkInTxt}>✓ Marcar objetivo hoje</Text>
                  }
                </Pressable>
              ) : (
                <View style={styles.checkInDone}>
                  <Text style={styles.checkInDoneTxt}>✅ Já marcaste hoje!</Text>
                </View>
              )}
            </Animated.View>

            <Text style={styles.secTitulo}>Estado dos membros</Text>
            {(streakInfo.membros || []).map(m => (
              <View key={m.id} style={styles.membroStreakRow}>
                <Text style={styles.membroStreakNome}>{m.nome}</Text>
                <Text style={m.cumpriu_hoje ? styles.cumpriuSim : styles.cumpriuNao}>
                  {m.cumpriu_hoje ? '✅' : '⏳'}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── Modal Criar Desafio ── */}
        <Modal visible={modalDesafio} animationType="slide" transparent>
          <View style={styles.modalBg}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitulo}>Novo Desafio</Text>

              <Pressable onPress={pedirDesafioIA} style={[styles.iaBtnModal, loadingIA && { opacity: 0.6 }]}>
                {loadingIA
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.iaBtnTxt}>🤖 Sugerir com IA</Text>
                }
              </Pressable>

              {sugestaoIA && (
                <View style={styles.sugestaoBox}>
                  <Text style={styles.sugestaoTxt}>💡 {sugestaoIA.justificacao}</Text>
                </View>
              )}

              <TextInput
                style={styles.field}
                placeholder="Título do desafio"
                placeholderTextColor={COLORS.textSecondary}
                value={formDesafio.titulo}
                onChangeText={v => setFormDesafio(p => ({ ...p, titulo: v }))}
              />
              <TextInput
                style={styles.field}
                placeholder="Descrição (opcional)"
                placeholderTextColor={COLORS.textSecondary}
                value={formDesafio.descricao}
                onChangeText={v => setFormDesafio(p => ({ ...p, descricao: v }))}
              />

              <View style={styles.tipoRow}>
                {['gastar_menos','categoria_limite','poupar_valor','streak_dias'].map(t => (
                  <Pressable
                    key={t}
                    onPress={() => setFormDesafio(p => ({ ...p, tipo: t }))}
                    style={[styles.tipoBtn, formDesafio.tipo === t && styles.tipoBtnAtivo]}
                  >
                    <Text style={[styles.tipoTxt, formDesafio.tipo === t && { color: '#fff' }]}>
                      {t === 'gastar_menos' ? '📉 Gastar menos' :
                       t === 'categoria_limite' ? '🏷️ Categoria' :
                       t === 'poupar_valor' ? '💰 Poupar' : '🔥 Streak'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.rowFields}>
                <TextInput
                  style={[styles.field, { flex: 1, marginRight: 6 }]}
                  placeholder="Valor alvo (€)"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="numeric"
                  value={formDesafio.valor_alvo}
                  onChangeText={v => setFormDesafio(p => ({ ...p, valor_alvo: v }))}
                />
                <TextInput
                  style={[styles.field, { flex: 1 }]}
                  placeholder="Duração (dias)"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="numeric"
                  value={formDesafio.dias}
                  onChangeText={v => setFormDesafio(p => ({ ...p, dias: v }))}
                />
              </View>

              <TextInput
                style={styles.field}
                placeholder="Recompensa (ex: 🏆 Jantar grátis)"
                placeholderTextColor={COLORS.textSecondary}
                value={formDesafio.recompensa}
                onChangeText={v => setFormDesafio(p => ({ ...p, recompensa: v }))}
              />

              <View style={styles.modalBtns}>
                <Pressable onPress={() => { setModalDesafio(false); setSugestaoIA(null); }} style={styles.cancelBtn}>
                  <Text style={styles.cancelTxt}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={criarDesafio} style={styles.confirmBtn}>
                  <Text style={styles.confirmTxt}>Criar ⚡</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.background },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header:      { flexDirection: 'row', alignItems: 'center', padding: SPACE.md, paddingTop: 48, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:     { marginRight: 8 },
  backTxt:     { fontSize: 22, color: COLORS.primary },
  headerEmoji: { fontSize: 28, marginRight: 8 },
  headerNome:  { fontSize: 17, fontFamily: FONT.bold, color: COLORS.text },
  headerSub:   { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  btnNovo:     { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 6 },
  btnNovoTxt:  { color: '#fff', fontSize: 12, fontFamily: FONT.bold },
  tabs:        { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabAtivo:    { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabTxt:      { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONT.medium },
  tabTxtAtivo: { color: COLORS.primary, fontFamily: FONT.bold },
  vazio:       { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 15 },
  vazioCard:   { alignItems: 'center', paddingVertical: 40 },
  vazioTxt:    { fontSize: 16, fontFamily: FONT.bold, color: COLORS.text, marginTop: 12 },
  vazioSub:    { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  feedCard:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8 },
  feedEmoji:   { fontSize: 22, marginRight: 10, marginTop: 2 },
  feedDesc:    { fontSize: 14, color: COLORS.text, fontFamily: FONT.regular },
  feedData:    { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  msgRow:      { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  msgRowMinha: { flexDirection: 'row-reverse' },
  msgAvatar:   { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  msgBubble:   { maxWidth: '75%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 10, borderTopLeftRadius: 4 },
  msgBubbleMinha: { backgroundColor: COLORS.primary, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: 4 },
  msgNome:     { fontSize: 11, fontFamily: FONT.bold, color: COLORS.primary, marginBottom: 2 },
  msgTexto:    { fontSize: 14, color: COLORS.text },
  msgHora:     { fontSize: 10, color: COLORS.textSecondary, marginTop: 3, alignSelf: 'flex-end' },
  reacoesRow:  { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  reacaoChip:  { backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginTop: 2 },
  reacoesBar:  { flexDirection: 'row', justifyContent: 'center', backgroundColor: COLORS.surface, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  reacaoBtnBar: { paddingHorizontal: 10 },
  inputRow:    { flexDirection: 'row', padding: 10, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: 'flex-end' },
  input:       { flex: 1, backgroundColor: COLORS.background, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 8, color: COLORS.text, maxHeight: 100, fontSize: 14 },
  sendBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendTxt:     { color: '#fff', fontSize: 18, fontFamily: FONT.bold },
  desafioCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, marginBottom: 12 },
  desafioTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  desafioTitulo: { fontSize: 15, fontFamily: FONT.bold, color: COLORS.text, flex: 1 },
  iaBadge:     { fontSize: 12, backgroundColor: '#A29BFE22', color: '#A29BFE', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontFamily: FONT.bold },
  countdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  countdownEmoji: { fontSize: 14, marginRight: 4 },
  countdownTxt: { fontSize: 15, fontFamily: FONT.bold, color: COLORS.primary },
  terminadoTxt: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 },
  rankRow:     { flexDirection: 'row', marginTop: 8 },
  rankItem:    { flex: 1, alignItems: 'center' },
  rankPos:     { fontSize: 18 },
  rankNome:    { fontSize: 11, color: COLORS.text, fontFamily: FONT.medium, marginTop: 2 },
  rankVal:     { fontSize: 11, color: COLORS.textSecondary },
  secTitulo:   { fontSize: 15, fontFamily: FONT.bold, color: COLORS.text, marginTop: 16, marginBottom: 8 },
  streakCard:  { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', marginBottom: 20 },
  streakEmoji: { fontSize: 48 },
  streakNum:   { fontSize: 64, fontFamily: FONT.bold, color: COLORS.primary, lineHeight: 76 },
  streakLabel: { fontSize: 16, color: COLORS.textSecondary, fontFamily: FONT.medium },
  streakSub:   { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 16 },
  checkInBtn:  { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: 24, paddingVertical: 12 },
  checkInTxt:  { color: '#fff', fontSize: 15, fontFamily: FONT.bold },
  checkInDone: { backgroundColor: '#00B89420', borderRadius: RADIUS.lg, paddingHorizontal: 24, paddingVertical: 12 },
  checkInDoneTxt: { color: '#00B894', fontSize: 15, fontFamily: FONT.bold },
  membroStreakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8 },
  membroStreakNome: { fontSize: 14, color: COLORS.text, fontFamily: FONT.medium },
  cumpriuSim:  { fontSize: 20 },
  cumpriuNao:  { fontSize: 20 },
  modalBg:     { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  modalBox:    { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACE.lg, paddingBottom: 40 },
  modalTitulo: { fontSize: 18, fontFamily: FONT.bold, color: COLORS.text, marginBottom: 14 },
  iaBtnModal:  { backgroundColor: '#A29BFE', borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', marginBottom: 10 },
  iaBtnTxt:    { color: '#fff', fontFamily: FONT.bold, fontSize: 14 },
  sugestaoBox: { backgroundColor: '#A29BFE15', borderRadius: RADIUS.md, padding: 10, marginBottom: 10 },
  sugestaoTxt: { fontSize: 12, color: '#A29BFE' },
  field:       { backgroundColor: COLORS.background, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, marginBottom: 8, fontSize: 14 },
  tipoRow:     { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  tipoBtn:     { borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: COLORS.background, marginRight: 6, marginBottom: 6 },
  tipoBtnAtivo: { backgroundColor: COLORS.primary },
  tipoTxt:     { fontSize: 12, color: COLORS.text, fontFamily: FONT.medium },
  rowFields:   { flexDirection: 'row' },
  modalBtns:   { flexDirection: 'row', marginTop: 10 },
  cancelBtn:   { flex: 1, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.background, marginRight: 8 },
  cancelTxt:   { color: COLORS.textSecondary, fontFamily: FONT.medium },
  confirmBtn:  { flex: 1, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.primary },
  confirmTxt:  { color: '#fff', fontFamily: FONT.bold, fontSize: 15 },
});
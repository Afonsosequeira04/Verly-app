// src/screens/GrupoDetalheScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, TextInput,
  Alert, ActivityIndicator, StyleSheet, RefreshControl,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { gruposAPI, desafiosAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import { formatMoney } from '../utils/money';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const C = COLORS;
const TABS = ['Feed', 'Chat', 'Desafios', 'Streak'];
const REACAO_EMOJIS = ['👀', '🔥', '💸', '💪', '😅', '🏆'];

export default function GrupoDetalheScreen({ route, navigation }) {
  const { grupoId } = route.params;

  const [grupo, setGrupo]             = useState(null);
  const [tab, setTab]                 = useState('Feed');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [feed, setFeed]               = useState([]);
  const [mensagens, setMensagens]     = useState([]);
  const [texto, setTexto]             = useState('');
  const [enviando, setEnviando]       = useState(false);
  const [mostrarReacoes, setMostrarReacoes] = useState(null);
  const chatRef = useRef(null);
  const [desafios, setDesafios]       = useState([]);
  const [modalDesafio, setModalDesafio] = useState(false);
  const [sugestaoIA, setSugestaoIA]   = useState(null);
  const [loadingIA, setLoadingIA]     = useState(false);
  const [formDesafio, setFormDesafio] = useState({
    titulo: '', descricao: '', tipo: 'gastar_menos',
    valor_alvo: '', dias: '14', recompensa: '🏆 Vencedor',
  });
  const [streakInfo, setStreakInfo]   = useState(null);
  const [fazendoCheckIn, setFazendoCheckIn] = useState(false);
  const [agora, setAgora]             = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const [g, f, d, str] = await Promise.all([
        gruposAPI.detalhe(grupoId),
        gruposAPI.feed(grupoId),
        desafiosAPI.listar(grupoId),
        gruposAPI.streak(grupoId),
      ]);
      setGrupo(g);
      setFeed(Array.isArray(f) ? f : []);
      setDesafios(Array.isArray(d) ? d : []);
      setStreakInfo(str);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [grupoId]);

  const carregarChat = useCallback(async () => {
    try {
      const msgs = await gruposAPI.chatHistorico(grupoId);
      setMensagens(Array.isArray(msgs) ? msgs : []);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (e) {}
  }, [grupoId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  useEffect(() => {
    if (tab === 'Chat') {
      carregarChat();
      const interval = setInterval(carregarChat, 5000);
      return () => clearInterval(interval);
    }
  }, [tab, carregarChat]);

  const enviarMensagem = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
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
      const updated = await gruposAPI.chatReagir(grupoId, msg_id, emoji);
      setMensagens(prev => prev.map(m => m.id === msg_id ? updated : m));
    } catch (e) {}
    setMostrarReacoes(null);
  };

  const pedirDesafioIA = async () => {
    setLoadingIA(true);
    try {
      const res = await desafiosAPI.criarComIA(grupoId);
      setSugestaoIA(res.sugestao);
      const sg = res.sugestao;
      setFormDesafio({
        titulo: sg.titulo || '', descricao: sg.descricao || '',
        tipo: sg.tipo || 'gastar_menos', valor_alvo: String(sg.valor_alvo || ''),
        dias: String(sg.dias || '14'), recompensa: sg.recompensa || '🏆',
      });
    } catch (e) {
      Alert.alert('Erro IA', e.message);
    } finally {
      setLoadingIA(false);
    }
  };

  const criarDesafio = async () => {
    if (!formDesafio.titulo.trim()) { Alert.alert('Falta o título'); return; }
    try {
      const inicio = new Date();
      const fim    = new Date(inicio.getTime() + parseInt(formDesafio.dias || 14) * 86400000);
      await desafiosAPI.criar(grupoId, {
        titulo: formDesafio.titulo, descricao: formDesafio.descricao,
        tipo: formDesafio.tipo, valor_alvo: parseFloat(formDesafio.valor_alvo) || null,
        inicio: inicio.toISOString(), fim: fim.toISOString(),
        recompensa: formDesafio.recompensa, gerado_ia: !!sugestaoIA,
      });
      setModalDesafio(false);
      setSugestaoIA(null);
      await carregar();
      Alert.alert('✅ Desafio criado!', 'Todos os membros foram adicionados.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  const fazerCheckIn = async () => {
    setFazendoCheckIn(true);
    try {
      const res = await gruposAPI.streakCheckIn(grupoId);
      setStreakInfo(prev => ({ ...prev, ...res, eu_cumpri_hoje: true }));
      if (res.streak_aumentou) {
        Alert.alert('🔥 Streak do grupo!', `${res.streak_dias} dias seguidos!`);
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
    const sec = segundos % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.brand} /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>

        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </Pressable>
          <Text style={s.headerEmoji}>{grupo?.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.headerNome}>{grupo?.nome}</Text>
            <Text style={s.headerSub}>{grupo?.total_membros} membros · 🔥 {grupo?.streak_dias || 0} dias</Text>
          </View>
          <Pressable onPress={() => setModalDesafio(true)} style={s.btnNovo}>
            <Text style={s.btnNovoTxt}>+ Desafio</Text>
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {TABS.map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabAtivo]}>
              <Text style={[s.tabTxt, tab === t && s.tabTxtAtivo]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Feed ── */}
        {tab === 'Feed' && (
          <ScrollView
            style={{ flex: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} tintColor={C.brand} />}
            contentContainerStyle={{ padding: SPACE.md }}
          >
            {feed.length === 0 && (
              <Text style={s.vazio}>Ainda não há atividade. Cria um desafio!</Text>
            )}
            {feed.map((item, i) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 50)} style={s.feedCard}>
                <Text style={s.feedEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.feedDesc}>{item.descricao}</Text>
                  <Text style={s.feedData}>
                    {new Date(item.criada_em).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
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
                <View style={[s.msgRow, item.minha && s.msgRowMinha]}>
                  {!item.minha && (
                    <View style={s.msgAvatar}>
                      <Text style={{ fontSize: 16, color: C.text }}>{item.nome_autor?.[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <Pressable onLongPress={() => setMostrarReacoes(item.id)} style={[s.msgBubble, item.minha && s.msgBubbleMinha]}>
                    {!item.minha && <Text style={s.msgNome}>{item.nome_autor}</Text>}
                    <Text style={[s.msgTexto, item.minha && { color: '#fff' }]}>{item.texto}</Text>
                    <Text style={[s.msgHora, item.minha && { color: 'rgba(255,255,255,0.6)' }]}>
                      {new Date(item.enviada_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {Object.keys(item.reacoes || {}).length > 0 && (
                      <View style={s.reacoesRow}>
                        {Object.entries(item.reacoes).map(([emoji, users]) => (
                          <Pressable key={emoji} onPress={() => reagir(item.id, emoji)} style={s.reacaoChip}>
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
              <View style={s.reacoesBar}>
                {REACAO_EMOJIS.map(e => (
                  <Pressable key={e} onPress={() => reagir(mostrarReacoes, e)} style={s.reacaoBtnBar}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setMostrarReacoes(null)} style={s.reacaoBtnBar}>
                  <Text style={{ fontSize: 18, color: C.textMid }}>✕</Text>
                </Pressable>
              </View>
            )}
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={texto}
                onChangeText={setTexto}
                placeholder="Mensagem..."
                placeholderTextColor={C.textMid}
                multiline
              />
              <Pressable onPress={enviarMensagem} style={[s.sendBtn, enviando && { opacity: 0.5 }]}>
                {enviando
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.sendTxt}>↑</Text>
                }
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Desafios ── */}
        {tab === 'Desafios' && (
          <ScrollView
            style={{ flex: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} tintColor={C.brand} />}
            contentContainerStyle={{ padding: SPACE.md }}
          >
            {desafios.length === 0 && (
              <View style={s.vazioCard}>
                <Text style={{ fontSize: 40, textAlign: 'center' }}>⚡</Text>
                <Text style={s.vazioTxt}>Sem desafios ainda.</Text>
                <Text style={s.vazioSub}>Cria um ou deixa a IA sugerir!</Text>
              </View>
            )}
            {desafios.map((d, i) => {
              const fim = new Date(d.fim);
              const segsRestantes = Math.max(0, Math.floor((fim - agora) / 1000));
              const terminado = d.estado === 'terminado';
              return (
                <Animated.View key={d.id} entering={FadeInDown.delay(i * 60)}>
                  <Pressable
                    style={[s.desafioCard, terminado && { opacity: 0.6 }]}
                    onPress={() => navigation.navigate('DesafioDetalhe', { desafio_id: d.id })}
                  >
                    <View style={s.desafioTop}>
                      <Text style={s.desafioTitulo}>{d.titulo}</Text>
                      {d.gerado_ia && <Text style={s.iaBadge}>🤖 IA</Text>}
                    </View>
                    {!terminado && (
                      <View style={s.countdownRow}>
                        <Text style={s.countdownTxt}>⏱️ {formatarContagem(segsRestantes)}</Text>
                      </View>
                    )}
                    {terminado && <Text style={s.terminadoTxt}>🏁 Terminado</Text>}
                    <View style={s.rankRow}>
                      {(d.ranking || []).slice(0, 3).map((r, pos) => (
                        <View key={r.user_id} style={s.rankItem}>
                          <Text style={s.rankPos}>{['🥇','🥈','🥉'][pos]}</Text>
                          <Text style={s.rankNome} numberOfLines={1}>{r.nome}</Text>
                          <Text style={s.rankVal}>{formatMoney(r.progresso || 0, d.currency || 'EUR', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}</Text>
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
            <Animated.View entering={FadeIn} style={s.streakCard}>
              <Text style={s.streakEmoji}>🔥</Text>
              <Text style={s.streakNum}>{streakInfo.streak_dias}</Text>
              <Text style={s.streakLabel}>dias seguidos</Text>
              <Text style={s.streakSub}>{streakInfo.check_ins_hoje}/{streakInfo.total_membros} cumpriram hoje</Text>
              {!streakInfo.eu_cumpri_hoje ? (
                <Pressable onPress={fazerCheckIn} style={[s.checkInBtn, fazendoCheckIn && { opacity: 0.6 }]}>
                  {fazendoCheckIn
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.checkInTxt}>✓ Marcar objetivo hoje</Text>
                  }
                </Pressable>
              ) : (
                <View style={s.checkInDone}>
                  <Text style={s.checkInDoneTxt}>✅ Já marcaste hoje!</Text>
                </View>
              )}
            </Animated.View>
            <Text style={s.secTitulo}>Estado dos membros</Text>
            {(streakInfo.membros || []).map(m => (
              <View key={m.id} style={s.membroRow}>
                <Text style={s.membroNome}>{m.nome}</Text>
                <Text style={{ fontSize: 20 }}>{m.cumpriu_hoje ? '✅' : '⏳'}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── Modal Criar Desafio ── */}
        <Modal visible={modalDesafio} animationType="slide" transparent>
          <View style={s.modalBg}>
            <ScrollView style={s.modalBox} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitulo}>Novo Desafio</Text>
              <Pressable onPress={pedirDesafioIA} style={[s.iaBtnModal, loadingIA && { opacity: 0.6 }]}>
                {loadingIA
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.iaBtnTxt}>🤖 Sugerir com IA</Text>
                }
              </Pressable>
              {sugestaoIA && (
                <View style={s.sugestaoBox}>
                  <Text style={s.sugestaoTxt}>💡 {sugestaoIA.justificacao}</Text>
                </View>
              )}
              <TextInput style={s.field} placeholder="Título do desafio" placeholderTextColor={C.textMid}
                value={formDesafio.titulo} onChangeText={v => setFormDesafio(p => ({ ...p, titulo: v }))} />
              <TextInput style={s.field} placeholder="Descrição (opcional)" placeholderTextColor={C.textMid}
                value={formDesafio.descricao} onChangeText={v => setFormDesafio(p => ({ ...p, descricao: v }))} />
              <View style={s.tipoRow}>
                {['gastar_menos','categoria_limite','poupar_valor','streak_dias'].map(t => (
                  <Pressable key={t} onPress={() => setFormDesafio(p => ({ ...p, tipo: t }))}
                    style={[s.tipoBtn, formDesafio.tipo === t && s.tipoBtnAtivo]}>
                    <Text style={[s.tipoTxt, formDesafio.tipo === t && { color: '#fff' }]}>
                      {t === 'gastar_menos' ? '📉 Gastar menos' : t === 'categoria_limite' ? '🏷️ Categoria' : t === 'poupar_valor' ? '💰 Poupar' : '🔥 Streak'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row' }}>
                <TextInput style={[s.field, { flex: 1, marginRight: 6 }]} placeholder="Valor alvo" placeholderTextColor={C.textMid}
                  keyboardType="numeric" value={formDesafio.valor_alvo} onChangeText={v => setFormDesafio(p => ({ ...p, valor_alvo: v }))} />
                <TextInput style={[s.field, { flex: 1 }]} placeholder="Duração (dias)" placeholderTextColor={C.textMid}
                  keyboardType="numeric" value={formDesafio.dias} onChangeText={v => setFormDesafio(p => ({ ...p, dias: v }))} />
              </View>
              <TextInput style={s.field} placeholder="Recompensa (ex: 🏆 Jantar)" placeholderTextColor={C.textMid}
                value={formDesafio.recompensa} onChangeText={v => setFormDesafio(p => ({ ...p, recompensa: v }))} />
              <View style={s.modalBtns}>
                <Pressable onPress={() => { setModalDesafio(false); setSugestaoIA(null); }} style={s.cancelBtn}>
                  <Text style={s.cancelTxt}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={criarDesafio} style={s.confirmBtn}>
                  <Text style={s.confirmTxt}>Criar ⚡</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </Modal>

      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: COLORS.bg },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  header:         { flexDirection: 'row', alignItems: 'center', padding: SPACE.md, paddingTop: 48, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:        { marginRight: 8 },
  backTxt:        { fontSize: 22, color: COLORS.brand },
  headerEmoji:    { fontSize: 28, marginRight: 8 },
  headerNome:     { fontSize: 17, fontWeight: '700', color: COLORS.text },
  headerSub:      { fontSize: 12, color: COLORS.textMid, marginTop: 1 },
  btnNovo:        { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 6 },
  btnNovoTxt:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  tabs:           { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab:            { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabAtivo:       { borderBottomWidth: 2, borderBottomColor: COLORS.brand },
  tabTxt:         { fontSize: 13, color: COLORS.textMid, fontWeight: '500' },
  tabTxtAtivo:    { color: COLORS.brand, fontWeight: '700' },
  vazio:          { textAlign: 'center', color: COLORS.textMid, marginTop: 40, fontSize: 15 },
  vazioCard:      { alignItems: 'center', paddingVertical: 40 },
  vazioTxt:       { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 12 },
  vazioSub:       { fontSize: 13, color: COLORS.textMid, marginTop: 4 },
  feedCard:       { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8 },
  feedEmoji:      { fontSize: 22, marginRight: 10, marginTop: 2 },
  feedDesc:       { fontSize: 14, color: COLORS.text },
  feedData:       { fontSize: 11, color: COLORS.textMid, marginTop: 2 },
  msgRow:         { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  msgRowMinha:    { flexDirection: 'row-reverse' },
  msgAvatar:      { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  msgBubble:      { maxWidth: '75%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 10, borderTopLeftRadius: 4 },
  msgBubbleMinha: { backgroundColor: COLORS.brand, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: 4 },
  msgNome:        { fontSize: 11, fontWeight: '700', color: COLORS.brand, marginBottom: 2 },
  msgTexto:       { fontSize: 14, color: COLORS.text },
  msgHora:        { fontSize: 10, color: COLORS.textMid, marginTop: 3, alignSelf: 'flex-end' },
  reacoesRow:     { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  reacaoChip:     { backgroundColor: COLORS.surface2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginTop: 2 },
  reacoesBar:     { flexDirection: 'row', justifyContent: 'center', backgroundColor: COLORS.surface, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  reacaoBtnBar:   { paddingHorizontal: 10 },
  inputRow:       { flexDirection: 'row', padding: 10, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: 'flex-end' },
  input:          { flex: 1, backgroundColor: COLORS.surface2, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 8, color: COLORS.text, maxHeight: 100, fontSize: 14 },
  sendBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendTxt:        { color: '#fff', fontSize: 18, fontWeight: '700' },
  desafioCard:    { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, marginBottom: 12 },
  desafioTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  desafioTitulo:  { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  iaBadge:        { fontSize: 12, backgroundColor: '#A29BFE22', color: '#A29BFE', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontWeight: '700', overflow: 'hidden' },
  countdownRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  countdownTxt:   { fontSize: 14, fontWeight: '700', color: COLORS.brand },
  terminadoTxt:   { fontSize: 12, color: COLORS.textMid, marginBottom: 8 },
  rankRow:        { flexDirection: 'row', marginTop: 8 },
  rankItem:       { flex: 1, alignItems: 'center' },
  rankPos:        { fontSize: 18 },
  rankNome:       { fontSize: 11, color: COLORS.text, fontWeight: '500', marginTop: 2 },
  rankVal:        { fontSize: 11, color: COLORS.textMid },
  secTitulo:      { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 16, marginBottom: 8 },
  streakCard:     { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', marginBottom: 20 },
  streakEmoji:    { fontSize: 48 },
  streakNum:      { fontSize: 64, fontWeight: '700', color: COLORS.brand, lineHeight: 76 },
  streakLabel:    { fontSize: 16, color: COLORS.textMid, fontWeight: '500' },
  streakSub:      { fontSize: 13, color: COLORS.textMid, marginTop: 6, marginBottom: 16 },
  checkInBtn:     { backgroundColor: COLORS.brand, borderRadius: RADIUS.lg, paddingHorizontal: 24, paddingVertical: 12 },
  checkInTxt:     { color: '#fff', fontSize: 15, fontWeight: '700' },
  checkInDone:    { backgroundColor: `${COLORS.green}20`, borderRadius: RADIUS.lg, paddingHorizontal: 24, paddingVertical: 12 },
  checkInDoneTxt: { color: COLORS.green, fontSize: 15, fontWeight: '700' },
  membroRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8 },
  membroNome:     { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  modalBg:        { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' },
  modalBox:       { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACE.lg, paddingBottom: 40, maxHeight: '90%' },
  modalTitulo:    { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  iaBtnModal:     { backgroundColor: '#A29BFE', borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', marginBottom: 10 },
  iaBtnTxt:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  sugestaoBox:    { backgroundColor: '#A29BFE15', borderRadius: RADIUS.md, padding: 10, marginBottom: 10 },
  sugestaoTxt:    { fontSize: 12, color: '#A29BFE' },
  field:          { backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, marginBottom: 8, fontSize: 14 },
  tipoRow:        { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  tipoBtn:        { borderRadius: RADIUS.xs, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: COLORS.surface2, marginRight: 6, marginBottom: 6 },
  tipoBtnAtivo:   { backgroundColor: COLORS.brand },
  tipoTxt:        { fontSize: 12, color: COLORS.text, fontWeight: '500' },
  modalBtns:      { flexDirection: 'row', marginTop: 10 },
  cancelBtn:      { flex: 1, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.surface2, marginRight: 8 },
  cancelTxt:      { color: COLORS.textMid, fontWeight: '500' },
  confirmBtn:     { flex: 1, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.brand },
  confirmTxt:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// src/screens/GruposScreen.js — Grupos de despesas
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator, StyleSheet, RefreshControl, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { gruposAPI, amigosAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const C   = COLORS;
const initials = (n = '') =>
  n.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

function Avatar({ nome, size = 38, color = C.brand }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.3,
      backgroundColor: color + '22', borderWidth: 1.5, borderColor: color,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{ fontSize: size * 0.36, fontWeight: '900', color }}>
        {initials(nome)}
      </Text>
    </View>
  );
}

function MembrosRow({ membros = [] }) {
  const shown = membros.slice(0, 4);
  const extra = membros.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: shown.length - i }}>
          <Avatar nome={m.nome} size={28} />
        </View>
      ))}
      {extra > 0 && (
        <View style={{
          marginLeft: -10, width: 28, height: 28, borderRadius: 8,
          backgroundColor: C.surface3, justifyContent: 'center', alignItems: 'center',
        }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: C.textMid }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

const EMOJIS = ['💸', '🧾', '🏠', '✈️', '🍽️', '🛒', '🚕', '🎟️', '👥', '€'];

export default function GruposScreen({ navigation }) {
  const [grupos,   setGrupos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [modal,    setModal]    = useState(false);
  const [amigos,   setAmigos]   = useState([]);

  // Form criar grupo
  const [nome,        setNome]       = useState('');
  const [descricao,   setDescricao]  = useState('');
  const [emoji,       setEmoji]      = useState('💸');
  const [convidados,  setConvidados] = useState([]);
  const [criando,     setCriando]    = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await gruposAPI.listar();
      setGrupos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('grupos err', e);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  const loadAmigos = async () => {
    try {
      const data = await amigosAPI.listar();
      setAmigos(Array.isArray(data?.amigos) ? data.amigos : []);
    } catch {}
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const abrirModal = async () => {
    await loadAmigos();
    setModal(true);
  };

  const toggleConvidado = (id) => {
    setConvidados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const criar = async () => {
    if (!nome.trim()) return Alert.alert('Ops', 'Dá um nome ao grupo');
    setCriando(true);
    try {
      const grupo = await gruposAPI.criar({
        nome: nome.trim(),
        descricao: descricao.trim(),
        emoji,
        amigos_ids: convidados,
      });
      setModal(false);
      setNome(''); setDescricao(''); setEmoji('💸'); setConvidados([]);
      await load();
      navigation.navigate('GrupoDetalhe', { grupoId: grupo.id });
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível criar o grupo');
    } finally {
      setCriando(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>Dividir despesas</Text>
          <Text style={styles.headerSub} numberOfLines={1}>Grupos para contas partilhadas</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Amigos')} style={styles.friendsBtn}>
          <Text style={styles.friendsTxt}>Amigos</Text>
        </Pressable>
        <Pressable onPress={abrirModal} style={styles.addBtn}>
          <Text style={styles.addTxt}>+ Grupo</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(true); }} tintColor={C.brand} />}
      >
        {grupos.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.empty}>
            <Text style={styles.emptyEmoji}>🧾</Text>
            <Text style={styles.emptyTitle}>Ainda sem grupos</Text>
            <Text style={styles.emptySub}>Cria um grupo para dividir contas, viagens, jantares ou despesas de casa.</Text>
            <Pressable onPress={abrirModal} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnTxt}>Criar grupo</Text>
            </Pressable>
          </Animated.View>
        ) : (
          grupos.map((g, i) => (
            <Animated.View key={g.id} entering={FadeInDown.delay(i * 60)}>
              <Pressable
                style={styles.card}
                onPress={() => navigation.navigate('GrupoDetalhe', { grupoId: g.id })}
              >
                <View style={styles.cardLeft}>
                  <Text style={styles.cardEmoji}>{g.emoji}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardNome}>{g.nome}</Text>
                  {g.descricao ? <Text style={styles.cardDesc} numberOfLines={1}>{g.descricao}</Text> : null}
                  <View style={styles.cardMeta}>
                    <MembrosRow membros={g.membros} />
                    <Text style={styles.cardMetaTxt}>{g.total_membros} membro{g.total_membros !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
                <Text style={styles.cardArrow}>›</Text>
              </Pressable>
            </Animated.View>
          ))
        )}
      </ScrollView>

      {/* Modal criar grupo */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Novo grupo de despesas</Text>

            {/* Emoji picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
              {EMOJIS.map(e => (
                <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}>
                  <Text style={styles.emojiTxt}>{e}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <TextInput
              style={styles.input}
              placeholder="Nome do grupo"
              placeholderTextColor={C.textSub}
              value={nome}
              onChangeText={setNome}
              maxLength={60}
            />
            <TextInput
              style={[styles.input, { height: 70 }]}
              placeholder="Descrição (opcional, ex: viagem, casa, férias)"
              placeholderTextColor={C.textSub}
              value={descricao}
              onChangeText={setDescricao}
              multiline
              maxLength={200}
            />

            {amigos.length > 0 && (
              <>
                <Text style={styles.sheetLabel}>Convidar amigos</Text>
                <ScrollView style={{ maxHeight: 160 }}>
                  {amigos.map(a => {
                    const sel = convidados.includes(a.id);
                    return (
                      <Pressable key={a.id} onPress={() => toggleConvidado(a.id)}
                        style={[styles.amigoRow, sel && styles.amigoRowSel]}>
                        <Avatar nome={a.nome} size={34} color={sel ? C.green : C.brand} />
                        <Text style={styles.amigoNome}>{a.nome}</Text>
                        {sel && <Text style={styles.checkmark}>✓</Text>}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Pressable onPress={criar} disabled={criando} style={[styles.criarBtn, criando && { opacity: 0.5 }]}>
              {criando ? <ActivityIndicator color="#fff" /> : <Text style={styles.criarBtnTxt}>Criar grupo</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  center:     { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header:     { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, gap: 12 },
  backBtn:    { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  backTxt:    { fontSize: 18, color: C.text },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle:{ fontSize: FONT.xl, fontWeight: '800', color: C.text },
  headerSub:  { fontSize: FONT.xs, color: C.textMid, marginTop: 1 },
  friendsBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.glass, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.pill },
  friendsTxt: { fontSize: FONT.sm, fontWeight: '800', color: C.textMid },
  addBtn:     { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.brand, borderRadius: RADIUS.pill },
  addTxt:     { fontSize: FONT.sm, fontWeight: '800', color: '#fff' },
  scroll:     { padding: SPACE.lg, paddingBottom: 100 },
  // Empty
  empty:      { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '800', color: C.text, marginBottom: 8 },
  emptySub:   { fontSize: FONT.sm, color: C.textMid, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20, marginBottom: 24 },
  emptyBtn:   { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: C.brand, borderRadius: RADIUS.pill },
  emptyBtnTxt:{ fontSize: FONT.sm, fontWeight: '800', color: '#fff' },
  // Card
  card:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm, gap: 12 },
  cardLeft:   { width: 48, height: 48, borderRadius: 14, backgroundColor: C.brandDim, justifyContent: 'center', alignItems: 'center' },
  cardEmoji:  { fontSize: 24 },
  cardBody:   { flex: 1, gap: 3 },
  cardNome:   { fontSize: FONT.md, fontWeight: '700', color: C.text },
  cardDesc:   { fontSize: FONT.xs, color: C.textMid },
  cardMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  cardMetaTxt:{ fontSize: FONT.xs, color: C.textSub },
  cardArrow:  { fontSize: 22, color: C.textSub },
  // Modal
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  overlayBg:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:      { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACE.lg, paddingBottom: 36 },
  sheetHandle:{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: FONT.xl, fontWeight: '800', color: C.text, marginBottom: 16 },
  sheetLabel: { fontSize: FONT.xs, fontWeight: '700', color: C.textMid, letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  emojiRow:   { marginBottom: 14 },
  emojiBtn:   { width: 44, height: 44, borderRadius: 12, backgroundColor: C.surface2, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  emojiBtnActive: { backgroundColor: C.brandDim, borderWidth: 1.5, borderColor: C.brand },
  emojiTxt:   { fontSize: 22 },
  input:      { backgroundColor: C.surface2, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border, padding: 12, color: C.text, fontSize: FONT.md, marginBottom: 10 },
  amigoRow:   { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: RADIUS.sm, marginBottom: 4, gap: 10 },
  amigoRowSel:{ backgroundColor: C.brandDim },
  amigoNome:  { flex: 1, fontSize: FONT.md, color: C.text, fontWeight: '600' },
  checkmark:  { fontSize: 16, color: C.green, fontWeight: '800' },
  criarBtn:   { backgroundColor: C.brand, borderRadius: RADIUS.pill, padding: 14, alignItems: 'center', marginTop: 16 },
  criarBtnTxt:{ fontSize: FONT.md, fontWeight: '800', color: '#fff' },
});

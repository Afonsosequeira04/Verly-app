// src/screens/GrupoDetalheScreen.js — Verly Social: Detalhe de Grupo
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator, StyleSheet, RefreshControl, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { gruposAPI, desafiosAPI, amigosAPI } from '../services/api';
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

const TIPOS_DESAFIO = [
  { key: 'gastar_menos',      label: 'Gastar menos no total',        emoji: '💸' },
  { key: 'categoria_limite',  label: 'Limite numa categoria',        emoji: '🛒' },
  { key: 'poupar_valor',      label: 'Poupar o máximo possível',     emoji: '💰' },
  { key: 'streak_dias',       label: 'Streak de dias sem gastar',    emoji: '🔥' },
];

function RankingRow({ posicao, participante }) {
  const medal = posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : posicao === 3 ? '🥉' : `#${posicao}`;
  return (
    <View style={styles.rankRow}>
      <Text style={styles.rankMedal}>{medal}</Text>
      <Avatar nome={participante.nome} size={32} color={participante.ganhou ? C.yellow : C.brand} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rankNome}>{participante.nome}</Text>
        <Text style={styles.rankProg}>{fmt(participante.progresso)}€</Text>
      </View>
      {participante.ganhou && <Text style={styles.rankTrophy}>🏆</Text>}
    </View>
  );
}

function DesafioCard({ desafio, navigation }) {
  const hoje   = new Date();
  const fim    = new Date(desafio.fim);
  const ativo  = desafio.estado === 'ativo' && fim > hoje;
  const diasRestantes = Math.max(0, Math.ceil((fim - hoje) / 86400000));

  return (
    <Pressable
      style={[styles.desafioCard, !ativo && styles.desafioCardInativo]}
      onPress={() => navigation.navigate('DesafioDetalhe', { desafioId: desafio.id })}
    >
      <View style={styles.desafioTop}>
        <View style={[styles.desafioBadge, { backgroundColor: ativo ? C.brandDim : C.surface3 }]}>
          <Text style={[styles.desafioBadgeTxt, { color: ativo ? C.brand : C.textSub }]}>
            {ativo ? `${diasRestantes}d restantes` : desafio.estado === 'terminado' ? 'Terminado' : 'Cancelado'}
          </Text>
        </View>
        {desafio.minha_posicao && (
          <Text style={styles.desafioPos}>
            {desafio.minha_posicao === 1 ? '🥇' : desafio.minha_posicao === 2 ? '🥈' : desafio.minha_posicao === 3 ? '🥉' : `#${desafio.minha_posicao}`}
          </Text>
        )}
      </View>
      <Text style={styles.desafioTitulo}>{desafio.titulo}</Text>
      {desafio.recompensa ? <Text style={styles.desafioRecompensa}>🎁 {desafio.recompensa}</Text> : null}
      <View style={styles.desafioMeta}>
        <Text style={styles.desafioMetaTxt}>{desafio.total_participantes} participantes</Text>
        <Text style={styles.desafioMetaTxt}>Progresso: {fmt(desafio.meu_progresso)}€</Text>
      </View>
    </Pressable>
  );
}

export default function GrupoDetalheScreen({ route, navigation }) {
  const { grupoId } = route.params;
  const [grupo,    setGrupo]    = useState(null);
  const [desafios, setDesafios] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [modal,    setModal]    = useState(false);
  const [amigos,   setAmigos]   = useState([]);

  // Form criar desafio
  const [titulo,      setTitulo]     = useState('');
  const [descricao,   setDescricao]  = useState('');
  const [tipo,        setTipo]       = useState('gastar_menos');
  const [categoria,   setCategoria]  = useState('');
  const [valorAlvo,   setValorAlvo]  = useState('');
  const [recompensa,  setRecompensa] = useState('');
  const [duracao,     setDuracao]    = useState('30'); // dias
  const [criando,     setCriando]    = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [g, d] = await Promise.all([
        gruposAPI.detalhe(grupoId),
        desafiosAPI.listar(grupoId),
      ]);
      setGrupo(g);
      setDesafios(Array.isArray(d) ? d : []);
    } catch (e) {
      console.log('grupo detalhe err', e);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [grupoId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const abrirModalDesafio = async () => {
    try {
      const data = await amigosAPI.listar();
      setAmigos(Array.isArray(data?.amigos) ? data.amigos : []);
    } catch {}
    setModal(true);
  };

  const criarDesafio = async () => {
    if (!titulo.trim()) return Alert.alert('Ops', 'Dá um título ao desafio');
    setCriando(true);
    try {
      const inicio = new Date().toISOString();
      const fim    = new Date(Date.now() + parseInt(duracao || 30) * 86400000).toISOString();
      await desafiosAPI.criar(grupoId, {
        titulo:     titulo.trim(),
        descricao:  descricao.trim(),
        tipo,
        categoria:  categoria.trim() || undefined,
        valor_alvo: valorAlvo ? parseFloat(valorAlvo) : undefined,
        recompensa: recompensa.trim() || '🏆 Vencedor do desafio',
        inicio, fim,
      });
      setModal(false);
      setTitulo(''); setDescricao(''); setTipo('gastar_menos');
      setCategoria(''); setValorAlvo(''); setRecompensa(''); setDuracao('30');
      await load();
    } catch {
      Alert.alert('Erro', 'Não foi possível criar o desafio');
    } finally {
      setCriando(false);
    }
  };

  const convidarAmigo = async (amigoId) => {
    try {
      await gruposAPI.convidar(grupoId, amigoId);
      Alert.alert('✅', 'Amigo adicionado ao grupo!');
      await load();
    } catch {
      Alert.alert('Erro', 'Não foi possível convidar');
    }
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator color={C.brand} size="large" />
    </View>
  );

  if (!grupo) return null;

  const membrosIds = grupo.membros.map(m => m.id);
  const amigosForaDoGrupo = amigos.filter(a => !membrosIds.includes(a.id));

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>
        <View style={styles.headerEmoji}>
          <Text style={{ fontSize: 28 }}>{grupo.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{grupo.nome}</Text>
          {grupo.descricao ? <Text style={styles.headerSub} numberOfLines={1}>{grupo.descricao}</Text> : null}
        </View>
        {grupo.sou_admin && (
          <Pressable onPress={abrirModalDesafio} style={styles.addBtn}>
            <Text style={styles.addTxt}>+ Desafio</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(true); }} tintColor={C.brand} />}
      >
        {/* Membros */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MEMBROS ({grupo.total_membros})</Text>
          <View style={styles.membrosRow}>
            {grupo.membros.map(m => (
              <View key={m.id} style={styles.membroItem}>
                <Avatar nome={m.nome} size={44} color={m.id === grupo.criador_id ? C.yellow : C.brand} />
                <Text style={styles.membroNome} numberOfLines={1}>{m.nome.split(' ')[0]}</Text>
                {m.id === grupo.criador_id && <Text style={styles.adminTag}>admin</Text>}
              </View>
            ))}
          </View>
        </View>

        {/* Convidar amigos */}
        {grupo.sou_admin && amigosForaDoGrupo.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CONVIDAR AMIGOS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {amigosForaDoGrupo.map(a => (
                <Pressable key={a.id} onPress={() => convidarAmigo(a.id)} style={styles.convidarChip}>
                  <Avatar nome={a.nome} size={28} />
                  <Text style={styles.convidarNome}>{a.nome.split(' ')[0]}</Text>
                  <Text style={styles.convidarPlus}>+</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Desafios */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>DESAFIOS</Text>
            {grupo.sou_admin && (
              <Pressable onPress={abrirModalDesafio}>
                <Text style={styles.sectionLink}>+ Criar</Text>
              </Pressable>
            )}
          </View>
          {desafios.length === 0 ? (
            <View style={styles.emptyDesafios}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🎯</Text>
              <Text style={styles.emptyDesafiosTxt}>Ainda sem desafios. {grupo.sou_admin ? 'Cria o primeiro!' : 'O admin pode criar desafios.'}</Text>
            </View>
          ) : (
            desafios.map((d, i) => (
              <Animated.View key={d.id} entering={FadeInDown.delay(i * 60)}>
                <DesafioCard desafio={d} navigation={navigation} />
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal criar desafio */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={() => setModal(false)} />
          <ScrollView style={styles.sheet} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Novo Desafio</Text>

            <TextInput style={styles.input} placeholder="Título do desafio" placeholderTextColor={C.textSub} value={titulo} onChangeText={setTitulo} />
            <TextInput style={[styles.input, { height: 60 }]} placeholder="Descrição (opcional)" placeholderTextColor={C.textSub} value={descricao} onChangeText={setDescricao} multiline />

            <Text style={styles.sheetLabel}>TIPO DE DESAFIO</Text>
            {TIPOS_DESAFIO.map(t => (
              <Pressable key={t.key} onPress={() => setTipo(t.key)} style={[styles.tipoBtn, tipo === t.key && styles.tipoBtnActive]}>
                <Text style={styles.tipoEmoji}>{t.emoji}</Text>
                <Text style={[styles.tipoLabel, tipo === t.key && { color: C.brand }]}>{t.label}</Text>
              </Pressable>
            ))}

            {tipo === 'categoria_limite' && (
              <TextInput style={styles.input} placeholder="Categoria (ex: delivery, lazer)" placeholderTextColor={C.textSub} value={categoria} onChangeText={setCategoria} />
            )}

            {(tipo !== 'streak_dias') && (
              <TextInput style={styles.input} placeholder="Valor alvo em € (ex: 200)" placeholderTextColor={C.textSub} value={valorAlvo} onChangeText={setValorAlvo} keyboardType="numeric" />
            )}

            <TextInput style={styles.input} placeholder="Duração em dias (ex: 30)" placeholderTextColor={C.textSub} value={duracao} onChangeText={setDuracao} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Recompensa (ex: 🍕 Pizza para o vencedor)" placeholderTextColor={C.textSub} value={recompensa} onChangeText={setRecompensa} />

            <Pressable onPress={criarDesafio} disabled={criando} style={[styles.criarBtn, criando && { opacity: 0.5 }]}>
              {criando ? <ActivityIndicator color="#fff" /> : <Text style={styles.criarBtnTxt}>Lançar Desafio 🚀</Text>}
            </Pressable>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.bg },
  center:           { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, gap: 10 },
  backBtn:          { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  backTxt:          { fontSize: 18, color: C.text },
  headerEmoji:      { width: 48, height: 48, borderRadius: 14, backgroundColor: C.brandDim, justifyContent: 'center', alignItems: 'center' },
  headerTitle:      { fontSize: FONT.lg, fontWeight: '800', color: C.text },
  headerSub:        { fontSize: FONT.xs, color: C.textMid },
  addBtn:           { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.brand, borderRadius: RADIUS.pill },
  addTxt:           { fontSize: FONT.xs, fontWeight: '800', color: '#fff' },
  scroll:           { padding: SPACE.lg, paddingBottom: 100 },
  section:          { marginBottom: SPACE.lg },
  sectionRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:     { fontSize: FONT.xs, fontWeight: '800', color: C.textMid, letterSpacing: 1.2, marginBottom: 10 },
  sectionLink:      { fontSize: FONT.sm, color: C.brand, fontWeight: '700' },
  membrosRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  membroItem:       { alignItems: 'center', gap: 4, width: 56 },
  membroNome:       { fontSize: FONT.xs, color: C.textMid, textAlign: 'center' },
  adminTag:         { fontSize: 9, color: C.yellow, fontWeight: '700' },
  convidarChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: C.border },
  convidarNome:     { fontSize: FONT.xs, color: C.text, fontWeight: '600' },
  convidarPlus:     { fontSize: 14, color: C.brand, fontWeight: '800' },
  // Desafio card
  desafioCard:      { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm },
  desafioCardInativo:{ opacity: 0.6 },
  desafioTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  desafioBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  desafioBadgeTxt:  { fontSize: FONT.xs, fontWeight: '700' },
  desafioPos:       { fontSize: 20 },
  desafioTitulo:    { fontSize: FONT.md, fontWeight: '700', color: C.text, marginBottom: 4 },
  desafioRecompensa:{ fontSize: FONT.xs, color: C.yellow, marginBottom: 8 },
  desafioMeta:      { flexDirection: 'row', justifyContent: 'space-between' },
  desafioMetaTxt:   { fontSize: FONT.xs, color: C.textSub },
  emptyDesafios:    { alignItems: 'center', paddingVertical: 32 },
  emptyDesafiosTxt: { fontSize: FONT.sm, color: C.textMid, textAlign: 'center', lineHeight: 20 },
  // Modal
  overlay:          { flex: 1, justifyContent: 'flex-end' },
  overlayBg:        { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:            { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACE.lg, maxHeight: '90%' },
  sheetHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:       { fontSize: FONT.xl, fontWeight: '800', color: C.text, marginBottom: 16 },
  sheetLabel:       { fontSize: FONT.xs, fontWeight: '700', color: C.textMid, letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  tipoBtn:          { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: RADIUS.sm, marginBottom: 6, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  tipoBtnActive:    { borderColor: C.brand, backgroundColor: C.brandDim },
  tipoEmoji:        { fontSize: 18 },
  tipoLabel:        { fontSize: FONT.sm, color: C.textMid, fontWeight: '600' },
  input:            { backgroundColor: C.surface2, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border, padding: 12, color: C.text, fontSize: FONT.md, marginBottom: 10 },
  criarBtn:         { backgroundColor: C.brand, borderRadius: RADIUS.pill, padding: 14, alignItems: 'center', marginTop: 12 },
  criarBtnTxt:      { fontSize: FONT.md, fontWeight: '800', color: '#fff' },
});
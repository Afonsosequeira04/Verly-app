import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Check, Plus, Users, WalletCards } from 'lucide-react-native';

import { amigosAPI, gruposAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SHADOWS, SPACE } from '../constants/theme';

const C = COLORS;
const ICONS = ['EUR', 'Trip', 'Home', 'Food', 'Ride', 'Team'];

const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';

function Avatar({ nome, size = 38, color = C.brand }) {
  return (
    <View style={[styles.avatar, {
      width: size,
      height: size,
      borderRadius: size * 0.34,
      backgroundColor: color + '22',
      borderColor: color + '66',
    }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.34, color }]}>{initials(nome)}</Text>
    </View>
  );
}

function MembrosRow({ membros = [] }) {
  const shown = membros.slice(0, 4);
  const extra = Math.max(0, membros.length - shown.length);
  return (
    <View style={styles.membersRow}>
      {shown.map((membro, index) => (
        <View key={`${membro.id}-${index}`} style={{ marginLeft: index === 0 ? 0 : -10, zIndex: shown.length - index }}>
          <Avatar nome={membro.nome} size={28} color={index % 2 ? C.cyan : C.brand} />
        </View>
      ))}
      {extra > 0 && (
        <View style={styles.extraBubble}>
          <Text style={styles.extraText}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

function GroupsDepthScene() {
  return (
    <View style={styles.groupsDepthScene} pointerEvents="none">
      <View style={styles.groupsDepthBack} />
      <LinearGradient
        colors={['rgba(34,212,253,0.16)', 'rgba(139,92,246,0.24)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.groupsDepthCard}
      >
        <View style={styles.groupsDepthIcon}>
          <Users size={15} color={C.brandMid || C.brand} />
        </View>
        <View style={styles.groupsDepthAvatars}>
          <View style={[styles.groupsDepthAvatar, { backgroundColor: C.brand + '66' }]} />
          <View style={[styles.groupsDepthAvatar, { backgroundColor: C.cyan + '66', marginLeft: -9 }]} />
          <View style={[styles.groupsDepthAvatar, { backgroundColor: C.green + '66', marginLeft: -9 }]} />
        </View>
      </LinearGradient>
      <View style={styles.groupsDepthCoin}>
        <WalletCards size={13} color={C.green} />
      </View>
    </View>
  );
}

export default function GruposScreen({ navigation }) {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [amigos, setAmigos] = useState([]);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [emoji, setEmoji] = useState('EUR');
  const [convidados, setConvidados] = useState([]);
  const [criando, setCriando] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await gruposAPI.listar();
      setGrupos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('grupos err', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadAmigos = async () => {
    try {
      const data = await amigosAPI.listar();
      setAmigos(Array.isArray(data?.amigos) ? data.amigos : []);
    } catch (_) {}
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const abrirModal = async () => {
    await loadAmigos();
    setModal(true);
  };

  const toggleConvidado = (id) => {
    setConvidados(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const criar = async () => {
    if (!nome.trim()) return Alert.alert('Falta nome', 'Da um nome ao grupo.');
    setCriando(true);
    try {
      const grupo = await gruposAPI.criar({
        nome: nome.trim(),
        descricao: descricao.trim(),
        emoji,
        amigos_ids: convidados,
      });
      setModal(false);
      setNome('');
      setDescricao('');
      setEmoji('EUR');
      setConvidados([]);
      await load(true);
      navigation.navigate('GrupoDetalhe', { grupoId: grupo.id });
    } catch (e) {
      Alert.alert('Erro', e.message || 'Nao foi possivel criar o grupo.');
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
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <GroupsDepthScene />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle}>Dividir despesas</Text>
          <Text style={styles.headerSub}>Grupos para contas partilhadas</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Amigos')} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>Amigos</Text>
        </Pressable>
        <Pressable onPress={abrirModal} style={styles.addBtn}>
          <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addGradient}>
            <Plus size={16} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      >
        <Animated.View entering={FadeInDown.delay(40)} style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Users size={22} color={C.brandMid || C.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroKicker}>TRICOUNT VERLY</Text>
            <Text style={styles.heroTitle}>{grupos.length ? `${grupos.length} grupo${grupos.length === 1 ? '' : 's'} ativo${grupos.length === 1 ? '' : 's'}` : 'Cria um grupo simples'}</Text>
            <Text style={styles.heroSub}>Regista despesas, escolhe quem pagou e ve os acertos sem ruído.</Text>
          </View>
        </Animated.View>

        {grupos.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.empty}>
            <View style={styles.emptyIcon}>
              <WalletCards size={30} color={C.cyan} />
            </View>
            <Text style={styles.emptyTitle}>Ainda sem grupos</Text>
            <Text style={styles.emptySub}>Cria um grupo para dividir viagens, jantares, casa ou despesas recorrentes.</Text>
            <Pressable onPress={abrirModal} style={styles.emptyBtn}>
              <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyGradient}>
                <Text style={styles.emptyBtnText}>Criar grupo</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        ) : (
          grupos.map((grupo, index) => (
            <Animated.View key={grupo.id} entering={FadeInDown.delay(index * 55)}>
              <Pressable
                style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}
                onPress={() => navigation.navigate('GrupoDetalhe', { grupoId: grupo.id })}
              >
                <LinearGradient colors={C.gradients.accent} style={styles.cardAccent} />
                <View style={styles.groupIcon}>
                  <Text style={styles.groupIconText}>{grupo.emoji || 'EUR'}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.groupName} numberOfLines={1}>{grupo.nome}</Text>
                  {!!grupo.descricao && <Text style={styles.groupDesc} numberOfLines={1}>{grupo.descricao}</Text>}
                  <View style={styles.groupMeta}>
                    <MembrosRow membros={grupo.membros || []} />
                    <Text style={styles.groupMetaText}>{grupo.total_membros || grupo.membros?.length || 1} membro{(grupo.total_membros || grupo.membros?.length || 1) === 1 ? '' : 's'}</Text>
                  </View>
                </View>
                <Text style={styles.arrow}>›</Text>
              </Pressable>
            </Animated.View>
          ))
        )}
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Novo grupo</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRail}>
              {ICONS.map(option => (
                <Pressable key={option} onPress={() => setEmoji(option)} style={[styles.iconChoice, emoji === option && styles.iconChoiceActive]}>
                  <Text style={[styles.iconChoiceText, emoji === option && { color: C.brandMid || C.brand }]}>{option}</Text>
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
              style={[styles.input, styles.textArea]}
              placeholder="Descricao opcional"
              placeholderTextColor={C.textSub}
              value={descricao}
              onChangeText={setDescricao}
              multiline
              maxLength={200}
            />

            {amigos.length > 0 && (
              <>
                <Text style={styles.sheetLabel}>Convidar amigos</Text>
                <ScrollView style={{ maxHeight: 170 }} showsVerticalScrollIndicator={false}>
                  {amigos.map(amigo => {
                    const selected = convidados.includes(amigo.id);
                    return (
                      <Pressable key={amigo.id} onPress={() => toggleConvidado(amigo.id)} style={[styles.friendRow, selected && styles.friendRowActive]}>
                        <Avatar nome={amigo.nome} size={34} color={selected ? C.green : C.brand} />
                        <Text style={styles.friendName}>{amigo.nome}</Text>
                        {selected && <Check size={16} color={C.green} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Pressable onPress={criar} disabled={criando} style={[styles.createBtn, criando && { opacity: 0.6 }]}>
              <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createGradient}>
                {criando ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>Criar grupo</Text>}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  groupsDepthScene: {
    position: 'absolute',
    right: -18,
    top: 94,
    width: 160,
    height: 136,
  },
  groupsDepthBack: {
    position: 'absolute',
    right: 34,
    top: 28,
    width: 94,
    height: 68,
    borderRadius: 24,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    transform: [{ rotate: '-8deg' }],
  },
  groupsDepthCard: {
    width: 126,
    height: 78,
    borderRadius: 26,
    padding: 12,
    borderWidth: 1,
    borderColor: C.borderHi,
    transform: [{ rotate: '6deg' }],
    justifyContent: 'space-between',
  },
  groupsDepthIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.brand + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupsDepthAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  groupsDepthAvatar: {
    width: 24,
    height: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  groupsDepthCoin: {
    position: 'absolute',
    right: 8,
    top: 4,
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: C.green + '16',
    borderWidth: 1,
    borderColor: C.green + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, gap: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 14, backgroundColor: C.glass, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: C.text, fontSize: FONT.xl, fontWeight: '900' },
  headerSub: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  secondaryBtn: { borderRadius: RADIUS.pill, backgroundColor: C.glass, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900' },
  addBtn: { borderRadius: RADIUS.pill, overflow: 'hidden', ...SHADOWS.brandGlow },
  addGradient: { width: 38, height: 38, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: SPACE.lg, paddingBottom: 100 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    marginBottom: SPACE.lg,
    ...SHADOWS.card,
  },
  heroIcon: { width: 48, height: 48, borderRadius: 18, backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand + '44', alignItems: 'center', justifyContent: 'center' },
  heroKicker: { color: C.brandMid || C.brand, fontSize: FONT.xs, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: C.text, fontSize: 25, fontWeight: '900', marginTop: 4 },
  heroSub: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, marginTop: 5 },
  empty: { alignItems: 'center', paddingTop: 58 },
  emptyIcon: { width: 78, height: 78, borderRadius: 24, backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  emptySub: { color: C.textMid, fontSize: FONT.sm, lineHeight: 20, textAlign: 'center', paddingHorizontal: 22, marginTop: 8, marginBottom: 20 },
  emptyBtn: { borderRadius: RADIUS.pill, overflow: 'hidden', ...SHADOWS.brandGlow },
  emptyGradient: { borderRadius: RADIUS.pill, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.glass,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.md,
    paddingLeft: SPACE.lg,
    marginBottom: SPACE.sm,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  groupIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand + '44', justifyContent: 'center', alignItems: 'center' },
  groupIconText: { color: C.brandMid || C.brand, fontSize: FONT.sm, fontWeight: '900' },
  groupName: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  groupDesc: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  groupMetaText: { color: C.textSub, fontSize: FONT.xs, fontWeight: '700' },
  arrow: { color: C.textSub, fontSize: 24, fontWeight: '700' },
  membersRow: { flexDirection: 'row', alignItems: 'center' },
  extraBubble: { marginLeft: -10, width: 28, height: 28, borderRadius: 10, backgroundColor: C.surface3, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  extraText: { color: C.textMid, fontSize: 9, fontWeight: '900' },
  avatar: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.borderHi, padding: SPACE.lg, paddingBottom: 36 },
  sheetHandle: { width: 42, height: 4, borderRadius: 3, backgroundColor: C.borderHi, alignSelf: 'center', marginBottom: SPACE.md },
  sheetTitle: { color: C.text, fontSize: FONT.xxl, fontWeight: '900', marginBottom: SPACE.md },
  sheetLabel: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  iconRail: { gap: 8, paddingBottom: SPACE.sm },
  iconChoice: { minWidth: 56, height: 42, borderRadius: RADIUS.md, backgroundColor: C.glass, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  iconChoiceActive: { backgroundColor: C.brandDim, borderColor: C.brand + '66' },
  iconChoiceText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900' },
  input: { backgroundColor: C.surface2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 13, paddingVertical: 12, color: C.text, fontSize: FONT.md, marginBottom: SPACE.sm },
  textArea: { height: 72, textAlignVertical: 'top' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: RADIUS.md, marginBottom: 5, backgroundColor: C.glass, borderWidth: 1, borderColor: C.border },
  friendRowActive: { backgroundColor: C.greenDim, borderColor: C.green + '55' },
  friendName: { flex: 1, color: C.text, fontSize: FONT.sm, fontWeight: '800' },
  createBtn: { borderRadius: RADIUS.pill, overflow: 'hidden', marginTop: SPACE.md, ...SHADOWS.brandGlow },
  createGradient: { borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: 'center' },
  createText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
});

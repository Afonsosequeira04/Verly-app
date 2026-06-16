// src/screens/AmigosScreen.js — Amigos para despesas partilhadas
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator, StyleSheet, RefreshControl,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Inbox, Receipt, Users } from 'lucide-react-native';
import { amigosAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import { Reveal } from '../components/UI';
import RefinedEmptyState from '../components/RefinedEmptyState';

const C = COLORS;

const initials = (n = '') =>
  n.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

function Avatar({ nome, size = 44, color = C.brand }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.3,
      backgroundColor: color + '20',
      borderWidth: 1.5, borderColor: color,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{ fontSize: size * 0.35, fontWeight: '900', color }}>
        {initials(nome)}
      </Text>
    </View>
  );
}

export default function AmigosScreen({ navigation }) {
  const [amigos,   setAmigos]   = useState([]);
  const [pedidos,  setPedidos]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [tab,      setTab]      = useState('amigos'); // 'amigos' | 'pedidos'

  // Modal adicionar
  const [showAdd,  setShowAdd]  = useState(false);
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [searching, setSearching] = useState(false);
  const [sending,  setSending]  = useState(null);

  // ── Carregar ────────────────────────────────────────────────────────────────
  const load = async (isRefresh = false) => {
    if (isRefresh) setRefresh(true); else setLoading(true);
    try {
      const [a, p] = await Promise.all([
        amigosAPI.listar(),
        amigosAPI.pedidos(),
      ]);
      setAmigos(a.amigos || []);
      setPedidos(p.pedidos || []);
    } catch (e) {
      console.warn('AmigosScreen:', e.message);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  // ── Pesquisar utilizadores ───────────────────────────────────────────────────
  const handleSearch = async (text) => {
    setQuery(text);
    if (text.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await amigosAPI.buscar(text);
      setResults(res.utilizadores || []);
    } catch (_) {}
    finally { setSearching(false); }
  };

  // ── Enviar pedido ────────────────────────────────────────────────────────────
  const handleEnviar = async (email, nome) => {
    setSending(email);
    try {
      await amigosAPI.enviarPedido(email);
      Alert.alert('Pedido enviado!', `Pedido de amizade enviado a ${nome}.`);
      setResults(prev => prev.filter(u => u.email !== email));
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setSending(null);
    }
  };

  // ── Aceitar pedido ───────────────────────────────────────────────────────────
  const handleAceitar = async (pedidoId, nome) => {
    try {
      await amigosAPI.aceitar(pedidoId);
      await load();
      Alert.alert('Amigos!', `Agora és amigo de ${nome}.`);
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  // ── Rejeitar pedido ──────────────────────────────────────────────────────────
  const handleRejeitar = async (pedidoId) => {
    try {
      await amigosAPI.rejeitar(pedidoId);
      setPedidos(prev => prev.filter(p => p.pedido_id !== pedidoId));
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  // ── Remover amigo ────────────────────────────────────────────────────────────
  const handleRemover = (amizadeId, nome) => {
    Alert.alert('Remover amigo', `Remover ${nome} dos teus amigos?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        try {
          await amigosAPI.rejeitar(amizadeId);
          setAmigos(prev => prev.filter(a => a.amizade_id !== amizadeId));
        } catch (e) {
          Alert.alert('Erro', e.message);
        }
      }},
    ]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Acesso rápido a grupos de despesas */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <Pressable onPress={() => navigation.navigate('Grupos')}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7C6FE020', borderRadius: 12, borderWidth: 1, borderColor: '#7C6FE040', padding: 10 }}>
          <Receipt size={18} color="#7C6FE0" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C6FE0' }}>Grupos de despesas</Text>
        </Pressable>
      </View>
      {/* Tab selector */}
      <Reveal delay={0} style={s.tabs}>
        <Pressable onPress={() => setTab('amigos')} style={[s.tab, tab === 'amigos' && s.tabActive]}>
          <Text style={[s.tabText, tab === 'amigos' && s.tabTextActive]}>
            Amigos {amigos.length > 0 ? `(${amigos.length})` : ''}
          </Text>
        </Pressable>
        <Pressable onPress={() => setTab('pedidos')} style={[s.tab, tab === 'pedidos' && s.tabActive]}>
          <Text style={[s.tabText, tab === 'pedidos' && s.tabTextActive]}>
            Pedidos {pedidos.length > 0 ? `(${pedidos.length})` : ''}
          </Text>
          {pedidos.length > 0 && <View style={s.badge} />}
        </Pressable>
      </Reveal>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.brand} />
        }
      >
        {/* ── Aba: Amigos ────────────────────────────────────────────────── */}
        {tab === 'amigos' && (
          <Reveal delay={60}>
            <Pressable onPress={() => setShowAdd(true)} style={s.addBtn}>
              <Text style={s.addBtnText}>+ Adicionar amigo</Text>
            </Pressable>

            {amigos.length === 0 ? (
              <RefinedEmptyState
                framed={false}
                variant="group"
                accent={C.brand}
                icon={<Users size={20} color={C.brand} />}
                title="Sem amigos ainda"
                subtitle="Adiciona amigos para criares grupos e dividires despesas."
                actionLabel="Adicionar amigo"
                onAction={() => setShowAdd(true)}
                style={s.empty}
              />
            ) : (
              amigos.map(a => (
                <View key={a.amizade_id} style={s.row}>
                  <Avatar nome={a.nome} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.rowName}>{a.nome}</Text>
                    <Text style={s.rowSub}>{a.email}</Text>
                  </View>
                  <Pressable onPress={() => handleRemover(a.amizade_id, a.nome)} style={s.rowActionBtn}>
                    <Text style={[s.rowActionText, { color: C.red }]}>Remover</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Reveal>
        )}

        {/* ── Aba: Pedidos ────────────────────────────────────────────────── */}
        {tab === 'pedidos' && (
          <Reveal delay={60}>
            {pedidos.length === 0 ? (
              <RefinedEmptyState
                framed={false}
                variant="feed"
                accent={C.cyan || C.brand}
                icon={<Inbox size={20} color={C.cyan || C.brand} />}
                title="Sem pedidos pendentes"
                subtitle="Quando alguem te enviar um pedido de amizade, aparece aqui."
                actionLabel="Adicionar amigo"
                onAction={() => setShowAdd(true)}
                style={s.empty}
              />
            ) : (
              pedidos.map(p => (
                <View key={p.pedido_id} style={s.row}>
                  <Avatar nome={p.nome} color={C.yellow} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.rowName}>{p.nome}</Text>
                    <Text style={s.rowSub}>{p.email}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => handleRejeitar(p.pedido_id)} style={[s.rowActionBtn, { borderColor: C.red + '40' }]}>
                      <Text style={[s.rowActionText, { color: C.red }]}>✕</Text>
                    </Pressable>
                    <Pressable onPress={() => handleAceitar(p.pedido_id, p.nome)} style={[s.rowActionBtn, { borderColor: C.green + '40', backgroundColor: C.green + '10' }]}>
                      <Text style={[s.rowActionText, { color: C.green }]}>✓ Aceitar</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </Reveal>
        )}
      </ScrollView>

      {/* ── Modal: Adicionar amigo ─────────────────────────────────────────── */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => { setShowAdd(false); setQuery(''); setResults([]); }}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Adicionar amigo</Text>
            <Text style={s.sheetSub}>Pesquisa pelo nome ou email do teu amigo.</Text>

            <TextInput
              style={s.input}
              placeholder="Nome ou email..."
              placeholderTextColor={C.textMid}
              value={query}
              onChangeText={handleSearch}
              autoFocus
              autoCapitalize="none"
            />

            {searching && <ActivityIndicator color={C.brand} style={{ marginTop: 16 }} />}

            {results.length > 0 && (
              <ScrollView style={{ maxHeight: 280, marginTop: 12 }}>
                {results.map(u => (
                  <View key={u.id} style={[s.row, { marginBottom: 8 }]}>
                    <Avatar nome={u.nome} size={38} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.rowName}>{u.nome}</Text>
                      <Text style={s.rowSub}>{u.email}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleEnviar(u.email, u.nome)}
                      disabled={sending === u.email}
                      style={[s.rowActionBtn, { backgroundColor: C.brand + '15', borderColor: C.brand + '40' }]}
                    >
                      {sending === u.email
                        ? <ActivityIndicator size="small" color={C.brand} />
                        : <Text style={[s.rowActionText, { color: C.brand }]}>Adicionar</Text>
                      }
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            {query.length >= 2 && !searching && results.length === 0 && (
              <Text style={[s.emptySub, { textAlign: 'center', marginTop: 20 }]}>
                Nenhum utilizador encontrado.
              </Text>
            )}

            <Pressable onPress={() => { setShowAdd(false); setQuery(''); setResults([]); }} style={[s.addBtn, { backgroundColor: C.surface3, marginTop: 20 }]}>
              <Text style={[s.addBtnText, { color: C.textMid }]}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: SPACE.lg,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1, paddingVertical: 9,
    borderRadius: RADIUS.sm - 2,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  tabActive: { backgroundColor: C.surface3 },
  tabText:   { fontSize: FONT.sm, fontWeight: '700', color: C.textMid },
  tabTextActive: { color: C.text },
  badge: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.red,
  },

  addBtn: {
    backgroundColor: C.brand,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  addBtnText: { fontSize: FONT.md, fontWeight: '700', color: '#fff' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
  },
  rowName: { fontSize: FONT.md, fontWeight: '700', color: C.text },
  rowSub:  { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },
  rowActionBtn: {
    borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 7,
  },
  rowActionText: { fontSize: FONT.xs, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: FONT.xl, fontWeight: '800', color: C.text, marginBottom: 8 },
  emptySub:   { fontSize: FONT.sm, color: C.textMid, textAlign: 'center', lineHeight: 20 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 44,
  },
  sheetTitle: { fontSize: FONT.xxl, fontWeight: '800', color: C.text, marginBottom: 6 },
  sheetSub:   { fontSize: FONT.sm, color: C.textMid, marginBottom: 20 },

  input: {
    backgroundColor: C.surface2,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border,
    color: C.text, fontSize: FONT.md,
    padding: 13,
  },
});

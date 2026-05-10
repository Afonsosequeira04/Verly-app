/**
 * src/screens/MetasScreen.js
 * Gestão de orçamentos por categoria — equivalente à página /metas da web.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { metasAPI } from '../services/api';
import { COLORS } from '../constants/theme';

const CATEGORIAS = [
  'Alimentação', 'Vestuário', 'Tecnologia', 'Casa & Decoração',
  'Saúde & Beleza', 'Desporto', 'Entretenimento', 'Transportes',
  'Educação', 'Outros',
];

const CAT_ICONS = {
  'Tecnologia': '💻', 'Alimentação': '🍽️', 'Vestuário': '👕',
  'Casa & Decoração': '🏠', 'Saúde & Beleza': '💊', 'Desporto': '🏋️',
  'Entretenimento': '🎬', 'Transportes': '🚗', 'Educação': '📚', 'Outros': '📦',
};

function MetaCard({ meta, onDelete }) {
  const pct = meta.limite > 0 ? Math.min((meta.gasto / meta.limite) * 100, 100) : 0;
  const cor = pct >= 100 ? COLORS.red : pct >= 80 ? COLORS.yellow : COLORS.green;
  const restante = meta.limite - meta.gasto;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardIcon}>{CAT_ICONS[meta.categoria] || '📦'}</Text>
          <View>
            <Text style={styles.cardNome}>{meta.nome || meta.categoria}</Text>
            <Text style={styles.cardCat}>{meta.categoria}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(meta.id)}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Barra de progresso */}
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: cor }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={[styles.progressPct, { color: cor }]}>{Math.round(pct)}%</Text>
          <Text style={styles.progressNum}>
            {meta.gasto.toFixed(0)}€ / {meta.limite.toFixed(0)}€
          </Text>
        </View>
      </View>

      {/* Restante */}
      <View style={[styles.restanteBox, { backgroundColor: `${cor}15` }]}>
        <Text style={[styles.restanteLabel, { color: cor }]}>
          {restante >= 0
            ? `${restante.toFixed(2)}€ disponível`
            : `${Math.abs(restante).toFixed(2)}€ acima do limite`}
        </Text>
      </View>
    </View>
  );
}

export default function MetasScreen() {
  const [metas, setMetas]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [modalVisible, setModal]  = useState(false);

  // Formulário nova meta
  const [nome, setNome]           = useState('');
  const [limite, setLimite]       = useState('');
  const [categoria, setCategoria] = useState('Alimentação');
  const [saving, setSaving]       = useState(false);

  const fetchMetas = async () => {
    try {
      const data = await metasAPI.listar();
      setMetas(data.metas || []);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchMetas(); }, []));

  const handleCriar = async () => {
    if (!nome.trim() || !limite || isNaN(Number(limite))) {
      Alert.alert('Erro', 'Preenche o nome e um limite válido.');
      return;
    }
    setSaving(true);
    try {
      await metasAPI.criar(nome.trim(), parseFloat(limite), categoria);
      setNome('');
      setLimite('');
      setCategoria('Alimentação');
      setModal(false);
      fetchMetas();
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Eliminar meta', 'Tens a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await metasAPI.apagar(id);
            setMetas(prev => prev.filter(m => m.id !== id));
          } catch (e) {
            Alert.alert('Erro', e.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brand} /></View>;
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Metas</Text>
          <Text style={styles.sub}>Orçamentos por categoria</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
          <Text style={styles.addBtnText}>+ Nova</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={metas}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefresh(true); fetchMetas(); }}
            tintColor={COLORS.brand}
          />
        }
        renderItem={({ item }) => <MetaCard meta={item} onDelete={handleDelete} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>Sem metas definidas</Text>
            <Text style={styles.emptySub}>
              Cria orçamentos por categoria para controlar os teus gastos.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setModal(true)}>
              <Text style={styles.emptyBtnText}>Criar primeira meta</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Modal nova meta */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Meta</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.formLabel}>Nome</Text>
              <TextInput
                style={styles.formInput}
                value={nome}
                onChangeText={setNome}
                placeholder="ex: Alimentação mensal"
                placeholderTextColor={COLORS.textSub}
              />

              <Text style={styles.formLabel}>Limite (€)</Text>
              <TextInput
                style={styles.formInput}
                value={limite}
                onChangeText={setLimite}
                placeholder="ex: 300"
                placeholderTextColor={COLORS.textSub}
                keyboardType="decimal-pad"
              />

              <Text style={styles.formLabel}>Categoria</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.catScroll}
                contentContainerStyle={styles.catScrollContent}
              >
                {CATEGORIAS.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, categoria === cat && styles.catChipActive]}
                    onPress={() => setCategoria(cat)}
                  >
                    <Text style={styles.catChipIcon}>{CAT_ICONS[cat]}</Text>
                    <Text style={[styles.catChipText, categoria === cat && styles.catChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[styles.formBtn, saving && styles.formBtnDisabled]}
                onPress={handleCriar}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.formBtnText}>Criar Meta →</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 12 },
  title:  { fontSize: 28, fontWeight: '800', color: COLORS.text },
  sub:    { fontSize: 13, color: COLORS.textSub, marginTop: 4 },
  addBtn: { backgroundColor: COLORS.brand, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  list: { paddingHorizontal: 20, paddingBottom: 32 },

  // Card
  card:        { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon:    { fontSize: 26 },
  cardNome:    { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardCat:     { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  deleteBtn:   { padding: 4 },
  deleteBtnText: { fontSize: 14, color: COLORS.textSub },

  progressWrap:   { marginBottom: 10 },
  progressBg:     { height: 8, backgroundColor: COLORS.surface2, borderRadius: 4, overflow: 'hidden' },
  progressFill:   { height: 8, borderRadius: 4 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressPct:    { fontSize: 12, fontWeight: '700' },
  progressNum:    { fontSize: 12, color: COLORS.textSub },
  restanteBox:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  restanteLabel:  { fontSize: 12, fontWeight: '700' },

  // Empty
  empty:      { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 12, opacity: 0.4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: COLORS.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:   { backgroundColor: COLORS.brand, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: COLORS.text },
  modalClose:   { fontSize: 18, color: COLORS.textSub, padding: 4 },

  formLabel:  { fontSize: 13, fontWeight: '600', color: COLORS.textSub, marginBottom: 6, marginTop: 14 },
  formInput:  { backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 15, padding: 12 },
  catScroll:  { marginTop: 8 },
  catScrollContent: { paddingBottom: 4, gap: 8, flexDirection: 'row' },
  catChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  catChipActive: { borderColor: COLORS.brand, backgroundColor: 'rgba(83,74,183,0.15)' },
  catChipIcon: { fontSize: 14 },
  catChipText: { fontSize: 12, color: COLORS.textSub, fontWeight: '600' },
  catChipTextActive: { color: COLORS.brand },
  formBtn:     { backgroundColor: COLORS.brand, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 24, marginBottom: 8 },
  formBtnDisabled: { opacity: 0.6 },
  formBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
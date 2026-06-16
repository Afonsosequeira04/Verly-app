/**
 * src/screens/CriarEmScreen.js
 * "Criar Em" — Playlists de faturas agrupadas, personalizáveis e colaborativas.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, Alert, ActivityIndicator,
  RefreshControl, Share,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FileText } from 'lucide-react-native';
import { apiFetch } from '../services/api';
import { COLORS } from '../constants/theme';
import RefinedEmptyState from '../components/RefinedEmptyState';

// ── Constantes ────────────────────────────────────────────────────────────────

const CORES = [
  '#6C5CE7', '#00C896', '#FF5370', '#FFB300',
  '#0984E3', '#E17055', '#A29BFE', '#55EFC4',
];

const ICONES = [
  { key: 'list',      label: '📋' },
  { key: 'star',      label: '⭐' },
  { key: 'shopping',  label: '🛍️' },
  { key: 'home',      label: '🏠' },
  { key: 'food',      label: '🍔' },
  { key: 'travel',    label: '✈️' },
  { key: 'health',    label: '💊' },
  { key: 'tech',      label: '💻' },
];

const ICONE_EMOJI = Object.fromEntries(ICONES.map(i => [i.key, i.label]));

// ── API helpers ───────────────────────────────────────────────────────────────

const playlistsAPI = {
  listar:   ()           => apiFetch('/playlists'),
  criar:    (data)       => apiFetch('/playlists', { method: 'POST', body: JSON.stringify(data) }),
  detalhe:  (id)         => apiFetch(`/playlists/${id}`),
  editar:   (id, data)   => apiFetch(`/playlists/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  apagar:   (id)         => apiFetch(`/playlists/${id}`, { method: 'DELETE' }),
  addFatura: (id, ids)   => apiFetch(`/playlists/${id}/faturas`, { method: 'POST', body: JSON.stringify({ fatura_ids: ids }) }),
  remFatura: (id, fid)   => apiFetch(`/playlists/${id}/faturas/${fid}`, { method: 'DELETE' }),
  partilhar: (id)        => apiFetch(`/playlists/${id}/partilhar`, { method: 'POST' }),
  juntar:   (codigo)     => apiFetch(`/playlists/juntar/${codigo}`, { method: 'POST' }),
};

const faturasAPI2 = {
  listar: () => apiFetch('/faturas'),
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function CriarEmScreen({ navigation }) {
  const [playlists, setPlaylists]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modais
  const [showCreate, setShowCreate]   = useState(false);
  const [showJuntar, setShowJuntar]   = useState(false);
  const [showDetail, setShowDetail]   = useState(false);
  const [detailData, setDetailData]   = useState(null);
  const [detailLoad, setDetailLoad]   = useState(false);
  const [showAddFat, setShowAddFat]   = useState(false);
  const [faturas, setFaturas]         = useState([]);
  const [selectedFat, setSelectedFat] = useState([]);

  // Form criar
  const [form, setForm] = useState({ nome: '', descricao: '', cor: CORES[0], icone: 'list' });
  const [creating, setCreating] = useState(false);

  // Juntar
  const [codInput, setCodInput] = useState('');
  const [joining, setJoining]   = useState(false);

  // ── Carregar ────────────────────────────────────────────────────────────────

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await playlistsAPI.listar();
      setPlaylists(data.playlists || []);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  // ── Criar playlist ──────────────────────────────────────────────────────────

  const handleCriar = async () => {
    if (!form.nome.trim()) return Alert.alert('Atenção', 'Dá um nome à playlist.');
    setCreating(true);
    try {
      const res = await playlistsAPI.criar(form);
      setPlaylists(prev => [res.playlist, ...prev]);
      setShowCreate(false);
      setForm({ nome: '', descricao: '', cor: CORES[0], icone: 'list' });
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setCreating(false);
    }
  };

  // ── Abrir detalhe ───────────────────────────────────────────────────────────

  const openDetail = async (pl) => {
    setShowDetail(true);
    setDetailData(null);
    setDetailLoad(true);
    try {
      const data = await playlistsAPI.detalhe(pl.id);
      setDetailData(data);
    } catch (e) {
      Alert.alert('Erro', e.message);
      setShowDetail(false);
    } finally {
      setDetailLoad(false);
    }
  };

  // ── Apagar playlist ─────────────────────────────────────────────────────────

  const handleApagar = (id) => {
    Alert.alert('Apagar playlist', 'Tens a certeza? Esta ação não pode ser revertida.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        try {
          await playlistsAPI.apagar(id);
          setPlaylists(prev => prev.filter(p => p.id !== id));
          setShowDetail(false);
        } catch (e) {
          Alert.alert('Erro', e.message);
        }
      }},
    ]);
  };

  // ── Partilhar ───────────────────────────────────────────────────────────────

  const handlePartilhar = async (id) => {
    try {
      const res = await playlistsAPI.partilhar(id);
      await Share.share({
        message: `Junta-te à minha playlist Verly com o código: ${res.codigo}`,
        title: 'Playlist Verly',
      });
      setDetailData(prev => prev ? { ...prev, codigo: res.codigo, colaborativa: 1 } : prev);
    } catch (e) {
      // user canceled share
    }
  };

  // ── Juntar por código ───────────────────────────────────────────────────────

  const handleJuntar = async () => {
    if (!codInput.trim()) return;
    setJoining(true);
    try {
      const res = await playlistsAPI.juntar(codInput.trim());
      Alert.alert('✅ Juntaste-te!', `Bem-vindo à playlist "${res.playlist.nome}".`);
      setShowJuntar(false);
      setCodInput('');
      load();
    } catch (e) {
      Alert.alert('Código inválido', e.message);
    } finally {
      setJoining(false);
    }
  };

  // ── Adicionar faturas ───────────────────────────────────────────────────────

  const openAddFaturas = async () => {
    try {
      const data = await faturasAPI2.listar();
      const existingIds = (detailData?.faturas || []).map(f => f.id);
      setFaturas((data.faturas || []).filter(f => !existingIds.includes(f.id)));
      setSelectedFat([]);
      setShowAddFat(true);
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  const toggleFatura = (id) => {
    setSelectedFat(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleAddFaturas = async () => {
    if (!selectedFat.length) return;
    try {
      await playlistsAPI.addFatura(detailData.id, selectedFat);
      const refreshed = await playlistsAPI.detalhe(detailData.id);
      setDetailData(refreshed);
      setShowAddFat(false);
      setPlaylists(prev => prev.map(p =>
        p.id === detailData.id ? { ...p, num_faturas: refreshed.num_faturas } : p
      ));
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  const handleRemFatura = async (faturaId) => {
    try {
      await playlistsAPI.remFatura(detailData.id, faturaId);
      const refreshed = await playlistsAPI.detalhe(detailData.id);
      setDetailData(refreshed);
      setPlaylists(prev => prev.map(p =>
        p.id === detailData.id ? { ...p, num_faturas: refreshed.num_faturas } : p
      ));
    } catch {}
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Header actions */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.btnSecondary} onPress={() => setShowJuntar(true)}>
          <Text style={s.btnSecondaryText}>+ Juntar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnPrimary} onPress={() => setShowCreate(true)}>
          <Text style={s.btnPrimaryText}>+ Nova Lista</Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {playlists.length === 0 ? (
        <RefinedEmptyState
          framed={false}
          variant="stack"
          accent={COLORS.brand}
          icon={<FileText size={21} color={COLORS.brand} />}
          title="Sem listas ainda"
          subtitle="Cria a tua primeira lista de faturas ou junta-te a uma lista de um amigo."
          actionLabel="Nova lista"
          onAction={() => setShowCreate(true)}
          style={s.empty}
        />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.brand} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={[s.card, { borderLeftColor: item.cor || COLORS.brand }]} onPress={() => openDetail(item)} activeOpacity={0.8}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: (item.cor || COLORS.brand) + '22' }]}>
                  <Text style={s.cardIconText}>{ICONE_EMOJI[item.icone] || '📋'}</Text>
                </View>
                <View style={s.cardInfo}>
                  <Text style={s.cardNome}>{item.nome}</Text>
                  {item.descricao ? <Text style={s.cardDesc} numberOfLines={1}>{item.descricao}</Text> : null}
                </View>
                {!item.is_owner && (
                  <View style={s.colabBadge}>
                    <Text style={s.colabBadgeText}>Collab</Text>
                  </View>
                )}
              </View>
              <View style={s.cardFooter}>
                <Text style={s.cardStat}>{item.num_faturas} faturas</Text>
                {item.colaborativa ? <Text style={s.cardStat}>🔗 Partilhada</Text> : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Modal: Criar playlist ─────────────────────────────────────────── */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Nova Lista</Text>

            <Text style={s.label}>Nome *</Text>
            <TextInput
              style={s.input}
              value={form.nome}
              onChangeText={v => setForm(p => ({ ...p, nome: v }))}
              placeholder="Ex: Férias Verão, Casa Nova..."
              placeholderTextColor={COLORS.textSub}
              maxLength={50}
            />

            <Text style={s.label}>Descrição (opcional)</Text>
            <TextInput
              style={[s.input, { height: 72 }]}
              value={form.descricao}
              onChangeText={v => setForm(p => ({ ...p, descricao: v }))}
              placeholder="Sobre o que é esta lista?"
              placeholderTextColor={COLORS.textSub}
              multiline
              maxLength={200}
            />

            <Text style={s.label}>Cor</Text>
            <View style={s.colorRow}>
              {CORES.map(c => (
                <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, form.cor === c && s.colorDotSelected]} onPress={() => setForm(p => ({ ...p, cor: c }))} />
              ))}
            </View>

            <Text style={s.label}>Ícone</Text>
            <View style={s.iconRow}>
              {ICONES.map(ic => (
                <TouchableOpacity key={ic.key} style={[s.iconBtn, form.icone === ic.key && { backgroundColor: form.cor + '33', borderColor: form.cor }]} onPress={() => setForm(p => ({ ...p, icone: ic.key }))}>
                  <Text style={s.iconBtnText}>{ic.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={s.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.submitBtn, creating && { opacity: 0.6 }]} onPress={handleCriar} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Criar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Juntar por código ──────────────────────────────────────── */}
      <Modal visible={showJuntar} animationType="slide" transparent onRequestClose={() => setShowJuntar(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { paddingBottom: 32 }]}>
            <Text style={s.sheetTitle}>Juntar a uma Lista</Text>
            <Text style={s.sheetSub}>Pede o código de partilha ao teu amigo e introduz aqui.</Text>
            <TextInput
              style={[s.input, { textAlign: 'center', fontSize: 22, fontWeight: '800', letterSpacing: 4 }]}
              value={codInput}
              onChangeText={v => setCodInput(v.toUpperCase())}
              placeholder="CÓDIGO"
              placeholderTextColor={COLORS.textSub}
              autoCapitalize="characters"
              maxLength={12}
            />
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowJuntar(false)}>
                <Text style={s.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.submitBtn, joining && { opacity: 0.6 }]} onPress={handleJuntar} disabled={joining}>
                {joining ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Juntar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Detalhe da playlist ────────────────────────────────────── */}
      <Modal visible={showDetail} animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <View style={s.rootModal}>
          {/* Header */}
          <View style={s.detailHeader}>
            <TouchableOpacity onPress={() => setShowDetail(false)}>
              <Text style={s.backBtn}>‹ Voltar</Text>
            </TouchableOpacity>
            {detailData?.is_owner && (
              <TouchableOpacity onPress={() => handleApagar(detailData.id)}>
                <Text style={s.deleteBtn}>Apagar</Text>
              </TouchableOpacity>
            )}
          </View>

          {detailLoad || !detailData ? (
            <View style={s.center}><ActivityIndicator color={COLORS.brand} /></View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* Info */}
              <View style={[s.detailBanner, { backgroundColor: (detailData.cor || COLORS.brand) + '22', borderColor: detailData.cor || COLORS.brand }]}>
                <Text style={s.detailIcon}>{ICONE_EMOJI[detailData.icone] || '📋'}</Text>
                <Text style={[s.detailNome, { color: detailData.cor || COLORS.brand }]}>{detailData.nome}</Text>
                {detailData.descricao ? <Text style={s.detailDesc}>{detailData.descricao}</Text> : null}
                <Text style={s.detailTotal}>{(detailData.total || 0).toFixed(2)}€ total</Text>
              </View>

              {/* Código de partilha */}
              {detailData.codigo ? (
                <View style={s.codigoBox}>
                  <Text style={s.codigoLabel}>Código de partilha</Text>
                  <Text style={s.codigoText}>{detailData.codigo}</Text>
                </View>
              ) : null}

              {/* Ações */}
              <View style={s.actionRow}>
                {detailData.is_owner && (
                  <TouchableOpacity style={s.actionBtn} onPress={() => handlePartilhar(detailData.id)}>
                    <Text style={s.actionBtnText}>🔗 Partilhar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.actionBtn} onPress={openAddFaturas}>
                  <Text style={s.actionBtnText}>+ Adicionar Faturas</Text>
                </TouchableOpacity>
              </View>

              {/* Membros */}
              {detailData.membros?.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Membros</Text>
                  {detailData.membros.map(m => (
                    <View key={m.user_id} style={s.membroRow}>
                      <View style={s.membroAvatar}>
                        <Text style={s.membroAvatarText}>{(m.nome || '?')[0].toUpperCase()}</Text>
                      </View>
                      <Text style={s.membroNome}>{m.nome}</Text>
                      <Text style={s.membroPapel}>{m.papel}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Faturas */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Faturas ({detailData.num_faturas})</Text>
                {detailData.faturas.length === 0 ? (
                  <Text style={s.emptyFat}>Ainda sem faturas. Adiciona algumas!</Text>
                ) : (
                  detailData.faturas.map(f => (
                    <View key={f.id} style={s.fatRow}>
                      <View style={s.fatInfo}>
                        <Text style={s.fatLoja}>{f.loja || 'Desconhecida'}</Text>
                        <Text style={s.fatMeta}>{f.categoria} · {f.data_compra || ''}</Text>
                      </View>
                      <Text style={s.fatTotal}>{(f.total || 0).toFixed(2)}€</Text>
                      <TouchableOpacity onPress={() => handleRemFatura(f.id)} style={s.remBtn}>
                        <Text style={s.remBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Modal: Selecionar faturas ─────────────────────────────────────── */}
      <Modal visible={showAddFat} animationType="slide" transparent onRequestClose={() => setShowAddFat(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: '80%' }]}>
            <Text style={s.sheetTitle}>Adicionar Faturas</Text>
            <Text style={s.sheetSub}>Seleciona as faturas para adicionar a esta lista.</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {faturas.length === 0 ? (
                <Text style={s.emptySub}>Todas as tuas faturas já estão nesta lista.</Text>
              ) : (
                faturas.map(f => {
                  const sel = selectedFat.includes(f.id);
                  return (
                    <TouchableOpacity key={f.id} style={[s.fatPickRow, sel && s.fatPickRowSel]} onPress={() => toggleFatura(f.id)}>
                      <View style={[s.checkbox, sel && s.checkboxSel]}>
                        {sel && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fatLoja}>{f.loja || 'Desconhecida'}</Text>
                        <Text style={s.fatMeta}>{f.categoria} · {f.data_compra || ''}</Text>
                      </View>
                      <Text style={s.fatTotal}>{(f.total || 0).toFixed(2)}€</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAddFat(false)}>
                <Text style={s.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.submitBtn, !selectedFat.length && { opacity: 0.4 }]} onPress={handleAddFaturas} disabled={!selectedFat.length}>
                <Text style={s.submitBtnText}>Adicionar ({selectedFat.length})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  rootModal: { flex: 1, backgroundColor: COLORS.bg },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 16, paddingBottom: 8 },

  btnPrimary:     { backgroundColor: COLORS.brand, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSecondary:     { backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.border },
  btnSecondaryText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },

  // Cards
  card: { backgroundColor: COLORS.surface, borderRadius: 14, marginBottom: 12, padding: 16, borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardIconText: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardNome: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  cardDesc: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  cardFooter: { flexDirection: 'row', gap: 16 },
  cardStat: { fontSize: 12, color: COLORS.textSub, fontWeight: '600' },
  colabBadge: { backgroundColor: COLORS.brandDim, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  colabBadgeText: { color: COLORS.brand, fontSize: 10, fontWeight: '700' },

  // Empty
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: COLORS.textSub, textAlign: 'center', lineHeight: 20 },

  // Modal sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  sheetSub: { fontSize: 13, color: COLORS.textSub, marginBottom: 20 },

  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSub, marginBottom: 6, marginTop: 14, textTransform: 'uppercase' },
  input: { backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 15, padding: 12 },

  colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff' },

  iconRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  iconBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  iconBtnText: { fontSize: 22 },

  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, backgroundColor: COLORS.surface2, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: COLORS.textSub, fontWeight: '700' },
  submitBtn: { flex: 1, backgroundColor: COLORS.brand, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '800' },

  // Detail
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { fontSize: 16, color: COLORS.brand, fontWeight: '700' },
  deleteBtn: { fontSize: 14, color: COLORS.red, fontWeight: '700' },
  detailBanner: { borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, marginBottom: 16 },
  detailIcon: { fontSize: 40, marginBottom: 8 },
  detailNome: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  detailDesc: { fontSize: 14, color: COLORS.textSub, marginBottom: 8, textAlign: 'center' },
  detailTotal: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  codigoBox: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  codigoLabel: { fontSize: 11, color: COLORS.textSub, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  codigoText: { fontSize: 28, fontWeight: '800', color: COLORS.brand, letterSpacing: 6 },

  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionBtn: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  actionBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textSub, textTransform: 'uppercase', marginBottom: 12 },

  membroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  membroAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.brandDim, justifyContent: 'center', alignItems: 'center' },
  membroAvatarText: { color: COLORS.brand, fontWeight: '800' },
  membroNome: { flex: 1, color: COLORS.text, fontWeight: '600' },
  membroPapel: { color: COLORS.textSub, fontSize: 12 },

  fatRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  fatInfo: { flex: 1 },
  fatLoja: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  fatMeta: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  fatTotal: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginRight: 10 },
  remBtn: { padding: 4 },
  remBtnText: { color: COLORS.red, fontWeight: '700' },
  emptyFat: { color: COLORS.textSub, textAlign: 'center', marginTop: 8 },

  fatPickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  fatPickRowSel: { borderColor: COLORS.brand, backgroundColor: COLORS.brandDim },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  checkboxSel: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
});

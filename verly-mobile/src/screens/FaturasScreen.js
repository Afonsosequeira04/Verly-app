/**
 * src/screens/FaturasScreen.js
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { faturasAPI } from '../services/api';
import { COLORS } from '../constants/theme';

const CAT_ICONS = {
  'Tecnologia': '💻', 'Alimentação': '🍽️', 'Vestuário': '👕',
  'Casa & Decoração': '🏠', 'Saúde & Beleza': '💊', 'Desporto': '🏋️',
  'Entretenimento': '🎬', 'Transportes': '🚗', 'Educação': '📚', 'Outros': '📦',
};

function FaturaCard({ fatura, onPress, onDelete }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardIcon}>
        <Text style={styles.cardIconText}>{CAT_ICONS[fatura.categoria] || '📄'}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardLoja} numberOfLines={1}>{fatura.loja || 'Sem nome'}</Text>
        <Text style={styles.cardMeta}>{fatura.categoria} · {fatura.data_compra || fatura.data_upload?.slice(0, 10) || '—'}</Text>
        {(fatura.data_garantia || fatura.data_devolucao) && (
          <View style={styles.prazosRow}>
            {fatura.data_devolucao && <Text style={styles.devTag}>↩ Dev: {fatura.data_devolucao}</Text>}
            {fatura.data_garantia && <Text style={styles.garTag}>🛡 Gar: {fatura.data_garantia}</Text>}
          </View>
        )}
      </View>
      <View style={styles.cardRight}>
        <Text style={[styles.cardTotal, fatura.total > 100 && styles.totalDanger]}>
          {(fatura.total || 0).toFixed(2)}€
        </Text>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(fatura.id)}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function FaturasScreen({ navigation }) {
  const [faturas, setFaturas]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [search, setSearch]       = useState('');
  const [total, setTotal]         = useState(0);

  const fetchFaturas = async (q = '') => {
    try {
      const data = await faturasAPI.listar(q ? { q } : {});
      setFaturas(data.faturas || []);
      setTotal(data.total || 0);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); fetchFaturas(); }, []));

  const handleSearch = (text) => {
    setSearch(text);
    fetchFaturas(text);
  };

  const handleDelete = (id) => {
    Alert.alert('Eliminar', 'Tens a certeza que queres eliminar esta fatura?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await faturasAPI.apagar(id);
            setFaturas(prev => prev.filter(f => f.id !== id));
          } catch (e) { Alert.alert('Erro', e.message); }
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
          <Text style={styles.title}>Faturas</Text>
          <Text style={styles.sub}>{faturas.length} faturas · {total.toFixed(2)}€</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearch}
          placeholder="Pesquisar loja..."
          placeholderTextColor={COLORS.textSub}
        />
      </View>

      {/* List */}
      <FlatList
        data={faturas}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); fetchFaturas(search); }} tintColor={COLORS.brand} />}
        renderItem={({ item }) => (
          <FaturaCard
            fatura={item}
            onPress={() => navigation.navigate('FaturaDetalhe', { id: item.id })}
            onDelete={handleDelete}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>Sem faturas</Text>
            <Text style={styles.emptySub}>Carrega a tua primeira fatura através da app web.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 12 },
  title:  { fontSize: 28, fontWeight: '800', color: COLORS.text },
  sub:    { fontSize: 13, color: COLORS.textSub, marginTop: 4 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center' },
  cardIconText: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardLoja: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  prazosRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  devTag: { fontSize: 11, color: COLORS.yellow },
  garTag: { fontSize: 11, color: COLORS.green },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardTotal: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  totalDanger: { color: COLORS.red },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 12, color: COLORS.textSub },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12, opacity: 0.3 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptySub: { fontSize: 13, color: COLORS.textSub, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
});
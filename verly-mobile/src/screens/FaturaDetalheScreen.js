/**
 * src/screens/FaturaDetalheScreen.js
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Gauge } from 'lucide-react-native';
import { faturasAPI } from '../services/api';
import { COLORS } from '../constants/theme';

const CAT_ICONS = {
  'Tecnologia': '💻', 'Alimentação': '🍽️', 'Vestuário': '👕',
  'Casa & Decoração': '🏠', 'Saúde & Beleza': '💊', 'Desporto': '🏋️',
  'Entretenimento': '🎬', 'Transportes': '🚗', 'Educação': '📚', 'Outros': '📦',
};

function InfoRow({ label, value, valueColor }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

export default function FaturaDetalheScreen({ route, navigation }) {
  const id = route.params?.id ?? route.params?.faturaId;
  const [fatura, setFatura]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      Alert.alert('Erro', 'Fatura inválida.');
      navigation.goBack();
      return;
    }
    faturasAPI.detalhe(id)
      .then(data => setFatura(data))
      .catch(e => { Alert.alert('Erro', e.message); navigation.goBack(); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = () => {
    Alert.alert('Eliminar', 'Tens a certeza que queres eliminar esta fatura?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await faturasAPI.apagar(id);
            navigation.goBack();
          } catch (e) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  };

  const handleScore = () => {
    navigation.navigate('Score', {
      faturaId: fatura.id,
      prefill: {
        item: fatura.loja || fatura.nome_ficheiro,
        categoria: fatura.categoria,
        preco: fatura.total,
      },
    });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brand} /></View>;
  }
  if (!fatura) return null;

  const items = Array.isArray(fatura.items) ? fatura.items : [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header com botão voltar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Faturas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Eliminar</Text>
        </TouchableOpacity>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Text style={styles.heroIconText}>{CAT_ICONS[fatura.categoria] || '📄'}</Text>
        </View>
        <Text style={styles.heroLoja}>{fatura.loja || fatura.nome_ficheiro}</Text>
        <Text style={styles.heroTotal}>{(fatura.total || 0).toFixed(2)}€</Text>
        <View style={styles.heroCatBadge}>
          <Text style={styles.heroCatText}>{fatura.categoria}</Text>
        </View>
        <TouchableOpacity style={styles.scoreBtn} onPress={handleScore} activeOpacity={0.85}>
          <Gauge size={16} color="#fff" strokeWidth={2.4} />
          <Text style={styles.scoreBtnText}>Analisar compra</Text>
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Detalhes</Text>
        <View style={styles.infoBox}>
          <InfoRow label="Data de compra" value={fatura.data_compra} />
          <InfoRow label="Ficheiro" value={fatura.nome_ficheiro} />
          <InfoRow label="Data de upload" value={fatura.data_upload?.slice(0, 10)} />
        </View>
      </View>

      {/* Prazos */}
      {(fatura.data_garantia || fatura.data_devolucao) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prazos</Text>
          <View style={styles.infoBox}>
            <InfoRow label="🛡 Garantia até" value={fatura.data_garantia} valueColor={COLORS.green} />
            <InfoRow label="↩ Devolução até" value={fatura.data_devolucao} valueColor={COLORS.yellow} />
          </View>
        </View>
      )}

      {/* Items */}
      {items.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.infoBox}>
            {items.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={styles.itemDot} />
                <Text style={styles.itemText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn: { padding: 4 },
  backText: { color: COLORS.brand, fontSize: 15, fontWeight: '600' },
  deleteBtn: { backgroundColor: 'rgba(255,71,87,0.12)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,71,87,0.25)' },
  deleteBtnText: { color: COLORS.red, fontSize: 13, fontWeight: '600' },
  hero:    { alignItems: 'center', marginBottom: 28 },
  heroIcon: { width: 72, height: 72, backgroundColor: COLORS.surface, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  heroIconText: { fontSize: 36 },
  heroLoja: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  heroTotal: { fontSize: 36, fontWeight: '800', color: COLORS.brand, marginBottom: 10 },
  heroCatBadge: { backgroundColor: 'rgba(83,74,183,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(83,74,183,0.3)' },
  heroCatText: { color: COLORS.brand, fontSize: 13, fontWeight: '700' },
  scoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.brand, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, marginTop: 16 },
  scoreBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  infoBox: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { fontSize: 13, color: COLORS.textSub },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, maxWidth: '60%', textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.brand },
  itemText: { fontSize: 13, color: COLORS.text, flex: 1 },
});

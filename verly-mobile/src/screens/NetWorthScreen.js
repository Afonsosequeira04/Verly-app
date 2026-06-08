import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { ArrowLeft, Plus, Trash2, WalletCards } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, FONT, RADIUS, SPACE, SHADOWS } from '../constants/theme';
import { netWorthAPI } from '../services/api';
import { formatMoney } from '../utils/money';

const C = COLORS;
const CATEGORIES_ASSET = ['Conta', 'Poupanca', 'Investimentos', 'Imovel', 'Crypto', 'Outros'];
const CATEGORIES_DEBT = ['Cartao', 'Credito', 'Emprestimo', 'Imovel', 'Outros'];
const PIE_COLORS = [C.brand, C.cyan, C.magenta, C.green, C.yellow, C.blue];

function polarToCartesian(cx, cy, r, angle) {
  const rad = (angle - 90) * Math.PI / 180;
  return { x: cx + (r * Math.cos(rad)), y: cy + (r * Math.sin(rad)) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function PieChart({ data = [] }) {
  const total = data.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  if (!total) {
    return (
      <View style={styles.emptyPie}>
        <Text style={styles.emptyPieText}>Sem ativos para desenhar o grafico</Text>
      </View>
    );
  }

  let angle = 0;
  const slices = data.map((item, index) => {
    const next = angle + (Number(item.valor || 0) / total) * 360;
    const slice = {
      ...item,
      start: angle,
      end: Math.min(next, 359.99),
      color: PIE_COLORS[index % PIE_COLORS.length],
    };
    angle = next;
    return slice;
  });

  return (
    <View style={styles.pieWrap}>
      <Svg width={190} height={190} viewBox="0 0 190 190">
        {slices.map((slice, index) => (
          <Path
            key={`${slice.categoria}-${index}`}
            d={arcPath(95, 95, 86, slice.start, slice.end)}
            fill={slice.color}
            opacity={0.92}
          />
        ))}
      </Svg>
      <View style={styles.legend}>
        {slices.map((slice, index) => (
          <View key={`${slice.categoria}-legend-${index}`} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>{slice.categoria}</Text>
            <Text style={styles.legendValue}>{Math.round((slice.valor / total) * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TypeChip({ active, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function NetWorthScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    tipo: 'asset',
    categoria: 'Conta',
    valor: '',
    currency: 'EUR',
  });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await netWorthAPI.get();
      setItems(data.items || []);
      setSummary(data.summary || null);
    } catch (e) {
      Alert.alert('Net worth', e.message || 'Nao foi possivel carregar o patrimonio.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setForm({ nome: '', tipo: 'asset', categoria: 'Conta', valor: '', currency: summary?.currency || 'EUR' });
    setModal(true);
  };

  const setTipo = (tipo) => {
    setForm(prev => ({
      ...prev,
      tipo,
      categoria: tipo === 'asset' ? 'Conta' : 'Cartao',
    }));
  };

  const guardar = async () => {
    const valor = Number(String(form.valor || '').replace(',', '.'));
    if (!form.nome.trim()) return Alert.alert('Falta nome', 'Da um nome ao ativo ou divida.');
    if (!valor || valor <= 0) return Alert.alert('Valor invalido', 'Indica um valor maior que zero.');

    setSaving(true);
    try {
      await netWorthAPI.criarItem({
        nome: form.nome.trim(),
        tipo: form.tipo,
        categoria: form.categoria,
        valor,
        currency: form.currency.trim().toUpperCase() || 'EUR',
      });
      setModal(false);
      await load(true);
    } catch (e) {
      Alert.alert('Net worth', e.message || 'Nao foi possivel guardar.');
    } finally {
      setSaving(false);
    }
  };

  const apagar = (item) => {
    Alert.alert('Remover item', `Remover "${item.nome}" do net worth?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await netWorthAPI.apagarItem(item.id);
            await load(true);
          } catch (e) {
            Alert.alert('Net worth', e.message || 'Nao foi possivel remover.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  const currency = summary?.currency || 'EUR';
  const categories = form.tipo === 'asset' ? CATEGORIES_ASSET : CATEGORIES_DEBT;

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={styles.decorOrb} />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Net worth</Text>
          <Text style={styles.subtitle}>Ativos, dividas e patrimonio liquido.</Text>
        </View>
        <Pressable onPress={openNew} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
          <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addGradient}>
            <Plus size={17} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>Patrimonio liquido</Text>
          <Text style={styles.netValue}>{formatMoney(summary?.net_worth || 0, currency)}</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Ativos</Text>
              <Text style={[styles.statValue, { color: C.green }]}>{formatMoney(summary?.assets || 0, currency)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Dividas</Text>
              <Text style={[styles.statValue, { color: C.red }]}>{formatMoney(summary?.liabilities || 0, currency)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Distribuicao de ativos</Text>
          <PieChart data={summary?.pie || []} />
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Itens</Text>
          <Text style={styles.sectionCount}>{items.length}</Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <WalletCards size={28} color={C.brandMid} />
            </View>
            <Text style={styles.emptyTitle}>Sem patrimonio registado</Text>
            <Text style={styles.emptyText}>Adiciona um ativo ou uma divida para veres o grafico e o total real.</Text>
            <Pressable onPress={openNew} style={styles.emptyAction}>
              <Text style={styles.emptyActionText}>Adicionar primeiro item</Text>
            </Pressable>
          </View>
        ) : items.map(item => (
          <View key={item.id} style={styles.itemRow}>
            <View style={[styles.itemDot, { backgroundColor: item.tipo === 'asset' ? C.greenDim : C.redDim }]}>
              <Text style={[styles.itemDotText, { color: item.tipo === 'asset' ? C.green : C.red }]}>
                {item.tipo === 'asset' ? '+' : '-'}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.itemName} numberOfLines={1}>{item.nome}</Text>
              <Text style={styles.itemMeta}>{item.categoria}</Text>
            </View>
            <Text style={[styles.itemValue, { color: item.tipo === 'asset' ? C.green : C.red }]}>
              {formatMoney(item.valor, item.currency)}
            </Text>
            <Pressable onPress={() => apagar(item)} hitSlop={8} style={styles.trashBtn}>
              <Trash2 size={15} color={C.textMid} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Novo item</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Conta Santander, ETF, cartao credito..."
                placeholderTextColor={C.textSub}
                value={form.nome}
                onChangeText={value => setForm(prev => ({ ...prev, nome: value }))}
              />
              <View style={styles.chipRow}>
                <TypeChip active={form.tipo === 'asset'} label="Ativo" onPress={() => setTipo('asset')} />
                <TypeChip active={form.tipo === 'liability'} label="Divida" onPress={() => setTipo('liability')} />
              </View>
              <Text style={styles.sheetLabel}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {categories.map(categoria => (
                  <TypeChip
                    key={categoria}
                    active={form.categoria === categoria}
                    label={categoria}
                    onPress={() => setForm(prev => ({ ...prev, categoria }))}
                  />
                ))}
              </ScrollView>
              <View style={styles.valueRow}>
                <TextInput
                  style={[styles.input, styles.valueInput]}
                  placeholder="0,00"
                  placeholderTextColor={C.textSub}
                  keyboardType="decimal-pad"
                  value={form.valor}
                  onChangeText={value => setForm(prev => ({ ...prev, valor: value }))}
                />
                <TextInput
                  style={[styles.input, styles.currencyInput]}
                  placeholder="EUR"
                  placeholderTextColor={C.textSub}
                  autoCapitalize="characters"
                  value={form.currency}
                  onChangeText={value => setForm(prev => ({ ...prev, currency: value }))}
                />
              </View>
              <View style={styles.sheetActions}>
                <Pressable onPress={() => setModal(false)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryText}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={guardar} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.65 }]}>
                  <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveGradient}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar</Text>}
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  decorOrb: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 54,
    right: -82,
    top: 92,
    backgroundColor: 'rgba(139,92,246,0.10)',
    transform: [{ rotate: '18deg' }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 54,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.md,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { color: C.text, fontSize: FONT.xxl, fontWeight: '900' },
  subtitle: { color: C.textMid, fontSize: FONT.sm, marginTop: 2 },
  addBtn: { borderRadius: RADIUS.pill, overflow: 'hidden', ...SHADOWS.brandGlow },
  addGradient: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill },
  content: { padding: SPACE.lg, paddingBottom: 58 },
  heroCard: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    ...SHADOWS.card,
  },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  netValue: { color: C.text, fontSize: 34, fontWeight: '900', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  stat: {
    flex: 1,
    borderRadius: RADIUS.md,
    backgroundColor: C.glassHi,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
  },
  statLabel: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
  statValue: { fontSize: FONT.md, fontWeight: '900', marginTop: 5 },
  card: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
    marginBottom: SPACE.lg,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  sectionTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  sectionCount: { color: C.brandMid, fontSize: FONT.sm, fontWeight: '900' },
  pieWrap: { alignItems: 'center', gap: SPACE.md, marginTop: SPACE.md },
  legend: { width: '100%', gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { flex: 1, color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
  legendValue: { color: C.text, fontSize: FONT.xs, fontWeight: '900' },
  emptyPie: { minHeight: 150, alignItems: 'center', justifyContent: 'center' },
  emptyPieText: { color: C.textMid, fontSize: FONT.sm },
  empty: { alignItems: 'center', paddingVertical: 46, paddingHorizontal: SPACE.md },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: C.brandDim,
    borderWidth: 1,
    borderColor: C.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  emptyTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  emptyText: { color: C.textMid, fontSize: FONT.sm, lineHeight: 20, textAlign: 'center', marginTop: 6, marginBottom: SPACE.md },
  emptyAction: { borderRadius: RADIUS.pill, backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand + '55', paddingHorizontal: 18, paddingVertical: 12 },
  emptyActionText: { color: C.brandMid, fontSize: FONT.sm, fontWeight: '900' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
  },
  itemDot: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemDotText: { fontSize: FONT.lg, fontWeight: '900' },
  itemName: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  itemMeta: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  itemValue: { fontSize: FONT.sm, fontWeight: '900' },
  trashBtn: { padding: 6 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    paddingBottom: 28,
  },
  sheetHandle: { width: 42, height: 4, borderRadius: 3, backgroundColor: C.borderHi, alignSelf: 'center', marginBottom: SPACE.md },
  sheetTitle: { color: C.text, fontSize: FONT.xxl, fontWeight: '900', marginBottom: SPACE.md },
  sheetLabel: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8 },
  input: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: C.text,
    fontSize: FONT.md,
    marginBottom: SPACE.sm,
  },
  valueRow: { flexDirection: 'row', gap: SPACE.sm },
  valueInput: { flex: 1, fontSize: 24, fontWeight: '900' },
  currencyInput: { width: 86, textAlign: 'center', fontWeight: '900' },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: SPACE.sm },
  chip: { borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.glass, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: C.brandDim, borderColor: C.brand + '66' },
  chipText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900' },
  chipTextActive: { color: C.brandMid },
  sheetActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  secondaryBtn: {
    flex: 1,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { color: C.textMid, fontSize: FONT.sm, fontWeight: '900' },
  saveBtn: { flex: 1, borderRadius: RADIUS.pill, overflow: 'hidden', ...SHADOWS.brandGlow },
  saveGradient: { paddingVertical: 14, alignItems: 'center', borderRadius: RADIUS.pill },
  saveText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});

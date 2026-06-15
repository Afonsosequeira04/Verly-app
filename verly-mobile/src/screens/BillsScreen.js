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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, CalendarDays, Check, Plus, Trash2 } from 'lucide-react-native';

import { billsAPI, calendarAPI, perfilAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatMoney } from '../utils/money';
import RefinedEmptyState from '../components/RefinedEmptyState';

const C = COLORS;

function monthKey(value) {
  if (!value) return 'Sem data';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sem data';
  return d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
}

export default function BillsScreen({ navigation }) {
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState(null);
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    titulo: '',
    valor: '',
    data_vencimento: new Date().toISOString().slice(0, 10),
    categoria: 'Obrigacao',
    recorrencia: 'none',
  });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const perfil = await perfilAPI.get().catch(() => ({}));
      const nextCurrency = perfil.moeda_preferida || currency;
      setCurrency(nextCurrency);
      const data = await billsAPI.listar({ currency: nextCurrency });
      setBills(data.bills || []);
      setSummary(data.summary || null);
    } catch (e) {
      Alert.alert('Bills', e.message || 'Nao foi possivel carregar obrigacoes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currency]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grouped = bills.reduce((acc, bill) => {
    const key = monthKey(bill.data_vencimento);
    acc[key] = acc[key] || [];
    acc[key].push(bill);
    return acc;
  }, {});

  const save = async () => {
    if (!form.titulo.trim()) return Alert.alert('Falta titulo', 'Indica o que tens de pagar.');
    setSaving(true);
    try {
      await billsAPI.criar({ ...form, currency });
      setModal(false);
      setForm({ ...form, titulo: '', valor: '' });
      await load(true);
    } catch (e) {
      Alert.alert('Bills', e.message || 'Nao foi possivel guardar.');
    } finally {
      setSaving(false);
    }
  };

  const togglePaid = async (bill) => {
    await billsAPI.atualizar(bill.id, { pago: !bill.pago });
    load(true);
  };

  const remove = (bill) => {
    Alert.alert('Apagar', `Apagar "${bill.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => { await billsAPI.apagar(bill.id); load(true); } },
    ]);
  };

  const connectCalendar = async (provider) => {
    try {
      const result = await calendarAPI.connect(provider);
      Alert.alert('Calendario', result.message || 'Calendario preparado.');
    } catch (e) {
      Alert.alert('Calendario', e.message || 'Nao foi possivel ligar.');
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.brand} size="large" /></View>;
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Bills</Text>
          <Text style={styles.subtitle}>Obrigacoes, datas e calendario.</Text>
        </View>
        <Pressable onPress={() => setModal(true)} style={styles.primaryIcon}>
          <Plus size={18} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      >
        <Animated.View entering={FadeInDown.delay(40)} style={styles.hero}>
          <CalendarDays size={24} color={C.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Proximos 30 dias</Text>
            <Text style={styles.heroValue}>{formatMoney(summary?.total_next_30_days || 0, currency)}</Text>
            <Text style={styles.heroSub}>{summary?.upcoming_count || 0} por pagar, {summary?.overdue_count || 0} em atraso</Text>
          </View>
        </Animated.View>

        <View style={styles.calendarCard}>
          <View style={styles.calendarTop}>
            <Text style={styles.sectionTitle}>Calendario</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => connectCalendar('google')} style={styles.smallBtn}><Text style={styles.smallBtnText}>Google</Text></Pressable>
              <Pressable onPress={() => connectCalendar('apple')} style={styles.smallBtn}><Text style={styles.smallBtnText}>Apple</Text></Pressable>
            </View>
          </View>
          {Object.keys(grouped).length === 0 ? (
            <RefinedEmptyState
              framed={false}
              variant="calendar"
              accent={C.brand}
              icon={<CalendarDays size={22} color={C.brandMid || C.brand} />}
              title="Sem obrigacoes por agora"
              subtitle="Adiciona rendas, seguros, subscricoes ou qualquer data que nao podes falhar."
              actionLabel="Adicionar bill"
              actionIcon={<Plus size={14} color="#fff" />}
              onAction={() => setModal(true)}
              style={styles.emptyState}
            />
          ) : Object.entries(grouped).map(([month, items]) => (
            <View key={month} style={styles.monthBlock}>
              <Text style={styles.monthTitle}>{month}</Text>
              {items.map(bill => (
                <View key={bill.id} style={styles.billRow}>
                  <Pressable onPress={() => togglePaid(bill)} style={[styles.check, bill.pago && styles.checkDone]}>
                    {bill.pago ? <Check size={14} color="#fff" /> : null}
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.billTitle, bill.pago && styles.paid]} numberOfLines={1}>{bill.titulo}</Text>
                    <Text style={styles.billMeta}>{bill.data_vencimento} · {bill.categoria}</Text>
                  </View>
                  <Text style={styles.billValue}>{formatMoney(bill.valor, bill.currency)}</Text>
                  <Pressable onPress={() => remove(bill)} hitSlop={8}><Trash2 size={15} color={C.red} /></Pressable>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Nova obrigacao</Text>
            <TextInput style={styles.input} placeholder="Ex: Renda, seguro, cartao" placeholderTextColor={C.textSub} value={form.titulo} onChangeText={titulo => setForm({ ...form, titulo })} />
            <TextInput style={styles.input} placeholder="Valor" placeholderTextColor={C.textSub} keyboardType="decimal-pad" value={form.valor} onChangeText={valor => setForm({ ...form, valor })} />
            <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={C.textSub} value={form.data_vencimento} onChangeText={data_vencimento => setForm({ ...form, data_vencimento })} />
            <Pressable onPress={save} disabled={saving} style={styles.saveBtn}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACE.lg, paddingTop: SPACE.xl },
  iconBtn: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  primaryIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: FONT.xl, fontWeight: '900' },
  subtitle: { color: C.textMid, fontSize: FONT.sm, marginTop: 2 },
  content: { padding: SPACE.lg, paddingTop: 0, paddingBottom: 120 },
  hero: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.lg, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 14 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800', textTransform: 'uppercase' },
  heroValue: { color: C.text, fontSize: 28, fontWeight: '900', marginTop: 2 },
  heroSub: { color: C.textMid, fontSize: FONT.xs, marginTop: 3 },
  calendarCard: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 14 },
  calendarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  smallBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 9, paddingHorizontal: 10, height: 30, justifyContent: 'center', backgroundColor: C.surface2 },
  smallBtnText: { color: C.brand, fontSize: FONT.xs, fontWeight: '900' },
  monthBlock: { marginTop: 10 },
  monthTitle: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.border },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: C.green, borderColor: C.green },
  billTitle: { color: C.text, fontSize: FONT.md, fontWeight: '800' },
  billMeta: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  billValue: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  paid: { textDecorationLine: 'line-through', color: C.textMid },
  emptyState: { paddingVertical: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12, borderWidth: 1, borderColor: C.border },
  sheetTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  input: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text, paddingHorizontal: 12, minHeight: 46 },
  saveBtn: { backgroundColor: C.brand, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '900', fontSize: FONT.md },
});

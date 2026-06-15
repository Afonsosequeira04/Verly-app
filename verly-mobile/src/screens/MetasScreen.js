// src/screens/MetasScreen.js — Redesign
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, ActivityIndicator, StyleSheet,
  Animated, Easing, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, X, Target, ChevronRight, Trash2 } from 'lucide-react-native';
import { metasAPI } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE, SHADOWS } from '../constants/theme';
import { Reveal, Card, Skeleton, SectionHeader, useScalePress } from '../components/UI';

const C = COLORS;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');

const CATS = [
  'Alimentação', 'Tecnologia', 'Vestuário', 'Casa & Decoração',
  'Saúde & Beleza', 'Desporto', 'Entretenimento', 'Transportes',
  'Educação', 'Subscrições', 'Outros',
];

function MetasDepthScene() {
  return (
    <View style={s.goalDepthScene} pointerEvents="none">
      <LinearGradient
        colors={['rgba(139,92,246,0.26)', 'rgba(34,212,253,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.goalDepthCard}
      >
        <View style={s.goalTargetOuter}>
          <View style={s.goalTargetInner}>
            <Target size={15} color={C.brandMid || C.brand} />
          </View>
        </View>
        <View style={{ gap: 5, flex: 1 }}>
          <View style={[s.goalDepthLine, { width: '76%' }]} />
          <View style={[s.goalDepthLine, { width: '45%', opacity: 0.45 }]} />
        </View>
      </LinearGradient>
      <View style={s.goalDepthFloor} />
      <View style={s.goalDepthTick} />
    </View>
  );
}

function MetaBar({ pct = 0, color = C.brand }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: Math.min(pct, 100), duration: 700, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct]);
  const w = width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <View style={{ height: 4, backgroundColor: C.surface3, borderRadius: 2, overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', width: w, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

function MetaCard({ meta, onDelete }) {
  const limite = Number(meta.limite ?? meta.valor_limite ?? 0);
  const gasto = Number(meta.gasto ?? meta.gasto_atual ?? 0);
  const pct = limite > 0 ? (gasto / limite) * 100 : 0;
  const color = pct > 100 ? C.red : pct > 80 ? C.yellow : C.green;
  const restante = limite - gasto;

  return (
    <Reveal delay={0}>
      <View style={s.card}>
        <LinearGradient colors={[color + '66', C.cyan + '33']} style={s.cardAccent} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.bodyText}>{meta.categoria}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
              <Text style={[s.bigNum, { color }]}>{fmt(gasto)} €</Text>
              <Text style={s.microText}>/ {fmt(limite)} €</Text>
            </View>
          </View>
          <Pressable onPress={() => onDelete(meta.id)} hitSlop={10} style={s.deleteBtn}>
            <Trash2 size={14} color={C.textMid} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
          <MetaBar pct={pct} color={color} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[s.microText, { color }]}>{Math.round(pct)}% usado</Text>
            <Text style={s.microText}>
              {restante >= 0 ? `${fmt(restante)} € restante` : `+${fmt(-restante)} € excesso`}
            </Text>
          </View>
        </View>
      </View>
    </Reveal>
  );
}

export default function MetasScreen() {
  const [metas,      setMetas]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [catSel,     setCatSel]     = useState(CATS[0]);
  const [valor,      setValor]      = useState('');
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { const d = await metasAPI.listar(); setMetas(d.metas || []); }
    catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSave = async () => {
    const v = parseFloat(valor.replace(',', '.'));
    if (!v || v <= 0) return Alert.alert('Valor inválido', 'Introduz um limite válido.');
    setSaving(true);
    try {
      await metasAPI.criar({ categoria: catSel, valor_limite: v });
      setShowModal(false); setValor('');
      load();
    } catch (e) { Alert.alert('Erro', e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = (id) => {
    Alert.alert('Eliminar meta', 'Tens a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await metasAPI.eliminar(id); load(); }
        catch (_) {}
      }},
    ]);
  };

  const totalGasto  = metas.reduce((a, m) => a + Number(m.gasto ?? m.gasto_atual ?? 0), 0);
  const totalLimite = metas.reduce((a, m) => a + Number(m.limite ?? m.valor_limite ?? 0), 0);

  return (
    <View style={s.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <MetasDepthScene />
      <ScrollView
        contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      >
        <Reveal delay={0} style={s.hero}>
          <View style={s.heroIcon}>
            <Target size={22} color={C.brandMid || C.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroKicker}>METAS MENSAIS</Text>
            <Text style={s.heroTitle}>{metas.length ? `${Math.round(totalLimite ? (totalGasto / totalLimite) * 100 : 0)}% usado` : 'Define limites claros'}</Text>
            <Text style={s.heroSub}>
              {metas.length
                ? `${fmt(totalGasto)} EUR gastos de ${fmt(totalLimite)} EUR planeados.`
                : 'Cria metas por categoria para a Verly conseguir avisar antes de passares do limite.'}
            </Text>
          </View>
        </Reveal>

        <SectionHeader title="As tuas metas" action="Nova meta" onAction={() => setShowModal(true)} style={{ marginBottom: 14 }} />

        {loading ? (
          <View style={{ gap: 12 }}>
            {[1, 2, 3].map(i => <Skeleton key={i} height={96} radius={RADIUS.lg} />)}
          </View>
        ) : metas.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}><Target size={24} color={C.brand} /></View>
            <Text style={s.emptyTitle}>Sem metas definidas</Text>
            <Text style={s.emptySub}>Define limites de gasto por categoria.</Text>
            <Pressable onPress={() => setShowModal(true)} style={s.emptyBtn}>
              <Plus size={14} color="#fff" />
              <Text style={s.emptyBtnText}>Criar primeira meta</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {metas.map(m => <MetaCard key={m.id} meta={m} onDelete={handleDelete} />)}
          </View>
        )}
      </ScrollView>

      {/* Modal nova meta */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <Text style={s.sheetTitle}>Nova meta</Text>
              <Pressable onPress={() => setShowModal(false)} hitSlop={10}>
                <X size={18} color={C.textMid} />
              </Pressable>
            </View>

            <Text style={s.label}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {CATS.map(c => (
                  <Pressable key={c} onPress={() => setCatSel(c)}
                    style={[s.chip, catSel === c && s.chipActive]}>
                    <Text style={[s.chipText, catSel === c && { color: C.brand }]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={s.label}>Limite mensal (€)</Text>
            <TextInput
              style={s.input}
              value={valor}
              onChangeText={setValor}
              placeholder="0.00"
              placeholderTextColor={C.textMid}
              keyboardType="decimal-pad"
            />

            <Pressable onPress={handleSave} disabled={saving}
              style={({ pressed }) => [s.btn, saving && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Guardar meta</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  goalDepthScene: {
    position: 'absolute',
    right: -12,
    top: 82,
    width: 154,
    height: 128,
  },
  goalDepthCard: {
    width: 128,
    height: 76,
    borderRadius: 26,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: C.borderHi,
    transform: [{ rotate: '8deg' }],
  },
  goalTargetOuter: {
    width: 38,
    height: 38,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.brand + '66',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  goalTargetInner: {
    width: 26,
    height: 26,
    borderRadius: 12,
    backgroundColor: C.brandDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalDepthLine: {
    height: 7,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  goalDepthFloor: {
    position: 'absolute',
    width: 100,
    height: 12,
    borderRadius: 12,
    right: 28,
    bottom: 18,
    backgroundColor: C.cyan + '22',
  },
  goalDepthTick: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 13,
    right: 6,
    top: 2,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  hero: {
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
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: C.brandDim,
    borderWidth: 1,
    borderColor: C.brand + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroKicker: { color: C.brandMid || C.brand, fontSize: FONT.xs, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: C.text, fontSize: 26, fontWeight: '900', marginTop: 4 },
  heroSub: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, marginTop: 4 },
  card: { backgroundColor: C.glass, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.borderHi, overflow: 'hidden', ...SHADOWS.card },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  bodyText: { fontSize: FONT.md, fontWeight: '600', color: C.text },
  bigNum:   { fontSize: FONT.xxl, fontWeight: '900', color: C.text, letterSpacing: 0 },
  microText: { fontSize: FONT.xs, color: C.textMid },
  label:    { fontSize: FONT.xs, fontWeight: '700', color: C.textMid, marginBottom: 8, letterSpacing: 0.3 },

  deleteBtn: {
    width: 32, height: 32, borderRadius: RADIUS.sm,
    backgroundColor: C.surface2, justifyContent: 'center', alignItems: 'center',
  },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '800', color: C.text },
  emptySub:  { fontSize: FONT.sm, color: C.textMid, textAlign: 'center' },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: C.brand, borderRadius: RADIUS.pill, paddingHorizontal: 18, paddingVertical: 12, ...SHADOWS.brandGlow },
  emptyBtnText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, borderWidth: 1, borderColor: C.borderHi },
  sheetHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:   { fontSize: FONT.lg, fontWeight: '800', color: C.text },

  input: { backgroundColor: C.surface3, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: FONT.md, padding: 13, marginBottom: 20 },

  chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: C.surface3, borderWidth: 1, borderColor: C.border },
  chipActive: { borderColor: C.brand, backgroundColor: C.brandDim },
  chipText:   { fontSize: FONT.sm, fontWeight: '600', color: C.textMid },

  btn: { backgroundColor: C.brand, borderRadius: RADIUS.md, padding: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
});

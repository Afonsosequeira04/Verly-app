// src/screens/GrupoDetalheScreen.js
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator, StyleSheet, RefreshControl,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { gruposAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE, SHADOWS } from '../constants/theme';
import { formatMoney } from '../utils/money';

const C = COLORS;
const TABS = ['Resumo', 'Despesas', 'Acertos'];
const CATEGORIAS = ['Geral', 'Casa', 'Viagem', 'Supermercado', 'Restaurante', 'Transporte'];

const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';

const parseAmount = (value) => Number(String(value || '').replace(',', '.'));

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  } catch (_) {
    return value;
  }
};

function Avatar({ nome, size = 34, accent = C.brand }) {
  return (
    <View style={[styles.avatar, {
      width: size,
      height: size,
      borderRadius: size * 0.34,
      backgroundColor: `${accent}18`,
      borderColor: `${accent}55`,
    }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.32, color: accent }]}>{initials(nome)}</Text>
    </View>
  );
}

function EmptyState({ title, subtitle, action, onPress }) {
  return (
    <Animated.View entering={FadeIn} style={styles.empty}>
      <View style={styles.emptyIllustration}>
        <LinearGradient colors={['rgba(139,92,246,0.26)', 'rgba(34,212,253,0.08)']} style={styles.emptyShapeBack} />
        <LinearGradient colors={['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.05)']} style={styles.emptyShape}>
          <Text style={styles.emptyIcon}>€</Text>
          <View style={styles.emptyLine} />
          <View style={[styles.emptyLine, { width: 36, opacity: 0.55 }]} />
        </LinearGradient>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{subtitle}</Text>
      {!!action && (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryBtnGradient}>
            <Text style={styles.primaryBtnText}>{action}</Text>
          </LinearGradient>
        </Pressable>
      )}
    </Animated.View>
  );
}

export default function GrupoDetalheScreen({ route, navigation }) {
  const { grupoId } = route.params;
  const { user } = useAuth();
  const currentUserId = Number(user?.id);

  const [grupo, setGrupo] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [despesas, setDespesas] = useState([]);
  const [tab, setTab] = useState('Resumo');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalDespesa, setModalDespesa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    descricao: '',
    valor: '',
    categoria: 'Geral',
    pagador_id: null,
    participantes_ids: [],
    notas: '',
  });

  const membros = useMemo(() => {
    const byId = new Map();
    (grupo?.membros || []).forEach(membro => {
      if (membro?.id != null && !byId.has(membro.id)) byId.set(membro.id, membro);
    });
    return Array.from(byId.values());
  }, [grupo?.membros]);
  const resumoSeguro = resumo || {
    total_gasto: 0,
    total_despesas: 0,
    meu_saldo: 0,
    eu_devo: 0,
    devem_me: 0,
    saldos: [],
    acertos: [],
  };

  const minhaLinha = useMemo(
    () => (resumoSeguro.saldos || []).find(item => item.user_id === currentUserId),
    [resumoSeguro.saldos, currentUserId],
  );

  const carregar = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [grupoData, despesasData] = await Promise.all([
        gruposAPI.detalhe(grupoId),
        gruposAPI.despesas(grupoId),
      ]);
      setGrupo(grupoData);
      setDespesas(Array.isArray(despesasData?.despesas) ? despesasData.despesas : []);
      setResumo(despesasData?.resumo || null);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível carregar o grupo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [grupoId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const abrirNovaDespesa = () => {
    const ids = membros.map(m => m.id);
    const payer = ids.includes(currentUserId) ? currentUserId : ids[0];
    setForm({
      descricao: '',
      valor: '',
      categoria: 'Geral',
      pagador_id: payer || null,
      participantes_ids: ids,
      notas: '',
    });
    setModalDespesa(true);
  };

  const toggleParticipante = (id) => {
    setForm(prev => {
      const selected = prev.participantes_ids.includes(id);
      return {
        ...prev,
        participantes_ids: selected
          ? prev.participantes_ids.filter(item => item !== id)
          : [...prev.participantes_ids, id],
      };
    });
  };

  const guardarDespesa = async () => {
    const valor = parseAmount(form.valor);
    if (!form.descricao.trim()) {
      Alert.alert('Falta a descrição', 'Dá um nome simples à despesa.');
      return;
    }
    if (!valor || valor <= 0) {
      Alert.alert('Valor inválido', 'Indica um valor maior que zero.');
      return;
    }
    if (!form.pagador_id) {
      Alert.alert('Falta o pagador', 'Escolhe quem pagou esta despesa.');
      return;
    }
    if (!form.participantes_ids.length) {
      Alert.alert('Sem participantes', 'Escolhe pelo menos uma pessoa para dividir a despesa.');
      return;
    }

    setSaving(true);
    try {
      await gruposAPI.criarDespesa(grupoId, {
        descricao: form.descricao.trim(),
        valor,
        categoria: form.categoria,
        pagador_id: form.pagador_id,
        participantes_ids: form.participantes_ids,
        notas: form.notas.trim(),
        data: new Date().toISOString().slice(0, 10),
      });
      setModalDespesa(false);
      await carregar(true);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível guardar a despesa.');
    } finally {
      setSaving(false);
    }
  };

  const apagarDespesa = (despesa) => {
    Alert.alert('Remover despesa', `Remover "${despesa.descricao}" do grupo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await gruposAPI.apagarDespesa(grupoId, despesa.id);
            await carregar(true);
          } catch (e) {
            Alert.alert('Erro', e.message || 'Não foi possível remover a despesa.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  const saldo = Number(resumoSeguro.meu_saldo || 0);
  const saldoLabel = saldo > 0.009
    ? 'Tens a receber'
    : saldo < -0.009
      ? 'Tens a pagar'
      : 'Está tudo certo';
  const saldoColor = saldo > 0.009 ? C.green : saldo < -0.009 ? C.red : C.text;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.root}>
        <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
        <View style={styles.decorOrb} />
        <View style={styles.decorCard} />

        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Text style={styles.backTxt}>‹</Text>
          </Pressable>
          <View style={styles.groupIcon}>
            <Text style={styles.groupEmoji}>{grupo?.emoji || '€'}</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle} numberOfLines={1}>{grupo?.nome || 'Grupo'}</Text>
            <Text style={styles.headerSub}>{grupo?.total_membros || membros.length} membros · contas partilhadas</Text>
          </View>
          <Pressable onPress={abrirNovaDespesa} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
            <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addGradient}>
              <Text style={styles.addTxt}>+ Despesa</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {TABS.map(item => (
            <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}>
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(true); }} tintColor={C.brand} />}
        >
          {tab === 'Resumo' && (
            <>
              <Animated.View entering={FadeInDown.delay(40)} style={styles.balanceCard}>
                <LinearGradient colors={C.gradients.card} style={styles.balanceGradient}>
                  <View style={styles.balanceTop}>
                    <View>
                      <Text style={styles.kicker}>O teu saldo</Text>
                      <Text style={[styles.balanceValue, { color: saldoColor }]}>
                        {formatMoney(Math.abs(saldo), 'EUR')}
                      </Text>
                    </View>
                    <View style={[styles.balanceBadge, { backgroundColor: saldoColor === C.red ? C.redDim : saldoColor === C.green ? C.greenDim : C.glassHi }]}>
                      <Text style={[styles.balanceBadgeTxt, { color: saldoColor }]}>{saldoLabel}</Text>
                    </View>
                  </View>
                  {!!minhaLinha && (
                    <View style={styles.balanceFoot}>
                      <Text style={styles.balanceFootText}>Pagaste {formatMoney(minhaLinha.pago, 'EUR')}</Text>
                      <Text style={styles.balanceFootText}>A tua parte {formatMoney(minhaLinha.parte, 'EUR')}</Text>
                    </View>
                  )}
                </LinearGradient>
              </Animated.View>

              <View style={styles.statGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Total dividido</Text>
                  <Text style={styles.statValue}>{formatMoney(resumoSeguro.total_gasto, 'EUR')}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Despesas</Text>
                  <Text style={styles.statValue}>{resumoSeguro.total_despesas}</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Saldos do grupo</Text>
              {(resumoSeguro.saldos || []).length === 0 ? (
                <EmptyState
                  title="Sem saldos ainda"
                  subtitle="Adiciona a primeira despesa para veres quem deve pagar a quem."
                  action="Adicionar despesa"
                  onPress={abrirNovaDespesa}
                />
              ) : (
                (resumoSeguro.saldos || []).map((item, index) => (
                  <Animated.View key={item.user_id} entering={FadeInDown.delay(index * 40)} style={styles.balanceRow}>
                    <Avatar nome={item.nome} accent={item.saldo > 0 ? C.green : item.saldo < 0 ? C.red : C.brand} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{item.nome}</Text>
                      <Text style={styles.rowSub}>Pagou {formatMoney(item.pago, 'EUR')} · parte {formatMoney(item.parte, 'EUR')}</Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: item.saldo > 0 ? C.green : item.saldo < 0 ? C.red : C.textMid }]}>
                      {item.saldo > 0 ? '+' : item.saldo < 0 ? '-' : ''}
                      {formatMoney(Math.abs(item.saldo), 'EUR')}
                    </Text>
                  </Animated.View>
                ))
              )}
            </>
          )}

          {tab === 'Despesas' && (
            despesas.length === 0 ? (
              <EmptyState
                title="Ainda sem despesas"
                subtitle="Regista uma conta, escolhe quem pagou e divide automaticamente pelo grupo."
                action="Adicionar despesa"
                onPress={abrirNovaDespesa}
              />
            ) : (
              despesas.map((despesa, index) => (
                <Animated.View key={despesa.id} entering={FadeInDown.delay(index * 45)}>
                  <View style={styles.expenseCard}>
                    <LinearGradient colors={[C.brand, C.cyan, C.magenta]} style={styles.expenseAccent} />
                    <View style={styles.expenseHead}>
                      <View style={styles.expenseIcon}>
                        <Text style={styles.expenseIconText}>€</Text>
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.expenseTitle} numberOfLines={1}>{despesa.descricao}</Text>
                        <Text style={styles.rowSub}>{despesa.categoria} · {formatDate(despesa.data)}</Text>
                      </View>
                      <Text style={styles.expenseValue}>{formatMoney(despesa.valor, 'EUR')}</Text>
                    </View>
                    <View style={styles.expenseMeta}>
                      <Text style={styles.metaText}>Pago por {despesa.pagador?.nome || 'membro'}</Text>
                      <Text style={styles.metaText}>{despesa.total_participantes} participantes</Text>
                      <Text style={styles.metaText}>A tua parte {formatMoney(despesa.minha_parte, 'EUR')}</Text>
                    </View>
                    {!!despesa.notas && <Text style={styles.notes}>{despesa.notas}</Text>}
                    {despesa.pode_apagar && (
                      <Pressable onPress={() => apagarDespesa(despesa)} style={styles.removeBtn}>
                        <Text style={styles.removeTxt}>Remover</Text>
                      </Pressable>
                    )}
                  </View>
                </Animated.View>
              ))
            )
          )}

          {tab === 'Acertos' && (
            (resumoSeguro.acertos || []).length === 0 ? (
              <EmptyState
                title="Sem acertos pendentes"
                subtitle="Quando houver diferenças entre quem pagou e quem participou, os acertos aparecem aqui."
              />
            ) : (
              (resumoSeguro.acertos || []).map((acerto, index) => (
                <Animated.View key={`${acerto.de_user_id}-${acerto.para_user_id}-${index}`} entering={FadeInDown.delay(index * 45)} style={styles.settlementCard}>
                  <View style={styles.settlementPeople}>
                    <Avatar nome={acerto.de_nome} accent={acerto.sou_devedor ? C.red : C.brand} />
                    <View style={styles.settlementArrow}>
                      <Text style={styles.settlementArrowTxt}>→</Text>
                    </View>
                    <Avatar nome={acerto.para_nome} accent={acerto.sou_credor ? C.green : C.cyan} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.settlementTitle}>{acerto.de_nome} paga a {acerto.para_nome}</Text>
                    <Text style={styles.rowSub}>
                      {acerto.sou_devedor ? 'Ação para ti' : acerto.sou_credor ? 'Vais receber' : 'Acerto entre membros'}
                    </Text>
                  </View>
                  <Text style={styles.settlementValue}>{formatMoney(acerto.valor, 'EUR')}</Text>
                </Animated.View>
              ))
            )
          )}
        </ScrollView>

        <Modal visible={modalDespesa} transparent animationType="slide" onRequestClose={() => setModalDespesa(false)}>
          <View style={styles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalDespesa(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.sheet}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                  <View style={styles.sheetHandle} />
                  <Text style={styles.sheetTitle}>Nova despesa</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Jantar, supermercado, hotel..."
                    placeholderTextColor={C.textSub}
                    value={form.descricao}
                    onChangeText={value => setForm(prev => ({ ...prev, descricao: value }))}
                  />
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    placeholder="0,00"
                    placeholderTextColor={C.textSub}
                    value={form.valor}
                    onChangeText={value => setForm(prev => ({ ...prev, valor: value }))}
                    keyboardType="decimal-pad"
                  />

                  <Text style={styles.sheetLabel}>Categoria</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {CATEGORIAS.map(categoria => (
                      <Pressable
                        key={categoria}
                        onPress={() => setForm(prev => ({ ...prev, categoria }))}
                        style={[styles.chip, form.categoria === categoria && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, form.categoria === categoria && styles.chipTextActive]}>{categoria}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text style={styles.sheetLabel}>Pago por</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleRow}>
                    {membros.map(membro => (
                      <Pressable
                        key={membro.id}
                        onPress={() => setForm(prev => ({ ...prev, pagador_id: membro.id }))}
                        style={[styles.personChip, form.pagador_id === membro.id && styles.personChipActive]}
                      >
                        <Avatar nome={membro.nome} size={28} accent={form.pagador_id === membro.id ? C.cyan : C.brand} />
                        <Text style={styles.personText} numberOfLines={1}>{membro.nome}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text style={styles.sheetLabel}>Dividir por</Text>
                  <View style={styles.participants}>
                    {membros.map(membro => {
                      const selected = form.participantes_ids.includes(membro.id);
                      return (
                        <Pressable
                          key={membro.id}
                          onPress={() => toggleParticipante(membro.id)}
                          style={[styles.participantRow, selected && styles.participantRowActive]}
                        >
                          <Avatar nome={membro.nome} size={30} accent={selected ? C.green : C.textMid} />
                          <Text style={styles.participantName}>{membro.nome}</Text>
                          <View style={[styles.checkCircle, selected && styles.checkCircleActive]}>
                            {selected && <Text style={styles.checkTxt}>✓</Text>}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  <TextInput
                    style={[styles.input, { minHeight: 58 }]}
                    placeholder="Notas (opcional)"
                    placeholderTextColor={C.textSub}
                    value={form.notas}
                    onChangeText={value => setForm(prev => ({ ...prev, notas: value }))}
                    multiline
                  />
                </ScrollView>
                <View style={styles.sheetActions}>
                  <Pressable onPress={() => setModalDespesa(false)} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryTxt}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={guardarDespesa} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.65 }]}>
                    <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveGradient}>
                      {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Guardar despesa</Text>}
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  decorOrb: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 48,
    right: -70,
    top: 92,
    backgroundColor: 'rgba(139,92,246,0.10)',
    transform: [{ rotate: '18deg' }],
  },
  decorCard: {
    position: 'absolute',
    width: 96,
    height: 68,
    borderRadius: 20,
    left: -32,
    top: 180,
    backgroundColor: 'rgba(34,212,253,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '-12deg' }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  backTxt: { color: C.text, fontSize: 30, lineHeight: 30, marginTop: -3 },
  groupIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: C.glassHi,
    borderWidth: 1,
    borderColor: C.borderHi,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupEmoji: { fontSize: 22 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: C.text, fontSize: FONT.xl, fontWeight: '900' },
  headerSub: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  addBtn: { borderRadius: RADIUS.pill, ...SHADOWS.brandGlow },
  addGradient: { borderRadius: RADIUS.pill, paddingHorizontal: 13, paddingVertical: 10 },
  addTxt: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: SPACE.lg,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    padding: 4,
    gap: 4,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: RADIUS.sm },
  tabActive: { backgroundColor: C.glassHi },
  tabText: { color: C.textMid, fontSize: FONT.sm, fontWeight: '800' },
  tabTextActive: { color: C.text },
  scroll: { padding: SPACE.lg, paddingBottom: 120 },
  balanceCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.borderHi,
    marginBottom: SPACE.md,
    ...SHADOWS.card,
  },
  balanceGradient: { padding: SPACE.lg },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800', textTransform: 'uppercase' },
  balanceValue: { fontSize: 34, fontWeight: '900', marginTop: 4 },
  balanceBadge: { borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 7 },
  balanceBadgeTxt: { fontSize: FONT.xs, fontWeight: '900' },
  balanceFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: SPACE.lg,
    paddingTop: SPACE.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  balanceFootText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '700' },
  statGrid: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.lg },
  statCard: {
    flex: 1,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
  },
  statLabel: { color: C.textMid, fontSize: FONT.xs, fontWeight: '700' },
  statValue: { color: C.text, fontSize: FONT.lg, fontWeight: '900', marginTop: 6 },
  sectionTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900', marginBottom: SPACE.sm },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    gap: 12,
  },
  avatar: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: C.text, fontSize: FONT.md, fontWeight: '800' },
  rowSub: { color: C.textMid, fontSize: FONT.xs, marginTop: 3 },
  rowAmount: { fontSize: FONT.md, fontWeight: '900' },
  expenseCard: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    paddingLeft: SPACE.lg,
    marginBottom: SPACE.md,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  expenseAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  expenseHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  expenseIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: C.brandDim,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseIconText: { color: C.brandMid, fontWeight: '900', fontSize: 18 },
  expenseTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  expenseValue: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  expenseMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACE.md },
  metaText: {
    color: C.textMid,
    fontSize: FONT.xs,
    fontWeight: '700',
    backgroundColor: C.glassHi,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  notes: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, marginTop: SPACE.sm },
  removeBtn: { alignSelf: 'flex-start', marginTop: SPACE.sm, paddingVertical: 6, paddingHorizontal: 8 },
  removeTxt: { color: C.red, fontSize: FONT.xs, fontWeight: '800' },
  settlementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
  },
  settlementPeople: { flexDirection: 'row', alignItems: 'center' },
  settlementArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    marginHorizontal: -2,
    zIndex: 2,
  },
  settlementArrowTxt: { color: C.textMid, fontSize: FONT.sm, fontWeight: '900' },
  settlementTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  settlementValue: { color: C.green, fontSize: FONT.md, fontWeight: '900' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: SPACE.md },
  emptyIllustration: { width: 104, height: 92, marginBottom: SPACE.md },
  emptyShapeBack: {
    position: 'absolute',
    width: 76,
    height: 58,
    borderRadius: 18,
    right: 4,
    top: 7,
    transform: [{ rotate: '12deg' }],
  },
  emptyShape: {
    width: 76,
    height: 88,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: 14,
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  emptyIcon: { color: C.cyan, fontSize: 22, fontWeight: '900', marginBottom: 10 },
  emptyLine: { width: 48, height: 5, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 7 },
  emptyTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900', textAlign: 'center' },
  emptySub: { color: C.textMid, fontSize: FONT.sm, lineHeight: 20, textAlign: 'center', marginTop: 7, marginBottom: SPACE.md },
  primaryBtn: { borderRadius: RADIUS.pill, overflow: 'hidden', ...SHADOWS.brandGlow },
  primaryBtnGradient: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: RADIUS.pill },
  primaryBtnText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    paddingBottom: 22,
  },
  sheetContent: { paddingBottom: SPACE.md },
  sheetHandle: { width: 42, height: 4, borderRadius: 3, backgroundColor: C.borderHi, alignSelf: 'center', marginBottom: SPACE.md },
  sheetTitle: { color: C.text, fontSize: FONT.xxl, fontWeight: '900', marginBottom: SPACE.md },
  sheetLabel: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
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
  amountInput: { fontSize: 28, fontWeight: '900', paddingVertical: 10 },
  chipRow: { gap: 8, paddingBottom: SPACE.sm },
  chip: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.glass,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: C.brandDim, borderColor: 'rgba(139,92,246,0.45)' },
  chipText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
  chipTextActive: { color: C.brandMid },
  peopleRow: { gap: 8, paddingBottom: SPACE.sm },
  personChip: {
    width: 112,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.glass,
    padding: 9,
    gap: 7,
  },
  personChipActive: { borderColor: 'rgba(34,212,253,0.48)', backgroundColor: 'rgba(34,212,253,0.08)' },
  personText: { color: C.text, fontSize: FONT.xs, fontWeight: '800' },
  participants: { gap: 7, marginBottom: SPACE.sm },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    padding: 9,
  },
  participantRowActive: { borderColor: 'rgba(0,214,143,0.38)', backgroundColor: C.greenDim },
  participantName: { flex: 1, color: C.text, fontSize: FONT.sm, fontWeight: '800' },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: { borderColor: C.green, backgroundColor: C.green },
  checkTxt: { color: C.bg, fontSize: FONT.xs, fontWeight: '900' },
  sheetActions: {
    flexDirection: 'row',
    gap: SPACE.sm,
    paddingTop: SPACE.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: RADIUS.pill,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryTxt: { color: C.textMid, fontSize: FONT.sm, fontWeight: '900' },
  saveBtn: { flex: 1, borderRadius: RADIUS.pill, overflow: 'hidden', ...SHADOWS.brandGlow },
  saveGradient: { paddingVertical: 14, alignItems: 'center', borderRadius: RADIUS.pill },
  saveTxt: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
});

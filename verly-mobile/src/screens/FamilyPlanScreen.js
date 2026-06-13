import React, { useCallback, useMemo, useState } from 'react';
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
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  MailPlus,
  Plus,
  Shield,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react-native';

import { familiaAPI, perfilAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatMoney } from '../utils/money';

const C = COLORS;
const ROLES = [
  ['admin', 'Admin'],
  ['partner', 'Parceiro'],
  ['child', 'Crianca'],
  ['viewer', 'So leitura'],
];
const CATEGORIES = ['Casa', 'Alimentacao', 'Transportes', 'Saude', 'Educacao', 'Lazer', 'Subscricoes'];

function ProgressBar({ pct = 0, color = C.green }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, pct || 0))}%`, backgroundColor: color }]} />
    </View>
  );
}

function ModalShell({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export default function FamilyPlanScreen({ navigation }) {
  const [family, setFamily] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);

  const [nome, setNome] = useState('');
  const [orcamento, setOrcamento] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('partner');
  const [budgetCategory, setBudgetCategory] = useState(CATEGORIES[0]);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [accountIds, setAccountIds] = useState([]);

  const permissions = family?.permissions || {};
  const canManage = !!permissions.can_manage;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const perfil = await perfilAPI.get().catch(() => ({}));
      const nextCurrency = perfil.moeda_preferida || currency || 'EUR';
      setCurrency(nextCurrency);
      const data = await familiaAPI.get({ currency: nextCurrency });
      setFamily(data.family || null);
      setIncoming(data.incoming_invites || []);
      const selected = (data.family?.accounts || []).filter(acc => acc.selected).map(acc => acc.id);
      setAccountIds(selected);
    } catch (e) {
      Alert.alert('Plano familiar', e.message || 'Nao foi possivel carregar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currency]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => {
    setNome(family?.nome || '');
    setOrcamento(family?.orcamento_mensal ? String(family.orcamento_mensal) : '');
    setModal(family ? 'edit' : 'create');
  };

  const savePlan = async () => {
    try {
      const payload = { nome: nome.trim() || 'Plano familiar', orcamento_mensal: orcamento || 0, currency };
      if (family) await familiaAPI.atualizar(payload);
      else await familiaAPI.criar(payload);
      setModal(null);
      await load(true);
    } catch (e) {
      Alert.alert('Plano familiar', e.message || 'Nao foi possivel guardar.');
    }
  };

  const invite = async () => {
    if (!email.trim()) return Alert.alert('Convidar', 'Indica um email.');
    try {
      const data = await familiaAPI.convidar(email.trim(), inviteRole);
      setFamily(data.family || family);
      setEmail('');
      setModal(null);
      Alert.alert(
        'Convite criado',
        data.email_sent
          ? 'Enviei o convite por email.'
          : `Email nao configurado. Partilha este link: ${data.invite?.invite_link || data.invite?.deep_link || ''}`,
      );
    } catch (e) {
      Alert.alert('Convidar', e.message || 'Nao foi possivel convidar.');
    }
  };

  const respondInvite = async (inviteToken, accept) => {
    try {
      if (accept) await familiaAPI.aceitarConvite(inviteToken);
      else await familiaAPI.recusarConvite(inviteToken);
      await load(true);
    } catch (e) {
      Alert.alert('Convite', e.message || 'Nao foi possivel responder.');
    }
  };

  const saveAccounts = async () => {
    try {
      const data = await familiaAPI.atualizarContas(accountIds);
      setFamily(data.family || family);
      setModal(null);
    } catch (e) {
      Alert.alert('Contas', e.message || 'Nao foi possivel guardar contas.');
    }
  };

  const saveCategoryBudget = async () => {
    try {
      const data = await familiaAPI.salvarBudgetCategoria({ category: budgetCategory, amount: budgetAmount, currency });
      setFamily(data.family || family);
      setBudgetAmount('');
      setModal(null);
    } catch (e) {
      Alert.alert('Budget', e.message || 'Nao foi possivel guardar.');
    }
  };

  const deleteCategoryBudget = async (id) => {
    try {
      const data = await familiaAPI.apagarBudgetCategoria(id);
      setFamily(data.family || family);
    } catch (e) {
      Alert.alert('Budget', e.message || 'Nao foi possivel apagar.');
    }
  };

  const updateMemberRole = async (role) => {
    if (!selectedMember) return;
    try {
      const data = await familiaAPI.atualizarMembro(selectedMember.id, { role });
      setFamily(data.family || family);
      setSelectedMember(null);
      setModal(null);
    } catch (e) {
      Alert.alert('Membro', e.message || 'Nao foi possivel atualizar.');
    }
  };

  const removeMember = async () => {
    if (!selectedMember) return;
    Alert.alert('Remover membro', `Remover ${selectedMember.nome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          const data = await familiaAPI.removerMembro(selectedMember.id);
          setFamily(data.family || family);
          setSelectedMember(null);
          setModal(null);
        },
      },
    ]);
  };

  const markPersonal = async (expense) => {
    try {
      const data = await familiaAPI.marcarDespesa({
        source_type: expense.source_type,
        source_id: expense.source_id,
        include_family: false,
      });
      setFamily(data.family || family);
    } catch (e) {
      Alert.alert('Despesa', e.message || 'Nao foi possivel marcar.');
    }
  };

  const selectedAccountSet = useMemo(() => new Set(accountIds), [accountIds]);
  const toggleAccount = (id) => {
    setAccountIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={C.brand} size="large" /></View>;

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Plano familiar</Text>
          <Text style={styles.subtitle}>Orcamento, contas, membros e despesas familiares.</Text>
        </View>
        <Pressable onPress={family ? () => setModal('invite') : openCreate} style={styles.primaryIcon}>
          {family ? <MailPlus size={18} color="#fff" /> : <Plus size={18} color="#fff" />}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      >
        {!!incoming.length && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Convites para ti</Text>
            {incoming.map(invite => (
              <View key={invite.token} style={styles.inviteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{invite.family_name || 'Plano familiar'}</Text>
                  <Text style={styles.rowSub}>Papel: {invite.role_label}</Text>
                </View>
                <Pressable onPress={() => respondInvite(invite.token, false)} style={styles.ghostBtn}><Text style={styles.ghostText}>Recusar</Text></Pressable>
                <Pressable onPress={() => respondInvite(invite.token, true)} style={styles.okBtn}><Check size={14} color="#fff" /></Pressable>
              </View>
            ))}
          </View>
        )}

        {!family ? (
          <Animated.View entering={FadeInDown.delay(40)} style={styles.empty}>
            <Users size={32} color={C.brand} />
            <Text style={styles.emptyTitle}>Cria o teu plano</Text>
            <Text style={styles.emptyText}>Depois podes convidar pessoas, escolher contas partilhadas e separar despesas familiares das pessoais.</Text>
            <Pressable onPress={openCreate} style={styles.mainBtn}><Text style={styles.mainBtnText}>Criar plano</Text></Pressable>
          </Animated.View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(40)} style={styles.hero}>
              <Text style={styles.kicker}>{family.nome}</Text>
              <Text style={styles.heroValue}>{formatMoney(family.total_gasto_mes || 0, family.currency)}</Text>
              <Text style={styles.heroSub}>de {formatMoney(family.orcamento_mensal || 0, family.currency)} este mes</Text>
              <ProgressBar pct={family.pct_orcamento || 0} color={(family.pct_orcamento || 0) > 100 ? C.red : C.green} />
              <Text style={styles.modeText}>
                {family.sharing_mode === 'selected_accounts' ? 'A usar contas familiares escolhidas.' : 'A usar gastos gerais ate escolheres contas familiares.'}
              </Text>
            </Animated.View>

            <View style={styles.actionGrid}>
              <Pressable onPress={() => setModal('invite')} style={styles.actionCard}><MailPlus size={18} color={C.brand} /><Text style={styles.actionText}>Convidar</Text></Pressable>
              <Pressable onPress={openCreate} style={styles.actionCard}><Banknote size={18} color={C.green} /><Text style={styles.actionText}>Budget</Text></Pressable>
              <Pressable onPress={() => setModal('accounts')} style={styles.actionCard}><WalletCards size={18} color={C.cyan} /><Text style={styles.actionText}>Contas</Text></Pressable>
              <Pressable onPress={() => setModal('category')} style={styles.actionCard}><Shield size={18} color={C.yellow} /><Text style={styles.actionText}>Categorias</Text></Pressable>
            </View>

            {!!family.alerts?.length && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Alertas familiares</Text>
                {family.alerts.map((alert, index) => (
                  <View key={`${alert.type}-${index}`} style={styles.alertRow}>
                    <AlertTriangle size={15} color={alert.level === 'danger' ? C.red : alert.level === 'warning' ? C.yellow : C.cyan} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{alert.title}</Text>
                      <Text style={styles.rowSub}>{alert.message}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Membros</Text>
              {(family.membros || []).map(member => (
                <Pressable
                  key={member.id}
                  disabled={!canManage || member.role === 'owner'}
                  onPress={() => { setSelectedMember(member); setModal('member'); }}
                  style={styles.memberRow}
                >
                  <View style={styles.avatar}><Text style={styles.avatarText}>{(member.nome || '?').slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{member.nome}</Text>
                    <Text style={styles.memberEmail}>{member.email}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.memberValue}>{formatMoney(member.gasto_mes || 0, member.currency)}</Text>
                    <Text style={styles.rolePill}>{member.role_label}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Contas familiares</Text>
                <Pressable onPress={() => setModal('accounts')}><Text style={styles.linkText}>Gerir</Text></Pressable>
              </View>
              {(family.accounts || []).filter(acc => acc.selected).slice(0, 4).map(account => (
                <Text key={account.id} style={styles.accountLine}>{account.nome_banco} - {account.owner_name}</Text>
              ))}
              {!family.accounts?.some(acc => acc.selected) && <Text style={styles.emptyLine}>Nenhuma conta escolhida ainda.</Text>}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Budgets por categoria</Text>
                <Pressable onPress={() => setModal('category')}><Text style={styles.linkText}>Adicionar</Text></Pressable>
              </View>
              {(family.category_budgets || []).map(item => (
                <View key={item.id} style={styles.budgetRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.category}</Text>
                    <Text style={styles.rowSub}>{formatMoney(item.spent || 0, item.currency)} de {formatMoney(item.amount || 0, item.currency)}</Text>
                    <ProgressBar pct={item.pct || 0} color={(item.pct || 0) >= 100 ? C.red : C.cyan} />
                  </View>
                  {canManage && (
                    <Pressable onPress={() => deleteCategoryBudget(item.id)} style={styles.iconTiny}>
                      <Trash2 size={14} color={C.red} />
                    </Pressable>
                  )}
                </View>
              ))}
              {!family.category_budgets?.length && <Text style={styles.emptyLine}>Ainda sem budgets por categoria.</Text>}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Despesas familiares recentes</Text>
              {(family.recent_expenses || []).map(expense => (
                <View key={expense.id} style={styles.expenseRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{expense.merchant}</Text>
                    <Text style={styles.rowSub}>{expense.member_name} - {expense.category}</Text>
                  </View>
                  <Text style={styles.memberValue}>{formatMoney(expense.amount || 0, expense.currency)}</Text>
                  {permissions.can_mark_expenses && (
                    <Pressable onPress={() => markPersonal(expense)} style={styles.ghostBtn}>
                      <Text style={styles.ghostText}>Pessoal</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {!family.recent_expenses?.length && <Text style={styles.emptyLine}>Sem despesas familiares este mes.</Text>}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Timeline familiar</Text>
              {(family.timeline || []).map((event, index) => (
                <View key={`${event.type}-${event.date}-${index}`} style={styles.timelineRow}>
                  <View style={styles.timelineDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{event.title}</Text>
                    <Text style={styles.rowSub}>{event.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <ModalShell visible={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={family ? 'Editar plano familiar' : 'Novo plano familiar'}>
        <TextInput style={styles.input} placeholder="Nome" placeholderTextColor={C.textSub} value={nome} onChangeText={setNome} />
        <TextInput style={styles.input} placeholder="Orcamento mensal" placeholderTextColor={C.textSub} keyboardType="decimal-pad" value={orcamento} onChangeText={setOrcamento} />
        <Pressable onPress={savePlan} style={styles.saveBtn}><Text style={styles.saveText}>Guardar</Text></Pressable>
      </ModalShell>

      <ModalShell visible={modal === 'invite'} onClose={() => setModal(null)} title="Convidar membro">
        <TextInput style={styles.input} placeholder="email@exemplo.com" placeholderTextColor={C.textSub} autoCapitalize="none" value={email} onChangeText={setEmail} />
        <View style={styles.roleGrid}>
          {ROLES.map(([key, label]) => (
            <Pressable key={key} onPress={() => setInviteRole(key)} style={[styles.roleChoice, inviteRole === key && styles.roleChoiceActive]}>
              <Text style={[styles.roleChoiceText, inviteRole === key && { color: C.text }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={invite} style={styles.saveBtn}><Text style={styles.saveText}>Criar convite</Text></Pressable>
      </ModalShell>

      <ModalShell visible={modal === 'accounts'} onClose={() => setModal(null)} title="Contas no plano">
        <ScrollView style={{ maxHeight: 330 }}>
          {(family?.accounts || []).map(account => (
            <Pressable key={account.id} onPress={() => toggleAccount(account.id)} style={styles.accountPick}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{account.nome_banco}</Text>
                <Text style={styles.rowSub}>{account.owner_name}{account.iban ? ` - ${account.iban}` : ''}</Text>
              </View>
              <View style={[styles.checkBox, selectedAccountSet.has(account.id) && styles.checkBoxActive]}>
                {selectedAccountSet.has(account.id) && <Check size={14} color="#fff" />}
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={saveAccounts} style={styles.saveBtn}><Text style={styles.saveText}>Guardar contas</Text></Pressable>
      </ModalShell>

      <ModalShell visible={modal === 'category'} onClose={() => setModal(null)} title="Budget por categoria">
        <View style={styles.roleGrid}>
          {CATEGORIES.map(category => (
            <Pressable key={category} onPress={() => setBudgetCategory(category)} style={[styles.roleChoice, budgetCategory === category && styles.roleChoiceActive]}>
              <Text style={[styles.roleChoiceText, budgetCategory === category && { color: C.text }]}>{category}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={styles.input} placeholder="Valor mensal" placeholderTextColor={C.textSub} keyboardType="decimal-pad" value={budgetAmount} onChangeText={setBudgetAmount} />
        <Pressable onPress={saveCategoryBudget} style={styles.saveBtn}><Text style={styles.saveText}>Guardar budget</Text></Pressable>
      </ModalShell>

      <ModalShell visible={modal === 'member'} onClose={() => setModal(null)} title={selectedMember?.nome || 'Membro'}>
        <View style={styles.roleGrid}>
          {ROLES.map(([key, label]) => (
            <Pressable key={key} onPress={() => updateMemberRole(key)} style={styles.roleChoice}>
              <Text style={styles.roleChoiceText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={removeMember} style={styles.dangerBtn}><Trash2 size={15} color="#fff" /><Text style={styles.saveText}>Remover membro</Text></Pressable>
      </ModalShell>
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
  hero: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 14 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  heroValue: { color: C.text, fontSize: 32, fontWeight: '900', marginTop: 7 },
  heroSub: { color: C.textMid, fontSize: FONT.sm, marginTop: 3 },
  modeText: { color: C.textSub || C.textMid, fontSize: FONT.xs, marginTop: 9 },
  barTrack: { height: 7, backgroundColor: C.surface3, borderRadius: 999, marginTop: 14, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  actionCard: { width: '47.8%', minHeight: 74, backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: 12, justifyContent: 'space-between' },
  actionText: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  card: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900', marginBottom: 8 },
  linkText: { color: C.brandMid || C.brand, fontSize: FONT.sm, fontWeight: '900' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 },
  alertRow: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border },
  avatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.brand, fontWeight: '900' },
  memberName: { color: C.text, fontSize: FONT.md, fontWeight: '800' },
  memberEmail: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  memberValue: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  rolePill: { color: C.textMid, fontSize: FONT.xs, marginTop: 4 },
  rowTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  rowSub: { color: C.textMid, fontSize: FONT.xs, lineHeight: 17, marginTop: 2 },
  accountLine: { color: C.textMid, fontSize: FONT.sm, paddingVertical: 5 },
  emptyLine: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 11 },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 11 },
  timelineRow: { flexDirection: 'row', gap: 11, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 11 },
  timelineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.cyan, marginTop: 5 },
  ghostBtn: { minHeight: 32, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: C.text, fontSize: FONT.xs, fontWeight: '900' },
  okBtn: { width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  iconTiny: { width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  empty: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 22, alignItems: 'center', gap: 10 },
  emptyTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  emptyText: { color: C.textMid, fontSize: FONT.sm, textAlign: 'center', lineHeight: 20 },
  mainBtn: { backgroundColor: C.brand, borderRadius: 10, paddingHorizontal: 18, minHeight: 42, justifyContent: 'center' },
  mainBtnText: { color: '#fff', fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12, borderWidth: 1, borderColor: C.border, maxHeight: '86%' },
  sheetTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  input: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text, paddingHorizontal: 12, minHeight: 46 },
  saveBtn: { backgroundColor: C.brand, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  dangerBtn: { backgroundColor: C.red, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveText: { color: '#fff', fontWeight: '900' },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChoice: { minHeight: 36, borderRadius: RADIUS.sm, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  roleChoiceActive: { backgroundColor: C.brandDim, borderColor: C.brand },
  roleChoiceText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900' },
  accountPick: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 },
  checkBox: { width: 28, height: 28, borderRadius: 9, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: C.brand, borderColor: C.brand },
});

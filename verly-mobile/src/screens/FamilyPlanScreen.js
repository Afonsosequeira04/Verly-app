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
import { ArrowLeft, MailPlus, Plus, Users } from 'lucide-react-native';

import { familiaAPI, perfilAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatMoney } from '../utils/money';

const C = COLORS;

export default function FamilyPlanScreen({ navigation }) {
  const [family, setFamily] = useState(null);
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [inviteModal, setInviteModal] = useState(false);
  const [nome, setNome] = useState('');
  const [orcamento, setOrcamento] = useState('');
  const [email, setEmail] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const perfil = await perfilAPI.get().catch(() => ({}));
      const nextCurrency = perfil.moeda_preferida || currency;
      setCurrency(nextCurrency);
      const data = await familiaAPI.get({ currency: nextCurrency });
      setFamily(data.family || null);
    } catch (e) {
      Alert.alert('Plano familiar', e.message || 'Nao foi possivel carregar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currency]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const criar = async () => {
    try {
      await familiaAPI.criar({ nome: nome.trim() || 'Plano familiar', orcamento_mensal: orcamento || 0, currency });
      setModal(false);
      setNome('');
      setOrcamento('');
      load(true);
    } catch (e) {
      Alert.alert('Plano familiar', e.message || 'Nao foi possivel criar.');
    }
  };

  const convidar = async () => {
    if (!email.trim()) return;
    try {
      const data = await familiaAPI.convidar(email.trim());
      setFamily(data.family || family);
      setInviteModal(false);
      setEmail('');
    } catch (e) {
      Alert.alert('Convidar', e.message || 'Nao foi possivel convidar.');
    }
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
          <Text style={styles.subtitle}>Orcamento e despesas partilhadas.</Text>
        </View>
        {family ? (
          <Pressable onPress={() => setInviteModal(true)} style={styles.primaryIcon}><MailPlus size={18} color="#fff" /></Pressable>
        ) : (
          <Pressable onPress={() => setModal(true)} style={styles.primaryIcon}><Plus size={18} color="#fff" /></Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      >
        {!family ? (
          <Animated.View entering={FadeInDown.delay(40)} style={styles.empty}>
            <Users size={32} color={C.brand} />
            <Text style={styles.emptyTitle}>Cria o teu plano</Text>
            <Text style={styles.emptyText}>Partilha controlo de despesas, budget e progresso mensal com pessoas da casa.</Text>
            <Pressable onPress={() => setModal(true)} style={styles.mainBtn}><Text style={styles.mainBtnText}>Criar plano</Text></Pressable>
          </Animated.View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(40)} style={styles.hero}>
              <Text style={styles.kicker}>{family.nome}</Text>
              <Text style={styles.heroValue}>{formatMoney(family.total_gasto_mes || 0, family.currency)}</Text>
              <Text style={styles.heroSub}>de {formatMoney(family.orcamento_mensal || 0, family.currency)} este mes</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.min(100, family.pct_orcamento || 0)}%` }]} />
              </View>
            </Animated.View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Membros</Text>
              {(family.membros || []).map(member => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{(member.nome || '?').slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{member.nome}</Text>
                    <Text style={styles.memberEmail}>{member.email}</Text>
                  </View>
                  <Text style={styles.memberValue}>{formatMoney(member.gasto_mes || 0, member.currency)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Novo plano familiar</Text>
            <TextInput style={styles.input} placeholder="Nome" placeholderTextColor={C.textSub} value={nome} onChangeText={setNome} />
            <TextInput style={styles.input} placeholder="Orcamento mensal" placeholderTextColor={C.textSub} keyboardType="decimal-pad" value={orcamento} onChangeText={setOrcamento} />
            <Pressable onPress={criar} style={styles.saveBtn}><Text style={styles.saveText}>Criar</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={inviteModal} transparent animationType="slide" onRequestClose={() => setInviteModal(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setInviteModal(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Convidar membro</Text>
            <TextInput style={styles.input} placeholder="email@exemplo.com" placeholderTextColor={C.textSub} autoCapitalize="none" value={email} onChangeText={setEmail} />
            <Pressable onPress={convidar} style={styles.saveBtn}><Text style={styles.saveText}>Convidar</Text></Pressable>
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
  content: { padding: SPACE.lg, paddingTop: 0, paddingBottom: 100 },
  empty: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 22, alignItems: 'center', gap: 10 },
  emptyTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  emptyText: { color: C.textMid, fontSize: FONT.sm, textAlign: 'center', lineHeight: 20 },
  mainBtn: { backgroundColor: C.brand, borderRadius: 10, paddingHorizontal: 18, minHeight: 42, justifyContent: 'center' },
  mainBtnText: { color: '#fff', fontWeight: '900' },
  hero: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 14 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  heroValue: { color: C.text, fontSize: 30, fontWeight: '900', marginTop: 6 },
  heroSub: { color: C.textMid, fontSize: FONT.sm, marginTop: 2 },
  barTrack: { height: 7, backgroundColor: C.surface3, borderRadius: 999, marginTop: 14, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.green, borderRadius: 999 },
  card: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 14 },
  sectionTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900', marginBottom: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border },
  avatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.brand, fontWeight: '900' },
  memberName: { color: C.text, fontSize: FONT.md, fontWeight: '800' },
  memberEmail: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  memberValue: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12, borderWidth: 1, borderColor: C.border },
  sheetTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  input: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text, paddingHorizontal: 12, minHeight: 46 },
  saveBtn: { backgroundColor: C.brand, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '900' },
});

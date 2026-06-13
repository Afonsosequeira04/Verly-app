import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, CheckCircle2, Clock3, Mail, Radar, Send, X } from 'lucide-react-native';

import { perfilAPI, refundRadarAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatMoney } from '../utils/money';

const C = COLORS;

const STATUS_ACTIONS = [
  ['sent', 'Pedido enviado'],
  ['waiting', 'A espera'],
  ['refunded', 'Recebido'],
  ['dismissed', 'Ignorar'],
];

function urgencyColor(urgency) {
  if (urgency === 'alta') return C.red;
  if (urgency === 'media') return C.yellow;
  return C.brand;
}

export default function RefundRadarScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const perfil = await perfilAPI.get().catch(() => ({}));
      const nextCurrency = perfil.moeda_preferida || currency;
      setCurrency(nextCurrency);
      const res = await refundRadarAPI.listar({ currency: nextCurrency });
      setData(res);
    } catch (e) {
      Alert.alert('Refund Radar', e.message || 'Nao foi possivel carregar oportunidades.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currency]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const updateStatus = async (item, status) => {
    try {
      await refundRadarAPI.atualizarEstado({
        key: item.key,
        status,
        recovered_amount: status === 'refunded' ? item.amount : undefined,
        currency: item.currency,
      });
      setSelected(null);
      load(true);
    } catch (e) {
      Alert.alert('Refund Radar', e.message || 'Nao foi possivel atualizar.');
    }
  };

  const shareAction = async (item) => {
    const action = item.action || {};
    await Share.share({
      title: action.email_subject || item.title,
      message: `${action.email_subject || item.title}\n\n${action.email_body || action.support_message || item.message}`,
    });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.brand} size="large" /></View>;
  }

  const opportunities = data?.opportunities || [];

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Refund Radar</Text>
          <Text style={styles.subtitle}>Dinheiro recuperavel e prazos de acao.</Text>
        </View>
        <View style={styles.headerIcon}><Radar size={19} color={C.brand} /></View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      >
        <Animated.View entering={FadeInDown.delay(40)} style={styles.hero}>
          <Text style={styles.kicker}>Potencial recuperavel</Text>
          <Text style={styles.heroValue}>{formatMoney(data?.total_potential || 0, data?.currency || currency)}</Text>
          <Text style={styles.heroSub}>{data?.count || 0} oportunidade{data?.count === 1 ? '' : 's'} ativa{data?.count === 1 ? '' : 's'} · {data?.urgent_count || 0} urgente{data?.urgent_count === 1 ? '' : 's'}</Text>
        </Animated.View>

        {opportunities.length === 0 ? (
          <View style={styles.empty}>
            <CheckCircle2 size={30} color={C.green} />
            <Text style={styles.emptyTitle}>Nada a reclamar agora</Text>
            <Text style={styles.emptySub}>Continuo a procurar duplicados, prazos, subscricoes e acertos.</Text>
          </View>
        ) : opportunities.map((item, index) => {
          const color = urgencyColor(item.urgency);
          return (
            <Animated.View key={item.key} entering={FadeInDown.delay(70 + index * 45)}>
              <Pressable onPress={() => setSelected(item)} style={[styles.card, { borderLeftColor: color }]}>
                <View style={styles.cardTop}>
                  <View style={[styles.typeIcon, { backgroundColor: color + '18' }]}>
                    {item.type === 'duplicate_charge' ? <Radar size={16} color={color} /> : item.type === 'subscription_renewal' ? <Clock3 size={16} color={color} /> : <Mail size={16} color={color} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardMsg}>{item.message}</Text>
                  </View>
                  <Text style={styles.amount}>{formatMoney(item.display_amount || item.amount, item.display_currency || item.currency)}</Text>
                </View>
                <View style={styles.cardFoot}>
                  <Text style={[styles.badge, { color, borderColor: color + '44' }]}>{item.status_label}</Text>
                  {!!item.deadline && <Text style={styles.deadline}>Prazo {item.deadline}</Text>}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{selected?.title}</Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={10}><X size={18} color={C.textMid} /></Pressable>
            </View>
            <Text style={styles.sheetMsg}>{selected?.message}</Text>

            <Text style={styles.sectionTitle}>Mensagem pronta</Text>
            <View style={styles.draftBox}>
              <Text style={styles.draftSubject}>{selected?.action?.email_subject}</Text>
              <Text style={styles.draftText}>{selected?.action?.support_message || selected?.action?.email_body}</Text>
            </View>

            <Text style={styles.sectionTitle}>Checklist</Text>
            {(selected?.action?.checklist || []).map(step => (
              <Text key={step} style={styles.checkItem}>- {step}</Text>
            ))}

            <View style={styles.actionRow}>
              <Pressable onPress={() => shareAction(selected)} style={styles.shareBtn}>
                <Send size={15} color="#fff" />
                <Text style={styles.shareText}>Partilhar</Text>
              </Pressable>
              {STATUS_ACTIONS.map(([status, label]) => (
                <Pressable key={status} onPress={() => updateStatus(selected, status)} style={styles.statusBtn}>
                  <Text style={styles.statusText}>{label}</Text>
                </Pressable>
              ))}
            </View>
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
  headerIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  title: { color: C.text, fontSize: FONT.xl, fontWeight: '900' },
  subtitle: { color: C.textMid, fontSize: FONT.sm, marginTop: 2 },
  content: { padding: SPACE.lg, paddingTop: 0, paddingBottom: 120 },
  hero: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 14 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  heroValue: { color: C.text, fontSize: 32, fontWeight: '900', marginTop: 4 },
  heroSub: { color: C.textMid, fontSize: FONT.sm, marginTop: 3 },
  card: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  typeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900', lineHeight: 20 },
  cardMsg: { color: C.textMid, fontSize: FONT.sm, lineHeight: 18, marginTop: 3 },
  amount: { color: C.green, fontSize: FONT.sm, fontWeight: '900' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: FONT.xs, fontWeight: '900' },
  deadline: { color: C.textMid, fontSize: FONT.xs },
  empty: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 24, alignItems: 'center', gap: 9 },
  emptyTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  emptySub: { color: C.textMid, fontSize: FONT.sm, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '86%', backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: C.border, padding: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sheetTitle: { flex: 1, color: C.text, fontSize: FONT.lg, fontWeight: '900', lineHeight: 23 },
  sheetMsg: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, marginTop: 8 },
  sectionTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900', marginTop: 16, marginBottom: 8 },
  draftBox: { backgroundColor: C.surface2, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 },
  draftSubject: { color: C.text, fontSize: FONT.sm, fontWeight: '900', marginBottom: 8 },
  draftText: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19 },
  checkItem: { color: C.textMid, fontSize: FONT.sm, lineHeight: 21 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  shareBtn: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.brand, borderRadius: 10, paddingHorizontal: 12 },
  shareText: { color: '#fff', fontSize: FONT.xs, fontWeight: '900' },
  statusBtn: { minHeight: 38, justifyContent: 'center', borderRadius: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10 },
  statusText: { color: C.text, fontSize: FONT.xs, fontWeight: '900' },
});

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, Upload } from 'lucide-react-native';

import { perfilAPI, replayAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatMoney } from '../utils/money';

const C = COLORS;

export default function MonthlyReplayScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const perfil = await perfilAPI.get().catch(() => ({}));
      const nextCurrency = perfil.moeda_preferida || 'EUR';
      setCurrency(nextCurrency);
      const replay = await replayAPI.mensal({ currency: nextCurrency });
      setData(replay);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.brand} size="large" /></View>;
  }

  const replayCurrency = data?.currency || currency;
  const events = data?.events || [];

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Replay do mes</Text>
          <Text style={styles.subtitle}>Timeline dos momentos que mexeram com o teu dinheiro.</Text>
        </View>
        <View style={styles.headerBadge}><CalendarClock size={18} color={C.cyan} /></View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
      >
        <Animated.View entering={FadeInDown.delay(40)} style={styles.hero}>
          <Text style={styles.kicker}>{data?.month || 'Este mes'}</Text>
          <Text style={styles.heroValue}>{formatMoney(data?.total_spent || 0, replayCurrency)}</Text>
          <Text style={styles.heroSub}>
            {data?.summary?.days_with_spend || 0} dias com gastos - {data?.summary?.records || 0} movimentos
          </Text>
          {data?.summary?.budget_used_pct != null && (
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.min(100, data.summary.budget_used_pct)}%` }]} />
            </View>
          )}
        </Animated.View>

        <View style={styles.timeline}>
          <View style={styles.sectionTop}>
            <Clock3 size={16} color={C.cyan} />
            <Text style={styles.sectionTitle}>Eventos do mes</Text>
          </View>

          {events.length ? events.map((event, index) => (
            <Animated.View
              key={`${event.type}-${event.date}-${index}`}
              entering={FadeInDown.delay(80 + index * 45)}
              style={styles.timelineRow}
            >
              <View style={styles.timelineDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineTitle}>{event.title}</Text>
                <Text style={styles.timelineMsg}>{event.message}</Text>
              </View>
            </Animated.View>
          )) : (
            <View style={styles.empty}>
              <CheckCircle2 size={28} color={C.green} />
              <Text style={styles.emptyText}>Ainda nao ha eventos suficientes este mes.</Text>
              <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('ImportarDados')}>
                <Upload size={14} color="#fff" />
                <Text style={styles.emptyBtnText}>Ligar dados</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACE.lg, paddingTop: SPACE.xl },
  iconBtn: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerBadge: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: FONT.xl, fontWeight: '900' },
  subtitle: { color: C.textMid, fontSize: FONT.sm, marginTop: 2 },
  content: { padding: SPACE.lg, paddingTop: 0, paddingBottom: 110 },
  hero: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 14 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  heroValue: { color: C.text, fontSize: 34, fontWeight: '900', marginTop: 8 },
  heroSub: { color: C.textMid, fontSize: FONT.sm, marginTop: 4 },
  barTrack: { height: 7, backgroundColor: C.surface3, borderRadius: 999, marginTop: 14, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.cyan, borderRadius: 999 },
  timeline: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 15 },
  sectionTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  timelineRow: { flexDirection: 'row', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.border },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.cyan, marginTop: 5 },
  timelineTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  timelineMsg: { color: C.textMid, fontSize: FONT.sm, lineHeight: 18, marginTop: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: C.textMid, fontSize: FONT.sm, textAlign: 'center' },
  emptyBtn: { minHeight: 38, borderRadius: RADIUS.sm, backgroundColor: C.brand, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 4 },
  emptyBtnText: { color: '#fff', fontSize: FONT.xs, fontWeight: '900' },
});

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
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Mail, ShieldCheck, WalletCards } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, FONT, RADIUS, SPACE, SHADOWS } from '../constants/theme';
import { gmailAPI, openBankingAPI } from '../services/api';

const C = COLORS;

function SourceCard({ icon, title, body, status, action, onPress, accent = C.brand }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sourceCard, pressed && styles.pressed]}>
      <LinearGradient colors={['rgba(255,255,255,0.085)', 'rgba(255,255,255,0.035)']} style={styles.sourceGradient}>
        <View style={styles.sourceTop}>
          <View style={[styles.sourceIcon, { backgroundColor: `${accent}18`, borderColor: `${accent}44` }]}>
            {icon}
          </View>
          <View style={[styles.statusPill, { backgroundColor: status === 'Ligado' ? C.greenDim : C.brandDim }]}>
            <Text style={[styles.statusText, { color: status === 'Ligado' ? C.green : C.brandMid }]}>{status}</Text>
          </View>
        </View>
        <Text style={styles.sourceTitle}>{title}</Text>
        <Text style={styles.sourceBody}>{body}</Text>
        <View style={styles.actionRow}>
          <Text style={[styles.actionText, { color: accent }]}>{action}</Text>
          <ArrowRight size={14} color={accent} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export default function ImportScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bankStatus, setBankStatus] = useState(null);
  const [gmailStatus, setGmailStatus] = useState(null);

  const load = useCallback(async () => {
    try {
      const [bank, gmail] = await Promise.allSettled([
        openBankingAPI.status(),
        gmailAPI.status(),
      ]);
      setBankStatus(bank.status === 'fulfilled' ? bank.value : null);
      setGmailStatus(gmail.status === 'fulfilled' ? gmail.value : null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bankConnected = Number(bankStatus?.accounts_count || 0) > 0;
  const gmailConnected = !!gmailStatus?.ligado;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={styles.decorOrb} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={C.brand}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <ShieldCheck size={22} color={C.brandMid} />
          </View>
          <Text style={styles.title}>Importar dados</Text>
          <Text style={styles.subtitle}>
            Liga as fontes que alimentam faturas, subscricoes e cockpit. Sem graficos soltos aqui.
          </Text>
        </View>

        <SourceCard
          title="Banco"
          body="Liga Open Banking e sincroniza movimentos reais de forma segura."
          status={bankConnected ? 'Ligado' : bankStatus?.configured ? 'Disponivel' : 'Configurar'}
          action={bankConnected ? 'Gerir ligacao' : 'Ligar banco'}
          accent={C.brand}
          icon={<WalletCards size={22} color={C.brandMid} />}
          onPress={() => navigation.navigate('OpenBanking')}
        />

        <SourceCard
          title="Gmail"
          body="Importa recibos e confirmacoes de compra diretamente do email."
          status={gmailConnected ? 'Ligado' : 'Disponivel'}
          action={gmailConnected ? 'Sincronizar Gmail' : 'Ligar Gmail'}
          accent={C.cyan}
          icon={<Mail size={22} color={C.cyan} />}
          onPress={() => navigation.navigate('Gmail')}
        />

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>O que acontece depois?</Text>
          <Text style={styles.noteText}>
            As importacoes alimentam faturas, subscricoes, Ask Verly e o cockpit inteligente. A analise aparece nos ecras certos.
          </Text>
        </View>
      </ScrollView>
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
    right: -84,
    top: 100,
    backgroundColor: 'rgba(34,212,253,0.08)',
    transform: [{ rotate: '16deg' }],
  },
  content: { padding: SPACE.lg, paddingTop: 60, paddingBottom: 54 },
  header: { marginBottom: SPACE.lg },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brandDim,
    borderWidth: 1,
    borderColor: C.borderHi,
    marginBottom: SPACE.md,
  },
  title: { color: C.text, fontSize: 30, fontWeight: '900', letterSpacing: 0 },
  subtitle: { color: C.textMid, fontSize: FONT.sm, lineHeight: 20, marginTop: 8 },
  sourceCard: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    overflow: 'hidden',
    marginBottom: SPACE.md,
    ...SHADOWS.card,
  },
  sourceGradient: { padding: SPACE.lg },
  sourceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.lg },
  sourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusPill: { borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 7 },
  statusText: { fontSize: FONT.xs, fontWeight: '900' },
  sourceTitle: { color: C.text, fontSize: FONT.xl, fontWeight: '900' },
  sourceBody: { color: C.textMid, fontSize: FONT.sm, lineHeight: 20, marginTop: 7 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.lg },
  actionText: { fontSize: FONT.sm, fontWeight: '900' },
  noteCard: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
    marginTop: SPACE.sm,
  },
  noteTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  noteText: { color: C.textMid, fontSize: FONT.xs, lineHeight: 18, marginTop: 6 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
});

/**
 * verly-mobile/src/screens/GmailScreen.js
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking, Alert, RefreshControl,
} from 'react-native';
import { COLORS, FONT, SPACE, RADIUS } from '../constants/theme';
import { apiFetch } from '../services/api';

const gmailAPI = {
  authUrl:    () => apiFetch('/gmail/auth-url'),
  status:     () => apiFetch('/gmail/status'),
  sync:       () => apiFetch('/gmail/sync', { method: 'POST' }),
  disconnect: () => apiFetch('/gmail/disconnect', { method: 'DELETE' }),
};

function StatCard({ label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SenderChip({ name }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{name}</Text>
    </View>
  );
}

const KNOWN_STORES = [
  'Zara', 'H&M', 'FNAC', 'Worten', 'Amazon', 'Zalando',
  'Continente', 'Uber Eats', 'Glovo', 'Booking', 'Spotify', 'Netflix',
];

export default function GmailScreen({ navigation }) {
  const [status, setStatus]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await gmailAPI.status();
      setStatus(data);
    } catch (e) {
      console.warn('Erro ao carregar status Gmail:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    const handleUrl = ({ url }) => {
      if (url?.includes('gmail/callback')) {
        if (url.includes('success=true')) {
          loadStatus();
          handleSync(true);
        } else {
          Alert.alert('Erro', 'Não foi possível ligar o Gmail. Tenta novamente.');
        }
        setConnecting(false);
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub?.remove();
  }, [loadStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { auth_url } = await gmailAPI.authUrl();
      await Linking.openURL(auth_url);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível iniciar a ligação ao Gmail.');
      setConnecting(false);
    }
  };

  const handleSync = async (silent = false) => {
    if (syncing) return;
    setSyncing(true);
    setLastResult(null);
    try {
      const result = await gmailAPI.sync();
      setLastResult(result);
      await loadStatus();
      if (!silent && result.faturas_criadas === 0) {
        Alert.alert('Nada de novo', 'Não encontrámos emails de compra novos nos últimos 30 dias.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Erro ao sincronizar. Verifica a ligação e tenta novamente.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Desligar Gmail',
      'As faturas já importadas ficam guardadas. Queres mesmo desligar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desligar',
          style: 'destructive',
          onPress: async () => {
            try {
              await gmailAPI.disconnect();
              setStatus({ ligado: false });
              setLastResult(null);
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível desligar. Tenta novamente.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }

  const isConnected = status?.ligado;
  const ultimaSync  = status?.ultima_sync
    ? new Date(status.ultima_sync).toLocaleString('pt-PT', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  // ── Ecrã não ligado ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.notConnectedContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>📧</Text>
        </View>

        <Text style={styles.title}>Importar do Gmail</Text>
        <Text style={styles.subtitle}>
          Liga o teu Gmail e a Verly importa automaticamente os emails de
          confirmação de compra — sem teres de fazer upload de nada.
        </Text>

        <View style={styles.howCard}>
          <Text style={styles.howTitle}>Como funciona</Text>
          {[
            ['🔍', 'A Verly analisa apenas emails de confirmação de compras'],
            ['🤖', 'A IA extrai loja, valor e data automaticamente'],
            ['🔒', 'Nunca lemos emails pessoais — só confirmações de compra'],
            ['✅', 'Tens sempre controlo total — podes desligar quando quiseres'],
          ].map(([icon, text], i) => (
            <View key={i} style={styles.howRow}>
              <Text style={styles.howIcon}>{icon}</Text>
              <Text style={styles.howText}>{text}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Detetamos automaticamente</Text>
        <View style={styles.chipsRow}>
          {KNOWN_STORES.map(s => <SenderChip key={s} name={s} />)}
          <SenderChip name="e muito mais..." />
        </View>

        {/* BOTÃO — agora com margem top garantida */}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, connecting && styles.btnDisabled]}
          onPress={handleConnect}
          disabled={connecting}
          activeOpacity={0.8}
        >
          {connecting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.btnPrimaryText}>Ligar Gmail</Text>
          }
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          Permissão de leitura apenas. Não enviamos nem apagamos emails.
        </Text>
      </ScrollView>
    );
  }

  // ── Ecrã ligado ─────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.connectedContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          loadStatus();
        }} tintColor={COLORS.brand} />
      }
    >
      <View style={styles.connectedBadge}>
        <View style={styles.connectedDot} />
        <Text style={styles.connectedEmail}>{status.gmail_email}</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Faturas importadas"
          value={status.faturas_importadas ?? 0}
          color={COLORS.brand}
        />
        <StatCard
          label="Última sync"
          value={ultimaSync ?? '—'}
        />
      </View>

      {lastResult && lastResult.faturas_criadas > 0 && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>
            ✅ {lastResult.faturas_criadas} fatura{lastResult.faturas_criadas !== 1 ? 's' : ''} importada{lastResult.faturas_criadas !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.resultSub}>
            {lastResult.emails_analisados} emails analisados
          </Text>
        </View>
      )}

      {lastResult && lastResult.faturas_criadas === 0 && (
        <View style={[styles.resultCard, styles.resultCardNeutral]}>
          <Text style={styles.resultTitleNeutral}>Sem faturas novas</Text>
          <Text style={styles.resultSub}>
            {lastResult.emails_analisados} emails analisados
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary, syncing && styles.btnDisabled]}
        onPress={() => handleSync(false)}
        disabled={syncing}
        activeOpacity={0.8}
      >
        {syncing ? (
          <View style={styles.btnRow}>
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.btnPrimaryText}>A sincronizar...</Text>
          </View>
        ) : (
          <Text style={styles.btnPrimaryText}>Sincronizar agora</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.syncNote}>
        Analisa emails de confirmação de compra dos últimos 30 dias.
      </Text>

      <TouchableOpacity
        style={[styles.btn, styles.btnSecondary]}
        onPress={() => navigation.navigate('Faturas', { filtro: 'gmail' })}
        activeOpacity={0.8}
      >
        <Text style={styles.btnSecondaryText}>Ver faturas importadas do Gmail</Text>
      </TouchableOpacity>

      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>🔒 A tua privacidade</Text>
        <Text style={styles.privacyBody}>
          A Verly só lê emails com assuntos como "confirmação de pedido" ou "recibo".
          Nunca acedemos a emails pessoais, nem guardamos o conteúdo dos emails
          — apenas os dados extraídos (loja, valor, data).
        </Text>
      </View>

      <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
        <Text style={styles.disconnectText}>Desligar Gmail</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },

  // Ecrã não ligado — flexGrow garante que o scroll funciona e o botão aparece
  notConnectedContent: {
    flexGrow: 1,
    padding: SPACE.lg,
    alignItems: 'center',
    paddingBottom: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.lg,
    marginBottom: SPACE.md,
  },
  iconEmoji: { fontSize: 36 },
  title: {
    fontSize: FONT.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACE.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT.sm,
    color: COLORS.textSub,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACE.lg,
    maxWidth: 320,
  },

  howCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    width: '100%',
    marginBottom: SPACE.lg,
  },
  howTitle: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACE.sm,
  },
  howRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  howIcon: { fontSize: 16, marginTop: 1 },
  howText: {
    flex: 1,
    fontSize: FONT.xs,
    color: COLORS.textSub,
    lineHeight: 20,
  },

  sectionLabel: {
    fontSize: FONT.xs,
    color: COLORS.textSub,
    alignSelf: 'flex-start',
    marginBottom: SPACE.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACE.xl,
    alignSelf: 'flex-start',
  },
  chip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  chipText: { fontSize: FONT.xs, color: COLORS.textSub },

  privacyNote: {
    fontSize: 11,
    color: COLORS.textSub,
    textAlign: 'center',
    marginTop: SPACE.sm,
    opacity: 0.7,
  },

  // Ecrã ligado
  connectedContent: {
    flexGrow: 1,
    padding: SPACE.lg,
    paddingBottom: 40,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    gap: 10,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2ecc71',
  },
  connectedEmail: {
    fontSize: FONT.sm,
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
  },

  statsRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSub,
    marginTop: 4,
    textAlign: 'center',
  },

  resultCard: {
    backgroundColor: '#1a3a2a',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#2ecc71' + '40',
  },
  resultCardNeutral: {
    backgroundColor: COLORS.surface,
    borderColor: 'transparent',
  },
  resultTitle: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: '#2ecc71',
    marginBottom: 4,
  },
  resultTitleNeutral: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: COLORS.textSub,
    marginBottom: 4,
  },
  resultSub: {
    fontSize: FONT.xs,
    color: COLORS.textSub,
  },

  syncNote: {
    fontSize: FONT.xs,
    color: COLORS.textSub,
    textAlign: 'center',
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
  },

  privacyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  privacyTitle: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACE.sm,
  },
  privacyBody: {
    fontSize: FONT.xs,
    color: COLORS.textSub,
    lineHeight: 20,
  },

  disconnectBtn: {
    alignItems: 'center',
    paddingVertical: SPACE.md,
  },
  disconnectText: {
    fontSize: FONT.sm,
    color: COLORS.red,
  },

  // Botões
  btn: {
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: SPACE.sm,
    marginTop: SPACE.md,
    minHeight: 52,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: '#7C6FE0',
    borderWidth: 0,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FONT.md,
  },
  btnSecondary: {
    backgroundColor: COLORS.surface,
    marginBottom: SPACE.md,
  },
  btnSecondaryText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: FONT.sm,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
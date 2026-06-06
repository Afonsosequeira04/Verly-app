import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Building2,
  CheckCircle2,
  Link as LinkIcon,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { OPEN_BANKING_CALLBACK_URL, openBankingAPI } from '../services/api';

const C = COLORS;
function parseCallbackUrl(url) {
  const query = (url || '').split('?')[1] || '';
  return query.split('&').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key) acc[decodeURIComponent(key)] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function formatAmount(value, currency = 'EUR') {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
  }).format(amount);
}

function EmptyState({ configured }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <ShieldCheck size={24} color={configured ? C.brand : C.yellow} />
      </View>
      <Text style={styles.emptyTitle}>
        {configured ? 'Liga o teu banco' : 'Configuração pendente'}
      </Text>
      <Text style={styles.emptyText}>
        {configured
          ? 'Escolhe uma instituição para importar saldos e movimentos.'
          : 'Adiciona ENABLE_BANKING_APP_ID e a private key no backend.'}
      </Text>
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function OpenBankingScreen() {
  const [status, setStatus] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectingId, setConnectingId] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const configured = status?.configured;

  const filteredInstitutions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return institutions.slice(0, 25);
    return institutions
      .filter(item => (item.name || item.id || '').toLowerCase().includes(q))
      .slice(0, 25);
  }, [institutions, query]);

  const load = useCallback(async () => {
    try {
      const statusData = await openBankingAPI.status();
      setStatus(statusData);

      const [accountsData, transactionsData] = await Promise.all([
        openBankingAPI.accounts(),
        openBankingAPI.transactions({ limit: 20 }),
      ]);
      setAccounts(accountsData.accounts || []);
      setTransactions(transactionsData.transactions || []);

      if (statusData.configured) {
        const institutionsData = await openBankingAPI.institutions('PT');
        setInstitutions(institutionsData.institutions || []);
      }
    } catch (e) {
      Alert.alert('Open Banking', e.message || 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const result = await openBankingAPI.sync();
      const [accountsData, transactionsData, statusData] = await Promise.all([
        openBankingAPI.accounts(),
        openBankingAPI.transactions({ limit: 20 }),
        openBankingAPI.status(),
      ]);
      setAccounts(accountsData.accounts || []);
      setTransactions(transactionsData.transactions || []);
      setStatus(statusData);
      if (!silent) {
        Alert.alert('Sincronização concluída', `${result.imported || 0} movimentos importados.`);
      }
    } catch (e) {
      if (!silent) Alert.alert('Open Banking', e.message || 'Erro ao sincronizar.');
      throw e;
    } finally {
      setSyncing(false);
    }
  }, []);

  const finishCallback = useCallback(async (url) => {
    if (!url?.startsWith('verly://open-banking/callback')) return;
    const params = parseCallbackUrl(url);
    try {
      await openBankingAPI.callback({
        code: params.code,
        state: params.state,
        reference: params.reference || params.ref,
        error: params.error,
        error_description: params.error_description,
      });
      await handleSync(true);
    } catch (e) {
      Alert.alert('Open Banking', e.message || 'Não foi possível concluir a ligação.');
    } finally {
      setConnectingId(null);
      load();
    }
  }, [handleSync, load]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => finishCallback(url));
    Linking.getInitialURL().then(url => {
      if (url) finishCallback(url);
    });
    return () => sub?.remove();
  }, [finishCallback]);

  const handleConnect = async (institution) => {
    setConnectingId(institution.id);
    try {
      const result = await openBankingAPI.connect({
        institution_id: institution.id,
        institution_name: institution.name,
        country: institution.country || 'PT',
        redirect_url: OPEN_BANKING_CALLBACK_URL,
        psu_type: 'personal',
      });
      if (!result.auth_url) throw new Error('O fornecedor não devolveu um URL de autorização.');
      await Linking.openURL(result.auth_url);
    } catch (e) {
      setConnectingId(null);
      Alert.alert('Open Banking', e.message || 'Não foi possível iniciar a ligação.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Open Banking</Text>
          <Text style={styles.subtitle}>{status?.provider || 'enablebanking'}</Text>
        </View>
        <View style={styles.headerIcon}>
          <WalletCards size={22} color={C.brand} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
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
        <View style={styles.statsRow}>
          <Stat label="Contas" value={status?.accounts_count ?? accounts.length} />
          <Stat label="Movimentos" value={status?.transactions_count ?? transactions.length} />
        </View>

        {!configured && <EmptyState configured={false} />}

        {configured && (
          <>
            {accounts.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Contas ligadas</Text>
                  <Pressable
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                    onPress={() => handleSync(false)}
                    disabled={syncing}
                  >
                    {syncing
                      ? <ActivityIndicator size="small" color={C.brand} />
                      : <RefreshCw size={16} color={C.brand} />
                    }
                  </Pressable>
                </View>
                {accounts.map(account => (
                  <View key={account.id || account.account_id} style={styles.accountCard}>
                    <Building2 size={16} color={C.brand} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accountName}>{account.nome_banco || account.institution_id}</Text>
                      <Text style={styles.accountMeta}>{account.iban || account.account_id}</Text>
                    </View>
                    <CheckCircle2 size={16} color={C.green} />
                  </View>
                ))}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Instituições</Text>
              <View style={styles.searchBox}>
                <Search size={16} color={C.textMid} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Pesquisar banco"
                  placeholderTextColor={C.textMid}
                  style={styles.searchInput}
                  autoCorrect={false}
                />
              </View>

              {filteredInstitutions.length === 0 ? (
                <EmptyState configured />
              ) : filteredInstitutions.map(institution => {
                const connecting = connectingId === institution.id;
                return (
                  <Pressable
                    key={`${institution.country}-${institution.id}`}
                    style={({ pressed }) => [styles.bankCard, pressed && styles.pressed]}
                    onPress={() => handleConnect(institution)}
                    disabled={!!connectingId}
                  >
                    <View style={styles.bankIcon}>
                      <Building2 size={18} color={C.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bankName}>{institution.name || institution.id}</Text>
                      <Text style={styles.bankMeta}>{institution.country || 'PT'}{institution.beta ? ' · beta' : ''}</Text>
                    </View>
                    {connecting
                      ? <ActivityIndicator size="small" color={C.brand} />
                      : <LinkIcon size={17} color={C.textMid} />
                    }
                  </Pressable>
                );
              })}
            </View>

            {transactions.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Últimos movimentos</Text>
                {transactions.map(item => {
                  const isExpense = Number(item.amount) < 0;
                  return (
                    <View key={item.id} style={styles.transactionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.transactionText} numberOfLines={1}>
                          {item.merchant_name || item.description || 'Movimento'}
                        </Text>
                        <Text style={styles.transactionDate}>{item.booked_at || item.value_date || ''}</Text>
                      </View>
                      <Text style={[styles.transactionAmount, { color: isExpense ? C.red : C.green }]}>
                        {formatAmount(item.amount, item.currency)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.xl,
    paddingBottom: SPACE.md,
  },
  title: { fontSize: FONT.xxl, fontWeight: '800', color: C.text, letterSpacing: 0 },
  subtitle: { fontSize: FONT.sm, color: C.textMid, marginTop: 2 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brand + '20',
  },
  content: { paddingHorizontal: SPACE.lg, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.md },
  stat: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
  },
  statValue: { fontSize: FONT.xl, fontWeight: '900', color: C.text },
  statLabel: { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },
  section: { marginTop: SPACE.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  sectionTitle: {
    fontSize: FONT.sm,
    fontWeight: '800',
    color: C.text,
    marginBottom: SPACE.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACE.md,
    minHeight: 46,
    marginBottom: SPACE.sm,
  },
  searchInput: { flex: 1, color: C.text, fontSize: FONT.sm, paddingVertical: 10 },
  bankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    minHeight: 70,
  },
  bankIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brand + '18',
  },
  bankName: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  bankMeta: { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
  },
  accountName: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  accountMeta: { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  transactionText: { fontSize: FONT.sm, fontWeight: '600', color: C.text },
  transactionDate: { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },
  transactionAmount: { fontSize: FONT.sm, fontWeight: '800' },
  empty: {
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.lg,
    marginTop: SPACE.md,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brand + '18',
    marginBottom: SPACE.sm,
  },
  emptyTitle: { fontSize: FONT.md, fontWeight: '800', color: C.text, textAlign: 'center' },
  emptyText: {
    fontSize: FONT.xs,
    color: C.textMid,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  pressed: { opacity: 0.75 },
});

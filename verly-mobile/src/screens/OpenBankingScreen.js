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
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Link as LinkIcon,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, FONT, RADIUS, SPACE, SHADOWS } from '../constants/theme';
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

function formatDate(value) {
  if (!value) return 'Ainda sem sync';
  try {
    return new Date(value).toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return String(value);
  }
}

function EmptyState({ configured }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <ShieldCheck size={24} color={configured ? C.brand : C.yellow} />
      </View>
      <Text style={styles.emptyTitle}>
        {configured ? 'Escolhe o teu banco' : 'Configuracao pendente'}
      </Text>
      <Text style={styles.emptyText}>
        {configured
          ? 'Procura a instituicao e liga a conta para a Verly poder importar movimentos.'
          : 'Configura ENABLE_BANKING_APP_ID e a private key no backend para ativar esta ligacao.'}
      </Text>
    </View>
  );
}

function AccountCard({ account }) {
  return (
    <View style={styles.accountCard}>
      <View style={styles.accountIcon}>
        <Building2 size={17} color={C.cyan} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.accountName} numberOfLines={1}>{account.nome_banco || account.institution_id || 'Conta bancaria'}</Text>
        <Text style={styles.accountMeta} numberOfLines={1}>{account.iban || account.account_id}</Text>
      </View>
      <CheckCircle2 size={17} color={C.green} />
    </View>
  );
}

export default function OpenBankingScreen({ navigation }) {
  const [status, setStatus] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectingId, setConnectingId] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const configured = !!status?.configured;
  const latestSync = useMemo(() => {
    const connections = status?.connections || [];
    return connections.find(conn => conn.last_sync_at)?.last_sync_at;
  }, [status]);

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
      const accountsData = await openBankingAPI.accounts();
      setAccounts(accountsData.accounts || []);
      if (statusData.configured) {
        const institutionsData = await openBankingAPI.institutions('PT');
        setInstitutions(institutionsData.institutions || []);
      } else {
        setInstitutions([]);
      }
    } catch (e) {
      Alert.alert('Open Banking', e.message || 'Nao foi possivel carregar a ligacao.');
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
      await load();
      if (!silent) {
        Alert.alert('Sincronizacao concluida', `${result.imported || 0} movimentos importados.`);
      }
    } catch (e) {
      if (!silent) Alert.alert('Open Banking', e.message || 'Erro ao sincronizar.');
      throw e;
    } finally {
      setSyncing(false);
    }
  }, [load]);

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
      Alert.alert('Open Banking', e.message || 'Nao foi possivel concluir a ligacao.');
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
      if (!result.auth_url) throw new Error('O fornecedor nao devolveu um URL de autorizacao.');
      await Linking.openURL(result.auth_url);
    } catch (e) {
      setConnectingId(null);
      Alert.alert('Open Banking', e.message || 'Nao foi possivel iniciar a ligacao.');
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
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={styles.decorOrb} />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Open Banking</Text>
          <Text style={styles.subtitle}>Liga e sincroniza contas bancarias.</Text>
        </View>
        <View style={styles.headerIcon}>
          <WalletCards size={21} color={C.brandMid} />
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
        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View>
              <Text style={styles.kicker}>Estado</Text>
              <Text style={styles.statusTitle}>
                {accounts.length ? 'Banco ligado' : configured ? 'Pronto para ligar' : 'Nao configurado'}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: accounts.length ? C.greenDim : C.brandDim }]}>
              <Text style={[styles.statusBadgeText, { color: accounts.length ? C.green : C.brandMid }]}>
                {accounts.length ? `${accounts.length} conta${accounts.length !== 1 ? 's' : ''}` : status?.provider || 'provider'}
              </Text>
            </View>
          </View>
          <Text style={styles.statusCopy}>
            {accounts.length
              ? `Ultima sincronizacao: ${formatDate(latestSync)}`
              : 'A ligacao fica aqui. A analise dos gastos continua no dashboard e insights.'}
          </Text>
          {accounts.length > 0 && (
            <Pressable
              onPress={() => handleSync(false)}
              disabled={syncing}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, syncing && { opacity: 0.65 }]}
            >
              <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryGradient}>
                {syncing ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <RefreshCw size={16} color="#fff" />
                    <Text style={styles.primaryText}>Sincronizar banco</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}
        </View>

        {!configured && <EmptyState configured={false} />}

        {accounts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contas ligadas</Text>
            {accounts.map(account => (
              <AccountCard key={account.id || account.account_id} account={account} />
            ))}
          </View>
        )}

        {configured && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ligar outro banco</Text>
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
                    <Building2 size={18} color={C.brandMid} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.bankName} numberOfLines={1}>{institution.name || institution.id}</Text>
                    <Text style={styles.bankMeta}>{institution.country || 'PT'}{institution.beta ? ' - beta' : ''}</Text>
                  </View>
                  {connecting
                    ? <ActivityIndicator size="small" color={C.brand} />
                    : <LinkIcon size={17} color={C.textMid} />
                  }
                </Pressable>
              );
            })}
          </View>
        )}
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
    right: -86,
    top: 92,
    backgroundColor: 'rgba(139,92,246,0.10)',
    transform: [{ rotate: '18deg' }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  title: { fontSize: FONT.xxl, fontWeight: '900', color: C.text, letterSpacing: 0 },
  subtitle: { fontSize: FONT.sm, color: C.textMid, marginTop: 2 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brandDim,
    borderWidth: 1,
    borderColor: C.borderHi,
  },
  content: { paddingHorizontal: SPACE.lg, paddingBottom: 48 },
  statusCard: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    ...SHADOWS.card,
  },
  statusTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  statusTitle: { color: C.text, fontSize: FONT.xl, fontWeight: '900', marginTop: 4 },
  statusBadge: { borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 7 },
  statusBadgeText: { fontSize: FONT.xs, fontWeight: '900' },
  statusCopy: { color: C.textMid, fontSize: FONT.sm, lineHeight: 20, marginTop: SPACE.md },
  primaryBtn: { marginTop: SPACE.md, borderRadius: RADIUS.pill, overflow: 'hidden', ...SHADOWS.brandGlow },
  primaryGradient: {
    minHeight: 48,
    borderRadius: RADIUS.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
  section: { marginTop: SPACE.md },
  sectionTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900', marginBottom: SPACE.sm },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: C.glass,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
  },
  accountIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,212,253,0.10)',
  },
  accountName: { fontSize: FONT.sm, fontWeight: '900', color: C.text },
  accountMeta: { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.glass,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACE.md,
    minHeight: 48,
    marginBottom: SPACE.sm,
  },
  searchInput: { flex: 1, color: C.text, fontSize: FONT.sm, paddingVertical: 10 },
  bankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: C.glass,
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
    backgroundColor: C.brandDim,
  },
  bankName: { fontSize: FONT.sm, fontWeight: '900', color: C.text },
  bankMeta: { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },
  empty: {
    alignItems: 'center',
    backgroundColor: C.glass,
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
    backgroundColor: C.brandDim,
    marginBottom: SPACE.sm,
  },
  emptyTitle: { fontSize: FONT.md, fontWeight: '900', color: C.text, textAlign: 'center' },
  emptyText: {
    fontSize: FONT.xs,
    color: C.textMid,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
});

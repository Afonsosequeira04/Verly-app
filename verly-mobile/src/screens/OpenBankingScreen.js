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
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Link as LinkIcon,
  PieChart,
  RefreshCw,
  Repeat,
  Search,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MotiView } from 'moti';

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

function formatShortAmount(value) {
  const amount = Math.abs(Number(value || 0));
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k€`;
  return `${amount.toFixed(0)}€`;
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}`;
}

function sourceLabel(source) {
  return source === 'open_banking' ? 'Banco' : 'Fatura';
}

function BudgetBanner({ budget }) {
  if (!budget) return null;
  const danger = budget.estado === 'excedido';
  const warning = budget.estado === 'atencao';
  const color = danger ? C.red : warning ? C.yellow : C.green;
  const pct = Math.min(Number(budget.pct || 0), 140);

  return (
    <Animated.View entering={FadeInDown.delay(60).duration(360).springify()} style={[styles.budgetCard, { borderColor: color + '66' }]}>
      <View style={styles.budgetHeader}>
        <View style={[styles.budgetIcon, { backgroundColor: color + '18' }]}>
          {danger || warning
            ? <AlertTriangle size={17} color={color} />
            : <CheckCircle2 size={17} color={color} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.budgetTitle}>
            {danger ? 'Orçamento ultrapassado' : warning ? 'Aproxima-se do orçamento' : 'Dentro do orçamento'}
          </Text>
          <Text style={styles.budgetText}>
            {formatAmount(budget.gasto)} de {formatAmount(budget.orcamento)} este mês
          </Text>
        </View>
        <Text style={[styles.budgetPct, { color }]}>{Math.round(budget.pct)}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
      </View>
    </Animated.View>
  );
}

function MonthlyBars({ data = [] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(item => Number(item.total || 0)), 1);
  const visible = data.slice(-6);

  return (
    <Animated.View entering={FadeInDown.delay(110).duration(360).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <BarChart3 size={15} color={C.brand} />
          <Text style={styles.sectionTitle}>Evolução bancária</Text>
        </View>
      </View>
      <View style={styles.chartCard}>
        {visible.map((item, index) => {
          const height = Math.max((Number(item.total || 0) / max) * 90, 8);
          const month = String(item.mes || '').split('-')[1] || item.mes;
          return (
            <View key={`${item.mes}-${index}`} style={styles.monthCol}>
              <Text style={styles.monthValue}>{formatShortAmount(item.total)}</Text>
              <MotiView
                from={{ height: 4, opacity: 0.4 }}
                animate={{ height, opacity: 1 }}
                transition={{ type: 'timing', duration: 520 + index * 70 }}
                style={styles.monthBar}
              />
              <Text style={styles.monthLabel}>{month}</Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

function CategoryBars({ data = [] }) {
  const visible = data.slice(0, 5);
  if (!visible.length) return null;
  const max = Math.max(...visible.map(item => Number(item.valor ?? item.total ?? 0)), 1);

  return (
    <Animated.View entering={FadeInDown.delay(150).duration(360).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <PieChart size={15} color={C.brand} />
          <Text style={styles.sectionTitle}>Categorias do mês</Text>
        </View>
      </View>
      <View style={styles.categoryCard}>
        {visible.map((item, index) => {
          const total = Number(item.valor ?? item.total ?? 0);
          const pct = max > 0 ? Math.max((total / max) * 100, 4) : 4;
          return (
            <View key={`${item.categoria}-${index}`} style={styles.categoryRow}>
              <View style={styles.categoryTop}>
                <Text style={styles.categoryName} numberOfLines={1}>{item.categoria}</Text>
                <Text style={styles.categoryAmount}>{formatAmount(total)}</Text>
              </View>
              <View style={styles.categoryTrack}>
                <MotiView
                  from={{ width: '0%' }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'timing', duration: 500 + index * 70 }}
                  style={styles.categoryFill}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

function RecurringCard({ subscriptions = [] }) {
  if (!subscriptions.length) return null;
  const total = subscriptions.reduce((sum, item) => sum + Number(item.preco_mensal || 0), 0);
  const visible = subscriptions.slice(0, 3);

  return (
    <Animated.View entering={FadeInDown.delay(190).duration(360).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Repeat size={15} color={C.brand} />
          <Text style={styles.sectionTitle}>Subscrições recorrentes</Text>
        </View>
        <Text style={styles.sectionBadge}>{formatShortAmount(total)}/mês</Text>
      </View>
      <View style={styles.recurringCard}>
        {visible.map((item, index) => (
          <View key={`${item.nome}-${index}`} style={[styles.recurringRow, index < visible.length - 1 && styles.recurringBorder]}>
            <View style={styles.recurringIcon}>
              <Repeat size={13} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recurringName} numberOfLines={1}>{item.nome}</Text>
              <Text style={styles.recurringMeta}>{item.meses_pago || 1} meses detetados</Text>
            </View>
            <Text style={styles.recurringAmount}>{formatAmount(item.preco_mensal)}</Text>
          </View>
        ))}
        <Text style={styles.recurringFoot}>Impacto anual estimado: {formatAmount(total * 12)}</Text>
      </View>
    </Animated.View>
  );
}

export default function OpenBankingScreen() {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectingId, setConnectingId] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const configured = status?.configured;
  const financialSummary = summary?.summary;
  const monthSummary = financialSummary?.mes_atual || {};
  const categoryData = monthSummary.por_categoria?.length
    ? monthSummary.por_categoria
    : financialSummary?.por_categoria || [];
  const monthlyData = financialSummary?.por_mes || [];
  const sourceData = financialSummary?.fontes || [];
  const bankSource = sourceData.find(item => item.fonte === 'open_banking');
  const invoiceSource = sourceData.find(item => item.fonte === 'fatura');

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

      const [accountsData, transactionsData, summaryData] = await Promise.all([
        openBankingAPI.accounts(),
        openBankingAPI.transactions({ limit: 20 }),
        openBankingAPI.summary(),
      ]);
      setAccounts(accountsData.accounts || []);
      setTransactions(transactionsData.transactions || []);
      setSummary(summaryData || null);

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
      const [accountsData, transactionsData, statusData, summaryData] = await Promise.all([
        openBankingAPI.accounts(),
        openBankingAPI.transactions({ limit: 20 }),
        openBankingAPI.status(),
        openBankingAPI.summary(),
      ]);
      setAccounts(accountsData.accounts || []);
      setTransactions(transactionsData.transactions || []);
      setStatus(statusData);
      setSummary(summaryData || null);
      if (!silent) {
        const subs = result.subscriptions_detected
          ? `\n${result.subscriptions_detected} subscrições recorrentes detetadas.`
          : '';
        Alert.alert('Sincronização concluída', `${result.imported || 0} movimentos importados.${subs}`);
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
            {financialSummary && (
              <>
                <Animated.View entering={FadeInDown.duration(360).springify()} style={styles.heroPanel}>
                  <View style={styles.heroTop}>
                    <View>
                      <Text style={styles.heroLabel}>Gastos reais este mês</Text>
                      <Text style={styles.heroAmount}>{formatAmount(monthSummary.total || 0)}</Text>
                    </View>
                    <View style={styles.heroTrend}>
                      <TrendingUp size={15} color={C.brand} />
                      <Text style={styles.heroTrendText}>
                        {financialSummary.previsao_mensal
                          ? `~${formatShortAmount(financialSummary.previsao_mensal)} previsto`
                          : 'sem previsão'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sourceRow}>
                    <View style={styles.sourcePill}>
                      <WalletCards size={13} color={C.brand} />
                      <Text style={styles.sourceText}>Banco {formatShortAmount(bankSource?.total || 0)}</Text>
                    </View>
                    <View style={styles.sourcePill}>
                      <CalendarDays size={13} color={C.green} />
                      <Text style={styles.sourceText}>Faturas {formatShortAmount(invoiceSource?.total || 0)}</Text>
                    </View>
                    {summary?.metas?.some(meta => meta.estado !== 'ok') && (
                      <View style={[styles.sourcePill, { borderColor: C.yellow + '55' }]}>
                        <AlertTriangle size={13} color={C.yellow} />
                        <Text style={[styles.sourceText, { color: C.yellow }]}>Metas em alerta</Text>
                      </View>
                    )}
                  </View>
                </Animated.View>

                <BudgetBanner budget={summary?.budget} />
                <MonthlyBars data={monthlyData} />
                <CategoryBars data={categoryData} />
                <RecurringCard subscriptions={summary?.subscriptions || []} />
              </>
            )}

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
                        <View style={styles.transactionMetaRow}>
                          <Text style={styles.transactionDate}>{formatDate(item.booked_at || item.value_date)}</Text>
                          {!!item.categoria && (
                            <View style={styles.categoryPill}>
                              <Text style={styles.categoryPillText}>{item.categoria}</Text>
                            </View>
                          )}
                          <View style={styles.sourceMiniPill}>
                            <Text style={styles.sourceMiniText}>{sourceLabel(item.source)}</Text>
                          </View>
                        </View>
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
  heroPanel: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.md,
    marginTop: SPACE.sm,
    marginBottom: SPACE.sm,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  heroLabel: { fontSize: FONT.xs, color: C.textMid, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroAmount: { fontSize: 30, color: C.text, fontWeight: '900', marginTop: 4, letterSpacing: 0 },
  heroTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.brand + '14',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroTrendText: { color: C.brand, fontSize: FONT.xs, fontWeight: '700' },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACE.md },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: C.borderHi,
    backgroundColor: C.surface2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sourceText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '700' },
  budgetCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACE.md,
    marginTop: SPACE.sm,
  },
  budgetHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  budgetIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '800' },
  budgetText: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  budgetPct: { fontSize: FONT.lg, fontWeight: '900' },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: C.surface3,
    overflow: 'hidden',
    marginTop: SPACE.sm,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  section: { marginTop: SPACE.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: {
    fontSize: FONT.sm,
    fontWeight: '800',
    color: C.text,
    marginBottom: SPACE.sm,
  },
  sectionBadge: { color: C.brand, fontSize: FONT.xs, fontWeight: '800' },
  chartCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 142,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
  },
  monthCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 110 },
  monthValue: { color: C.textMid, fontSize: 9, fontWeight: '800', minHeight: 14 },
  monthBar: { width: '72%', maxWidth: 24, minHeight: 8, borderRadius: 5, backgroundColor: C.brand, marginTop: 4 },
  monthLabel: { color: C.textMid, fontSize: 10, fontWeight: '700', marginTop: 6 },
  categoryCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
  },
  categoryRow: { marginBottom: SPACE.sm },
  categoryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, marginBottom: 6 },
  categoryName: { color: C.text, fontSize: FONT.sm, fontWeight: '700', flex: 1 },
  categoryAmount: { color: C.text, fontSize: FONT.sm, fontWeight: '800' },
  categoryTrack: { height: 7, borderRadius: 4, backgroundColor: C.surface3, overflow: 'hidden' },
  categoryFill: { height: '100%', borderRadius: 4, backgroundColor: C.green },
  recurringCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
  },
  recurringRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: 9 },
  recurringBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  recurringIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    backgroundColor: C.brand + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurringName: { color: C.text, fontSize: FONT.sm, fontWeight: '700' },
  recurringMeta: { color: C.textMid, fontSize: FONT.xs, marginTop: 1 },
  recurringAmount: { color: C.brand, fontSize: FONT.sm, fontWeight: '800' },
  recurringFoot: { color: C.textMid, fontSize: FONT.xs, marginTop: SPACE.sm, textAlign: 'right' },
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
  transactionMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  transactionDate: { fontSize: FONT.xs, color: C.textMid },
  categoryPill: {
    borderRadius: RADIUS.pill,
    backgroundColor: C.brand + '14',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryPillText: { color: C.brand, fontSize: 10, fontWeight: '700' },
  sourceMiniPill: {
    borderRadius: RADIUS.pill,
    backgroundColor: C.surface3,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sourceMiniText: { color: C.textMid, fontSize: 10, fontWeight: '700' },
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

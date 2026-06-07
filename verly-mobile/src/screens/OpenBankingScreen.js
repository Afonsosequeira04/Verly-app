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
  Building2,
  CalendarDays,
  CheckCircle2,
  Link as LinkIcon,
  RefreshCw,
  Repeat,
  Search,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MotiView } from 'moti';

import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { OPEN_BANKING_CALLBACK_URL, openBankingAPI } from '../services/api';
import { formatCompactMoney, formatMoney } from '../utils/money';
import { FinancialChartsPanel, FinancialChartsSkeleton } from '../components/FinancialCharts';
import IntelligenceDeck from '../components/IntelligenceDeck';

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
  return formatMoney(value, currency);
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

function formatShortAmount(value, currency = 'EUR') {
  return formatCompactMoney(value, currency);
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

function movementKindLabel(kind, isSpending) {
  if (kind === 'savings') return 'Poupanca';
  if (kind === 'transfer') return 'Transferencia';
  if (kind === 'income') return 'Entrada';
  return isSpending ? 'Gasto' : 'Movimento';
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function BudgetBanner({ budget }) {
  if (!budget) return null;
  const mismatch = budget.currency_mismatch || budget.estado === 'moeda_diferente';
  const danger = budget.estado === 'excedido';
  const warning = budget.estado === 'atencao';
  const color = mismatch ? C.yellow : danger ? C.red : warning ? C.yellow : C.green;
  const pct = Math.min(Number(budget.pct || 0), 140);

  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 360, delay: 60 }}
      style={[styles.budgetCard, { borderColor: color + '66' }]}
    >
      <View style={styles.budgetHeader}>
        <View style={[styles.budgetIcon, { backgroundColor: color + '18' }]}>
          {danger || warning
            ? <AlertTriangle size={17} color={color} />
            : <CheckCircle2 size={17} color={color} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.budgetTitle}>
            {mismatch ? 'Orcamento noutra moeda' : danger ? 'Orçamento ultrapassado' : warning ? 'Aproxima-se do orçamento' : 'Dentro do orçamento'}
          </Text>
          <Text style={styles.budgetText}>
            {mismatch
              ? `${budget.currency} definido; movimentos ativos em ${budget.active_currency}`
              : `${formatAmount(budget.gasto, budget.currency)} de ${formatAmount(budget.orcamento, budget.currency)} este mês`}
          </Text>
        </View>
        <Text style={[styles.budgetPct, { color }]}>
          {mismatch ? budget.active_currency : `${Math.round(budget.pct)}%`}
        </Text>
      </View>
      {!mismatch && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
        </View>
      )}
    </MotiView>
  );
}

function RecurringCard({ subscriptions = [], currency = 'EUR' }) {
  if (!subscriptions.length) return null;
  const totalsByCurrency = subscriptions.reduce((acc, item) => {
    const code = item.currency || currency;
    acc[code] = (acc[code] || 0) + Number(item.preco_mensal || 0);
    return acc;
  }, {});
  const total = totalsByCurrency[currency] ?? Object.values(totalsByCurrency)[0] ?? 0;
  const totalCurrency = totalsByCurrency[currency] != null ? currency : Object.keys(totalsByCurrency)[0] || currency;
  const visible = subscriptions.slice(0, 3);

  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 360, delay: 190 }}
      style={styles.section}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Repeat size={15} color={C.brand} />
          <Text style={styles.sectionTitle}>Subscrições recorrentes</Text>
        </View>
        <Text style={styles.sectionBadge}>{formatShortAmount(total, totalCurrency)}/mês</Text>
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
            <Text style={styles.recurringAmount}>{formatAmount(item.preco_mensal, item.currency || currency)}</Text>
          </View>
        ))}
        <Text style={styles.recurringFoot}>Impacto anual estimado: {formatAmount(total * 12, totalCurrency)}</Text>
      </View>
    </MotiView>
  );
}

function CurrencyStrip({ summary, onSelect }) {
  const currencies = summary?.available_currencies || [];
  if (!currencies.length) return null;
  return (
    <View style={styles.currencyRow}>
      {currencies.slice(0, 3).map(item => {
        const active = item.currency === summary.currency;
        return (
          <Pressable
            key={item.currency}
            onPress={() => onSelect?.(item.currency)}
            style={[styles.currencyPill, active && styles.currencyPillActive]}
          >
            <Text style={[styles.currencyCode, active && styles.currencyCodeActive]}>{item.currency}</Text>
            <Text style={styles.currencyTotal}>{formatShortAmount(item.total, item.currency)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ExcludedMovementsCard({ excluded }) {
  if (!excluded?.count) return null;
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 360, delay: 130 }}
      style={styles.excludedCard}
    >
      <View style={styles.excludedHeader}>
        <View style={styles.sectionTitleRow}>
          <ShieldCheck size={15} color={C.green} />
          <Text style={styles.sectionTitle}>Movimentos fora dos gastos</Text>
        </View>
        <Text style={styles.excludedCount}>{excluded.count}</Text>
      </View>
      <View style={styles.excludedTotals}>
        {(excluded.total_by_currency || []).map(item => (
          <View key={item.currency} style={styles.excludedPill}>
            <Text style={styles.excludedPillText}>{formatShortAmount(item.total, item.currency)}</Text>
          </View>
        ))}
      </View>
      {(excluded.examples || []).slice(0, 3).map((item, index) => (
        <View key={`${item.loja}-${index}`} style={styles.excludedRow}>
          <Text style={styles.excludedName} numberOfLines={1}>{item.loja}</Text>
          <Text style={styles.excludedMeta}>{movementKindLabel(item.tipo, false)}</Text>
          <Text style={styles.excludedAmount}>{formatAmount(item.valor, item.currency)}</Text>
        </View>
      ))}
    </MotiView>
  );
}

export default function OpenBankingScreen({ navigation }) {
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
  const [selectedCurrency, setSelectedCurrency] = useState(null);

  const configured = status?.configured;
  const financialSummary = summary?.summary;
  const monthSummary = financialSummary?.mes_atual || {};
  const activeCurrency = monthSummary.currency || financialSummary?.currency || 'EUR';
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
        openBankingAPI.summary(selectedCurrency ? { currency: selectedCurrency } : {}),
      ]);
      setAccounts(accountsData.accounts || []);
      setTransactions(transactionsData.transactions || []);
      setSummary(summaryData || null);
      if (!selectedCurrency && summaryData?.summary?.currency) {
        setSelectedCurrency(summaryData.summary.currency);
      }

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
  }, [selectedCurrency]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const result = await openBankingAPI.sync();
      const [accountsData, transactionsData, statusData, summaryData] = await Promise.all([
        openBankingAPI.accounts(),
        openBankingAPI.transactions({ limit: 20 }),
        openBankingAPI.status(),
        openBankingAPI.summary(selectedCurrency ? { currency: selectedCurrency } : {}),
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
  }, [selectedCurrency]);

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
      <View style={styles.loadingRoot}>
        <FinancialChartsSkeleton title="A sincronizar Open Banking" />
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
                <MotiView
                  from={{ opacity: 0, translateY: 12 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 360 }}
                  style={styles.heroPanel}
                >
                  <View style={styles.heroTop}>
                    <View>
                      <Text style={styles.heroLabel}>Gastos reais este mês</Text>
                      <Text style={styles.heroAmount}>{formatAmount(monthSummary.total || 0, activeCurrency)}</Text>
                    </View>
                    <View style={styles.heroTrend}>
                      <TrendingUp size={15} color={C.brand} />
                      <Text style={styles.heroTrendText}>
                        {financialSummary.previsao_mensal
                          ? `~${formatShortAmount(financialSummary.previsao_mensal, financialSummary.previsao_currency || activeCurrency)} previsto`
                          : 'sem previsão'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sourceRow}>
                    <View style={styles.sourcePill}>
                      <WalletCards size={13} color={C.brand} />
                      <Text style={styles.sourceText}>Banco {formatShortAmount(bankSource?.total || 0, bankSource?.currency || activeCurrency)}</Text>
                    </View>
                    <View style={styles.sourcePill}>
                      <CalendarDays size={13} color={C.green} />
                      <Text style={styles.sourceText}>Faturas {formatShortAmount(invoiceSource?.total || 0, invoiceSource?.currency || activeCurrency)}</Text>
                    </View>
                    {summary?.metas?.some(meta => meta.estado !== 'ok') && (
                      <View style={[styles.sourcePill, { borderColor: C.yellow + '55' }]}>
                        <AlertTriangle size={13} color={C.yellow} />
                        <Text style={[styles.sourceText, { color: C.yellow }]}>Metas em alerta</Text>
                      </View>
                    )}
                  </View>
                </MotiView>

                <CurrencyStrip
                  summary={financialSummary}
                  onSelect={(currency) => {
                    setSelectedCurrency(currency);
                    setLoading(true);
                  }}
                />
                <IntelligenceDeck
                  intelligence={summary?.financial_intelligence}
                  navigation={navigation}
                  compact
                  title="Leitura do banco"
                />
                <BudgetBanner budget={summary?.budget} />
                <ExcludedMovementsCard excluded={financialSummary.excluded} />
                <View style={styles.chartPanelWrap}>
                  <FinancialChartsPanel
                    title="Open Banking vivo"
                    subtitle="Movimentos, categorias e evolucao vindos diretamente do banco."
                    categories={categoryData}
                    months={monthlyData}
                    itemsByCategory={monthSummary.itens_por_categoria || {}}
                    sources={sourceData}
                    currency={activeCurrency}
                  />
                </View>
                <RecurringCard subscriptions={summary?.subscriptions || []} currency={activeCurrency} />
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
                  const isExpense = item.is_spending ?? Number(item.amount) < 0;
                  const kindLabel = movementKindLabel(item.kind, isExpense);
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
                          <View style={styles.kindMiniPill}>
                            <Text style={styles.kindMiniText}>{kindLabel}</Text>
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
  loadingRoot: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', paddingHorizontal: SPACE.lg },
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
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACE.sm, marginBottom: SPACE.xs },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  currencyPillActive: { borderColor: C.brand + '66', backgroundColor: C.brand + '14' },
  currencyCode: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900' },
  currencyCodeActive: { color: C.brand },
  currencyTotal: { color: C.textMid, fontSize: FONT.xs, fontWeight: '700' },
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
  chartPanelWrap: { marginTop: SPACE.md },
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
  excludedCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.green + '35',
    padding: SPACE.md,
    marginTop: SPACE.sm,
  },
  excludedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  excludedCount: { color: C.green, fontSize: FONT.sm, fontWeight: '900' },
  excludedTotals: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },
  excludedPill: {
    backgroundColor: C.green + '12',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  excludedPillText: { color: C.green, fontSize: FONT.xs, fontWeight: '800' },
  excludedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingTop: 8 },
  excludedName: { flex: 1, color: C.text, fontSize: FONT.xs, fontWeight: '700' },
  excludedMeta: { color: C.textMid, fontSize: 10, fontWeight: '700' },
  excludedAmount: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
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
  kindMiniPill: {
    borderRadius: RADIUS.pill,
    backgroundColor: C.green + '14',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  kindMiniText: { color: C.green, fontSize: 10, fontWeight: '800' },
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

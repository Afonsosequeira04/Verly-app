import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bell,
  Brain,
  CalendarDays,
  LineChart,
  Radar,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  WalletCards,
} from 'lucide-react-native';

import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatCompactMoney } from '../utils/money';
import { BitReveal, KineticPressable, SignalPill } from './AnimatedBits';

const C = COLORS;

function priorityColor(priority) {
  if (priority === 'critical') return C.red;
  if (priority === 'high') return C.yellow;
  if (priority === 'medium') return C.brand;
  return C.green;
}

function routeToLabel(route, action) {
  if (action === 'upload') return 'Adicionar';
  if (route === 'ImportarDados' || route === 'OpenBanking') return 'Banco';
  if (route === 'MinhasSubscricoes') return 'Subscricoes';
  if (route === 'LiveDeals') return 'Live Deals';
  if (route === 'RefundRadar') return 'Reembolsos';
  if (route === 'Bills') return 'Bills';
  if (route === 'Metas') return 'Metas';
  if (route === 'Estatisticas') return 'Analise';
  if (route === 'Score') return 'Live Deals';
  if (route === 'NetWorth') return 'Patrimonio';
  if (route === 'Chat') return 'Ask';
  return 'Abrir';
}

function actionIcon(item, color, size = 17) {
  if (item.action === 'upload') return <UploadCloud size={size} color={color} />;
  if (item.route === 'ImportarDados' || item.route === 'OpenBanking') return <Banknote size={size} color={color} />;
  if (item.route === 'LiveDeals' || item.route === 'Score') return <Search size={size} color={color} />;
  if (item.route === 'RefundRadar') return <Radar size={size} color={color} />;
  if (item.route === 'Bills') return <CalendarDays size={size} color={color} />;
  if (item.route === 'Metas') return <Target size={size} color={color} />;
  if (item.route === 'Estatisticas') return <LineChart size={size} color={color} />;
  if (item.route === 'MinhasSubscricoes') return <Bell size={size} color={color} />;
  if (item.route === 'NetWorth') return <WalletCards size={size} color={color} />;
  if (item.route === 'Faturas') return <Receipt size={size} color={color} />;
  if (item.priority === 'critical') return <AlertTriangle size={size} color={color} />;
  return <Sparkles size={size} color={color} />;
}

function runAction(item, navigation, onUpload) {
  if (item.action === 'upload') {
    onUpload?.();
    return;
  }
  if (item.route) navigation?.navigate?.(item.route === 'Score' ? 'LiveDeals' : item.route, item.params || undefined);
}

function ActionCard({ item, index, navigation, onUpload }) {
  const color = priorityColor(item.priority);
  const metric = item.metric != null
    ? (item.currency ? formatCompactMoney(item.metric, item.currency) : String(item.metric))
    : null;

  return (
    <BitReveal delay={110 + index * 45}>
      <KineticPressable
        onPress={() => runAction(item, navigation, onUpload)}
        style={[styles.actionCard, { borderColor: color + '3F' }]}
      >
        <View style={[styles.actionIcon, { backgroundColor: color + '18' }]}>
          {actionIcon(item, color, 16)}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.actionTop}>
            <Text style={styles.actionTitle} numberOfLines={1}>{item.title}</Text>
            {!!metric && <Text style={[styles.actionMetric, { color }]}>{metric}</Text>}
          </View>
          {!!item.body && <Text style={styles.actionBody} numberOfLines={2}>{item.body}</Text>}
        </View>
        <View style={styles.actionRoute}>
          <Text style={styles.actionRouteText}>{routeToLabel(item.route, item.action)}</Text>
          <ArrowRight size={12} color={color} />
        </View>
      </KineticPressable>
    </BitReveal>
  );
}

function ToolTile({ item, index, navigation, onUpload }) {
  const color = item.color || priorityColor(item.priority);
  return (
    <BitReveal delay={180 + index * 35} style={styles.toolTileWrap}>
      <KineticPressable
        onPress={() => runAction(item, navigation, onUpload)}
        style={styles.toolTile}
      >
        <View style={[styles.toolIcon, { backgroundColor: color + '18' }]}>
          {actionIcon(item, color, 16)}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.toolTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.toolBody} numberOfLines={1}>{item.body}</Text>
        </View>
      </KineticPressable>
    </BitReveal>
  );
}

function mergeTools(actions, baseTools) {
  const seen = new Set();
  const merged = [];
  [...actions, ...baseTools].forEach((item) => {
    const key = item.action ? `action:${item.action}` : item.route ? `route:${item.route}` : item.id || item.title;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

export default function IntelligenceDeck({
  intelligence,
  navigation,
  compact = false,
  title = 'Copiloto financeiro',
  onUpload,
}) {
  const action = intelligence?.primary_action || {
    id: 'import_sources',
    priority: 'high',
    title: 'Ligar dados reais',
    body: 'Importa banco, Gmail ou faturas para a Verly conseguir agir por ti.',
    route: 'ImportarDados',
  };
  const actions = intelligence?.next_actions || [];
  const quality = intelligence?.data_quality || {};
  const budget = intelligence?.budget || {};
  const score = Number(intelligence?.score || 0);
  const scoreColor = score >= 75 ? C.green : score >= 50 ? C.yellow : C.red;

  const baseTools = [
    { id: 'upload_invoice', priority: 'medium', title: 'Fatura', body: 'Digitalizar', action: 'upload', color: C.brand },
    { id: 'connect_bank_tool', priority: 'medium', title: 'Banco', body: 'Sincronizar', route: 'ImportarDados', color: C.green },
    { id: 'live_deals_tool', priority: 'medium', title: 'Live Deals', body: 'Comparar antes', route: 'LiveDeals', color: C.cyan },
    { id: 'bills_tool', priority: 'medium', title: 'Bills', body: 'Prazos', route: 'Bills', color: C.yellow },
    { id: 'refund_tool', priority: 'medium', title: 'Refund Radar', body: 'Recuperar', route: 'RefundRadar', color: C.orange },
    { id: 'stats_tool', priority: 'medium', title: 'Analise', body: 'Gastos', route: 'Estatisticas', color: C.brandMid },
  ];
  const tools = mergeTools(actions, baseTools).slice(0, compact ? 4 : 8);
  const recommended = actions
    .filter(item => (item.id || item.route) !== (action.id || action.route))
    .slice(0, compact ? 1 : 2);

  return (
    <View style={[styles.wrap, compact && styles.compactWrap]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Brain size={15} color={C.brand} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <SignalPill
          label={quality.label || 'A analisar'}
          value={score ? `${score}/100` : `${quality.score || 0}%`}
          color={score ? scoreColor : C.brand}
        />
      </View>

      <KineticPressable
        onPress={() => runAction(action, navigation, onUpload)}
        style={[styles.primary, { borderColor: priorityColor(action.priority) + '55' }]}
      >
        <View style={styles.primaryTop}>
          <View style={[styles.primaryIcon, { backgroundColor: priorityColor(action.priority) + '18' }]}>
            {actionIcon(action, priorityColor(action.priority), 20)}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>Proximo melhor passo</Text>
            <Text style={styles.primaryTitle} numberOfLines={2}>{action.title || 'Abrir analise'}</Text>
          </View>
          <ArrowRight size={18} color={priorityColor(action.priority)} />
        </View>
        {!!action.body && <Text style={styles.primaryBody} numberOfLines={3}>{action.body}</Text>}
      </KineticPressable>

      <View style={styles.signalRow}>
        <SignalPill
          label="Orcamento"
          value={budget.pct != null ? `${Math.round(budget.pct)}%` : 'sem limite'}
          color={budget.status === 'over' ? C.red : budget.status === 'watch' || budget.status === 'forecast_over' ? C.yellow : C.green}
        />
        <SignalPill
          label="Banco"
          value={`${quality.bank_records || 0}`}
          color={quality.bank_records ? C.green : C.yellow}
        />
        <SignalPill
          label="Fontes"
          value={`${(quality.sources || []).length}`}
          color={C.brand}
        />
      </View>

      {!compact && recommended.length > 0 && (
        <View style={styles.actions}>
          {recommended.map((item, index) => (
            <ActionCard key={item.id || index} item={item} index={index} navigation={navigation} onUpload={onUpload} />
          ))}
        </View>
      )}

      <View style={styles.toolsHeader}>
        <ShieldCheck size={14} color={C.green} />
        <Text style={styles.toolsHeaderText}>Ferramentas rapidas</Text>
      </View>
      <View style={styles.toolGrid}>
        {tools.map((item, index) => (
          <ToolTile key={item.id || `${item.route}-${index}`} item={item} index={index} navigation={navigation} onUpload={onUpload} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: SPACE.lg, marginBottom: 14 },
  compactWrap: { marginHorizontal: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.sm,
    marginBottom: 10,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: {
    color: C.textMid,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  primary: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
  },
  primaryTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  primaryIcon: { width: 42, height: 42, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  primaryTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900', marginTop: 2, lineHeight: 21 },
  primaryBody: { color: C.textMid, fontSize: FONT.sm, fontWeight: '600', lineHeight: 19, marginTop: 10 },
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: SPACE.sm,
  },
  actions: { gap: 8, marginTop: SPACE.sm },
  actionCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACE.sm,
  },
  actionIcon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  actionTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: 3 },
  actionTitle: { flex: 1, color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  actionMetric: { fontSize: FONT.xs, fontWeight: '900' },
  actionBody: { color: C.textMid, fontSize: FONT.xs, fontWeight: '600', lineHeight: 16 },
  actionRoute: { alignItems: 'center', gap: 4 },
  actionRouteText: { color: C.textSub, fontSize: 9, fontWeight: '900' },
  toolsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.md, marginBottom: 8 },
  toolsHeaderText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toolTileWrap: { width: '48%' },
  toolTile: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  toolIcon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  toolTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  toolBody: { color: C.textMid, fontSize: FONT.xs, fontWeight: '700', marginTop: 2 },
});

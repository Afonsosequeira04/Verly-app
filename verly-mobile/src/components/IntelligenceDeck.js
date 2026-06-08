import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Gauge,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react-native';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatCompactMoney, formatMoney } from '../utils/money';
import { BitReveal, GlowShell, KineticPressable, MorphingBars, SignalPill } from './AnimatedBits';

const C = COLORS;

function priorityColor(priority) {
  if (priority === 'critical') return C.red;
  if (priority === 'high') return C.yellow;
  if (priority === 'medium') return C.brand;
  return C.green;
}

function routeToLabel(route) {
  if (route === 'OpenBanking') return 'Banco';
  if (route === 'ImportarDados') return 'Importar';
  if (route === 'MinhasSubscricoes') return 'Subscricoes';
  if (route === 'Metas') return 'Metas';
  if (route === 'Estatisticas') return 'Analise';
  if (route === 'Score') return 'Score';
  if (route === 'NetWorth') return 'Patrimonio';
  if (route === 'Grupos') return 'Grupos';
  return 'Abrir';
}

function ActionCard({ item, index, navigation }) {
  const color = priorityColor(item.priority);
  const metric = item.metric != null
    ? (item.currency ? formatCompactMoney(item.metric, item.currency) : String(item.metric))
    : null;

  return (
    <BitReveal delay={120 + index * 55}>
      <KineticPressable
        onPress={() => item.route && navigation?.navigate?.(item.route)}
        style={[styles.actionCard, { borderColor: color + '42' }]}
      >
        <View style={[styles.actionIcon, { backgroundColor: color + '18' }]}>
          {item.priority === 'critical'
            ? <AlertTriangle size={15} color={color} />
            : <Target size={15} color={color} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.actionTop}>
            <Text style={styles.actionTitle} numberOfLines={1}>{item.title}</Text>
            {!!metric && <Text style={[styles.actionMetric, { color }]}>{metric}</Text>}
          </View>
          <Text style={styles.actionBody} numberOfLines={2}>{item.body}</Text>
        </View>
        <View style={styles.actionRoute}>
          <Text style={styles.actionRouteText}>{routeToLabel(item.route)}</Text>
          <ArrowRight size={12} color={color} />
        </View>
      </KineticPressable>
    </BitReveal>
  );
}

function ChallengeCard({ item, index, navigation }) {
  const days = item.days || 1;
  return (
    <BitReveal delay={220 + index * 70} style={{ flex: 1 }}>
      <Pressable
        onPress={() => navigation?.navigate?.('Grupos')}
        style={styles.challengeCard}
      >
        <View style={styles.challengeTop}>
          <Users size={14} color={C.green} />
          <Text style={styles.challengeDays}>{days} {days === 1 ? 'dia' : 'dias'}</Text>
        </View>
        <Text style={styles.challengeTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.challengeText} numberOfLines={2}>{item.description}</Text>
        {Number(item.target || 0) > 0 && (
          <Text style={styles.challengeTarget}>
            Alvo {formatMoney(item.target, item.currency || 'EUR', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}
          </Text>
        )}
      </Pressable>
    </BitReveal>
  );
}

export default function IntelligenceDeck({
  intelligence,
  navigation,
  compact = false,
  title = 'Cockpit inteligente',
}) {
  if (!intelligence) return null;

  const action = intelligence.primary_action || {};
  const actions = intelligence.next_actions || [];
  const quality = intelligence.data_quality || {};
  const budget = intelligence.budget || {};
  const challenges = intelligence.social_challenges || [];
  const score = Number(intelligence.score || 0);
  const scoreColor = score >= 75 ? C.green : score >= 50 ? C.yellow : C.red;
  const bars = actions.map((item, index) => Math.max(0.25, 0.92 - index * 0.12));

  return (
    <View style={[styles.wrap, compact && styles.compactWrap]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Brain size={15} color={C.brand} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <SignalPill label={quality.label || 'A analisar'} value={`${quality.score || 0}%`} color={scoreColor} />
      </View>

      <GlowShell delay={40} colors={[scoreColor + '66', C.brand + '44', C.surface]}>
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <View style={styles.heroBadge}>
              <Sparkles size={13} color={scoreColor} />
              <Text style={[styles.heroBadgeText, { color: scoreColor }]}>Score {score}/100</Text>
            </View>
            <Text style={styles.heroTitle}>{intelligence.headline || 'Analise pronta'}</Text>
            <Text style={styles.heroAction} numberOfLines={2}>{action.title || 'Sem acao critica'}</Text>
            {!!action.body && <Text style={styles.heroBody} numberOfLines={3}>{action.body}</Text>}
          </View>
          <View style={styles.heroViz}>
            <Gauge size={24} color={scoreColor} />
            <MorphingBars bars={bars} color={scoreColor} />
          </View>
        </View>
      </GlowShell>

      <View style={styles.signalRow}>
        <SignalPill
          label="Orcamento"
          value={budget.pct != null ? `${Math.round(budget.pct)}%` : 'sem limite'}
          color={budget.status === 'over' ? C.red : budget.status === 'watch' ? C.yellow : C.green}
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

      {!compact && actions.length > 0 && (
        <View style={styles.actions}>
          {actions.slice(0, 3).map((item, index) => (
            <ActionCard key={item.id || index} item={item} index={index} navigation={navigation} />
          ))}
        </View>
      )}

      {!compact && challenges.length > 0 && (
        <View style={styles.challengeSection}>
          <View style={styles.challengeHeader}>
            <ShieldCheck size={14} color={C.green} />
            <Text style={styles.challengeHeaderText}>Acoes colaborativas</Text>
          </View>
          <View style={styles.challengeGrid}>
            {challenges.slice(0, 2).map((item, index) => (
              <ChallengeCard key={`${item.title}-${index}`} item={item} index={index} navigation={navigation} />
            ))}
          </View>
        </View>
      )}
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
  hero: {
    minHeight: 176,
    flexDirection: 'row',
    gap: SPACE.md,
    padding: SPACE.md,
  },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  heroBadgeText: { fontSize: FONT.xs, fontWeight: '900' },
  heroTitle: { color: C.text, fontSize: FONT.xl, fontWeight: '900', letterSpacing: 0 },
  heroAction: { color: C.text, fontSize: FONT.md, fontWeight: '900', marginTop: 10 },
  heroBody: { color: C.textMid, fontSize: FONT.sm, fontWeight: '600', lineHeight: 19, marginTop: 5 },
  heroViz: { width: 82, alignItems: 'center', justifyContent: 'space-between' },
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: SPACE.sm,
  },
  actions: { gap: 8, marginTop: SPACE.sm },
  actionCard: {
    minHeight: 76,
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
  challengeSection: { marginTop: SPACE.md },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  challengeHeaderText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  challengeGrid: { flexDirection: 'row', gap: 8 },
  challengeCard: {
    minHeight: 128,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.green + '33',
    padding: SPACE.sm,
  },
  challengeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  challengeDays: { color: C.green, fontSize: 10, fontWeight: '900' },
  challengeTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  challengeText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '600', lineHeight: 16, marginTop: 5 },
  challengeTarget: { color: C.green, fontSize: FONT.xs, fontWeight: '900', marginTop: 8 },
});

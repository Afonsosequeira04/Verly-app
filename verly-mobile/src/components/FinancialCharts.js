import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import { MotiView } from 'moti';
import { Activity, BarChart3, Layers3, PieChart, TrendingDown, TrendingUp } from 'lucide-react-native';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatCompactMoney, formatMoney } from '../utils/money';

const C = COLORS;
const W = Dimensions.get('window').width;
const CHART_W = Math.min(W - 64, 342);
const CHART_H = 174;

const PALETTE = [
  '#7C6FE0',
  '#00D68F',
  '#22D4FD',
  '#FFB300',
  '#FF4D6D',
  '#FF7340',
  '#B06FE0',
];

function keyOf(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function monthLabel(value) {
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const raw = String(value || '');
  const month = raw.includes('-') ? parseInt(raw.split('-')[1], 10) - 1 : NaN;
  return Number.isFinite(month) ? names[month] || raw : raw;
}

function normalizeCategories(items = [], fallbackCurrency = 'EUR') {
  return (items || [])
    .map((item, index) => ({
      id: `${keyOf(item.categoria || item.label || item.nome || index)}-${index}`,
      rawId: keyOf(item.categoria || item.label || item.nome || index),
      label: item.categoria || item.label || item.nome || `Categoria ${index + 1}`,
      value: Number(item.valor ?? item.total ?? item.value ?? 0),
      currency: item.currency || fallbackCurrency,
      count: item.count || item.num_movimentos || item.num_faturas || null,
      color: PALETTE[index % PALETTE.length],
    }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function normalizeMonths(items = [], fallbackCurrency = 'EUR') {
  return (items || [])
    .map((item, index) => ({
      id: String(item.mes || item.label || index),
      label: monthLabel(item.mes || item.label || index),
      value: Number(item.total ?? item.valor ?? item.value ?? 0),
      currency: item.currency || fallbackCurrency,
      count: item.num_faturas || item.num_movimentos || item.count || null,
    }))
    .filter(item => item.value >= 0);
}

function buildPath(points) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function areaPath(points) {
  if (!points.length) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${buildPath(points)} L ${last.x} ${CHART_H - 22} L ${first.x} ${CHART_H - 22} Z`;
}

function SegmentedControl({ value, onChange, hasCategories = true, hasMonths = true }) {
  const modes = [
    { id: 'overview', label: '3D', Icon: Layers3 },
    { id: 'trend', label: 'Tempo', Icon: Activity, disabled: !hasMonths },
    { id: 'categories', label: 'Categorias', Icon: PieChart, disabled: !hasCategories },
  ];

  return (
    <View style={styles.segmented}>
      {modes.map(({ id, label, Icon, disabled }) => {
        const active = value === id;
        return (
          <Pressable
            key={id}
            disabled={disabled}
            onPress={() => onChange(id)}
            style={[styles.segment, active && styles.segmentActive, disabled && styles.segmentDisabled]}
          >
            <Icon size={13} color={active ? C.text : C.textMid} />
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InsightRow({ categories, months, currency }) {
  const top = categories[0];
  const last = months[months.length - 1];
  const prev = months[months.length - 2];
  const diff = last && prev ? last.value - prev.value : 0;
  const diffPct = prev?.value > 0 ? Math.round((Math.abs(diff) / prev.value) * 100) : null;
  const trendColor = diff > 0 ? C.red : diff < 0 ? C.green : C.textMid;

  return (
    <View style={styles.insightRow}>
      <View style={styles.insightPill}>
        <Text style={styles.insightLabel}>Maior peso</Text>
        <Text style={styles.insightValue} numberOfLines={1}>
          {top ? `${top.label} ${formatCompactMoney(top.value, top.currency)}` : 'Sem categoria'}
        </Text>
      </View>
      <View style={styles.insightPill}>
        <Text style={styles.insightLabel}>Tendencia</Text>
        <View style={styles.trendLine}>
          {diff > 0
            ? <TrendingUp size={12} color={trendColor} />
            : <TrendingDown size={12} color={trendColor} />}
          <Text style={[styles.insightValue, { color: trendColor }]}>
            {diffPct == null ? formatCompactMoney(last?.value || 0, last?.currency || currency) : `${diff > 0 ? '+' : '-'}${diffPct}%`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function sourceName(value) {
  if (value === 'open_banking') return 'Banco';
  if (value === 'fatura') return 'Faturas';
  return value || 'Fonte';
}

function SourceBreakdown({ sources = [], currency = 'EUR' }) {
  const normalized = (sources || [])
    .map((item, index) => ({
      label: sourceName(item.fonte || item.source || item.label),
      value: Number(item.total ?? item.valor ?? item.value ?? 0),
      count: item.count || item.num_registos || null,
      currency: item.currency || currency,
      color: PALETTE[index % PALETTE.length],
    }))
    .filter(item => item.value > 0);

  if (!normalized.length) return null;
  const total = normalized.reduce((sum, item) => sum + item.value, 0);

  return (
    <View style={styles.sourceBox}>
      {normalized.map((item) => {
        const pct = Math.max(6, (item.value / Math.max(total, 1)) * 100);
        return (
          <View key={item.label} style={styles.sourceItem}>
            <View style={styles.sourceTop}>
              <Text style={styles.sourceLabel}>{item.label}</Text>
              <Text style={[styles.sourceValue, { color: item.color }]}>
                {formatCompactMoney(item.value, item.currency)}
              </Text>
            </View>
            <View style={styles.sourceTrack}>
              <MotiView
                from={{ width: '0%' }}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'timing', duration: 520 }}
                style={[styles.sourceFill, { backgroundColor: item.color }]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DepthOverview({ categories, months, currency, onPickCategory }) {
  const source = categories.length ? categories.slice(0, 5) : months.slice(-5);
  const max = Math.max(...source.map(item => item.value), 1);

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 220 }}
      style={styles.sceneWrap}
    >
      <View style={styles.scene}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGradient id="floor" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={C.brand} stopOpacity="0.16" />
              <Stop offset="1" stopColor={C.green} stopOpacity="0.05" />
            </SvgGradient>
          </Defs>
          <Polygon
            points={`28,154 ${CHART_W - 36},128 ${CHART_W - 6},170 58,198`}
            fill="url(#floor)"
            stroke={C.brand + '35'}
            strokeWidth="1"
          />
        </Svg>
        <View style={styles.columnsRow}>
          {source.map((item, index) => {
            const height = Math.max(46, (item.value / max) * 126);
            const color = item.color || PALETTE[index % PALETTE.length];
            return (
              <Pressable key={item.id || index} onPress={() => onPickCategory?.(item.id)}>
                <MotiView
                  from={{ height: 16, opacity: 0, translateY: 26, scale: 0.88 }}
                  animate={{ height, opacity: 1, translateY: 0, scale: 1, rotateY: index % 2 ? '-10deg' : '10deg' }}
                  transition={{ type: 'spring', delay: 80 + index * 75, damping: 15 }}
                  style={[
                    styles.depthColumn,
                    {
                      backgroundColor: color,
                      shadowColor: color,
                      transform: [{ perspective: 820 }, { rotateX: '-16deg' }, { rotateZ: '-2deg' }],
                    },
                  ]}
                >
                  <View style={styles.depthCap} />
                  <View style={styles.depthSide} />
                  <Text style={styles.depthValue}>{formatCompactMoney(item.value, item.currency || currency)}</Text>
                  <Text style={styles.depthLabel} numberOfLines={1}>{item.label}</Text>
                </MotiView>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.helperText}>Toca numa coluna para abrir a categoria correspondente.</Text>
    </MotiView>
  );
}

function TrendChart({ months, currency }) {
  const [selected, setSelected] = useState(7);
  const visible = months.slice(-8);
  if (!visible.length) return null;
  const selectedIndex = Math.min(selected, visible.length - 1);

  const values = visible.map(item => item.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const step = visible.length > 1 ? (CHART_W - 40) / (visible.length - 1) : 0;
  const points = visible.map((item, index) => ({
    x: 20 + index * step,
    y: 20 + ((max - item.value) / range) * (CHART_H - 54),
    item,
  }));
  const active = visible[selectedIndex] || visible[visible.length - 1];
  const prev = selectedIndex > 0 ? visible[selectedIndex - 1] : null;
  const diff = prev ? active.value - prev.value : 0;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 220 }}
      style={styles.trendWrap}
    >
      <View style={styles.trendMeta}>
        <View>
          <Text style={styles.metaLabel}>Selecionado</Text>
          <Text style={styles.metaValue}>{active.label} - {formatMoney(active.value, active.currency || currency)}</Text>
        </View>
        {!!prev && (
          <Text style={[styles.deltaText, { color: diff > 0 ? C.red : C.green }]}>
            {diff > 0 ? '+' : ''}{formatCompactMoney(diff, active.currency || currency)}
          </Text>
        )}
      </View>

      <Svg width={CHART_W} height={CHART_H}>
        <Defs>
          <SvgGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.brand} stopOpacity="0.36" />
            <Stop offset="1" stopColor={C.brand} stopOpacity="0.02" />
          </SvgGradient>
        </Defs>
        {[0, 1, 2].map(i => (
          <Path
            key={i}
            d={`M 14 ${28 + i * 42} H ${CHART_W - 14}`}
            stroke={C.borderHi}
            strokeWidth="1"
          />
        ))}
        <Path d={areaPath(points)} fill="url(#areaGradient)" />
        <Path d={buildPath(points)} fill="none" stroke={C.brand} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => {
          const activePoint = selectedIndex === index;
          return (
            <G key={`${point.item.id}-${index}`}>
              <Circle cx={point.x} cy={point.y} r={activePoint ? 6 : 4} fill={activePoint ? C.green : C.brand} />
              <Rect
                x={Math.max(0, point.x - 18)}
                y={0}
                width={36}
                height={CHART_H}
                fill="transparent"
                onPress={() => setSelected(index)}
              />
            </G>
          );
        })}
      </Svg>
      <View style={styles.axisRow}>
        {visible.map((item, index) => (
          <Pressable key={`${item.id}-${index}`} onPress={() => setSelected(index)} style={styles.axisItem}>
            <Text style={[styles.axisLabel, selectedIndex === index && { color: C.green }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </MotiView>
  );
}

function CategoryExplorer({ categories, currency, itemsByCategory = {}, onSelected }) {
  const [selected, setSelected] = useState(categories[0]?.id || null);
  const max = Math.max(...categories.map(item => item.value), 1);
  const active = categories.find(item => item.id === selected) || categories[0];
  const details = itemsByCategory[keyOf(active?.label)] || itemsByCategory[active?.label] || [];

  if (!categories.length) return null;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 220 }}
      style={styles.categoryExplorer}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
        {categories.slice(0, 8).map((item) => {
          const isActive = selected === item.id;
          return (
            <Pressable
              key={`${item.id}-chip`}
              onPress={() => {
                setSelected(item.id);
                onSelected?.(item.id);
              }}
              style={[styles.categoryChip, isActive && { borderColor: item.color, backgroundColor: item.color + '18' }]}
            >
              <Text style={[styles.categoryChipLabel, isActive && { color: C.text }]} numberOfLines={1}>{item.label}</Text>
              <Text style={[styles.categoryChipValue, { color: item.color }]}>{formatCompactMoney(item.value, item.currency || currency)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {categories.slice(0, 6).map((item, index) => {
        const pct = Math.max(5, (item.value / max) * 100);
        const isActive = selected === item.id;
        return (
          <Pressable key={`${item.id}-rank`} onPress={() => setSelected(item.id)} style={[styles.rankRow, isActive && styles.rankRowActive]}>
            <View style={[styles.rankBadge, { backgroundColor: item.color + '22' }]}>
              <Text style={[styles.rankBadgeText, { color: item.color }]}>#{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rankTop}>
                <Text style={styles.rankLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={[styles.rankValue, { color: item.color }]}>{formatMoney(item.value, item.currency || currency)}</Text>
              </View>
              <View style={styles.rankTrack}>
                <MotiView
                  from={{ width: '0%' }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'timing', duration: 560 + index * 70 }}
                  style={[styles.rankFill, { backgroundColor: item.color }]}
                />
              </View>
            </View>
          </Pressable>
        );
      })}

      {!!active && (
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 220 }}
          style={[styles.detailCard, { borderLeftColor: active.color }]}
        >
          <Text style={styles.detailTitle}>{active.label}</Text>
          <Text style={styles.detailText}>
            Representa {Math.round((active.value / Math.max(categories.reduce((s, item) => s + item.value, 0), 1)) * 100)}% dos gastos visiveis.
          </Text>
          {details.slice(0, 3).map((item, index) => (
            <View key={`${item.loja || item.nome || index}-${index}`} style={styles.detailRow}>
              <Text style={styles.detailName} numberOfLines={1}>{item.loja || item.nome || item.description || 'Movimento'}</Text>
              <Text style={styles.detailAmount}>{formatMoney(item.valor ?? item.total ?? item.amount ?? 0, item.currency || active.currency || currency)}</Text>
            </View>
          ))}
        </MotiView>
      )}
    </MotiView>
  );
}

export function FinancialChartsPanel({
  title = 'Analise financeira',
  subtitle,
  categories = [],
  months = [],
  itemsByCategory = {},
  sources = [],
  currency = 'EUR',
  delay = 120,
}) {
  const normalizedCategories = useMemo(() => normalizeCategories(categories, currency), [categories, currency]);
  const normalizedMonths = useMemo(() => normalizeMonths(months, currency), [months, currency]);
  const [mode, setMode] = useState(normalizedMonths.length ? 'trend' : 'categories');
  const hasCategories = normalizedCategories.length > 0;
  const hasMonths = normalizedMonths.length > 0;
  const activeMode = mode === 'categories' && !hasCategories
    ? (hasMonths ? 'trend' : 'overview')
    : mode === 'trend' && !hasMonths
      ? (hasCategories ? 'categories' : 'overview')
      : mode;

  const total = normalizedCategories.length
    ? normalizedCategories.reduce((sum, item) => sum + item.value, 0)
    : normalizedMonths[normalizedMonths.length - 1]?.value || 0;

  if (!normalizedCategories.length && !normalizedMonths.length) return null;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 420, delay }}
      style={styles.panel}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <View style={styles.totalPill}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCompactMoney(total, currency)}</Text>
        </View>
      </View>

      <InsightRow categories={normalizedCategories} months={normalizedMonths} currency={currency} />
      <SourceBreakdown sources={sources} currency={currency} />
      <SegmentedControl
        value={activeMode}
        onChange={setMode}
        hasCategories={hasCategories}
        hasMonths={hasMonths}
      />

      {activeMode === 'overview' && (
        <DepthOverview
          categories={normalizedCategories}
          months={normalizedMonths}
          currency={currency}
          onPickCategory={() => setMode('categories')}
        />
      )}
      {activeMode === 'trend' && <TrendChart months={normalizedMonths} currency={currency} />}
      {activeMode === 'categories' && (
        <CategoryExplorer
          categories={normalizedCategories}
          currency={currency}
          itemsByCategory={itemsByCategory}
        />
      )}
    </MotiView>
  );
}

export function FinancialChartsSkeleton({ title = 'A preparar graficos' }) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>A organizar movimentos, moedas e categorias.</Text>
        </View>
      </View>
      <View style={styles.loadingScene}>
        {[0, 1, 2, 3, 4].map((item) => (
          <MotiView
            key={item}
            from={{ height: 28 + item * 10, opacity: 0.45 }}
            animate={{ height: 92 - item * 8, opacity: 1 }}
            transition={{
              type: 'timing',
              duration: 760,
              loop: true,
              repeatReverse: true,
              delay: item * 95,
            }}
            style={[styles.loadingBar, { backgroundColor: PALETTE[item % PALETTE.length] }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.sm,
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  title: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  subtitle: { color: C.textMid, fontSize: FONT.xs, fontWeight: '600', marginTop: 3, lineHeight: 16 },
  totalPill: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.brand + '44',
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'flex-end',
  },
  totalLabel: { color: C.textSub, fontSize: 9, fontWeight: '800' },
  totalValue: { color: C.brand, fontSize: FONT.sm, fontWeight: '900', marginTop: 1 },
  insightRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.sm },
  insightPill: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.sm,
  },
  insightLabel: { color: C.textSub, fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  insightValue: { color: C.text, fontSize: FONT.xs, fontWeight: '800', marginTop: 3 },
  trendLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  sourceBox: {
    backgroundColor: C.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.sm,
    gap: 8,
    marginBottom: SPACE.sm,
  },
  sourceItem: { gap: 5 },
  sourceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  sourceLabel: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
  sourceValue: { color: C.text, fontSize: FONT.xs, fontWeight: '900' },
  sourceTrack: { height: 7, borderRadius: 999, backgroundColor: C.surface3, overflow: 'hidden' },
  sourceFill: { height: '100%', borderRadius: 999 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: RADIUS.md,
    padding: 4,
    gap: 4,
    marginBottom: SPACE.md,
  },
  segment: {
    flex: 1,
    minHeight: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  segmentActive: { backgroundColor: C.brand + '24', borderWidth: 1, borderColor: C.brand + '55' },
  segmentDisabled: { opacity: 0.38 },
  segmentText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
  segmentTextActive: { color: C.text },
  sceneWrap: { gap: SPACE.sm },
  scene: {
    height: 226,
    borderRadius: RADIUS.lg,
    backgroundColor: '#05030f',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: C.brand + '20',
  },
  columnsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  depthColumn: {
    width: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    shadowOffset: { width: 8, height: 12 },
    shadowOpacity: 0.36,
    shadowRadius: 16,
    elevation: 8,
  },
  depthCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: '#ffffff48',
  },
  depthSide: {
    position: 'absolute',
    top: 8,
    right: 0,
    bottom: 0,
    width: 13,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: '#0000002c',
  },
  depthValue: { color: '#fff', fontSize: 10, fontWeight: '900', marginBottom: 4 },
  depthLabel: { color: '#ffffffd8', fontSize: 9, fontWeight: '800', maxWidth: 48 },
  helperText: { color: C.textMid, fontSize: FONT.xs, textAlign: 'center', fontWeight: '700' },
  trendWrap: {
    backgroundColor: C.bg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.sm,
    alignItems: 'center',
  },
  trendMeta: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  metaLabel: { color: C.textSub, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  metaValue: { color: C.text, fontSize: FONT.xs, fontWeight: '900', marginTop: 2 },
  deltaText: { fontSize: FONT.xs, fontWeight: '900' },
  axisRow: { flexDirection: 'row', width: CHART_W, marginTop: -2 },
  axisItem: { flex: 1, alignItems: 'center' },
  axisLabel: { color: C.textMid, fontSize: 9, fontWeight: '800' },
  categoryExplorer: { gap: SPACE.sm },
  categoryRail: { gap: 8, paddingRight: SPACE.md },
  categoryChip: {
    width: 122,
    borderRadius: RADIUS.md,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.sm,
  },
  categoryChipLabel: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
  categoryChipValue: { fontSize: FONT.sm, fontWeight: '900', marginTop: 4 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.md,
    padding: 9,
  },
  rankRowActive: { backgroundColor: C.surface2 },
  rankBadge: { width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { fontSize: 10, fontWeight: '900' },
  rankTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, marginBottom: 6 },
  rankLabel: { color: C.text, fontSize: FONT.sm, fontWeight: '800', flex: 1 },
  rankValue: { fontSize: FONT.xs, fontWeight: '900' },
  rankTrack: { height: 8, borderRadius: 999, backgroundColor: C.surface3, overflow: 'hidden' },
  rankFill: { height: '100%', borderRadius: 999 },
  detailCard: {
    backgroundColor: C.surface2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    padding: SPACE.sm,
  },
  detailTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  detailText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '600', marginTop: 3, lineHeight: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, marginTop: 8 },
  detailName: { flex: 1, color: C.textMid, fontSize: FONT.xs, fontWeight: '700' },
  detailAmount: { color: C.text, fontSize: FONT.xs, fontWeight: '900' },
  loadingScene: {
    height: 190,
    borderRadius: RADIUS.lg,
    backgroundColor: '#05030f',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    padding: SPACE.md,
    overflow: 'hidden',
  },
  loadingBar: {
    width: 36,
    borderRadius: 12,
    shadowOffset: { width: 6, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 12,
    elevation: 6,
  },
});

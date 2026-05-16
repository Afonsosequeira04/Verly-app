// src/screens/DashboardScreen.js — Dashboard com Moti + Reanimated 4
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity,
  StatusBar, RefreshControl, Modal, TextInput, Alert,
  StyleSheet, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  interpolate,
  Easing,
  FadeInDown,
  FadeIn,
  SlideInDown,
  ZoomIn,
  BounceIn,
} from 'react-native-reanimated';
import { MotiView, MotiText } from 'moti';
import * as ImagePicker    from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Bell, Plus, Search, X, TrendingUp, TrendingDown,
  Receipt, Camera, Upload, FileText, Zap,
  ChevronRight, AlertCircle, Target, BarChart2,
} from 'lucide-react-native';
import { dashboardAPI, faturasAPI, notificacoesAPI, insightsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import {
  Reveal, Card, Skeleton, SectionHeader,
  useScalePress, AnimatedListItem, PulseDot,
} from '../components/UI';

const C   = COLORS;
const W   = Dimensions.get('window').width;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

const CHART_COLORS = [
  '#7C6FE0', '#00D68F', '#FFB300', '#FF4D6D',
  '#22D4FD', '#EC4899', '#FF7340', '#4ECDC4',
];

function normalizeDashboardData(data) {
  if (!data) return { porCategoria: [], porMes: [] };
  const porCategoria = Array.isArray(data.categorias)
    ? data.categorias.map(c => ({ categoria: c.nome || c.categoria || 'Outros', total: c.total || 0 }))
    : [];
  let porMes = [];
  if (data.evolucao?.labels && data.evolucao?.values) {
    porMes = data.evolucao.labels.map((label, i) => ({ mes: label, total: data.evolucao.values[i] || 0 }));
  }
  return { porCategoria, porMes };
}

// ─── Budget Bar animada com Reanimated 4 ─────────────────────────────────────
function BudgetBar({ pct = 0, color = C.brand }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(300, withTiming(Math.min(pct, 100), {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    }));
  }, [pct]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={{ height: 5, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: color, borderRadius: 3 }, barStyle]} />
    </View>
  );
}

// ─── Bar chart interativo com Reanimated 4 ────────────────────────────────────
function BarItem({ item, idx, onSelect, isSelected, max }) {
  const val   = item.valor || item.total || 0;
  const pct   = val / max;
  const color = CHART_COLORS[idx % CHART_COLORS.length];
  const BAR_W = W - 80 - SPACE.lg * 2;

  const barWidth  = useSharedValue(4);
  const bgOpacity = useSharedValue(0);
  const barHeight = useSharedValue(isSelected ? 7 : 5);

  useEffect(() => {
    barWidth.value = withDelay(100 + idx * 80, withTiming(Math.max(BAR_W * pct, 4), {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    }));
  }, [pct]);

  useEffect(() => {
    bgOpacity.value = withTiming(isSelected ? 1 : 0, { duration: 200 });
    barHeight.value = withSpring(isSelected ? 8 : 5, { damping: 20, stiffness: 300 });
  }, [isSelected]);

  const barStyle   = useAnimatedStyle(() => ({ width: barWidth.value, height: barHeight.value }));
  const rowStyle   = useAnimatedStyle(() => ({ backgroundColor: `${color}${Math.round(bgOpacity.value * 18).toString(16).padStart(2,'0')}` }));

  return (
    <Animated.View
      entering={FadeInDown.delay(idx * 60).duration(350).springify()}
      style={rowStyle}
    >
      <Pressable
        onPress={() => onSelect?.(isSelected ? null : idx)}
        style={{ borderRadius: 10, padding: 8 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
          <Text
            style={[s.microText, { flex: 1, fontWeight: isSelected ? '800' : '600', color: isSelected ? C.text : C.textMid }]}
            numberOfLines={1}
          >
            {item.categoria || item.label || item.nome || `Item ${idx + 1}`}
          </Text>
          <Text style={[s.microText, { color, fontWeight: '800' }]}>{fmt(val)} €</Text>
        </View>
        <View style={{ backgroundColor: C.surface3, borderRadius: 4, overflow: 'hidden' }}>
          <Animated.View style={[{ backgroundColor: color, borderRadius: 4 }, barStyle]} />
        </View>
        {isSelected && (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text style={[s.microText, { marginTop: 5, color }]}>
              {Math.round(pct * 100)}% do total gasto
            </Text>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function InteractiveBarChart({ items = [], onSelect, selectedIdx }) {
  const max = Math.max(...items.map(i => i.valor || i.total || 0), 1);
  return (
    <View style={{ gap: 6 }}>
      {items.slice(0, 6).map((item, idx) => (
        <BarItem key={idx} item={item} idx={idx} onSelect={onSelect} isSelected={selectedIdx === idx} max={max} />
      ))}
    </View>
  );
}

// ─── Monthly chart ────────────────────────────────────────────────────────────
function MonthBar({ item, idx, total, onPress, isSelected }) {
  const max = total;
  const pct = (item.total || 0) / max;
  const CHART_H = 72;
  const h = Math.max(pct * CHART_H, 4);
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const m = parseInt((item.mes || '').split('-')[1], 10) - 1;
  const label = meses[m] ?? item.mes?.slice(-2) ?? '';
  const color = isSelected ? CHART_COLORS[0] : CHART_COLORS[0] + '55';

  const barH    = useSharedValue(0);
  const opacity = useSharedValue(isSelected ? 1 : 0.6);

  useEffect(() => {
    barH.value    = withDelay(150 + idx * 60, withTiming(h, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, [h]);

  useEffect(() => {
    opacity.value = withTiming(isSelected ? 1 : 0.6, { duration: 200 });
  }, [isSelected]);

  const barStyle = useAnimatedStyle(() => ({ height: barH.value, opacity: opacity.value }));

  return (
    <Pressable
      style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: CHART_H + 36 }}
      onPress={onPress}
    >
      {isSelected ? (
        <Animated.View entering={FadeIn.duration(150)}>
          <Text style={[s.microText, { fontSize: 9, marginBottom: 3, color: CHART_COLORS[0], fontWeight: '800' }]}>
            {(item.total || 0) >= 1000 ? `${((item.total) / 1000).toFixed(1)}k` : fmt(item.total || 0)}€
          </Text>
        </Animated.View>
      ) : (
        <Text style={{ fontSize: 9, marginBottom: 3, opacity: 0 }}>-</Text>
      )}
      <Animated.View style={[{ width: '75%', backgroundColor: color, borderRadius: 4, marginBottom: 6 }, barStyle]} />
      <Text style={[s.microText, { fontSize: 10, fontWeight: isSelected ? '800' : '600', color: isSelected ? C.text : C.textMid }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MonthlyChart({ data = [], onMonthSelect, selectedMonth }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.total || 0), 1);
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
        {data.slice(-6).map((item, idx) => (
          <MonthBar
            key={idx} item={item} idx={idx} total={max}
            onPress={() => onMonthSelect?.(selectedMonth === idx ? null : idx)}
            isSelected={selectedMonth === idx}
          />
        ))}
      </View>
      {selectedMonth != null && data[data.length - 6 + selectedMonth] && (() => {
        const item = data[data.length - 6 + selectedMonth];
        const m = parseInt((item.mes || '').split('-')[1], 10) - 1;
        return (
          <Animated.View entering={FadeInDown.duration(250)} style={{ marginTop: 10, padding: 12, backgroundColor: C.surface3, borderRadius: 10 }}>
            <Text style={[s.microText, { color: C.text, fontWeight: '800' }]}>
              {meses[m] || item.mes} — {fmt(item.total)} €
            </Text>
            {item.num_faturas != null && (
              <Text style={[s.microText, { marginTop: 3 }]}>{item.num_faturas} fatura(s) registada(s)</Text>
            )}
          </Animated.View>
        );
      })()}
    </View>
  );
}

// ─── Charts section ───────────────────────────────────────────────────────────
function ChartsSection({ porCategoria, porMes, navigation }) {
  const [tab, setTab] = useState('categorias');
  const [selectedBar, setSelectedBar] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  const hasCats  = Array.isArray(porCategoria) && porCategoria.length > 0;
  const hasMeses = Array.isArray(porMes) && porMes.length > 0;

  const tabIndicator = useSharedValue(tab === 'categorias' ? 0 : 1);

  const handleTab = (t) => {
    setTab(t);
    tabIndicator.value = withSpring(t === 'categorias' ? 0 : 1, { damping: 22, stiffness: 300 });
    if (t === 'categorias') setSelectedBar(null);
    else setSelectedMonth(null);
  };

  if (!hasCats && !hasMeses) {
    return (
      <Reveal delay={140} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
        <SectionHeader title="Os teus gastos" />
        <View style={[s.card, { padding: 24, alignItems: 'center', gap: 12 }]}>
          <BarChart2 size={32} color={C.textMid} />
          <Text style={[s.bodyText, { textAlign: 'center', color: C.textMid }]}>Ainda sem dados suficientes</Text>
          <Text style={[s.microText, { textAlign: 'center', maxWidth: 240 }]}>Adiciona as tuas primeiras faturas para ver gráficos aqui</Text>
          <Pressable onPress={() => navigation?.navigate?.('Faturas')} style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.brandDim, borderRadius: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.brand }}>+ Adicionar fatura</Text>
          </Pressable>
        </View>
      </Reveal>
    );
  }

  const topCat = hasCats
    ? porCategoria.reduce((a, b) => ((b.valor || b.total || 0) > (a.valor || a.total || 0) ? b : a), porCategoria[0])
    : null;

  let tendencia = null;
  if (hasMeses && porMes.length >= 2) {
    const last = porMes[porMes.length - 1]?.total || 0;
    const prev = porMes[porMes.length - 2]?.total || 0;
    const diff = last - prev;
    const pct  = prev > 0 ? Math.abs(diff / prev * 100) : 0;
    tendencia = { diff, pct: Math.round(pct), subiu: diff > 0 };
  }

  return (
    <Reveal delay={140} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Os teus gastos" />
      <View style={s.card}>
        {/* Tabs */}
        <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
          {hasCats && (
            <Pressable onPress={() => handleTab('categorias')} style={[s.tab, tab === 'categorias' && s.tabActive]}>
              <Text style={[s.tabText, tab === 'categorias' && s.tabTextActive]}>Por categoria</Text>
            </Pressable>
          )}
          {hasMeses && (
            <Pressable onPress={() => handleTab('mensal')} style={[s.tab, tab === 'mensal' && s.tabActive]}>
              <Text style={[s.tabText, tab === 'mensal' && s.tabTextActive]}>Evolução</Text>
            </Pressable>
          )}
        </View>

        {tab === 'categorias' && hasCats && (
          <Animated.View entering={FadeIn.duration(200)} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {topCat && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, padding: 12, backgroundColor: C.surface2, borderRadius: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CHART_COLORS[0] }} />
                <Text style={[s.microText, { flex: 1 }]}>
                  Categoria principal:{' '}
                  <Text style={{ color: C.text, fontWeight: '800' }}>{topCat.categoria || topCat.label}</Text>
                  {' '}com{' '}
                  <Text style={{ color: CHART_COLORS[0], fontWeight: '800' }}>{fmt(topCat.valor || topCat.total)} €</Text>
                </Text>
              </View>
            )}
            <InteractiveBarChart items={porCategoria} onSelect={setSelectedBar} selectedIdx={selectedBar} />
            <Text style={[s.microText, { textAlign: 'center', marginTop: 12, opacity: 0.55 }]}>Toca numa categoria para ver detalhes</Text>
          </Animated.View>
        )}

        {tab === 'mensal' && hasMeses && (
          <Animated.View entering={FadeIn.duration(200)} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {tendencia && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, padding: 12, backgroundColor: C.surface2, borderRadius: 10 }}>
                {tendencia.subiu ? <TrendingUp size={14} color={C.red} /> : <TrendingDown size={14} color={C.green} />}
                <Text style={[s.microText, { flex: 1 }]}>
                  Este mês gastaste{' '}
                  <Text style={{ color: tendencia.subiu ? C.red : C.green, fontWeight: '800' }}>
                    {tendencia.subiu ? '+' : '-'}{tendencia.pct}%
                  </Text>
                  {' '}{tendencia.subiu ? 'mais' : 'menos'} do que no mês anterior
                </Text>
              </View>
            )}
            <MonthlyChart data={porMes} onMonthSelect={setSelectedMonth} selectedMonth={selectedMonth} />
            <Text style={[s.microText, { textAlign: 'center', marginTop: 12, opacity: 0.55 }]}>Toca num mês para ver o valor</Text>
          </Animated.View>
        )}
      </View>
    </Reveal>
  );
}

// ─── HeroCard ─────────────────────────────────────────────────────────────────
function HeroCard({ data, onSearchPress }) {
  const spent    = data?.total_gasto || 0;
  const budget   = data?.orcamento   || 0;
  const pct      = budget > 0 ? (spent / budget) * 100 : 0;
  const barColor = pct > 90 ? C.red : pct > 70 ? C.yellow : C.green;

  return (
    <Animated.View
      entering={FadeInDown.delay(60).duration(450).springify()}
      style={{ marginHorizontal: SPACE.lg, marginTop: 12, marginBottom: 14 }}
    >
      <View style={[s.card, { padding: 20 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={s.label}>Gasto este mês</Text>
            <MotiView
              key={spent}
              from={{ opacity: 0, translateY: 6 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', damping: 18, delay: 80 }}
            >
              <Text style={[s.bigNum, { marginTop: 4 }]}>{fmt(spent)} €</Text>
            </MotiView>
            {budget > 0 && <Text style={s.subText}>de {fmt(budget)} € orçamentados</Text>}
          </View>
          <Animated.View entering={FadeIn.delay(200)}>
            <Pressable onPress={onSearchPress} style={s.iconBtn} hitSlop={8}>
              <Search size={17} color={C.textMid} />
            </Pressable>
          </Animated.View>
        </View>

        {budget > 0 && (
          <View style={{ marginTop: 18 }}>
            <BudgetBar pct={pct} color={barColor} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={s.microText}>{Math.round(pct)}% utilizado</Text>
              <Text style={[s.microText, { color: barColor }]}>
                {pct > 100 ? `+${fmt(spent - budget)} € acima` : `${fmt(budget - spent)} € restante`}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── MetricsRow ───────────────────────────────────────────────────────────────
function MetricsRow({ data }) {
  const comparacao = data?.comparacao || {};
  const variacao   = comparacao.variacao_pct;
  const subiu      = comparacao.subiu;

  const metrics = [
    { label: 'Faturas',    value: data?.num_faturas ?? '—',                                icon: <Receipt size={14} color={C.brand} />,                                                            color: C.brand },
    { label: 'Alertas',    value: data?.alertas?.length ?? 0,                              icon: <AlertCircle size={14} color={data?.alertas?.length ? C.red : C.green} />,                        color: data?.alertas?.length ? C.red : C.green },
    { label: 'Vs. mês',   value: variacao != null ? `${subiu ? '+' : ''}${variacao}%` : '—', icon: subiu ? <TrendingUp size={14} color={C.red} /> : <TrendingDown size={14} color={C.green} />, color: subiu ? C.red : C.green },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      {metrics.map((m, i) => (
        <Animated.View
          key={i}
          entering={FadeInDown.delay(80 + i * 60).duration(380).springify()}
          style={[s.card, { flex: 1, padding: 14, alignItems: 'center', gap: 6 }]}
        >
          {m.icon}
          <MotiText
            key={m.value}
            from={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 16 }}
            style={[s.metricVal, { color: m.color }]}
          >
            {m.value}
          </MotiText>
          <Text style={s.label}>{m.label}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

// ─── InsightsSection ──────────────────────────────────────────────────────────
function InsightsSection({ mood, feed }) {
  const hasMood   = !!mood?.frase;
  const feedItems = Array.isArray(feed)
    ? feed.map(item => typeof item === 'object' ? (item.texto || '') : String(item)).filter(Boolean)
    : [];

  if (!hasMood && !feedItems.length) return null;

  return (
    <Reveal delay={175} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Insights da Verly" />
      <View style={s.card}>
        {hasMood && (
          <View style={{ padding: 16, borderBottomWidth: feedItems.length ? 1 : 0, borderBottomColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Zap size={13} color={C.brand} />
              <Text style={[s.label, { color: C.brand }]}>Verly diz</Text>
            </View>
            <Text style={[s.bodyText, { fontStyle: 'italic', color: C.textMid, lineHeight: 20 }]}>
              "{mood.frase}"
            </Text>
          </View>
        )}
        {feedItems.length > 0 && (
          <View style={{ padding: 16, gap: 10 }}>
            {feedItems.slice(0, 3).map((item, i) => (
              <AnimatedListItem key={i} index={i}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.brand, marginTop: 6 }} />
                  <Text style={[s.bodyText, { flex: 1, color: C.textMid, lineHeight: 20, fontWeight: '500' }]}>{item}</Text>
                </View>
              </AnimatedListItem>
            ))}
          </View>
        )}
      </View>
    </Reveal>
  );
}

// ─── AlertsPanel ─────────────────────────────────────────────────────────────
function AlertsPanel({ visible, alertas = [] }) {
  const height  = useSharedValue(0);
  const opacity = useSharedValue(0);
  const ITEM_H  = 64;

  useEffect(() => {
    const target = visible ? alertas.length * ITEM_H + 16 : 0;
    height.value  = withTiming(target,        { duration: 280, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(visible ? 1 : 0, { duration: 220 });
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    maxHeight: height.value,
    opacity:   opacity.value,
  }));

  if (!alertas.length) return null;

  return (
    <Animated.View style={[{ overflow: 'hidden', marginHorizontal: SPACE.lg, marginBottom: 14 }, panelStyle]}>
      <View style={s.card}>
        {alertas.map((a, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < alertas.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: a.urgencia === 'alta' ? C.red : C.yellow }} />
            <View style={{ flex: 1 }}>
              <Text style={s.bodyText} numberOfLines={1}>{a.loja}</Text>
              <Text style={[s.microText, { marginTop: 2 }]}>{a.tipo} · {a.dias} dia(s)</Text>
            </View>
            <Text style={[s.microText, { color: a.urgencia === 'alta' ? C.red : C.yellow }]}>
              {a.urgencia?.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── RecentFaturas ────────────────────────────────────────────────────────────
function RecentFaturas({ faturas = [], navigation }) {
  if (!faturas.length) return null;
  return (
    <Reveal delay={220} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Últimas faturas" action="Ver todas" onAction={() => navigation.navigate('Faturas')} />
      <View style={s.card}>
        {faturas.map((f, i) => (
          <AnimatedListItem key={f.id} index={i}>
            <Pressable
              onPress={() => navigation.navigate('FaturaDetalhe', { faturaId: f.id })}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                borderBottomWidth: i < faturas.length - 1 ? 1 : 0, borderBottomColor: C.border,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <View style={[s.iconBox, { backgroundColor: C.brandDim }]}>
                <Receipt size={15} color={C.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.bodyText} numberOfLines={1}>{f.loja}</Text>
                <Text style={[s.microText, { marginTop: 2 }]}>{f.categoria} · {f.data_compra || '—'}</Text>
              </View>
              <Text style={[s.bodyText, { fontWeight: '800' }]}>{fmt(f.total)} €</Text>
              <ChevronRight size={13} color={C.textMid} />
            </Pressable>
          </AnimatedListItem>
        ))}
      </View>
    </Reveal>
  );
}

// ─── UploadSheet com Reanimated 4 ────────────────────────────────────────────
function UploadSheet({ visible, onClose, onUploaded }) {
  const insets  = useSafeAreaInsets();
  const slideY  = useSharedValue(400);
  const overlay = useSharedValue(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      slideY.value  = withSpring(0, { damping: 26, stiffness: 180 });
      overlay.value = withTiming(1, { duration: 200 });
    } else {
      slideY.value  = withTiming(400, { duration: 220, easing: Easing.in(Easing.quad) });
      overlay.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const sheetStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value }));

  const upload = async (uri, name, type) => {
    setUploading(true);
    try {
      const result = await faturasAPI.upload(uri, name, type);
      onClose();
      if (result?.fatura) {
        setTimeout(() => { setUploadResult(result.fatura); }, 300);
      }
      setTimeout(() => { onUploaded(); }, 500);
    } catch (err) {
      Alert.alert('Erro no upload', err.message || 'Não foi possível fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permissão', 'Câmara necessária');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!r.canceled && r.assets?.[0]) {
      const a = r.assets[0];
      await upload(a.uri, a.fileName || 'foto.jpg', 'image/jpeg');
    }
  };

  const pickGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
    if (!r.canceled && r.assets?.[0]) {
      const a = r.assets[0];
      await upload(a.uri, a.fileName || 'galeria.jpg', 'image/jpeg');
    }
  };

  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'text/plain', 'image/*'] });
    if (!r.canceled && r.assets?.[0]) {
      const f = r.assets[0];
      await upload(f.uri, f.name, f.mimeType || 'application/octet-stream');
    }
  };

  const OPTIONS = [
    { label: 'Câmara',   sub: 'Tirar foto',  Icon: Camera,   color: C.brand,  fn: pickCamera  },
    { label: 'Galeria',  sub: 'Da galeria',   Icon: Upload,   color: C.green,  fn: pickGallery },
    { label: 'Ficheiro', sub: 'PDF ou texto', Icon: FileText, color: C.yellow, fn: pickFile    },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }, overlayStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View style={[s.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={s.sheetHandle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <Text style={s.sheetTitle}>Adicionar fatura</Text>
            <Pressable onPress={onClose} hitSlop={10}><X size={18} color={C.textMid} /></Pressable>
          </View>

          {uploading ? (
            <MotiView
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ alignItems: 'center', paddingVertical: 36, gap: 12 }}
            >
              <MotiView
                from={{ rotate: '0deg' }}
                animate={{ rotate: '360deg' }}
                transition={{ type: 'timing', duration: 1200, loop: true, repeatReverse: false }}
              >
                <Zap size={28} color={C.brand} />
              </MotiView>
              <Text style={[s.label, { textAlign: 'center' }]}>A processar com IA…</Text>
            </MotiView>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {OPTIONS.map(({ label, sub, Icon, color, fn }) => (
                <Pressable
                  key={label}
                  onPress={fn}
                  style={({ pressed }) => [s.uploadOption, { flex: 1, opacity: pressed ? 0.75 : 1 }]}
                >
                  <View style={{ width: 50, height: 50, borderRadius: RADIUS.md, backgroundColor: color + '18', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                    <Icon size={22} color={color} />
                  </View>
                  <Text style={[s.bodyText, { fontSize: 13 }]}>{label}</Text>
                  <Text style={[s.microText, { fontSize: 11, marginTop: 2 }]}>{sub}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── SearchOverlay ────────────────────────────────────────────────────────────
function SearchOverlay({ visible, onClose, navigation }) {
  const opacity = useSharedValue(0);
  const [q, setQ]             = useState('');
  const [results, setResults] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
    if (!visible) { setQ(''); setResults([]); }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const search = (text) => {
    setQ(text);
    clearTimeout(timer.current);
    if (!text.trim()) return setResults([]);
    timer.current = setTimeout(async () => {
      try { const d = await faturasAPI.listar({ q: text }); setResults(d.faturas || []); } catch (_) {}
    }, 320);
  };

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg, zIndex: 9999 }, overlayStyle]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, padding: SPACE.lg, paddingTop: 56 }}>
          <Animated.View entering={FadeInDown.duration(250)} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16 }]}>
            <Search size={16} color={C.textMid} />
            <TextInput
              autoFocus value={q} onChangeText={search}
              placeholder="Pesquisar faturas…" placeholderTextColor={C.textMid}
              style={{ flex: 1, fontSize: FONT.md, color: C.text, paddingVertical: 10 }}
            />
            <Pressable onPress={onClose} hitSlop={8}><X size={16} color={C.textMid} /></Pressable>
          </Animated.View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {results.map((f, i) => (
              <AnimatedListItem key={f.id} index={i}>
                <Pressable
                  onPress={() => { onClose(); navigation.navigate('FaturaDetalhe', { faturaId: f.id }); }}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.bodyText}>{f.loja}</Text>
                    <Text style={[s.microText, { marginTop: 2 }]}>{f.categoria} · {f.data_compra || '—'}</Text>
                  </View>
                  <Text style={[s.bodyText, { fontWeight: '800' }]}>{fmt(f.total)} €</Text>
                </Pressable>
              </AnimatedListItem>
            ))}
            {!results.length && q.length > 1 && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Text style={[s.label, { textAlign: 'center', marginTop: 40 }]}>Sem resultados para "{q}"</Text>
              </Animated.View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ─── FAB com spring bounce ────────────────────────────────────────────────────
function FAB({ onPress }) {
  const scale      = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const rotate     = useSharedValue(0);

  useEffect(() => {
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 180 });
    }, 400);
  }, []);

  const onPressIn  = () => {
    pressScale.value = withSpring(0.90, { damping: 20, stiffness: 400 });
    rotate.value     = withTiming(45, { duration: 150 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1,    { damping: 18, stiffness: 300 });
    rotate.value     = withTiming(0,    { duration: 150 });
  };

  const fabStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value * pressScale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View style={[s.fab, fabStyle]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        style={{ width: '100%', height: '100%', borderRadius: RADIUS.lg, justifyContent: 'center', alignItems: 'center' }}
      >
        <Plus size={22} color="#fff" strokeWidth={2.5} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <View style={{ gap: 14, paddingHorizontal: SPACE.lg, marginTop: 12 }}>
      <Skeleton height={130} radius={RADIUS.lg} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[1,2,3].map(i => <Skeleton key={i} height={76} style={{ flex: 1 }} radius={RADIUS.md} />)}
      </View>
      <Skeleton height={200} radius={RADIUS.lg} />
      <Skeleton height={140} radius={RADIUS.lg} />
    </View>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation, route }) {
  const { user }  = useAuth();
  const insets    = useSafeAreaInsets();
  const [data,       setData]   = useState(null);
  const [loading,    setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [showUpload, setUpload]  = useState(false);
  const [showSearch, setSearch]  = useState(false);
  const [showAlerts, setAlerts]  = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [notifs,     setNotifs]     = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const [notifLoad,  setNotifLoad]  = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // fatura extraída após upload
  const [insights,   setInsights]   = useState([]);

  const fetchNotifs = useCallback(async () => {
    setNotifLoad(true);
    try {
      const data = await notificacoesAPI.listar();
      setNotifs(data.notificacoes || []);
      setNotifCount(data.urgentes || 0);
    } catch (e) {}
    finally { setNotifLoad(false); }
  }, []);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  const fetchInsights = useCallback(async () => {
    try {
      const data = await insightsAPI.get();
      setInsights((data.insights || []).slice(0, 3));
    } catch (e) {}
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  // Abre upload quando o + do header é pressionado
  useEffect(() => {
    if (route?.params?.openUpload) {
      setUpload(true);
      navigation.setParams({ openUpload: false });
    }
  }, [route?.params?.openUpload]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true); else setLoading(true);
    try {
      const d = await dashboardAPI.get();
      setData(d);
    } catch (e) { console.warn('Dashboard:', e.message); }
    finally { setLoading(false); setRefresh(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { porCategoria, porMes } = normalizeDashboardData(data);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header custom com fade roxo */}
      <View style={{ position: 'relative' }}>
        {/* Gradiente roxo a desvanecer de cima para baixo */}
        <LinearGradient
          colors={['#7C6FE055', 'transparent']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 70,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12,
          backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: C.border,
          zIndex: 1,
        }}>
          {/* Esquerda — notificações rápidas */}
          <TouchableOpacity onPress={() => { setNotifOpen(v => !v); if (!notifOpen) fetchNotifs(); }} hitSlop={8} style={{ position: 'relative' }}>
            <Bell size={20} color={notifOpen ? C.brand : C.textMid} strokeWidth={1.8} />
            {notifCount > 0 && (
              <View style={{
                position: 'absolute', top: -4, right: -4,
                backgroundColor: '#FF4D6D', borderRadius: 8,
                minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 3,
              }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Centro — título */}
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, letterSpacing: -0.5 }}>Verly</Text>

          {/* Direita — + e menu */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setUpload(true)}
              style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: C.brand,
                justifyContent: 'center', alignItems: 'center',
              }}
            >
              <Plus size={18} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Menu')} hitSlop={8}>
              <Text style={{ color: C.text, fontSize: 22 }}>☰</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Painel de notificações rápidas ── */}
        {notifOpen && (
          <View style={{
            position: 'absolute', top: insets.top + 70, left: 12, right: 12,
            backgroundColor: C.surface2, borderRadius: 16, zIndex: 100,
            borderWidth: 1, borderColor: C.border,
            shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 10,
          }}>
            {/* Header do painel */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Notificações</Text>
              <TouchableOpacity onPress={() => setNotifOpen(false)} hitSlop={8}>
                <X size={18} color={C.textMid} />
              </TouchableOpacity>
            </View>

            {notifLoad ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: C.textSub, fontSize: 13 }}>A carregar...</Text>
              </View>
            ) : notifs.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 28, marginBottom: 8 }}>✅</Text>
                <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>Tudo em ordem!</Text>
                <Text style={{ color: C.textSub, fontSize: 12, marginTop: 4 }}>Sem notificações por agora.</Text>
              </View>
            ) : (
              notifs.map((n, i) => {
                const urgColor = n.urgencia === 'alta' ? '#FF4D6D' : n.urgencia === 'media' ? '#FFB300' : C.brand;
                return (
                  <View key={i} style={{
                    flexDirection: 'row', alignItems: 'flex-start', padding: 14,
                    borderBottomWidth: i < notifs.length - 1 ? 1 : 0,
                    borderBottomColor: C.border,
                    borderLeftWidth: 3, borderLeftColor: urgColor,
                  }}>
                    <Text style={{ fontSize: 20, marginRight: 10, marginTop: 1 }}>{n.icone}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontWeight: '700', fontSize: 13, marginBottom: 2 }}>{n.titulo}</Text>
                      <Text style={{ color: C.textSub, fontSize: 12, lineHeight: 17 }}>{n.mensagem}</Text>
                      <View style={{ marginTop: 5, alignSelf: 'flex-start', backgroundColor: `${urgColor}22`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: urgColor, fontSize: 9, fontWeight: '800' }}>
                          {n.urgencia === 'alta' ? 'URGENTE' : n.urgencia === 'media' ? 'ATENÇÃO' : 'INFO'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

      {showSearch && (
        <SearchOverlay visible={showSearch} onClose={() => setSearch(false)} navigation={navigation} />
      )}
      <UploadSheet visible={showUpload} onClose={() => setUpload(false)} onUploaded={load} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} colors={[C.brand]} />
        }
      >
        <AlertsPanel visible={showAlerts} alertas={data?.alertas || []} />

        {loading ? <LoadingSkeleton /> : (
          <>
            <HeroCard data={data} onSearchPress={() => setSearch(true)} />
            <MetricsRow data={data} />
            <ChartsSection porCategoria={porCategoria} porMes={porMes} navigation={navigation} />
            <InsightsSection mood={data?.mood} feed={data?.feed} />

            {data?.subscricoes?.count_danger > 0 && (
              <Animated.View
                entering={FadeInDown.delay(200).duration(400).springify()}
                style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}
              >
                <Pressable
                  onPress={() => navigation.navigate('Subscricoes')}
                  style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderColor: C.red + '30' }]}
                >
                  <View style={[s.iconBox, { backgroundColor: C.red + '18' }]}>
                    <TrendingUp size={16} color={C.red} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.bodyText}>{data.subscricoes.count_danger} subscrição(ões) a desperdiçar</Text>
                    <Text style={[s.microText, { marginTop: 2 }]}>{fmt(data.subscricoes.total_mensal)} €/mês</Text>
                  </View>
                  <ChevronRight size={14} color={C.red} />
                </Pressable>
              </Animated.View>
            )}

            <RecentFaturas faturas={data?.ultimas_faturas} navigation={navigation} />
          </>
        )}
      </ScrollView>

        {/* ── Modal resultado do upload ── */}
        {uploadResult && (
          <Modal transparent animationType="fade" visible={!!uploadResult} onRequestClose={() => setUploadResult(null)}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setUploadResult(null)}>
              <Pressable style={{ backgroundColor: C.surface2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }} onPress={() => {}}>
                <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 4 }}>✅ Fatura adicionada!</Text>
                <Text style={{ color: C.textSub, fontSize: 13, marginBottom: 20 }}>Aqui está o que extraímos automaticamente:</Text>

                {uploadResult.loja ? (
                  <View style={{ backgroundColor: C.surface3, borderRadius: 12, padding: 16, gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.textMid, fontSize: 13 }}>Loja</Text>
                      <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>{uploadResult.loja}</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: C.border }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.textMid, fontSize: 13 }}>Total</Text>
                      <Text style={{ color: C.brand, fontWeight: '900', fontSize: 16 }}>{(uploadResult.total || 0).toFixed(2)} €</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: C.border }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.textMid, fontSize: 13 }}>Categoria</Text>
                      <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>{uploadResult.categoria || 'Outros'}</Text>
                    </View>
                    {uploadResult.data_compra ? (
                      <>
                        <View style={{ height: 1, backgroundColor: C.border }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: C.textMid, fontSize: 13 }}>Data</Text>
                          <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>{uploadResult.data_compra}</Text>
                        </View>
                      </>
                    ) : null}
                    {uploadResult.data_garantia ? (
                      <>
                        <View style={{ height: 1, backgroundColor: C.border }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: C.textMid, fontSize: 13 }}>Garantia até</Text>
                          <Text style={{ color: '#00D68F', fontWeight: '700', fontSize: 13 }}>{uploadResult.data_garantia} 🛡️</Text>
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ backgroundColor: C.surface3, borderRadius: 12, padding: 16 }}>
                    <Text style={{ color: C.textSub, fontSize: 13, textAlign: 'center' }}>Fatura guardada. Abre o separador Faturas para ver os detalhes.</Text>
                  </View>
                )}

                <Pressable
                  onPress={() => setUploadResult(null)}
                  style={{ marginTop: 20, backgroundColor: C.brand, borderRadius: 12, padding: 14, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Fechar</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: C.border,
  },
  label:    { fontSize: FONT.xs, fontWeight: '600', color: C.textMid, letterSpacing: 0.3 },
  bodyText: { fontSize: FONT.md, fontWeight: '600', color: C.text },
  microText:{ fontSize: FONT.xs, color: C.textMid },
  bigNum:   { fontSize: FONT.h1, fontWeight: '900', color: C.text, letterSpacing: -0.8 },
  subText:  { fontSize: FONT.sm, color: C.textMid, marginTop: 2 },
  metricVal:{ fontSize: FONT.xl, fontWeight: '900', letterSpacing: -0.5 },
  iconBtn: {
    width: 40, height: 40, borderRadius: RADIUS.sm,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  iconBox: {
    width: 38, height: 38, borderRadius: RADIUS.sm,
    justifyContent: 'center', alignItems: 'center',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: C.brandDim, borderWidth: 1.5, borderColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '900', color: C.brand },
  dot: {
    position: 'absolute', top: 8, right: 8,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.red, borderWidth: 1.5, borderColor: C.bg,
  },
  fab: {
    position: 'absolute', bottom: 96, right: SPACE.lg,
    width: 56, height: 56, borderRadius: RADIUS.lg,
    backgroundColor: C.brand,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 10,
  },
  sheet: {
    backgroundColor: C.surface2,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: FONT.lg, fontWeight: '800', color: C.text },
  uploadOption: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', paddingVertical: 18, paddingHorizontal: 8,
  },
  tab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: 'transparent',
  },
  tabActive: { backgroundColor: C.brandDim, borderColor: C.brand + '40' },
  tabText:       { fontSize: 12, fontWeight: '700', color: C.textMid },
  tabTextActive: { color: C.brand },
});
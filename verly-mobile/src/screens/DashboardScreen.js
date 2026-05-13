// src/screens/DashboardScreen.js — Dashboard com gráficos interativos
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity,
  Animated, Easing, StatusBar, RefreshControl,
  Modal, TextInput, Alert, StyleSheet, Dimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker    from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Bell, Plus, Search, X, TrendingUp, TrendingDown,
  Receipt, Camera, Upload, FileText, Zap,
  ChevronRight, AlertCircle, Target, BarChart2,
} from 'lucide-react-native';
import { dashboardAPI, faturasAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import { Reveal, Card, Skeleton, SectionHeader, useScalePress } from '../components/UI';

const C   = COLORS;
const W   = Dimensions.get('window').width;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

const CHART_COLORS = [
  '#7C6FE0', '#00D68F', '#FFB300', '#FF4D6D',
  '#22D4FD', '#EC4899', '#FF7340', '#4ECDC4',
];

// ─── Normaliza dados do backend para o formato esperado pelos gráficos ─────────
// Backend retorna:
//   categorias: [{ nome, total }]
//   evolucao:   { labels: ['2025-01', ...], values: [123, ...] }
//
// Os gráficos esperam:
//   porCategoria: [{ categoria, total }]
//   porMes:       [{ mes: '2025-01', total, num_faturas? }]

function normalizeDashboardData(data) {
  if (!data) return { porCategoria: [], porMes: [] };

  // Categorias: backend usa "nome", gráfico usa "categoria"
  const porCategoria = Array.isArray(data.categorias)
    ? data.categorias.map(c => ({
        categoria: c.nome || c.categoria || 'Outros',
        total:     c.total || 0,
      }))
    : [];

  // Evolução mensal: backend devolve { labels, values }
  // Precisamos de [{ mes, total }]
  let porMes = [];
  if (data.evolucao?.labels && data.evolucao?.values) {
    porMes = data.evolucao.labels.map((label, i) => ({
      mes:   label,
      total: data.evolucao.values[i] || 0,
    }));
  }

  return { porCategoria, porMes };
}

// ─── Animated Budget Bar ──────────────────────────────────────────────────────
function BudgetBar({ pct = 0, color = C.brand }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: Math.min(pct, 100),
      duration: 900, delay: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);
  const widthInterp = width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <View style={{ height: 4, backgroundColor: C.surface3, borderRadius: 2, overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', width: widthInterp, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

// ─── Barras horizontais animadas com toque ────────────────────────────────────
function InteractiveBarChart({ items = [], onSelect, selectedIdx }) {
  const max = Math.max(...items.map(i => i.valor || i.total || 0), 1);
  const BAR_W = W - 80 - (SPACE.lg || 20) * 2;

  return (
    <View style={{ gap: 10 }}>
      {items.slice(0, 6).map((item, idx) => {
        const val   = item.valor || item.total || 0;
        const pct   = val / max;
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        const isSelected = selectedIdx === idx;
        const anim  = useRef(new Animated.Value(0)).current;

        useEffect(() => {
          Animated.timing(anim, {
            toValue: pct,
            duration: 600 + idx * 80,
            delay: 100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
        }, [pct]);

        const animW = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [4, Math.max(BAR_W * pct, 4)],
        });

        return (
          <Pressable
            key={idx}
            onPress={() => onSelect?.(isSelected ? null : idx)}
            style={[
              {
                borderRadius: 10,
                padding: 8,
                backgroundColor: isSelected ? color + '12' : 'transparent',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={[s.microText, { flex: 1, fontWeight: isSelected ? '800' : '600', color: isSelected ? C.text : C.textMid }]} numberOfLines={1}>
                {item.categoria || item.label || item.nome || `Item ${idx + 1}`}
              </Text>
              <Text style={[s.microText, { color, fontWeight: '800' }]}>{fmt(val)} €</Text>
            </View>
            <View style={{ height: isSelected ? 7 : 5, backgroundColor: C.surface3, borderRadius: 4, overflow: 'hidden' }}>
              <Animated.View style={{
                height: '100%',
                width: animW,
                backgroundColor: color,
                borderRadius: 4,
              }} />
            </View>
            {isSelected && (
              <Text style={[s.microText, { marginTop: 5, color: color }]}>
                {Math.round(pct * 100)}% do total gasto
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Gráfico mensal interativo ────────────────────────────────────────────────
function MonthlyChart({ data = [], onMonthSelect, selectedMonth }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.total || 0), 1);
  const CHART_H = 72;
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: CHART_H + 30 }}>
        {data.slice(-6).map((item, idx) => {
          const pct   = (item.total || 0) / max;
          const h     = Math.max(pct * CHART_H, 4);
          const m     = parseInt((item.mes || '').split('-')[1], 10) - 1;
          const label = meses[m] ?? item.mes?.slice(-2) ?? '';
          const isSelected = selectedMonth === idx;
          const color = isSelected ? CHART_COLORS[0] : CHART_COLORS[0] + '60';
          const anim  = useRef(new Animated.Value(0)).current;

          useEffect(() => {
            Animated.timing(anim, {
              toValue: h,
              duration: 500 + idx * 60,
              delay: 150,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }).start();
          }, [h]);

          return (
            <Pressable
              key={idx}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: CHART_H + 30 }}
              onPress={() => onMonthSelect?.(isSelected ? null : idx)}
            >
              {isSelected && (
                <Text style={[s.microText, { fontSize: 9, marginBottom: 2, color: CHART_COLORS[0], fontWeight: '800' }]}>
                  {(item.total || 0) >= 1000
                    ? `${((item.total) / 1000).toFixed(1)}k`
                    : fmt(item.total || 0)}€
                </Text>
              )}
              {!isSelected && (
                <Text style={[s.microText, { fontSize: 9, marginBottom: 2, opacity: 0 }]}>-</Text>
              )}
              <Animated.View style={{
                width: '80%',
                height: anim,
                backgroundColor: color,
                borderRadius: 4,
                marginBottom: 5,
              }} />
              <Text style={[s.microText, { fontSize: 10, fontWeight: isSelected ? '800' : '600', color: isSelected ? C.text : C.textMid }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedMonth != null && data[data.length - 6 + selectedMonth] && (() => {
        const item = data[data.length - 6 + selectedMonth];
        const m    = parseInt((item.mes || '').split('-')[1], 10) - 1;
        return (
          <View style={{ marginTop: 10, padding: 12, backgroundColor: C.surface3, borderRadius: 10 }}>
            <Text style={[s.microText, { color: C.text, fontWeight: '800' }]}>
              {meses[m] || item.mes} — {fmt(item.total)} €
            </Text>
            {item.num_faturas != null && (
              <Text style={[s.microText, { marginTop: 3 }]}>
                {item.num_faturas} fatura(s) registada(s)
              </Text>
            )}
          </View>
        );
      })()}
    </View>
  );
}

// ─── Secção de gráficos interativos (substitui QuickActions) ──────────────────
function ChartsSection({ porCategoria, porMes, navigation }) {
  const [tab, setTab]              = useState('categorias');
  const [selectedBar, setSelectedBar]     = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  const hasCats  = Array.isArray(porCategoria) && porCategoria.length > 0;
  const hasMeses = Array.isArray(porMes)        && porMes.length > 0;

  if (!hasCats && !hasMeses) {
    return (
      <Reveal delay={140} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
        <SectionHeader title="Os teus gastos" />
        <View style={[s.card, { padding: 24, alignItems: 'center', gap: 12 }]}>
          <BarChart2 size={32} color={C.textMid} />
          <Text style={[s.bodyText, { textAlign: 'center', color: C.textMid }]}>
            Ainda sem dados suficientes
          </Text>
          <Text style={[s.microText, { textAlign: 'center', maxWidth: 240 }]}>
            Adiciona as tuas primeiras faturas para ver gráficos aqui
          </Text>
          <Pressable
            onPress={() => navigation?.navigate?.('Faturas')}
            style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.brandDim, borderRadius: 10 }}
          >
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
    const last  = porMes[porMes.length - 1]?.total || 0;
    const prev  = porMes[porMes.length - 2]?.total || 0;
    const diff  = last - prev;
    const pct   = prev > 0 ? Math.abs(diff / prev * 100) : 0;
    tendencia = { diff, pct: Math.round(pct), subiu: diff > 0 };
  }

  return (
    <Reveal delay={140} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Os teus gastos" />
      <View style={s.card}>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
          {hasCats && (
            <Pressable
              onPress={() => { setTab('categorias'); setSelectedBar(null); }}
              style={[s.tab, tab === 'categorias' && s.tabActive]}
            >
              <Text style={[s.tabText, tab === 'categorias' && s.tabTextActive]}>
                Por categoria
              </Text>
            </Pressable>
          )}
          {hasMeses && (
            <Pressable
              onPress={() => { setTab('mensal'); setSelectedMonth(null); }}
              style={[s.tab, tab === 'mensal' && s.tabActive]}
            >
              <Text style={[s.tabText, tab === 'mensal' && s.tabTextActive]}>
                Evolução
              </Text>
            </Pressable>
          )}
        </View>

        {/* Tab: Categorias */}
        {tab === 'categorias' && hasCats && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {topCat && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, padding: 12, backgroundColor: C.surface2, borderRadius: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CHART_COLORS[0] }} />
                <Text style={[s.microText, { flex: 1 }]}>
                  A tua categoria principal é{' '}
                  <Text style={{ color: C.text, fontWeight: '800' }}>
                    {topCat.categoria || topCat.label}
                  </Text>{' '}
                  com{' '}
                  <Text style={{ color: CHART_COLORS[0], fontWeight: '800' }}>
                    {fmt(topCat.valor || topCat.total)} €
                  </Text>
                </Text>
              </View>
            )}

            <InteractiveBarChart
              items={porCategoria}
              onSelect={setSelectedBar}
              selectedIdx={selectedBar}
            />

            <Text style={[s.microText, { textAlign: 'center', marginTop: 14, opacity: 0.6 }]}>
              Toca numa categoria para ver detalhes
            </Text>
          </View>
        )}

        {/* Tab: Mensal */}
        {tab === 'mensal' && hasMeses && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {tendencia && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, padding: 12, backgroundColor: C.surface2, borderRadius: 10 }}>
                {tendencia.subiu
                  ? <TrendingUp size={14} color={C.red} />
                  : <TrendingDown size={14} color={C.green} />
                }
                <Text style={[s.microText, { flex: 1 }]}>
                  Este mês gastaste{' '}
                  <Text style={{ color: tendencia.subiu ? C.red : C.green, fontWeight: '800' }}>
                    {tendencia.subiu ? '+' : '-'}{tendencia.pct}%
                  </Text>{' '}
                  {tendencia.subiu ? 'mais' : 'menos'} do que no mês anterior
                </Text>
              </View>
            )}

            <MonthlyChart
              data={porMes}
              onMonthSelect={setSelectedMonth}
              selectedMonth={selectedMonth}
            />

            <Text style={[s.microText, { textAlign: 'center', marginTop: 14, opacity: 0.6 }]}>
              Toca num mês para ver o valor
            </Text>
          </View>
        )}
      </View>
    </Reveal>
  );
}

// ─── Hero Card ────────────────────────────────────────────────────────────────
function HeroCard({ data, onSearchPress }) {
  const spent    = data?.total_gasto || 0;
  const budget   = data?.orcamento   || 0;
  const pct      = budget > 0 ? (spent / budget) * 100 : 0;
  const barColor = pct > 90 ? C.red : pct > 70 ? C.yellow : C.green;

  return (
    <Reveal delay={60} style={{ marginHorizontal: SPACE.lg, marginTop: 12, marginBottom: 14 }}>
      <View style={[s.card, { padding: 20 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={s.label}>Gasto este mês</Text>
            <Text style={[s.bigNum, { marginTop: 4 }]}>{fmt(spent)} €</Text>
            {budget > 0 && (
              <Text style={s.subText}>de {fmt(budget)} € orçamentados</Text>
            )}
          </View>
          <Pressable onPress={onSearchPress} style={s.iconBtn} hitSlop={8}>
            <Search size={17} color={C.textMid} />
          </Pressable>
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
    </Reveal>
  );
}

// ─── Metrics Row ──────────────────────────────────────────────────────────────
function MetricsRow({ data }) {
  const comparacao = data?.comparacao || {};
  const variacao   = comparacao.variacao_pct;
  const subiu      = comparacao.subiu;

  const metrics = [
    {
      label: 'Faturas',
      value: data?.num_faturas ?? '—',
      icon:  <Receipt size={14} color={C.brand} />,
      color: C.brand,
    },
    {
      label: 'Alertas',
      value: data?.alertas?.length ?? 0,
      icon:  <AlertCircle size={14} color={data?.alertas?.length ? C.red : C.green} />,
      color: data?.alertas?.length ? C.red : C.green,
    },
    {
      label: 'Vs. mês ant.',
      value: variacao != null ? `${subiu ? '+' : ''}${variacao}%` : '—',
      icon:  subiu
        ? <TrendingUp size={14} color={C.red} />
        : <TrendingDown size={14} color={C.green} />,
      color: subiu ? C.red : C.green,
    },
  ];

  return (
    <Reveal delay={100} style={{ flexDirection: 'row', gap: 10, marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      {metrics.map((m, i) => (
        <View key={i} style={[s.card, { flex: 1, padding: 14, alignItems: 'center', gap: 6 }]}>
          {m.icon}
          <Text style={[s.metricVal, { color: m.color }]}>{m.value}</Text>
          <Text style={s.label}>{m.label}</Text>
        </View>
      ))}
    </Reveal>
  );
}

// ─── Insights Verly (texto + mood) ───────────────────────────────────────────
function InsightsSection({ mood, feed }) {
  const hasMood     = !!mood?.frase;
  const feedItems   = Array.isArray(feed)
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
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.brand, marginTop: 6 }} />
                <Text style={[s.bodyText, { flex: 1, color: C.textMid, lineHeight: 20, fontWeight: '500' }]}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Reveal>
  );
}

// ─── Alertas accordion ────────────────────────────────────────────────────────
function AlertsPanel({ visible, alertas = [] }) {
  const maxH = useRef(new Animated.Value(0)).current;
  const opac = useRef(new Animated.Value(0)).current;
  const ITEM_H = 64;

  useEffect(() => {
    const target = visible ? alertas.length * ITEM_H + 16 : 0;
    Animated.parallel([
      Animated.timing(maxH, { toValue: target, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(opac, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: false }),
    ]).start();
  }, [visible]);

  if (!alertas.length) return null;

  return (
    <Animated.View style={{ overflow: 'hidden', maxHeight: maxH, opacity: opac, marginHorizontal: SPACE.lg, marginBottom: 14 }}>
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

// ─── Faturas recentes ─────────────────────────────────────────────────────────
function RecentFaturas({ faturas = [], navigation }) {
  if (!faturas.length) return null;
  return (
    <Reveal delay={220} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Últimas faturas" action="Ver todas" onAction={() => navigation.navigate('Faturas')} />
      <View style={s.card}>
        {faturas.map((f, i) => (
          <Pressable
            key={f.id}
            onPress={() => navigation.navigate('FaturaDetalhe', { faturaId: f.id })}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
              borderBottomWidth: i < faturas.length - 1 ? 1 : 0, borderBottomColor: C.border,
              opacity: pressed ? 0.75 : 1,
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
        ))}
      </View>
    </Reveal>
  );
}

// ─── Upload Sheet ─────────────────────────────────────────────────────────────
// CORRIGIDO: usa faturasAPI.upload em vez de fetch direto, e chama onUploaded após sucesso
function UploadSheet({ visible, onClose, onUploaded }) {
  const slideY  = useRef(new Animated.Value(400)).current;
  const overlay = useRef(new Animated.Value(0)).current;
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY,  { toValue: 0, damping: 26, stiffness: 180, useNativeDriver: true }),
        Animated.timing(overlay, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,  { toValue: 400, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(overlay, { toValue: 0,   duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const upload = async (uri, name, type) => {
    setUploading(true);
    try {
      await faturasAPI.upload(uri, name, type);
      onClose();
      // Pequeno delay para dar tempo ao backend de processar antes do reload
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
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', opacity: overlay, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
          <View style={s.sheetHandle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <Text style={s.sheetTitle}>Adicionar fatura</Text>
            <Pressable onPress={onClose} hitSlop={10}><X size={18} color={C.textMid} /></Pressable>
          </View>
          {uploading ? (
            <View style={{ alignItems: 'center', paddingVertical: 36, gap: 12 }}>
              <Zap size={26} color={C.brand} />
              <Text style={[s.label, { textAlign: 'center' }]}>A processar com IA…</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {OPTIONS.map(({ label, sub, Icon, color, fn }) => (
                <Pressable
                  key={label}
                  onPress={fn}
                  style={({ pressed }) => [s.uploadOption, { opacity: pressed ? 0.75 : 1 }]}
                >
                  <View style={{ width: 48, height: 48, borderRadius: RADIUS.md, backgroundColor: color + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
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

// ─── Search Overlay ───────────────────────────────────────────────────────────
function SearchOverlay({ visible, onClose, navigation }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [q, setQ]             = useState('');
  const [results, setResults] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
    if (!visible) { setQ(''); setResults([]); }
  }, [visible]);

  const search = (text) => {
    setQ(text);
    clearTimeout(timer.current);
    if (!text.trim()) return setResults([]);
    timer.current = setTimeout(async () => {
      try {
        const d = await faturasAPI.listar({ q: text });
        setResults(d.faturas || []);
      } catch (_) {}
    }, 320);
  };

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg, zIndex: 9999, opacity }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={{ flex: 1, padding: SPACE.lg, paddingTop: 56 }}>
          <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16 }]}>
            <Search size={16} color={C.textMid} />
            <TextInput
              autoFocus value={q} onChangeText={search}
              placeholder="Pesquisar faturas…" placeholderTextColor={C.textMid}
              style={{ flex: 1, fontSize: FONT.md, color: C.text, paddingVertical: 10 }}
            />
            <Pressable onPress={onClose} hitSlop={8}><X size={16} color={C.textMid} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {results.map(f => (
              <Pressable
                key={f.id}
                onPress={() => { onClose(); navigation.navigate('FaturaDetalhe', { faturaId: f.id }); }}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.bodyText}>{f.loja}</Text>
                  <Text style={[s.microText, { marginTop: 2 }]}>{f.categoria} · {f.data_compra || '—'}</Text>
                </View>
                <Text style={[s.bodyText, { fontWeight: '800' }]}>{fmt(f.total)} €</Text>
              </Pressable>
            ))}
            {!results.length && q.length > 1 && (
              <Text style={[s.label, { textAlign: 'center', marginTop: 40 }]}>Sem resultados para "{q}"</Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────
function FAB({ onPress }) {
  const scale = useRef(new Animated.Value(0)).current;
  const { onPressIn, onPressOut, scale: pressScale } = useScalePress(0.92);

  useEffect(() => {
    setTimeout(() => {
      Animated.spring(scale, { toValue: 1, speed: 12, bounciness: 14, useNativeDriver: true }).start();
    }, 400);
  }, []);

  return (
    <Animated.View style={[s.fab, { transform: [{ scale: Animated.multiply(scale, pressScale) }] }]}>
      <Pressable
        onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress}
        style={{ width: '100%', height: '100%', borderRadius: RADIUS.lg, justifyContent: 'center', alignItems: 'center' }}
      >
        <Plus size={22} color="#fff" strokeWidth={2.5} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ user, alertas, showAlerts, onBellPress, insets }) {
  const dotScale = useRef(new Animated.Value(0)).current;
  const hasAlerts = alertas?.length > 0;

  useEffect(() => {
    if (hasAlerts) {
      setTimeout(() => {
        Animated.spring(dotScale, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: true }).start();
      }, 500);
    }
  }, [hasAlerts]);

  return (
    <Reveal delay={0} style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.sm,
      paddingBottom: 6,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials(user?.nome)}</Text>
        </View>
        <View>
          <Text style={s.microText}>Olá,</Text>
          <Text style={[s.bodyText, { fontWeight: '800', fontSize: FONT.lg }]}>
            {(user?.nome || '').split(' ')[0] || 'Utilizador'}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onBellPress}
        style={[s.iconBtn, showAlerts && { backgroundColor: C.brandDim, borderColor: C.brand }]}
      >
        <Bell size={17} color={hasAlerts ? C.red : C.textMid} />
        {hasAlerts && (
          <Animated.View style={[s.dot, { transform: [{ scale: dotScale }] }]} />
        )}
      </Pressable>
    </Reveal>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <View style={{ gap: 14, paddingHorizontal: SPACE.lg, marginTop: 12 }}>
      <Skeleton height={130} radius={RADIUS.lg} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[1, 2, 3].map(i => <Skeleton key={i} height={76} style={{ flex: 1 }} radius={RADIUS.md} />)}
      </View>
      <Skeleton height={200} radius={RADIUS.lg} />
      <Skeleton height={140} radius={RADIUS.lg} />
    </View>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }) {
  const { user }  = useAuth();
  const insets    = useSafeAreaInsets();
  const [data,       setData]   = useState(null);
  const [loading,    setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [showUpload, setUpload]  = useState(false);
  const [showSearch, setSearch]  = useState(false);
  const [showAlerts, setAlerts]  = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true); else setLoading(true);
    try {
      const d = await dashboardAPI.get();
      setData(d);
    } catch (e) { console.warn('Dashboard:', e.message); }
    finally { setLoading(false); setRefresh(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Normaliza os dados do backend para o formato esperado pelos gráficos
  const { porCategoria, porMes } = normalizeDashboardData(data);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }
      >
        <Header
          user={user}
          alertas={data?.alertas}
          showAlerts={showAlerts}
          onBellPress={() => setAlerts(v => !v)}
          insets={insets}
        />
        <AlertsPanel visible={showAlerts} alertas={data?.alertas || []} />

        {loading ? <LoadingSkeleton /> : (
          <>
            <HeroCard data={data} onSearchPress={() => setSearch(true)} />
            <MetricsRow data={data} />

            {/* Gráficos interativos com dados normalizados do backend */}
            <ChartsSection
              porCategoria={porCategoria}
              porMes={porMes}
              navigation={navigation}
            />

            <InsightsSection mood={data?.mood} feed={data?.feed} />

            {data?.subscricoes?.count_danger > 0 && (
              <Reveal delay={200} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
                <Card
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
                </Card>
              </Reveal>
            )}

            <RecentFaturas faturas={data?.ultimas_faturas} navigation={navigation} />
          </>
        )}
      </ScrollView>

      <FAB onPress={() => setUpload(true)} />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
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
    padding: 24, paddingBottom: 44,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: FONT.lg, fontWeight: '800', color: C.text },
  uploadOption: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  tab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: C.brandDim,
    borderColor: C.brand + '40',
  },
  tabText: { fontSize: 12, fontWeight: '700', color: C.textMid },
  tabTextActive: { color: C.brand },
});
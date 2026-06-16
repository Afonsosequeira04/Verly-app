// src/screens/DashboardScreen.js — Dashboard com Moti + Reanimated 4
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity,
  StatusBar, RefreshControl, Modal, Alert,
  StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { MotiView, MotiText } from 'moti';
import * as ImagePicker    from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Bell, Plus, X, TrendingUp, TrendingDown,
  Receipt, Camera, Upload, FileText, Zap,
  ChevronRight, ChevronDown, ChevronUp, RefreshCw,
  AlertCircle, Target, BarChart2,
  Shield, Flame, Download, WalletCards,
} from 'lucide-react-native';
import { dashboardAPI, faturasAPI, notificacoesAPI, insightsAPI, apiFetch, openBankingAPI, preferencesAPI } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import {
  Reveal, Skeleton, SectionHeader,
  AnimatedListItem,
  AnimatedCounter, GlowPulse,
} from '../components/UI';
import { FinancialChartsPanel, FinancialChartsSkeleton } from '../components/FinancialCharts';
import IntelligenceDeck from '../components/IntelligenceDeck';
import { haptic } from '../utils/haptics';
import { formatCompactMoney, formatMoney } from '../utils/money';

const C   = COLORS;
const W   = Dimensions.get('window').width;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

const PREFS_KEY = '@verly_dashboard_prefs';
const CARDS_DEFAULT = ['hero', 'impacto', 'faturas'];
const DEFAULT_PREFS = {
  mostrarPrevisao: true,
  mostrarGraficos: true,
  mostrarFaturas:  true,
};
const CURRENCIES = ['EUR', 'USD', 'GBP', 'DKK', 'SEK', 'NOK'];

function normalizeDashboardData(data) {
  if (!data) return { porCategoria: [], porMes: [], chartCurrency: 'EUR', chartSources: [] };
  const summary = data.real_summary || {};
  const chartCurrency = summary.currency || data.active_currency || data.currency || 'EUR';
  const chartSources = Array.isArray(summary.fontes) ? summary.fontes : [];
  const summaryCategories = summary.mes_atual?.por_categoria?.length
    ? summary.mes_atual.por_categoria
    : summary.por_categoria;
  const porCategoria = Array.isArray(summaryCategories)
    ? summaryCategories.map(c => ({
        categoria: c.categoria || c.nome || 'Outros',
        total: c.valor ?? c.total ?? 0,
        currency: c.currency || chartCurrency,
      }))
    : Array.isArray(data.categorias)
      ? data.categorias.map(c => ({
          categoria: c.nome || c.categoria || 'Outros',
          total: c.total || 0,
          currency: c.currency || chartCurrency,
        }))
    : [];
  let porMes = [];
  if (Array.isArray(summary.historico_mensal) && summary.historico_mensal.length) {
    porMes = summary.historico_mensal.map(item => ({
      mes: item.mes,
      total: item.valor ?? item.total ?? 0,
      currency: item.currency || chartCurrency,
    }));
  } else if (data.evolucao?.labels && data.evolucao?.values) {
    porMes = data.evolucao.labels.map((label, i) => ({
      mes: label,
      total: data.evolucao.values[i] || 0,
      currency: chartCurrency,
    }));
  }
  return { porCategoria, porMes, chartCurrency, chartSources };
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

// ─── Charts financeiros reutilizáveis ─────────────────────────────────────────
function DashboardAmbientScene({ pct = 0, color = C.brand }) {
  const safePct = Math.max(6, Math.min(100, Math.round(pct || 0)));
  const trend = [0.22, 0.48, 0.36, 0.74, 0.56].map((ratio) => Math.max(20, Math.round(ratio * 88 + safePct * 0.32)));

  return (
    <View style={s.ambientWrap} pointerEvents="none">
      <MotiView
        from={{ opacity: 0.18, scale: 0.96, rotate: '-4deg' }}
        animate={{ opacity: 0.34, scale: 1.04, rotate: '4deg' }}
        transition={{ loop: true, type: 'timing', duration: 6200 }}
        style={[s.ambientOrbit, { borderColor: color + '28' }]}
      />
      <MotiView
        from={{ translateY: 8, opacity: 0.42 }}
        animate={{ translateY: -6, opacity: 0.78 }}
        transition={{ loop: true, type: 'timing', duration: 4800 }}
        style={s.ambientGlassTicket}
      >
        <View style={[s.ambientTicketChip, { backgroundColor: color + '24' }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[s.ambientTicketLine, { width: '78%' }]} />
          <View style={[s.ambientTicketLine, { width: '48%', opacity: 0.55 }]} />
        </View>
      </MotiView>
      <View style={s.ambientPath}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={[s.ambientPathLine, { top: 26 + index * 32, opacity: 0.2 - index * 0.04 }]} />
        ))}
      </View>
      <View style={s.ambientBars}>
        {trend.map((height, index) => (
          <MotiView
            key={`${height}-${index}`}
            from={{ height: Math.max(18, height - 14), opacity: 0.34 }}
            animate={{ height, opacity: index === 3 ? 0.9 : 0.58 }}
            transition={{ loop: true, type: 'timing', duration: 2600 + index * 240 }}
            style={[
              s.ambientBar,
              { backgroundColor: index === 3 ? color + '80' : (C.cyan || C.brand) + '42' },
            ]}
          />
        ))}
      </View>
      <MotiView
        from={{ scale: 0.82, opacity: 0.42 }}
        animate={{ scale: 1.14, opacity: 0.9 }}
        transition={{ loop: true, type: 'timing', duration: 3600 }}
        style={[s.ambientPulseDot, { backgroundColor: color }]}
      />
    </View>
  );
}

function ChartsSection({ porCategoria, porMes, navigation, chartCurrency = 'EUR', chartSources = [] }) {
  const hasData = (Array.isArray(porCategoria) && porCategoria.length > 0) || (Array.isArray(porMes) && porMes.length > 0);

  if (!hasData) {
    return (
      <Reveal delay={140} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
        <SectionHeader title="Os teus gastos" />
        <View style={[s.card, { padding: 24, alignItems: 'center', gap: 12 }]}>
          <BarChart2 size={32} color={C.textMid} />
          <Text style={[s.bodyText, { textAlign: 'center', color: C.text }]}>Sem gastos para analisar</Text>
          <Text style={[s.microText, { textAlign: 'center', maxWidth: 240 }]}>Adiciona uma fatura ou liga o banco para veres categorias e evolução.</Text>
          <Pressable onPress={() => navigation?.navigate?.('Faturas')} style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.brandDim, borderRadius: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.brand }}>+ Adicionar fatura</Text>
          </Pressable>
        </View>
      </Reveal>
    );
  }

  return (
    <Reveal delay={140} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <FinancialChartsPanel
        title="Analise viva dos gastos"
        subtitle="Tempo, categorias e profundidade num grafico unico e interativo."
        categories={porCategoria}
        months={porMes}
        sources={chartSources}
        currency={chartCurrency}
      />
    </Reveal>
  );
}

function HeroCard({ data }) {
  const spent    = data?.total_gasto || 0;
  const budget   = data?.orcamento   || 0;
  const currency = data?.currency || 'EUR';
  const pct      = budget > 0 ? (spent / budget) * 100 : 0;
  const barColor = pct > 90 ? C.red : pct > 70 ? C.yellow : C.green;

  return (
    <Animated.View
      entering={FadeInDown.delay(60).duration(450).springify()}
      style={{ marginHorizontal: SPACE.lg, marginTop: 12, marginBottom: 14 }}
    >
      <View style={s.heroSummary}>
        <View style={s.heroTopRow}>
          <View style={s.heroCopy}>
            <Text style={s.label}>Gasto este mês</Text>
            <AnimatedCounter
              value={spent}
              suffix={` ${currency}`}
              decimals={2}
              duration={1100}
              style={[s.bigNum, { marginTop: 4 }]}
            />
            {budget > 0 && <Text style={s.subText}>de {formatMoney(budget, currency)} orçamentados</Text>}
          </View>
        </View>

        {budget > 0 && (
          <View style={{ marginTop: 18 }}>
            <BudgetBar pct={pct} color={barColor} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={s.microText}>{Math.round(pct)}% utilizado</Text>
              <Text style={[s.microText, { color: barColor }]}>
                {pct > 100
                  ? `+${formatMoney(spent - budget, currency)} acima`
                  : `${formatMoney(budget - spent, currency)} restante`}
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
    { label: 'Faturas', value: data?.num_faturas ?? 0, icon: <Receipt size={14} color={C.brand} />, color: C.brand },
    { label: 'Alertas', value: data?.alertas?.length ?? 0, icon: <AlertCircle size={14} color={data?.alertas?.length ? C.red : C.green} />, color: data?.alertas?.length ? C.red : C.green },
  ];

  if (variacao != null) {
    metrics.push({
      label: 'Vs. mês',
      value: `${subiu ? '+' : ''}${variacao}%`,
      icon: subiu ? <TrendingUp size={14} color={C.red} /> : <TrendingDown size={14} color={C.green} />,
      color: subiu ? C.red : C.green,
    });
  }

  return (
    <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      {metrics.map((m, i) => {
        const hasAlert = i === 1 && (data?.alertas?.length ?? 0) > 0;
        const inner = (
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
        );
        return hasAlert
          ? <GlowPulse key={i} color={C.red} intensity={0.4} period={1800}>{inner}</GlowPulse>
          : inner;
      })}
    </View>
  );
}

// ─── InsightsSection ──────────────────────────────────────────────────────────
function BankingContext({ data, navigation }) {
  const banking = data?.banking;
  const currencies = banking?.available_currencies || data?.real_summary?.available_currencies || [];
  const excluded = banking?.excluded || data?.real_summary?.excluded;
  if (!currencies.length && !excluded?.count) return null;

  return (
    <Reveal delay={120} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <Pressable style={[s.card, { padding: 14 }]} onPress={() => { haptic.light(); navigation?.navigate?.('ImportarDados'); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <View style={[s.iconBox, { backgroundColor: C.brand + '18' }]}>
            <WalletCards size={16} color={C.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bodyText}>Banco ligado aos gastos</Text>
            <Text style={[s.microText, { marginTop: 2 }]}>Moedas e movimentos reais sincronizados</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {currencies.slice(0, 3).map(item => (
            <View key={item.currency} style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={[s.microText, { color: item.currency === banking?.active_currency ? C.brand : C.textMid, fontWeight: '900' }]}>
                {item.currency} · {formatCompactMoney(item.total, item.currency)}
              </Text>
            </View>
          ))}
        </View>
        {excluded?.count > 0 && (
          <Text style={[s.microText, { marginTop: 10, color: C.green, fontWeight: '700' }]}>
            {excluded.count} transferencias/poupancas fora dos gastos
          </Text>
        )}
      </Pressable>
    </Reveal>
  );
}

function ContextSelector({ currency, onCurrency, accountId, onAccount, accounts = [] }) {
  return (
    <Reveal delay={70} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <View style={s.contextStrip}>
        <Text style={s.contextLabel}>Vista</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.contextScroll}>
          {CURRENCIES.map(code => {
            const active = code === currency;
            return (
              <Pressable
                key={code}
                onPress={() => onCurrency(code)}
                style={[s.contextChip, active && s.contextChipActive]}
              >
                <Text style={[s.contextChipText, active && s.contextChipTextActive]}>{code}</Text>
              </Pressable>
            );
          })}
          {[{ id: 'all', nome_banco: 'Todas as contas' }, ...accounts].map(account => {
            const id = account.id === 'all' ? 'all' : String(account.id);
            const active = id === String(accountId || 'all');
            return (
              <Pressable
                key={id}
                onPress={() => onAccount(id)}
                style={[s.contextChip, active && s.contextChipBank]}
              >
                <Text numberOfLines={1} style={[s.contextChipText, active && s.contextChipBankText]}>
                  {account.nome_banco || account.iban || account.account_id || 'Conta'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Reveal>
  );
}

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

// ─── RecentFaturas ────────────────────────────────────────────────────────────
function RecentFaturas({ faturas = [], navigation }) {
  if (!faturas.length) return null;
  return (
    <Reveal delay={220} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <SectionHeader title="Últimas faturas" action="Ver todas" onAction={() => navigation.navigate('Faturas')} />
      <View style={s.card}>
        {faturas.map((f, i) => {
          const title = f.loja || f.nome_ficheiro || 'Fatura';
          const meta = [f.categoria, f.data_compra].filter(Boolean).join(' · ');
          return (
          <AnimatedListItem key={f.id} index={i}>
            <Pressable
              onPress={() => navigation.navigate('FaturaDetalhe', { id: f.id })}
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
                <Text style={s.bodyText} numberOfLines={1}>{title}</Text>
                {!!meta && <Text style={[s.microText, { marginTop: 2 }]}>{meta}</Text>}
              </View>
              <Text style={[s.bodyText, { fontWeight: '800' }]}>{fmt(f.total)} €</Text>
              <ChevronRight size={13} color={C.textMid} />
            </Pressable>
          </AnimatedListItem>
          );
        })}
      </View>
    </Reveal>
  );
}

// ─── UploadSheet com Reanimated 4 ────────────────────────────────────────────
function UploadSheet({ visible, onClose, onUploaded, onUploadResult }) {
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
        setTimeout(() => { onUploadResult?.(result.fatura); }, 300);
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

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <View style={{ gap: 14, paddingHorizontal: SPACE.lg, marginTop: 12 }}>
      <Skeleton height={130} radius={RADIUS.lg} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[1,2,3].map(i => <Skeleton key={i} height={76} style={{ flex: 1 }} radius={RADIUS.md} />)}
      </View>
      <FinancialChartsSkeleton title="A montar dashboard" />
      <Skeleton height={140} radius={RADIUS.lg} />
    </View>
  );
}

// ─── Streak Badge ─────────────────────────────────────────────────────────────
function StreakBadge({ streak = 0 }) {
  if (streak === 0) return null;
  return (
    <MotiView
      from={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', delay: 400 }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#FF7340' + '22',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#FF7340' + '60',
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Flame size={14} color="#FF7340" />
      <Text style={{ fontSize: 13, fontWeight: '900', color: '#FF7340' }}>
        {streak} dia{streak !== 1 ? 's' : ''}
      </Text>
    </MotiView>
  );
}

// ─── Poupança Card ────────────────────────────────────────────────────────────
function PoupancaCard({ data }) {
  const [resultado,  setResultado]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [expanded,   setExpanded]   = useState(false);

  const spent = data?.total_gasto || 0;

  useEffect(() => {
    if (!spent || spent === 0) return;
    carregar();
  }, [spent]);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/poupanca');
      if (res.success && !res.sem_dados) setResultado(res);
    } catch (e) {
      setResultado(null);
    } finally {
      setLoading(false);
    }
  };

  if (!spent || spent === 0) return null;

  const poupancaPossivel = resultado?.poupanca_estimada_mensal || resultado?.poupanca_possivel || null;

  return (
    <Animated.View entering={FadeInDown.delay(370).springify()} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <Pressable
        onPress={() => setExpanded(e => !e)}
        style={{
          backgroundColor: C.surface,
          borderRadius: RADIUS.lg,
          borderWidth: 1,
          borderColor: C.brand + '40',
          padding: 14,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 12,
            backgroundColor: C.brand + '22',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Zap size={20} color={C.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Sugestão de Poupança
            </Text>
            {loading ? (
              <Text style={{ fontSize: 13, color: C.textMid, marginTop: 2 }}>A analisar os teus padrões...</Text>
            ) : poupancaPossivel ? (
              <Text style={{ fontSize: 18, fontWeight: '900', color: C.brand, marginTop: 1 }}>
                Até {fmt(poupancaPossivel)} € /mês
              </Text>
            ) : (
              <Text style={{ fontSize: 13, color: C.textMid, marginTop: 2 }}>Toca para ver a análise</Text>
            )}
          </View>
          {expanded
            ? <ChevronUp size={16} color={C.textSub} />
            : <ChevronDown size={16} color={C.textSub} />
          }
        </View>

        {/* Conteúdo expandido */}
        {expanded && (
          <Animated.View entering={FadeInDown.duration(200)} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border }}>
            {loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={C.brand} />
                <Text style={{ color: C.textMid, fontSize: 13 }}>A analisar histórico e padrões reais...</Text>
              </View>
            ) : resultado ? (
              <>
                {/* Sugestão principal */}
                <Text style={{ color: C.text, fontSize: 14, lineHeight: 20, marginBottom: 12 }}>
                  {resultado.sugestao}
                </Text>

                {/* Breakdown por categoria */}
                {resultado.breakdown?.length > 0 && (
                  <View style={{ gap: 8, marginBottom: 12 }}>
                    {resultado.breakdown.map((b, i) => (
                      <View key={i} style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: C.surface2, borderRadius: 10, padding: 10,
                      }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: C.text, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>
                            {b.categoria}
                          </Text>
                          <Text style={{ color: C.textSub, fontSize: 11 }}>
                            Cortar {b.corte_sugerido_pct}% → poupar {fmt(b.economia_mensal)}€/mês
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: C.green, fontSize: 13, fontWeight: '800' }}>
                            +{fmt(b.economia_anual)}€
                          </Text>
                          <Text style={{ color: C.textSub, fontSize: 10 }}>por ano</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Impacto anual total */}
                {resultado.poupanca_estimada_anual > 0 && (
                  <View style={{
                    backgroundColor: C.brand + '15', borderRadius: 10, padding: 10,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 10,
                  }}>
                    <Text style={{ color: C.textMid, fontSize: 12 }}>Impacto anual estimado</Text>
                    <Text style={{ color: C.brand, fontSize: 15, fontWeight: '900' }}>
                      {fmt(resultado.poupanca_estimada_anual)} €
                    </Text>
                  </View>
                )}

                <Pressable onPress={carregar} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={12} color={C.brand} />
                  <Text style={{ color: C.brand, fontSize: 12, fontWeight: '600' }}>Atualizar análise</Text>
                </Pressable>
              </>
            ) : (
              <Text style={{ color: C.textMid, fontSize: 13 }}>Sem dados suficientes para análise.</Text>
            )}
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Previsão Card ────────────────────────────────────────────────────────────
function PrevisaoCard({ previsao, orcamento, navigation }) {
  if (!previsao || previsao === 0) return null;
  const vaiUltrapassar = orcamento > 0 && previsao > orcamento;
  const cor = vaiUltrapassar ? C.red : C.green;

  return (
    <Animated.View entering={FadeInDown.delay(350).springify()} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <Pressable
        onPress={() => { haptic.light(); navigation?.navigate('Retrospetiva'); }}
        style={{
          backgroundColor: C.surface,
          borderRadius: RADIUS.lg,
          borderWidth: 1,
          borderColor: cor + '40',
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: cor + '22',
          justifyContent: 'center', alignItems: 'center',
        }}>
          <TrendingUp size={20} color={cor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Previsão este mês
          </Text>
          <Text style={{ fontSize: 20, fontWeight: '900', color: cor, marginTop: 1 }}>
            {fmt(previsao)} €
          </Text>
          {vaiUltrapassar && orcamento > 0 && (
            <Text style={{ fontSize: 11, color: C.red, fontWeight: '600', marginTop: 2 }}>
              Vai ultrapassar o orçamento de {fmt(orcamento)} €
            </Text>
          )}
          {!vaiUltrapassar && orcamento > 0 && (
            <Text style={{ fontSize: 11, color: C.green, fontWeight: '600', marginTop: 2 }}>
              Dentro do orçamento de {fmt(orcamento)} €
            </Text>
          )}
        </View>
        <ChevronRight size={16} color={C.textSub} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Quick Links ──────────────────────────────────────────────────────────────
function QuickLinks({ navigation, numGarantias = 0 }) {
  if (numGarantias <= 0) return null;

  return (
    <Animated.View entering={FadeInDown.delay(400).springify()} style={{ marginHorizontal: SPACE.lg, marginBottom: 14 }}>
      <Pressable
        onPress={() => { haptic.light(); navigation?.navigate('Garantias'); }}
        style={{
          backgroundColor: C.surface,
          borderRadius: RADIUS.lg,
          borderWidth: 1,
          borderColor: numGarantias > 0 ? '#00D68F40' : C.border,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={[s.iconBox, { backgroundColor: numGarantias > 0 ? '#00D68F18' : C.surface2 }]}>
          <Shield size={18} color={numGarantias > 0 ? '#00D68F' : C.textMid} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.bodyText}>Garantias</Text>
          <Text style={[s.microText, { marginTop: 2 }]}>
            {numGarantias > 0 ? `${numGarantias} ativa${numGarantias !== 1 ? 's' : ''}` : 'Sem garantias ativas'}
          </Text>
        </View>
        <ChevronRight size={14} color={C.textMid} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────



function ImpactActions({ navigation, onUpload, hasData }) {
  const actions = [
    {
      key: 'chat',
      title: 'Ask Verly',
      sub: 'Pede uma acao ou decisao rapida',
      icon: <Zap size={17} color={C.brandMid || C.brand} />,
      tint: C.brand,
      onPress: () => navigation.navigate('Chat'),
    },
    {
      key: 'deals',
      title: 'Live Deals',
      sub: 'Compara antes de comprar',
      icon: <Flame size={17} color={C.yellow} />,
      tint: C.yellow,
      onPress: () => navigation.navigate('LiveDeals'),
    },
    {
      key: 'refund',
      title: 'Refund Radar',
      sub: 'Procura dinheiro recuperavel',
      icon: <Shield size={17} color={C.green} />,
      tint: C.green,
      onPress: () => navigation.navigate('RefundRadar'),
    },
    {
      key: 'data',
      title: hasData ? 'Adicionar fatura' : 'Ligar dados',
      sub: hasData ? 'Regista uma compra agora' : 'Banco, Gmail ou fatura',
      icon: hasData ? <Receipt size={17} color={C.cyan || C.brand} /> : <Download size={17} color={C.cyan || C.brand} />,
      tint: C.cyan || C.brand,
      onPress: () => (hasData ? onUpload?.() : navigation.navigate('ImportarDados')),
    },
  ];

  return (
    <Reveal delay={120} style={s.impactSection}>
      <View style={s.impactHeader}>
        <Text style={s.impactTitle}>Acoes que importam</Text>
        <Pressable onPress={() => navigation.navigate('Menu')} hitSlop={8}>
          <Text style={s.impactMore}>Ver tudo</Text>
        </Pressable>
      </View>
      <View style={s.impactGrid}>
        {actions.map((action, index) => (
          <Pressable
            key={action.key}
            onPress={() => { haptic.light(); action.onPress(); }}
            style={({ pressed }) => [
              s.impactAction,
              index < 2 && { marginBottom: 10 },
              pressed && { opacity: 0.76, transform: [{ scale: 0.99 }] },
            ]}
          >
            <View style={[s.impactIcon, { borderColor: action.tint + '55', backgroundColor: action.tint + '14' }]}>
              {action.icon}
            </View>
            <Text style={s.impactActionTitle} numberOfLines={1}>{action.title}</Text>
            <Text style={s.impactActionSub} numberOfLines={2}>{action.sub}</Text>
          </Pressable>
        ))}
      </View>
    </Reveal>
  );
}

export default function DashboardScreen({ navigation, route }) {
  const { user }  = useAuth();
  const insets    = useSafeAreaInsets();
  const [data,       setData]   = useState(null);
  const [loading,    setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [showUpload, setUpload]  = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [notifs,     setNotifs]     = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const [notifLoad,  setNotifLoad]  = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // fatura extraída após upload
  const [insights,   setInsights]   = useState([]);
  const [streakDias,   setStreakDias]   = useState(0);
  const [numGarantias, setNumGarantias] = useState(0);
  const [previsao,     setPrevisao]     = useState(null);
  const [orcamento,    setOrcamento]    = useState(0);
  const [prefs,        setPrefs]        = useState(DEFAULT_PREFS);
  const [selectedCurrency, setSelectedCurrency] = useState('EUR');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [accounts, setAccounts] = useState([]);

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
      if (data.success) setInsights((data.insights || []).slice(0, 3));
    } catch (e) {}
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const fetchExtras = useCallback(async () => {
    try {
      const res = await apiFetch('/exportar/resumo');
      if (res.success) {
        setStreakDias(res.streak_dias || 0);
        setOrcamento(res.orcamento_mensal || 0);
        const ativas = (res.garantias_ativas || []).filter(g => g.dias_restantes >= 0);
        setNumGarantias(ativas.length);
      }
      // Previsão vem do dashboard
      const ins = await apiFetch('/insights');
      if (ins.success && ins.resumo?.previsao_mensal) {
        setPrevisao(ins.resumo.previsao_mensal);
        if (ins.resumo.orcamento_mensal) setOrcamento(ins.resumo.orcamento_mensal);
      }
    } catch (e) {}
  }, []);

  useEffect(() => { fetchExtras(); }, [fetchExtras]);

  useEffect(() => {
    preferencesAPI.get()
      .then(res => {
        if (res.moeda_preferida) setSelectedCurrency(res.moeda_preferida);
      })
      .catch(() => {});
    openBankingAPI.accounts()
      .then(res => setAccounts(res.accounts || []))
      .catch(() => {});
  }, []);

  // Carrega preferências do dashboard
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then(raw => {
      if (raw) {
        try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }); } catch (_) {}
      }
    });
  }, []);

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
      const params = { currency: selectedCurrency };
      if (selectedAccount && selectedAccount !== 'all') params.account_id = selectedAccount;
      const d = await dashboardAPI.get(params);
      setData(d);
    } catch (e) { console.warn('Dashboard:', e.message); }
    finally { setLoading(false); setRefresh(false); }
  }, [selectedAccount, selectedCurrency]);

  const updateCurrency = useCallback((code) => {
    setSelectedCurrency(code);
    preferencesAPI.update({ moeda_preferida: code }).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { porCategoria, porMes, chartCurrency, chartSources } = normalizeDashboardData(data);
  const dashboardSpent = Number(data?.total_gasto || 0);
  const dashboardBudget = Number(data?.orcamento || 0);
  const dashboardPct = dashboardBudget > 0 ? (dashboardSpent / dashboardBudget) * 100 : 0;
  const dashboardAccent = dashboardPct > 90 ? C.red : dashboardPct > 70 ? C.yellow : C.green;
  const hasUsefulData = dashboardSpent > 0 || Number(data?.num_faturas || 0) > 0 || !!data?.banking?.connected;


  // Renderiza cada card pelo seu id
  const renderCard = (id) => {
    switch (id) {
      case 'hero':
        return <HeroCard key="hero" data={data} />;
      case 'impacto':
        return (
          <ImpactActions
            key="impacto"
            navigation={navigation}
            hasData={hasUsefulData}
            onUpload={() => { haptic.medium(); setUpload(true); }}
          />
        );
      case 'contexto':
        return (
          <ContextSelector
            key="contexto"
            currency={selectedCurrency}
            onCurrency={updateCurrency}
            accountId={selectedAccount}
            onAccount={setSelectedAccount}
            accounts={accounts}
          />
        );
      case 'intelligence':
        return (
          <IntelligenceDeck
            key="intelligence"
            intelligence={data?.financial_intelligence}
            navigation={navigation}
            onUpload={() => { haptic.medium(); setUpload(true); }}
          />
        );
      case 'metricas':
        return (
          <React.Fragment key="metricas">
            <MetricsRow data={data} />
            <BankingContext data={data} navigation={navigation} />
          </React.Fragment>
        );
      case 'previsao':
        return prefs.mostrarPrevisao ? <PrevisaoCard key="previsao" previsao={previsao} orcamento={orcamento} navigation={navigation} /> : null;
      case 'quicklinks':
        return <QuickLinks key="quicklinks" navigation={navigation} numGarantias={numGarantias} />;
      case 'graficos':
        return prefs.mostrarGraficos ? <ChartsSection key="graficos" porCategoria={porCategoria} porMes={porMes} navigation={navigation} chartCurrency={chartCurrency} chartSources={chartSources} /> : null;
      case 'faturas':
        return prefs.mostrarFaturas ? <RecentFaturas key="faturas" faturas={data?.ultimas_faturas} navigation={navigation} /> : null;
      default:
        return null;
    }
  };

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

          {/* Centro — título + streak */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, letterSpacing: 0 }}>Verly</Text>
            <StreakBadge streak={streakDias} />
          </View>

          {/* Direita — upload e menu */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => { haptic.medium(); setUpload(true); }}
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

      <UploadSheet visible={showUpload} onClose={() => setUpload(false)} onUploaded={load} onUploadResult={setUploadResult} />
      <DashboardAmbientScene pct={dashboardPct} color={dashboardAccent} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { haptic.light(); load(true); }} tintColor={C.brand} colors={[C.brand]} />
        }
      >
        {loading ? <LoadingSkeleton /> : (
          <>
            {CARDS_DEFAULT.map((id) => renderCard(id))}
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
  heroCard: {
    padding: 20,
    overflow: 'hidden',
  },
  heroSummary: {
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  ambientWrap: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    height: 250,
    opacity: 0.92,
    zIndex: 0,
  },
  ambientOrbit: {
    position: 'absolute',
    right: -28,
    top: 12,
    width: 184,
    height: 184,
    borderRadius: 92,
    borderWidth: 1,
    transform: [{ rotate: '-12deg' }],
  },
  ambientGlassTicket: {
    position: 'absolute',
    right: 28,
    top: 62,
    width: 150,
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    backgroundColor: 'rgba(18,24,48,0.62)',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ambientTicketChip: {
    width: 28,
    height: 28,
    borderRadius: 10,
  },
  ambientTicketLine: {
    height: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  ambientPath: {
    position: 'absolute',
    left: -36,
    right: 60,
    top: 52,
    height: 116,
    transform: [{ rotate: '-10deg' }],
  },
  ambientPathLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(34,212,253,0.55)',
  },
  ambientBars: {
    position: 'absolute',
    right: 34,
    top: 138,
    height: 96,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  ambientBar: {
    width: 9,
    borderRadius: 6,
  },
  ambientPulseDot: {
    position: 'absolute',
    right: 172,
    top: 96,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  impactSection: {
    marginHorizontal: SPACE.lg,
    marginTop: 2,
    marginBottom: 18,
  },
  impactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  impactTitle: {
    color: C.text,
    fontSize: FONT.lg,
    fontWeight: '900',
  },
  impactMore: {
    color: C.brandMid || C.brand,
    fontSize: FONT.xs,
    fontWeight: '900',
  },
  impactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  impactAction: {
    width: (W - SPACE.lg * 2 - 10) / 2,
    minHeight: 118,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(18,24,38,0.72)',
    padding: 14,
  },
  impactIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  impactActionTitle: {
    color: C.text,
    fontSize: FONT.md,
    fontWeight: '900',
  },
  impactActionSub: {
    color: C.textMid,
    fontSize: FONT.xs,
    lineHeight: 16,
    marginTop: 4,
  },
  label:    { fontSize: FONT.xs, fontWeight: '600', color: C.textMid, letterSpacing: 0.3 },
  bodyText: { fontSize: FONT.md, fontWeight: '600', color: C.text },
  microText:{ fontSize: FONT.xs, color: C.textMid },
  bigNum:   { fontSize: FONT.h1, fontWeight: '900', color: C.text, letterSpacing: 0 },
  subText:  { fontSize: FONT.sm, color: C.textMid, marginTop: 2 },
  metricVal:{ fontSize: FONT.xl, fontWeight: '900', letterSpacing: 0 },
  contextStrip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contextLabel: {
    color: C.textMid,
    fontSize: FONT.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  contextScroll: { gap: 8, alignItems: 'center', paddingRight: 4 },
  contextChip: {
    maxWidth: 180,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    paddingHorizontal: 10,
  },
  contextChipActive: {
    borderColor: C.brand,
    backgroundColor: C.brandDim,
  },
  contextChipBank: {
    borderColor: C.green + '66',
    backgroundColor: C.green + '16',
  },
  contextChipText: {
    color: C.textMid,
    fontSize: FONT.xs,
    fontWeight: '900',
  },
  contextChipTextActive: { color: C.brand },
  contextChipBankText: { color: C.green },
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
});

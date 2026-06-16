// src/screens/InsightsScreen.js — Verly Insights v6 — Donut Chart PocketGuard Style
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, RefreshControl, ActivityIndicator,
  Dimensions, TouchableOpacity, Animated as RNAnimated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  FadeInDown, FadeIn, FadeInUp,
  useSharedValue, useAnimatedStyle,
  withTiming, withDelay, withSpring, Easing,
  interpolate, useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import {
  Zap, TrendingUp, TrendingDown, AlertCircle,
  CheckCircle, Brain, Target, RefreshCw,
  Repeat, Calendar, ArrowRight, ChevronDown, ChevronUp,
  BookOpen, Award, Lightbulb, AlertTriangle, BarChart2,
  DollarSign, PieChart, Clock,
} from 'lucide-react-native';
import { insightsAPI } from '../services/api';
import DonutCategorias from '../components/DonutCategorias';
import ExplainableInsightCard from '../components/ExplainableInsightCard';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const { width: W, height: H } = Dimensions.get('window');
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const fmtK = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmt(n);

const CAT_COLORS = ['#7C6FE0', '#E24B4A', '#00D68F', '#FFB300', '#45B7D1', '#FF7340'];
const CAT_ICONS = {
  'alimentação': '🛒', 'transporte': '🚗', 'saúde': '🏥',
  'lazer': '🎮', 'vestuário': '👕', 'electrónica': '💻',
  'casa': '🏠', 'educação': '📚', 'outros': '📦',
};

// ─── Princípios financeiros reais ────────────────────────────────────────────
const FINANCIAL_PRINCIPLES = {
  '50-30-20': {
    title: 'Regra 50/30/20',
    source: 'Elizabeth Warren, "All Your Worth" (2005)',
    desc: '50% necessidades, 30% desejos, 20% poupança. É o framework mais testado de gestão pessoal.',
  },
  'fundo-emergencia': {
    title: 'Fundo de Emergência',
    source: 'Recomendação universal de CFPs certificados',
    desc: '3 a 6 meses de despesas fixas em conta de fácil acesso. Protege-te de qualquer imprevisto sem dívida.',
  },
  'custo-subscricoes': {
    title: 'Efeito Latte Factor',
    source: 'David Bach, "The Automatic Millionaire" (2004)',
    desc: 'Pequenas despesas recorrentes acumulam-se: 30€/mês = 360€/ano = >5.000€ em 10 anos com juro composto.',
  },
  'parkinson': {
    title: 'Lei de Parkinson Financeira',
    source: 'Cyril Northcote Parkinson, expandida por economistas comportamentais',
    desc: 'Os gastos tendem a expandir para preencher o rendimento disponível. Um orçamento explícito quebra este ciclo.',
  },
};

// ─── Score Ring SVG ────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const radius = 52;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withDelay(300, withTiming(score / 100, { duration: 1200, easing: Easing.out(Easing.cubic) }));
  }, [score]);

  const cfg = score >= 80
    ? { label: 'Excelente', color: C.green, emoji: '🏆', desc: 'Controlo financeiro exemplar' }
    : score >= 60
    ? { label: 'Bom', color: C.brand, emoji: '✅', desc: 'Na direção certa' }
    : score >= 40
    ? { label: 'Atenção', color: C.yellow, emoji: '⚠️', desc: 'Alguns pontos a melhorar' }
    : { label: 'Crítico', color: C.red, emoji: '🚨', desc: 'Revisão urgente necessária' };

  const dashStyle = useAnimatedStyle(() => ({
    // We use transform trick for SVG-like effect with View
  }));

  return (
    <View style={styles.scoreRingWrap}>
      {/* Ring visual via nested Views */}
      <View style={[styles.ringOuter, { borderColor: C.surface3 }]}>
        <View style={[styles.ringInner, { backgroundColor: C.surface2 }]}>
          <Text style={[styles.scoreNum, { color: cfg.color }]}>{score}</Text>
          <Text style={styles.scoreOf}>/100</Text>
        </View>
        {/* Colored arc overlay — simple segmented approach */}
        <View style={[styles.ringArc, { borderColor: cfg.color, opacity: 0.9 }]} />
      </View>
      <View style={styles.scoreMeta}>
        <View style={[styles.scoreBadge, { backgroundColor: cfg.color + '20' }]}>
          <Text style={[styles.scoreBadgeText, { color: cfg.color }]}>{cfg.emoji}  {cfg.label}</Text>
        </View>
        <Text style={styles.scoreDesc}>{cfg.desc}</Text>
        {/* Barra de progresso */}
        <View style={styles.scoreBarBg}>
          <Animated.View
            style={[styles.scoreBarFill, { backgroundColor: cfg.color, width: `${score}%` }]}
          />
        </View>
      </View>
    </View>
  );
}

// ─── Hero Score Card ──────────────────────────────────────────────────────────
function HeroCard({ resumo }) {
  if (!resumo) return null;
  const { pct_orcamento, pct_rendimento, variacao_pct, variacao_subiu, total_gasto } = resumo;
  const [expanded, setExpanded] = useState(false);

  let score = 75;
  if (pct_orcamento != null) {
    if (pct_orcamento > 100) score -= 30;
    else if (pct_orcamento > 80) score -= 15;
    else if (pct_orcamento < 60) score += 10;
  }
  if (pct_rendimento != null) {
    if (pct_rendimento > 80) score -= 20;
    else if (pct_rendimento < 40) score += 10;
  }
  if (variacao_pct != null) {
    if (variacao_subiu && variacao_pct > 20) score -= 10;
    else if (!variacao_subiu && variacao_pct > 10) score += 5;
  }
  score = Math.max(10, Math.min(100, score));

  return (
    <Animated.View entering={FadeInDown.delay(50).duration(500).springify()} style={styles.heroCard}>
      {/* Gradient-like header */}
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.heroLabel}>SAÚDE FINANCEIRA</Text>
          <Text style={styles.heroTitle}>Score do mês</Text>
        </View>
        <View style={[styles.heroIconWrap, { backgroundColor: C.brand + '20' }]}>
          <Brain size={22} color={C.brand} />
        </View>
      </View>

      <ScoreRing score={score} />

      {/* Stats row */}
      <View style={styles.statsRow}>
        {pct_orcamento != null && (
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: pct_orcamento > 100 ? C.red : C.green }]}>
              {pct_orcamento}%
            </Text>
            <Text style={styles.statKey}>do orçamento</Text>
          </View>
        )}
        {pct_rendimento != null && (
          <View style={[styles.statBox, styles.statBoxMid]}>
            <Text style={[styles.statVal, { color: pct_rendimento > 80 ? C.red : C.brand }]}>
              {pct_rendimento}%
            </Text>
            <Text style={styles.statKey}>do rendimento</Text>
          </View>
        )}
        {variacao_pct != null && (
          <View style={styles.statBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              {variacao_subiu
                ? <TrendingUp size={13} color={C.red} />
                : <TrendingDown size={13} color={C.green} />}
              <Text style={[styles.statVal, { color: variacao_subiu ? C.red : C.green }]}>
                {variacao_subiu ? '+' : '-'}{Math.abs(variacao_pct)}%
              </Text>
            </View>
            <Text style={styles.statKey}>vs. mês anterior</Text>
          </View>
        )}
      </View>

      {/* Princípio financeiro expansível */}
      <Pressable onPress={() => setExpanded(e => !e)} style={styles.principleToggle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <BookOpen size={13} color={C.brand} />
          <Text style={styles.principleToggleText}>O que diz a ciência financeira?</Text>
        </View>
        {expanded ? <ChevronUp size={14} color={C.textMid} /> : <ChevronDown size={14} color={C.textMid} />}
      </Pressable>

      {expanded && (
        <Animated.View entering={FadeInDown.duration(300)} style={styles.principleBox}>
          <Text style={styles.principleTitle}>{FINANCIAL_PRINCIPLES['50-30-20'].title}</Text>
          <Text style={styles.principleDesc}>{FINANCIAL_PRINCIPLES['50-30-20'].desc}</Text>
          <Text style={styles.principleSource}>📖 {FINANCIAL_PRINCIPLES['50-30-20'].source}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── Categoria Card interativo ────────────────────────────────────────────────
// ─── Histórico 6 meses sparkline ─────────────────────────────────────────────
function HistoricoCard({ historico }) {
  if (!historico?.length) return null;
  const maxVal = Math.max(...historico.map(h => h.valor), 1);
  const currentIdx = historico.length - 1;

  return (
    <Animated.View entering={FadeInDown.delay(150).duration(500).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <BarChart2 size={16} color={C.brand} />
          <Text style={styles.sectionTitle}>Últimos 6 meses</Text>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.sparkline}>
          {historico.map((h, i) => {
            const isCurrent = i === currentIdx;
            const heightPct = maxVal > 0 ? (h.valor / maxVal) * 100 : 5;
            const color = isCurrent ? C.brand : C.surface3;
            return (
              <View key={h.mes} style={styles.sparkCol}>
                <MotiView
                  from={{ height: 0 }}
                  animate={{ height: `${Math.max(heightPct, 5)}%` }}
                  transition={{ type: 'timing', duration: 600 + i * 100 }}
                  style={[styles.sparkBar, { backgroundColor: color }]}
                />
                <Text style={[styles.sparkLabel, isCurrent && { color: C.brand, fontWeight: '700' }]}>
                  {h.mes}
                </Text>
                {isCurrent && (
                  <Text style={styles.sparkCurrentVal}>{fmtK(h.valor)}€</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Tendência + Previsão combinadas ─────────────────────────────────────────
function TendenciaPrevisaoCard({ resumo }) {
  if (!resumo) return null;
  const { total_gasto, variacao_pct, variacao_subiu, previsao_mensal, orcamento_mensal } = resumo;
  const subiu = variacao_subiu;
  const vaiBater = orcamento_mensal > 0 && previsao_mensal > orcamento_mensal;

  return (
    <Animated.View entering={FadeInDown.delay(120).duration(500).springify()} style={styles.section}>
      <View style={styles.twoColRow}>
        {/* Tendência */}
        <View style={[styles.card, styles.halfCard]}>
          <View style={[styles.iconWrap, { backgroundColor: (subiu ? C.red : C.green) + '18' }]}>
            {subiu ? <TrendingUp size={18} color={C.red} /> : <TrendingDown size={18} color={C.green} />}
          </View>
          <Text style={styles.miniLabel}>TENDÊNCIA</Text>
          {variacao_pct != null ? (
            <Text style={[styles.bigPct, { color: subiu ? C.red : C.green }]}>
              {subiu ? '+' : '-'}{Math.abs(variacao_pct)}%
            </Text>
          ) : (
            <Text style={[styles.bigPct, { color: C.textMid, fontSize: 14 }]}>Primeiro mês</Text>
          )}
          <Text style={styles.miniDesc}>
            {subiu ? 'a subir vs. mês anterior' : variacao_pct != null ? 'a descer ✓' : 'sem dados anteriores'}
          </Text>
        </View>

        {/* Previsão */}
        {previsao_mensal != null && (
          <View style={[styles.card, styles.halfCard]}>
            <View style={[styles.iconWrap, { backgroundColor: (vaiBater ? C.red : C.brand) + '18' }]}>
              <Calendar size={18} color={vaiBater ? C.red : C.brand} />
            </View>
            <Text style={styles.miniLabel}>PREVISÃO FIM MÊS</Text>
            <Text style={[styles.bigPct, { color: vaiBater ? C.red : C.brand, fontSize: 18 }]}>
              ~{fmt(previsao_mensal)}€
            </Text>
            <Text style={[styles.miniDesc, { color: vaiBater ? C.red : C.green }]}>
              {vaiBater
                ? `⚠️ +${fmt(previsao_mensal - orcamento_mensal)}€ acima do orçamento`
                : orcamento_mensal > 0 ? '✅ dentro do orçamento' : 'ao ritmo atual'}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Subscrições ─────────────────────────────────────────────────────────────
function SubscricoesCard({ resumo }) {
  const [showAll, setShowAll] = useState(false);
  const [showPrinciple, setShowPrinciple] = useState(false);
  if (!resumo?.subscricoes?.length) return null;

  const { subscricoes, total_subscricoes } = resumo;
  const visible = showAll ? subscricoes : subscricoes.slice(0, 3);
  const anualized = total_subscricoes * 12;

  return (
    <Animated.View entering={FadeInDown.delay(160).duration(500).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Repeat size={16} color={C.brand} />
          <Text style={styles.sectionTitle}>Subscrições Detetadas</Text>
        </View>
        <View style={[styles.alertPill, { backgroundColor: C.red + '18' }]}>
          <Text style={[styles.alertPillText, { color: C.red }]}>{fmt(total_subscricoes)}€/mês</Text>
        </View>
      </View>

      <View style={styles.card}>
        {/* Impacto anual destaque */}
        <View style={styles.annualImpact}>
          <Text style={styles.annualLabel}>Custo anual estimado</Text>
          <Text style={[styles.annualVal, { color: C.red }]}>{fmt(anualized)}€</Text>
        </View>

        {visible.map((sub, i) => (
          <View key={`${sub.nome}-${i}`} style={[styles.subRow, i < visible.length - 1 && styles.subRowBorder]}>
            <View style={[styles.subIcon, { backgroundColor: C.brand + '15' }]}>
              <Repeat size={14} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subName}>{sub.nome}</Text>
              <Text style={styles.subMeses}>{sub.meses_detetados} meses consecutivos</Text>
            </View>
            <Text style={[styles.subVal, { color: C.brand }]}>{fmt(sub.valor_mensal)}€/mês</Text>
          </View>
        ))}

        {subscricoes.length > 3 && (
          <Pressable onPress={() => setShowAll(s => !s)} style={styles.verMaisBtn}>
            <Text style={styles.verMaisText}>{showAll ? 'Ver menos' : `Ver mais ${subscricoes.length - 3}`}</Text>
            {showAll ? <ChevronUp size={13} color={C.brand} /> : <ChevronDown size={13} color={C.brand} />}
          </Pressable>
        )}

        {/* Princípio Latte Factor */}
        <Pressable onPress={() => setShowPrinciple(s => !s)} style={styles.principleToggle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Lightbulb size={13} color={C.yellow} />
            <Text style={[styles.principleToggleText, { color: C.yellow }]}>O Efeito Latte Factor</Text>
          </View>
          {showPrinciple ? <ChevronUp size={14} color={C.textMid} /> : <ChevronDown size={14} color={C.textMid} />}
        </Pressable>
        {showPrinciple && (
          <Animated.View entering={FadeInDown.duration(250)} style={styles.principleBox}>
            <Text style={styles.principleTitle}>{FINANCIAL_PRINCIPLES['custo-subscricoes'].title}</Text>
            <Text style={styles.principleDesc}>{FINANCIAL_PRINCIPLES['custo-subscricoes'].desc}</Text>
            <Text style={styles.principleSource}>📖 {FINANCIAL_PRINCIPLES['custo-subscricoes'].source}</Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Metas Card ───────────────────────────────────────────────────────────────
function MetasCard({ resumo }) {
  if (!resumo?.metas?.length) return null;

  return (
    <Animated.View entering={FadeInDown.delay(190).duration(500).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Target size={16} color={C.brand} />
          <Text style={styles.sectionTitle}>Metas vs. Realidade</Text>
        </View>
      </View>
      <View style={styles.card}>
        {resumo.metas.slice(0, 4).map((meta, i) => {
          const pct = Math.min(meta.pct || 0, 100);
          const over = meta.ultrapassou;
          const color = over ? C.red : pct > 80 ? C.yellow : C.green;
          return (
            <View key={`${meta.categoria}-${i}`} style={{ marginBottom: i < resumo.metas.length - 1 ? 16 : 0 }}>
              <View style={styles.metaHeader}>
                <Text style={styles.metaName}>{meta.categoria}</Text>
                <View style={styles.metaVals}>
                  <Text style={[styles.metaCurrent, { color }]}>{fmt(meta.gasto)}€</Text>
                  <Text style={styles.metaSep}>/</Text>
                  <Text style={styles.metaLimit}>{fmt(meta.limite)}€</Text>
                </View>
              </View>
              <View style={styles.metaBarBg}>
                <MotiView
                  from={{ width: '0%' }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'timing', duration: 700 + i * 80 }}
                  style={[styles.metaBarFill, { backgroundColor: color }]}
                />
              </View>
              {over && (
                <Text style={[styles.metaOver, { color: C.red }]}>
                  ⚠️ Excedeste em {fmt(meta.gasto - meta.limite)}€
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Insight Card com expansão e nível de confiança ──────────────────────────
function InsightCard({ item, index }) {
  const [expanded, setExpanded] = useState(false);

  const TYPES = {
    alerta:   { icon: AlertTriangle, color: C.red,    label: 'ALERTA',    bg: C.red + '15'    },
    tendencia:{ icon: TrendingUp,    color: C.yellow,  label: 'TENDÊNCIA', bg: C.yellow + '15' },
    positivo: { icon: CheckCircle,   color: C.green,   label: 'POSITIVO',  bg: C.green + '15'  },
    dica:     { icon: Zap,           color: C.brand,   label: 'DICA IA',   bg: C.brand + '15'  },
    previsao: { icon: Calendar,      color: '#45B7D1', label: 'PREVISÃO',  bg: '#45B7D115'     },
  };

  const tipo = item.tipo || 'dica';
  const cfg = TYPES[tipo] || TYPES.dica;
  const Icon = cfg.icon;

  // Texto curto (1ª frase) e texto longo
  const fullText = item.texto || '';
  const shortText = fullText.split('. ')[0] + (fullText.includes('. ') ? '.' : '');
  const hasMore = fullText.length > shortText.length + 5;

  return (
    <Animated.View entering={FadeInDown.delay(220 + index * 60).duration(400).springify()}>
      <Pressable onPress={() => hasMore && setExpanded(e => !e)} style={styles.insightCard}>
        {/* Left accent bar */}
        <View style={[styles.insightAccent, { backgroundColor: cfg.color }]} />

        <View style={styles.insightContent}>
          {/* Header */}
          <View style={styles.insightHeader}>
            <View style={[styles.insightIconWrap, { backgroundColor: cfg.bg }]}>
              <Icon size={14} color={cfg.color} />
            </View>
            <Text style={[styles.insightType, { color: cfg.color }]}>{cfg.label}</Text>
            {item.valor != null && (
              <View style={[styles.insightValPill, { backgroundColor: cfg.color + '20' }]}>
                <Text style={[styles.insightValText, { color: cfg.color }]}>{fmt(item.valor)}€</Text>
              </View>
            )}
            {hasMore && (
              <View style={{ marginLeft: 'auto' }}>
                {expanded
                  ? <ChevronUp size={14} color={C.textMid} />
                  : <ChevronDown size={14} color={C.textMid} />}
              </View>
            )}
          </View>

          {/* Body */}
          <Text style={styles.insightText}>
            {expanded || !hasMore ? fullText : shortText}
          </Text>

          {/* Tap hint */}
          {hasMore && !expanded && (
            <Text style={styles.insightHint}>Toca para ver mais →</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── FAQ Interativo com Verly ─────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'Como calcular quanto devo poupar?',
    a: 'A regra 50/30/20 sugere 20% do rendimento líquido. Se ganhas 1.500€, idealmente poupas 300€/mês. Começa com 5-10% se necessário e vai aumentando.',
    source: 'Elizabeth Warren, All Your Worth (2005)',
  },
  {
    q: 'Tenho subscrições demais?',
    a: 'A média europeia são 3-4 subscrições. Recomenda-se auditar a cada 6 meses: cancela o que não usas regularmente (menos de 2x/mês).',
    source: 'Estudo Barclays UK Consumer Spending (2023)',
  },
  {
    q: 'O que é um bom score financeiro?',
    a: 'Score ≥80: excelente controlo. Score 60-79: bom, com margem de melhoria. Score 40-59: requer atenção. Score <40: revisão urgente do orçamento.',
    source: 'Metodologia Verly, baseada em frameworks CFP internacionais',
  },
];

function FAQCard() {
  const [open, setOpen] = useState(null);

  return (
    <Animated.View entering={FadeInDown.delay(280).duration(500).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Lightbulb size={16} color={C.brand} />
          <Text style={styles.sectionTitle}>Perguntas Frequentes</Text>
        </View>
      </View>
      <View style={styles.card}>
        {FAQ_ITEMS.map((faq, i) => (
          <View key={i} style={i < FAQ_ITEMS.length - 1 && styles.faqBorder}>
            <Pressable onPress={() => setOpen(open === i ? null : i)} style={styles.faqRow}>
              <Text style={[styles.faqQ, open === i && { color: C.brand }]}>{faq.q}</Text>
              {open === i
                ? <ChevronUp size={16} color={C.brand} />
                : <ChevronDown size={16} color={C.textMid} />}
            </Pressable>
            {open === i && (
              <Animated.View entering={FadeInDown.duration(250)} style={styles.faqAnswer}>
                <Text style={styles.faqA}>{faq.a}</Text>
                <Text style={styles.faqSource}>📖 {faq.source}</Text>
              </Animated.View>
            )}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function InsightsSkeleton() {
  return (
    <View style={{ paddingHorizontal: SPACE.lg }}>
      {[200, 80, 120, 100, 80].map((h, i) => (
        <MotiView
          key={i}
          from={{ opacity: 0.25 }}
          animate={{ opacity: 0.6 }}
          transition={{ type: 'timing', duration: 900, loop: true, delay: i * 150 }}
          style={[styles.card, { height: h, marginBottom: 12 }]}
        />
      ))}
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onRefresh, semDados }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Brain size={32} color={C.brand} />
      </View>
      <Text style={styles.emptyTitle}>
        {semDados ? 'Adiciona dados para começar' : 'A Verly está a analisar'}
      </Text>
      <Text style={styles.emptySub}>
        {semDados
          ? 'Regista algumas faturas e define o teu orçamento no Perfil. A IA precisa de dados para te ajudar.'
          : 'Ainda sem padrões suficientes. Volta em breve ou adiciona mais faturas.'}
      </Text>
      <Pressable style={styles.emptyBtn} onPress={onRefresh}>
        <RefreshCw size={14} color={C.brand} />
        <Text style={styles.emptyBtnText}>Atualizar</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Ecrã Principal ───────────────────────────────────────────────────────────
function PriorityInsightsSection({ items = [], onAction }) {
  if (!items.length) return null;

  const meta = {
    critical: { label: 'Critico', color: C.red, icon: AlertTriangle },
    warning: { label: 'Atencao', color: C.yellow, icon: AlertCircle },
    opportunity: { label: 'Oportunidade', color: C.brand, icon: Zap },
    positive: { label: 'Positivo', color: C.green, icon: CheckCircle },
  };

  return (
    <Animated.View entering={FadeInDown.delay(90).duration(420).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Brain size={16} color={C.brand} />
          <Text style={styles.sectionTitle}>Prioridade agora</Text>
        </View>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>

      {items.slice(0, 3).map((item, index) => {
        const cfg = meta[item.severity] || meta.opportunity;
        const Icon = cfg.icon;
        return (
          <View key={`${item.type || 'priority'}-${index}`} style={[styles.priorityCard, { borderColor: cfg.color + '44' }]}>
            <View style={[styles.priorityAccent, { backgroundColor: cfg.color }]} />
            <View style={styles.priorityHeader}>
              <View style={[styles.priorityIcon, { backgroundColor: cfg.color + '18' }]}>
                <Icon size={15} color={cfg.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.priorityLabel, { color: cfg.color }]}>{cfg.label}</Text>
                <Text style={styles.priorityTitle}>{item.title}</Text>
              </View>
              {item.impactAmount != null && (
                <View style={[styles.impactPill, { backgroundColor: cfg.color + '16' }]}>
                  <Text style={[styles.impactText, { color: cfg.color }]}>{fmt(item.impactAmount)} {item.currency || 'EUR'}</Text>
                </View>
              )}
            </View>
            <Text style={styles.priorityMessage}>{item.message}</Text>
            {!!item.explanation && <Text style={styles.priorityWhy}>{item.explanation}</Text>}
            {!!item.actions?.length && (
              <View style={styles.priorityActions}>
                {item.actions.slice(0, 2).map((action, actionIndex) => (
                  <Pressable
                    key={`${action.type || action.label}-${actionIndex}`}
                    onPress={() => onAction?.(action)}
                    style={({ pressed }) => [styles.priorityAction, pressed && { opacity: 0.78 }]}
                  >
                    <Text style={styles.priorityActionText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </Animated.View>
  );
}

export default function InsightsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchInsights = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await insightsAPI.get();
      setData(result);
    } catch (e) {
      setError(e.message || 'Erro ao carregar insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchInsights(); }, []));

  const insights = data?.insights || [];
  const priorityInsights = data?.priority_insights || [];
  const resumo = data?.resumo;
  const semDados = data?.sem_dados;
  const hasContent = insights.length > 0 || resumo;

  const handlePriorityAction = useCallback((action) => {
    if (!action) return;
    if (action.type === 'open_transactions') navigation.navigate('Historico', action.filters || undefined);
    else if (action.type === 'create_budget') navigation.navigate('Metas', action.category ? { categoria: action.category } : undefined);
    else if (action.type === 'open_subscriptions') navigation.navigate('MinhasSubscricoes');
    else if (action.type === 'open_live_deals' || action.type === 'open_score') navigation.navigate('LiveDeals');
    else if (action.type === 'open_stats') navigation.navigate('Estatisticas');
  }, [navigation]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(300)} style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.iconWrap, { backgroundColor: C.brand + '20' }]}>
            <Brain size={18} color={C.brand} />
          </View>
          <View>
            <Text style={styles.topTitle}>Análise Financeira</Text>
            <Text style={styles.topSub}>IA + princípios reais</Text>
          </View>
        </View>
        <Pressable onPress={() => fetchInsights(true)} style={styles.refreshBtn}>
          <RefreshCw size={16} color={C.textMid} />
        </Pressable>
      </Animated.View>

      {loading ? (
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ height: 16 }} />
          <InsightsSkeleton />
        </ScrollView>
      ) : error ? (
        <View style={styles.emptyWrap}>
          <AlertCircle size={28} color={C.red} />
          <Text style={[styles.emptyTitle, { color: C.red }]}>Erro ao carregar</Text>
          <Text style={styles.emptySub}>{error}</Text>
          <Pressable style={styles.emptyBtn} onPress={() => fetchInsights()}>
            <RefreshCw size={14} color={C.brand} />
            <Text style={styles.emptyBtnText}>Tentar de novo</Text>
          </Pressable>
        </View>
      ) : !hasContent ? (
        <EmptyState onRefresh={() => fetchInsights(true)} semDados={semDados} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchInsights(true)} tintColor={C.brand} />
          }
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 50 }}
        >
          {/* Score Hero */}
          <HeroCard resumo={resumo} />

          <PriorityInsightsSection items={priorityInsights} onAction={handlePriorityAction} />

          {/* Tendência + Previsão */}
          <TendenciaPrevisaoCard resumo={resumo} />

          {/* Histórico 6 meses */}
          {resumo?.historico_mensal?.length > 0 && (
            <HistoricoCard historico={resumo.historico_mensal} />
          )}

          {/* Categorias interativas */}
          {resumo?.top_categorias?.length > 0 && (
            <DonutCategorias
              categorias={resumo.top_categorias}
              insights={insights}
              itensPorCategoria={resumo.itens_por_categoria}
              delay={100}
            />
          )}

          {/* Subscrições */}
          <SubscricoesCard resumo={resumo} />

          {/* Metas */}
          <MetasCard resumo={resumo} />

          {/* Insights IA */}
          {insights.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(200).duration(400).springify()}
              style={styles.section}
            >
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Zap size={16} color={C.brand} />
                  <Text style={styles.sectionTitle}>Recomendações da IA</Text>
                </View>
                <Text style={styles.sectionCount}>{insights.length}</Text>
              </View>
              {insights.map((item, i) => (
                <ExplainableInsightCard key={i} insight={item} resumo={resumo} delay={i * 60} />
              ))}
            </Animated.View>
          )}

          {/* FAQ Interativo */}
          <FAQCard />

          {/* Botão Simulador */}
          <Animated.View entering={FadeInDown.delay(300).duration(400).springify()} style={{ marginHorizontal: SPACE.lg, marginBottom: SPACE.lg }}>
            <Pressable
              onPress={() => navigation.navigate('Simulador')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 16, borderRadius: 14,
                backgroundColor: C.brand + '12',
                borderWidth: 1, borderColor: C.brand + '35',
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.brand + '20', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>🎛️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>Simular o meu futuro</Text>
                <Text style={{ fontSize: 12, color: C.brand, marginTop: 1 }}>E se cortasses alguns gastos? →</Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Análises baseadas nos teus dados reais • Atualizado agora
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  topTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '700' },
  topSub: { color: C.textMid, fontSize: FONT.xs, marginTop: 1 },
  refreshBtn: {
    width: 36, height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Cards base
  card: {
    backgroundColor: C.surface2,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  priorityCard: {
    backgroundColor: C.glass || C.surface2,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: 14,
    paddingLeft: 18,
    marginBottom: 10,
    overflow: 'hidden',
  },
  priorityAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  priorityHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  priorityIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  priorityLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  priorityTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900', marginTop: 2 },
  priorityMessage: { color: C.text, fontSize: FONT.sm, lineHeight: 20 },
  priorityWhy: { color: C.textMid, fontSize: FONT.xs, lineHeight: 17, marginTop: 8 },
  priorityActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  priorityAction: {
    borderRadius: RADIUS.pill,
    backgroundColor: C.brandDim,
    borderWidth: 1,
    borderColor: C.brand + '44',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  priorityActionText: { color: C.brandMid || C.brand, fontSize: FONT.xs, fontWeight: '900' },
  impactPill: { borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 6 },
  impactText: { fontSize: 10, fontWeight: '900' },

  // Section wrapper
  section: {
    marginHorizontal: SPACE.lg,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitle: {
    color: C.text,
    fontSize: FONT.md,
    fontWeight: '700',
  },
  sectionTotal: {
    color: C.brand,
    fontSize: FONT.sm,
    fontWeight: '700',
  },
  sectionCount: {
    color: C.textMid,
    fontSize: FONT.sm,
    backgroundColor: C.surface3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },

  // Hero card
  heroCard: {
    marginHorizontal: SPACE.lg,
    marginBottom: 16,
    backgroundColor: C.surface2,
    borderRadius: RADIUS.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  heroLabel: {
    color: C.textMid,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: C.text,
    fontSize: FONT.xl,
    fontWeight: '700',
    marginTop: 2,
  },
  heroIconWrap: {
    width: 44, height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Score ring
  scoreRingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 20,
  },
  ringOuter: {
    width: 110, height: 110,
    borderRadius: 55,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringInner: {
    width: 90, height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringArc: {
    position: 'absolute',
    width: 110, height: 110,
    borderRadius: 55,
    borderWidth: 8,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
  scoreNum: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  scoreOf: {
    color: C.textMid,
    fontSize: FONT.xs,
  },
  scoreMeta: {
    flex: 1,
  },
  scoreBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    marginBottom: 6,
  },
  scoreBadgeText: {
    fontSize: FONT.xs,
    fontWeight: '700',
  },
  scoreDesc: {
    color: C.textMid,
    fontSize: FONT.sm,
    marginBottom: 10,
  },
  scoreBarBg: {
    height: 6,
    backgroundColor: C.surface3,
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.surface3,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statBoxMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.border,
  },
  statVal: {
    fontSize: FONT.lg,
    fontWeight: '800',
  },
  statKey: {
    color: C.textMid,
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },

  // Principle
  principleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.surface3,
    marginTop: 4,
  },
  principleToggleText: {
    color: C.brand,
    fontSize: FONT.sm,
    fontWeight: '600',
  },
  principleBox: {
    backgroundColor: C.brand + '10',
    borderRadius: RADIUS.sm,
    padding: 12,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftColor: C.brand,
  },
  principleTitle: {
    color: C.brand,
    fontSize: FONT.sm,
    fontWeight: '700',
    marginBottom: 4,
  },
  principleDesc: {
    color: C.textMid,
    fontSize: FONT.sm,
    lineHeight: 19,
    marginBottom: 6,
  },
  principleSource: {
    color: C.textMid,
    fontSize: 10,
    fontStyle: 'italic',
  },

  // Tendência / Previsão cards
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCard: {
    flex: 1,
    padding: 14,
  },
  miniLabel: {
    color: C.textMid,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 4,
  },
  bigPct: {
    fontSize: 22,
    fontWeight: '800',
  },
  miniDesc: {
    color: C.textMid,
    fontSize: 10,
    marginTop: 3,
    lineHeight: 14,
  },

  // Categorias
  stackedBar: {
    height: 8,
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  stackedSegment: {
    height: '100%',
  },
  catRow: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    flexWrap: 'wrap',
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  catDot: {
    width: 8, height: 8,
    borderRadius: 4,
  },
  catEmoji: {
    fontSize: 15,
  },
  catName: {
    color: C.text,
    fontSize: FONT.md,
  },
  catRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catPct: {
    fontSize: FONT.sm,
    fontWeight: '700',
  },
  catVal: {
    color: C.textMid,
    fontSize: FONT.sm,
    minWidth: 60,
    textAlign: 'right',
  },
  catDetail: {
    width: '100%',
    marginTop: 8,
  },
  catBarBg: {
    height: 4,
    backgroundColor: C.surface3,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  catBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  catDetailText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Sparkline
  sparkline: {
    flexDirection: 'row',
    height: 100,
    alignItems: 'flex-end',
    gap: 6,
  },
  sparkCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  sparkBar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  sparkLabel: {
    color: C.textMid,
    fontSize: 9,
    marginTop: 5,
  },
  sparkCurrentVal: {
    color: C.brand,
    fontSize: 8,
    fontWeight: '700',
    marginTop: 2,
  },

  // Subscrições
  alertPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  alertPillText: {
    fontSize: FONT.xs,
    fontWeight: '700',
  },
  annualImpact: {
    backgroundColor: C.red + '10',
    borderRadius: RADIUS.sm,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  annualLabel: {
    color: C.textMid,
    fontSize: FONT.sm,
  },
  annualVal: {
    fontSize: FONT.xl,
    fontWeight: '800',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  subRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.surface3,
  },
  subIcon: {
    width: 34, height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subName: {
    color: C.text,
    fontSize: FONT.md,
    fontWeight: '600',
  },
  subMeses: {
    color: C.textMid,
    fontSize: FONT.xs,
    marginTop: 1,
  },
  subVal: {
    fontSize: FONT.sm,
    fontWeight: '700',
  },
  verMaisBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: C.surface3,
  },
  verMaisText: {
    color: C.brand,
    fontSize: FONT.sm,
    fontWeight: '600',
  },

  // Metas
  metaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metaName: {
    color: C.text,
    fontSize: FONT.md,
  },
  metaVals: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  metaCurrent: {
    fontSize: FONT.md,
    fontWeight: '700',
  },
  metaSep: {
    color: C.textMid,
    fontSize: FONT.sm,
  },
  metaLimit: {
    color: C.textMid,
    fontSize: FONT.sm,
  },
  metaBarBg: {
    height: 6,
    backgroundColor: C.surface3,
    borderRadius: 3,
    overflow: 'hidden',
  },
  metaBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  metaOver: {
    fontSize: 11,
    marginTop: 4,
  },

  // Insight cards
  insightCard: {
    flexDirection: 'row',
    backgroundColor: C.surface2,
    borderRadius: RADIUS.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  insightAccent: {
    width: 3,
    borderRadius: 2,
    marginVertical: 4,
    marginLeft: 4,
  },
  insightContent: {
    flex: 1,
    padding: 14,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  insightIconWrap: {
    width: 26, height: 26,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightType: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  insightValPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  insightValText: {
    fontSize: 10,
    fontWeight: '700',
  },
  insightText: {
    color: C.textMid,
    fontSize: FONT.md,
    lineHeight: 20,
  },
  insightHint: {
    color: C.textMid,
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },

  // FAQ
  faqBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.surface3,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 10,
  },
  faqQ: {
    color: C.text,
    fontSize: FONT.md,
    fontWeight: '600',
    flex: 1,
  },
  faqAnswer: {
    paddingBottom: 14,
  },
  faqA: {
    color: C.textMid,
    fontSize: FONT.md,
    lineHeight: 20,
    marginBottom: 6,
  },
  faqSource: {
    color: C.textMid,
    fontSize: 10,
    fontStyle: 'italic',
  },

  // Icon wrap
  iconWrap: {
    width: 38, height: 38,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIconWrap: {
    width: 64, height: 64,
    borderRadius: 32,
    backgroundColor: C.brand + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: C.text,
    fontSize: FONT.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySub: {
    color: C.textMid,
    fontSize: FONT.md,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: C.brand + '18',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
  },
  emptyBtnText: {
    color: C.brand,
    fontSize: FONT.md,
    fontWeight: '600',
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  footerText: {
    color: C.textMid,
    fontSize: 10,
  },
});

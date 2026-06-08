// src/components/ExplainableInsightCard.js — Verly Fase 5A: Explainable AI
// Mostra "PORQUÊ" o insight foi gerado, com dados visuais que o suportam.
import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Dimensions,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withSpring, withTiming, interpolate,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import {
  ChevronDown, ChevronUp, Brain, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Zap, Target, BookOpen,
  BarChart2, Calendar, DollarSign, Info,
} from 'lucide-react-native';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const W = Dimensions.get('window').width;
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');

const TIPO_CONFIG = {
  alerta: { icon: AlertTriangle, cor: C.red, corDim: C.redDim, label: 'Alerta', emoji: '⚠️' },
  tendencia: { icon: TrendingUp, cor: C.yellow, corDim: C.yellowDim, label: 'Tendência', emoji: '📈' },
  positivo: { icon: CheckCircle, cor: '#00D68F', corDim: 'rgba(0,214,143,0.10)', label: 'Positivo', emoji: '✅' },
  dica: { icon: Zap, cor: C.brand, corDim: C.brandDim, label: 'Dica', emoji: '💡' },
  previsao: { icon: Calendar, cor: '#22D4FD', corDim: 'rgba(34,212,253,0.10)', label: 'Previsão', emoji: '🔮' },
};

function MiniBar({ label, valor, max, cor }) {
  const pct = max > 0 ? Math.min((valor / max) * 100, 100) : 0;
  return (
    <View style={xStyles.miniBarWrap}>
      <View style={xStyles.miniBarHeader}>
        <Text style={xStyles.miniBarLabel}>{label}</Text>
        <Text style={[xStyles.miniBarVal, { color: cor }]}>{fmt(valor)}€</Text>
      </View>
      <View style={xStyles.miniBarBg}>
        <MotiView from={{ width: '0%' }} animate={{ width: `${pct}%` }} transition={{ type: 'timing', duration: 600 }} style={[xStyles.miniBarFill, { backgroundColor: cor }]} />
      </View>
    </View>
  );
}

function EvidenciaItem({ icon: Icon, texto, cor }) {
  return (
    <View style={xStyles.evidenciaItem}>
      <View style={[xStyles.evidenciaDot, { backgroundColor: cor }]} />
      <Text style={xStyles.evidenciaText}>{texto}</Text>
    </View>
  );
}

function buildEvidencias(insight, resumo) {
  const evidencias = [];
  const tipo = insight.tipo;
  const texto = insight.texto || '';
  if (!resumo) return evidencias;
  const { total_gasto, orcamento_mensal, rendimento_mensal, variacao_pct, variacao_subiu, previsao_mensal, top_categorias = [], subscricoes = [], total_subscricoes, metas = [], regra_5030_20 } = resumo;

  if (tipo === 'alerta' || tipo === 'tendencia') {
    if (variacao_pct != null) evidencias.push({ icon: variacao_subiu ? TrendingUp : TrendingDown, texto: `${variacao_subiu ? 'Aumento' : 'Redução'} de ${Math.abs(variacao_pct)}% vs mês anterior`, cor: variacao_subiu ? C.red : C.green });
    if (orcamento_mensal > 0 && total_gasto > orcamento_mensal * 0.85) { const pct = Math.round((total_gasto / orcamento_mensal) * 100); evidencias.push({ icon: BarChart2, texto: `Usaste ${pct}% do orçamento mensal (${fmt(total_gasto)}€/${fmt(orcamento_mensal)}€)`, cor: pct > 100 ? C.red : C.yellow }); }
    if (previsao_mensal && orcamento_mensal > 0 && previsao_mensal > orcamento_mensal) evidencias.push({ icon: Calendar, texto: `Previsão fim de mês: ${fmt(previsao_mensal)}€ (acima do orçamento)`, cor: C.red });
  }
  if (tipo === 'positivo') {
    if (variacao_pct != null && variacao_pct < 0) evidencias.push({ icon: TrendingDown, texto: `Gastos reduziram ${Math.abs(variacao_pct)}% vs mês passado`, cor: C.green });
    if (orcamento_mensal > 0 && total_gasto < orcamento_mensal * 0.8) evidencias.push({ icon: CheckCircle, texto: `Estás ${Math.round((1 - total_gasto / orcamento_mensal) * 100)}% abaixo do orçamento`, cor: C.green });
  }
  if (tipo === 'dica' && total_subscricoes > 0) {
    evidencias.push({ icon: Zap, texto: `${subscricoes.length} subscrição(ões) detetada(s) = ${fmt(total_subscricoes)}€/mês`, cor: C.orange });
    evidencias.push({ icon: Calendar, texto: `Custo anual estimado: ${fmt(total_subscricoes * 12)}€`, cor: C.orange });
  }
  if (tipo === 'previsao' && previsao_mensal) {
    evidencias.push({ icon: Calendar, texto: `Taxa diária atual: ${fmt(total_gasto / new Date().getDate())}€/dia`, cor: C.brand });
    if (orcamento_mensal > 0) { const diff = previsao_mensal - orcamento_mensal; evidencias.push({ icon: Target, texto: diff > 0 ? `Excederia o orçamento em ${fmt(diff)}€` : `Ficaria ${fmt(Math.abs(diff))}€ abaixo do orçamento`, cor: diff > 0 ? C.red : C.green }); }
  }
  if (top_categorias.length > 0) { const top = top_categorias[0]; if (texto.toLowerCase().includes(top.categoria.toLowerCase())) evidencias.push({ icon: BarChart2, texto: `${top.categoria}: ${fmt(top.valor)}€ este mês`, cor: C.brand }); }
  if (regra_5030_20 && (tipo === 'dica' || tipo === 'alerta') && regra_5030_20.pct_rendimento > 80) evidencias.push({ icon: Info, texto: `Gastos = ${regra_5030_20.pct_rendimento}% do rendimento (ideal: máx 80%)`, cor: C.yellow });
  return evidencias.slice(0, 4);
}

function ContextBars({ insight, resumo }) {
  const tipo = insight.tipo;
  if (!resumo) return null;
  const { top_categorias = [], total_gasto, orcamento_mensal } = resumo;
  if (tipo === 'alerta' && orcamento_mensal > 0) {
    return (
      <View style={{ gap: 6, marginTop: 8 }}>
        <MiniBar label="Gasto atual" valor={total_gasto} max={orcamento_mensal} cor={total_gasto > orcamento_mensal ? C.red : C.brand} />
        <MiniBar label="Orçamento mensal" valor={orcamento_mensal} max={orcamento_mensal} cor={C.surface3} />
      </View>
    );
  }
  if ((tipo === 'dica' || tipo === 'tendencia') && top_categorias.length > 0) {
    const max = top_categorias[0].valor || 1;
    return (
      <View style={{ gap: 6, marginTop: 8 }}>
        {top_categorias.slice(0, 3).map((cat, i) => (
          <MiniBar key={`${cat.categoria}-${i}`} label={cat.categoria} valor={cat.valor} max={max} cor={['#7C6FE0', '#FF4D6D', '#FFB300'][i]} />
        ))}
      </View>
    );
  }
  return null;
}

function PrincipioFinanceiro({ texto }) {
  const principios = [
    { key: '50/30/20', titulo: 'Regra 50/30/20', autor: 'Elizabeth Warren, 2005' },
    { key: 'latte factor', titulo: 'Latte Factor', autor: 'David Bach, 2004' },
    { key: 'parkinson', titulo: 'Lei de Parkinson', autor: 'C.N. Parkinson' },
    { key: 'juro composto', titulo: 'Juro Composto', autor: 'Princípio universal' },
    { key: 'fundo de emergência', titulo: 'Fundo de Emergência', autor: 'CFPs certificados' },
  ];
  const textoLower = texto.toLowerCase();
  const found = principios.find(p => textoLower.includes(p.key.toLowerCase()));
  if (!found) return null;
  return (
    <View style={xStyles.principioWrap}>
      <View style={xStyles.principioHeader}>
        <BookOpen size={11} color={C.brand} />
        <Text style={xStyles.principioTitulo}>{found.titulo}</Text>
      </View>
      <Text style={xStyles.principioAutor}>📖 {found.autor}</Text>
    </View>
  );
}

export default function ExplainableInsightCard({ insight, resumo, delay = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const tipo = insight.tipo || 'dica';
  const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.dica;
  const Icon = cfg.icon;
  const evidencias = buildEvidencias(insight, resumo);
  const hasDetails = evidencias.length > 0;

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(450).springify()} style={[xStyles.card, { borderLeftColor: cfg.cor }]}>
      <Pressable onPress={() => hasDetails && setExpanded(e => !e)} style={xStyles.cardHeader} disabled={!hasDetails}>
        <View style={[xStyles.iconWrap, { backgroundColor: cfg.corDim }]}><Icon size={16} color={cfg.cor} /></View>
        <View style={{ flex: 1 }}>
          <View style={xStyles.tipoBadgeRow}>
            <View style={[xStyles.tipoBadge, { backgroundColor: cfg.cor + '18' }]}><Text style={[xStyles.tipoText, { color: cfg.cor }]}>{cfg.emoji} {cfg.label}</Text></View>
            {insight.valor != null && (<View style={xStyles.valorBadge}><Text style={xStyles.valorText}>{fmt(insight.valor)}€</Text></View>)}
          </View>
          <Text style={xStyles.insightTexto}>{insight.texto}</Text>
        </View>
        {hasDetails && (<View style={{ paddingLeft: 4 }}>{expanded ? <ChevronUp size={14} color={C.textMid} /> : <ChevronDown size={14} color={C.textMid} />}</View>)}
      </Pressable>

      {expanded && hasDetails && (
        <Animated.View entering={FadeIn.duration(250)} style={xStyles.expandedWrap}>
          <View style={xStyles.divider} />
          <View style={xStyles.explicacaoHeader}><Brain size={12} color={C.brand} /><Text style={xStyles.explicacaoTitulo}>Baseado em:</Text></View>
          {evidencias.map((ev, i) => <EvidenciaItem key={i} icon={ev.icon} texto={ev.texto} cor={ev.cor} />)}
          <ContextBars insight={insight} resumo={resumo} />
          <PrincipioFinanceiro texto={insight.texto} />
        </Animated.View>
      )}

      {!expanded && hasDetails && (
        <View style={xStyles.expandHint}>
          <View style={[xStyles.expandDot, { backgroundColor: cfg.cor }]} />
          <View style={[xStyles.expandDot, { backgroundColor: cfg.cor }]} />
          <View style={[xStyles.expandDot, { backgroundColor: cfg.cor }]} />
        </View>
      )}
    </Animated.View>
  );
}

const xStyles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, marginBottom: SPACE.sm, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: SPACE.md, gap: 10 },
  iconWrap: { width: 34, height: 34, borderRadius: RADIUS.xs, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  tipoBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tipoBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.pill },
  tipoText: { fontSize: 10, fontWeight: '700' },
  valorBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.pill, backgroundColor: C.surface3 },
  valorText: { fontSize: 10, fontWeight: '700', color: C.textMid },
  insightTexto: { fontSize: FONT.sm, color: C.text, lineHeight: 19 },
  expandedWrap: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.md },
  divider: { height: 1, backgroundColor: C.border, marginBottom: SPACE.sm },
  explicacaoHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  explicacaoTitulo: { fontSize: FONT.xs, fontWeight: '700', color: C.brand, letterSpacing: 0.5 },
  evidenciaItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  evidenciaDot: { width: 6, height: 6, borderRadius: 3 },
  evidenciaText: { fontSize: FONT.xs, color: C.textMid, flex: 1, lineHeight: 16 },
  miniBarWrap: { marginBottom: 4 },
  miniBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  miniBarLabel: { fontSize: 10, color: C.textMid },
  miniBarVal: { fontSize: 10, fontWeight: '700' },
  miniBarBg: { height: 4, backgroundColor: C.surface3, borderRadius: 2, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 2 },
  principioWrap: { marginTop: 10, padding: 9, backgroundColor: C.brandDim, borderRadius: RADIUS.xs },
  principioHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  principioTitulo: { fontSize: FONT.xs, fontWeight: '700', color: C.brand },
  principioAutor: { fontSize: 10, color: C.textMid },
  expandHint: { flexDirection: 'row', justifyContent: 'center', gap: 3, paddingBottom: 8 },
  expandDot: { width: 4, height: 4, borderRadius: 2, opacity: 0.4 },
});

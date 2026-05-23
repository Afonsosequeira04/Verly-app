// src/screens/SimuladorScreen.js — Verly Fase 5A: Simulações Interativas
// Mostra projeções dinâmicas baseadas nos dados reais do utilizador
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Dimensions, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withTiming, withSpring, Easing, interpolate,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import { useFocusEffect } from '@react-navigation/native';
import {
  Sliders, TrendingDown, TrendingUp, Target,
  Zap, Calendar, DollarSign, ChevronRight,
  Info, ArrowRight, Sparkles, AlertTriangle,
} from 'lucide-react-native';
import { insightsAPI, apiFetch } from '../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const { width: W } = Dimensions.get('window');
const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');
const fmtK = (n) => {
  const v = +(n || 0);
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmt(v);
};

function Slider({ value, min, max, step = 1, onChange, color = C.brand }) {
  const sliderWidth = W - SPACE.lg * 2 - 32;
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const fillWidth = pct * sliderWidth;

  const handlePress = (e) => {
    const x = e.nativeEvent.locationX;
    const ratio = Math.min(Math.max(x / sliderWidth, 0), 1);
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.min(Math.max(stepped, min), max));
  };

  return (
    <Pressable onPress={handlePress} style={styles.sliderTrack} hitSlop={12}>
      <View style={[styles.sliderBg, { width: sliderWidth }]}>
        <Animated.View style={[styles.sliderFill, { width: fillWidth, backgroundColor: color }]} />
        <View style={[styles.sliderThumb, { left: fillWidth - 10, backgroundColor: color }]} />
      </View>
    </Pressable>
  );
}

function PctButtons({ value, min, max, onChange, options = [5, 10, 20, 30] }) {
  return (
    <View style={styles.pctRow}>
      {options.map(pct => {
        const newVal = Math.min(max, Math.round((value * (1 - pct / 100)) / 5) * 5);
        const isActive = Math.abs(value - newVal) < 1;
        return (
          <Pressable
            key={pct}
            onPress={() => onChange(newVal)}
            style={[styles.pctBtn, isActive && { backgroundColor: C.brand + '30', borderColor: C.brand }]}
          >
            <Text style={[styles.pctBtnText, isActive && { color: C.brand }]}>-{pct}%</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ImpactoCard({ poupancaMes, poupancaAno, label, icon: Icon, color, delay = 0 }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400).springify()} style={[styles.impactoCard, { borderColor: color + '30' }]}>
      <View style={[styles.impactoIconWrap, { backgroundColor: color + '15' }]}>
        <Icon size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.impactoLabel}>{label}</Text>
        <Text style={[styles.impactoValMes, { color }]}>+{fmtK(poupancaMes)}€/mês</Text>
        <Text style={styles.impactoValAno}>+{fmtK(poupancaAno)}€/ano</Text>
      </View>
    </Animated.View>
  );
}

function SimulacaoBloco({ titulo, subtitulo, valorAtual, min, max, step, unidade, onChange, cor, children }) {
  return (
    <View style={styles.simulacaoBloco}>
      <View style={styles.simulacaoHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.simulacaoTitulo}>{titulo}</Text>
          <Text style={styles.simulacaoSub}>{subtitulo}</Text>
        </View>
        <View style={[styles.simulacaoValWrap, { backgroundColor: cor + '15' }]}>
          <Text style={[styles.simulacaoVal, { color: cor }]}>{fmt(valorAtual)}{unidade}</Text>
        </View>
      </View>
      <Slider value={valorAtual} min={min} max={max} step={step} onChange={onChange} color={cor} />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabelText}>{fmt(min)}{unidade}</Text>
        <Text style={styles.sliderLabelText}>{fmt(max)}{unidade}</Text>
      </View>
      {children}
    </View>
  );
}

function TimelineCard({ poupancaMes, objetivo }) {
  if (!poupancaMes || poupancaMes <= 0) return null;

  const marcos = [
    { label: 'Fundo emergência (1 mês)', valor: objetivo > 0 ? objetivo : 500, icon: '🛡️' },
    { label: 'Férias de verão', valor: 800, icon: '✈️' },
    { label: 'Fundo emergência (3 meses)', valor: objetivo > 0 ? objetivo * 3 : 1500, icon: '💪' },
    { label: 'Grande objetivo', valor: objetivo > 0 ? objetivo * 6 : 3000, icon: '🏆' },
  ];

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(500).springify()} style={styles.timelineCard}>
      <View style={styles.sectionTitleRow}>
        <Calendar size={14} color={C.brand} />
        <Text style={styles.sectionTitle}>Em quanto tempo poupas?</Text>
      </View>
      {marcos.map((marco, i) => {
        const meses = Math.ceil(marco.valor / poupancaMes);
        const anos = (meses / 12).toFixed(1);
        const cor = meses <= 3 ? C.green : meses <= 12 ? C.yellow : C.brand;
        return (
          <View key={i} style={styles.marcoRow}>
            <Text style={styles.marcoIcon}>{marco.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.marcoLabel}>{marco.label}</Text>
              <Text style={[styles.marcoTempo, { color: cor }]}>
                {meses <= 12 ? `${meses} meses` : `${anos} anos`}
              </Text>
            </View>
            <Text style={[styles.marcoValor, { color: C.textMid }]}>{fmtK(marco.valor)}€</Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

export default function SimuladorScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState(null);
  const [delivery, setDelivery] = useState(0);
  const [subscricoes, setSubscricoes] = useState(0);
  const [lazer, setLazer] = useState(0);
  const [vestuario, setVestuario] = useState(0);
  const [rendimento, setRendimento] = useState(0);
  const [activeSimulacao, setActiveSimulacao] = useState('cortes');

  const totalCorte = (dados?.delivery_original || 0) - delivery
    + (dados?.subscricoes_original || 0) - subscricoes
    + (dados?.lazer_original || 0) - lazer
    + (dados?.vestuario_original || 0) - vestuario;

  const poupancaAnual = totalCorte * 12;
  const rendimentoExtra = rendimento - (dados?.rendimento_original || 0);

  useFocusEffect(useCallback(() => { loadDados(); }, []));

  const loadDados = async () => {
    try {
      setLoading(true);
      const res = await insightsAPI.get();
      if (res.success && res.resumo) {
        const r = res.resumo;
        const cats = r.top_categorias || [];
        const getVal = (nome) => {
          const c = cats.find(c => c.categoria?.toLowerCase().includes(nome));
          return c ? Math.round(c.valor || 0) : 0;
        };
        const deliveryVal = getVal('delivery') || getVal('alimentação') || getVal('restaurante') || 50;
        const subsVal = Math.round(r.total_subscricoes || 0) || 30;
        const lazerVal = getVal('lazer') || getVal('entretenimento') || 40;
        const vestuarioVal = getVal('vestuário') || getVal('vestuario') || 30;
        const rendimentoVal = Math.round(r.rendimento_mensal || 0) || 1000;
        setDados({ delivery_original: deliveryVal, subscricoes_original: subsVal, lazer_original: lazerVal, vestuario_original: vestuarioVal, rendimento_original: rendimentoVal, total_gasto: r.total_gasto || 0, orcamento: r.orcamento_mensal || 0 });
        setDelivery(deliveryVal); setSubscricoes(subsVal); setLazer(lazerVal); setVestuario(vestuarioVal); setRendimento(rendimentoVal);
      }
    } catch (e) {
      setDados({ delivery_original: 120, subscricoes_original: 45, lazer_original: 80, vestuario_original: 60, rendimento_original: 1200, total_gasto: 850, orcamento: 1000 });
      setDelivery(120); setSubscricoes(45); setLazer(80); setVestuario(60); setRendimento(1200);
    } finally { setLoading(false); }
  };

  if (loading) return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="large" color={C.brand} />
      <Text style={styles.loadingText}>A calcular os teus dados...</Text>
    </View>
  );

  const poupancaMesTotal = totalCorte + rendimentoExtra;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Simulador</Text>
          <Text style={styles.headerSub}>O que acontece se mudares os teus hábitos?</Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: C.brand + '20' }]}>
          <Sliders size={18} color={C.brand} />
        </View>
      </View>

      <View style={styles.tabsWrap}>
        <Pressable onPress={() => setActiveSimulacao('cortes')} style={[styles.tab, activeSimulacao === 'cortes' && styles.tabActive]}>
          <Text style={[styles.tabText, activeSimulacao === 'cortes' && styles.tabTextActive]}>Cortar gastos</Text>
        </Pressable>
        <Pressable onPress={() => setActiveSimulacao('rendimento')} style={[styles.tab, activeSimulacao === 'rendimento' && styles.tabActive]}>
          <Text style={[styles.tabText, activeSimulacao === 'rendimento' && styles.tabTextActive]}>Aumentar rendimento</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {poupancaMesTotal > 0 && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.resultHero}>
            <View style={styles.resultBg} />
            <Text style={styles.resultLabel}>POUPANÇA ESTIMADA</Text>
            <Text style={styles.resultValMes}>+{fmtK(poupancaMesTotal)}€<Text style={styles.resultPerMes}>/mês</Text></Text>
            <Text style={styles.resultValAno}>+{fmtK(poupancaMesTotal * 12)}€/ano</Text>
            {dados?.orcamento > 0 && (
              <Text style={styles.resultContexto}>Ficarias com {fmtK(Math.max(0, dados.orcamento - (dados.total_gasto - totalCorte)))}€ de folga no orçamento</Text>
            )}
          </Animated.View>
        )}

        {activeSimulacao === 'cortes' ? (
          <View style={{ paddingHorizontal: SPACE.lg }}>
            {[
              { titulo: '🛵 Delivery & Restaurantes', sub: `Atual: ${fmt(dados?.delivery_original || 0)}€/mês`, val: delivery, setVal: setDelivery, orig: dados?.delivery_original, cor: C.red, label: 'Cortar delivery', icon: TrendingDown },
              { titulo: '🔁 Subscrições', sub: `Atual: ${fmt(dados?.subscricoes_original || 0)}€/mês = ${fmtK((dados?.subscricoes_original || 0) * 12)}€/ano`, val: subscricoes, setVal: setSubscricoes, orig: dados?.subscricoes_original, cor: C.orange, label: 'Cancelar subscrições', icon: Zap },
              { titulo: '🎮 Lazer & Entretenimento', sub: `Atual: ${fmt(dados?.lazer_original || 0)}€/mês`, val: lazer, setVal: setLazer, orig: dados?.lazer_original, cor: C.yellow, label: 'Reduzir lazer', icon: Target },
              { titulo: '👕 Vestuário & Acessórios', sub: `Atual: ${fmt(dados?.vestuario_original || 0)}€/mês`, val: vestuario, setVal: setVestuario, orig: dados?.vestuario_original, cor: C.brandMid, label: 'Cortar vestuário', icon: TrendingDown },
            ].map((item, idx) => (
              <Animated.View key={idx} entering={FadeInDown.delay(idx * 50).duration(400).springify()} style={styles.card}>
                <SimulacaoBloco titulo={item.titulo} subtitulo={item.sub} valorAtual={item.val} min={0} max={Math.max((item.orig || 0) * 1.5, 100)} step={5} unidade="€" onChange={item.setVal} cor={item.cor}>
                  <PctButtons value={item.orig || item.val} min={0} max={item.orig || 200} onChange={item.setVal} />
                  {item.val < (item.orig || 0) && (
                    <ImpactoCard label={item.label} poupancaMes={(item.orig || 0) - item.val} poupancaAno={((item.orig || 0) - item.val) * 12} icon={item.icon} color={item.cor} delay={0} />
                  )}
                </SimulacaoBloco>
              </Animated.View>
            ))}
            <Pressable onPress={() => { setDelivery(dados?.delivery_original || 0); setSubscricoes(dados?.subscricoes_original || 0); setLazer(dados?.lazer_original || 0); setVestuario(dados?.vestuario_original || 0); }} style={styles.resetBtn}>
              <Text style={styles.resetBtnText}>↩ Repor valores originais</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: SPACE.lg }}>
            <Animated.View entering={FadeInDown.delay(50).duration(400).springify()} style={styles.card}>
              <SimulacaoBloco titulo="💰 Rendimento mensal" subtitulo={`Atual: ${fmt(dados?.rendimento_original || 0)}€/mês`} valorAtual={rendimento} min={dados?.rendimento_original || 500} max={Math.max((dados?.rendimento_original || 1000) * 2, 3000)} step={50} unidade="€" onChange={setRendimento} cor={C.green}>
                {rendimento > (dados?.rendimento_original || 0) && (
                  <View style={[styles.impactoCard, { borderColor: C.green + '30' }]}>
                    <View style={[styles.impactoIconWrap, { backgroundColor: C.green + '15' }]}><TrendingUp size={18} color={C.green} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.impactoLabel}>Rendimento adicional</Text>
                      <Text style={[styles.impactoValMes, { color: C.green }]}>+{fmtK(rendimento - (dados?.rendimento_original || 0))}€/mês</Text>
                      <Text style={styles.impactoValAno}>+{fmtK((rendimento - (dados?.rendimento_original || 0)) * 12)}€/ano</Text>
                    </View>
                  </View>
                )}
              </SimulacaoBloco>
              {rendimento > 0 && (
                <View style={styles.regra5020}>
                  <Info size={12} color={C.brand} />
                  <Text style={styles.regra5020Text}>Regra 50/30/20: com {fmt(rendimento)}€ devias poupar <Text style={{ color: C.green, fontWeight: '700' }}>{fmt(rendimento * 0.2)}€/mês</Text></Text>
                </View>
              )}
            </Animated.View>
          </View>
        )}

        {poupancaMesTotal > 0 && (
          <View style={{ paddingHorizontal: SPACE.lg }}>
            <TimelineCard poupancaMes={poupancaMesTotal} objetivo={dados?.orcamento || 500} />
          </View>
        )}

        {poupancaMesTotal <= 0 && (
          <Animated.View entering={FadeInDown.delay(300).duration(500).springify()} style={[styles.dicaCard, { marginHorizontal: SPACE.lg }]}>
            <AlertTriangle size={16} color={C.yellow} />
            <Text style={styles.dicaText}>Move os sliders para cima para ver o impacto de reduzir os teus gastos. Pequenas mudanças têm grande impacto ao longo do tempo.</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, gap: 12 },
  loadingText: { color: C.textMid, fontSize: FONT.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingTop: SPACE.xl, paddingBottom: SPACE.md },
  headerTitle: { fontSize: FONT.xxl, fontWeight: '800', color: C.text },
  headerSub: { fontSize: FONT.sm, color: C.textMid, marginTop: 2 },
  headerBadge: { width: 44, height: 44, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  tabsWrap: { flexDirection: 'row', marginHorizontal: SPACE.lg, marginBottom: SPACE.md, backgroundColor: C.surface2, borderRadius: RADIUS.sm, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.xs, alignItems: 'center' },
  tabActive: { backgroundColor: C.brand },
  tabText: { fontSize: FONT.sm, fontWeight: '600', color: C.textMid },
  tabTextActive: { color: '#FFF', fontWeight: '700' },
  resultHero: { marginHorizontal: SPACE.lg, marginBottom: SPACE.md, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.brand + '30', padding: SPACE.lg, alignItems: 'center', overflow: 'hidden' },
  resultBg: { position: 'absolute', top: -20, left: -20, right: -20, height: 80, backgroundColor: C.brand + '08', borderRadius: 40 },
  resultLabel: { fontSize: FONT.xs, fontWeight: '700', color: C.brand, letterSpacing: 1.2, marginBottom: 4 },
  resultValMes: { fontSize: 38, fontWeight: '900', color: C.green },
  resultPerMes: { fontSize: FONT.lg, fontWeight: '500', color: C.textMid },
  resultValAno: { fontSize: FONT.md, color: C.textMid, marginTop: 2 },
  resultContexto: { fontSize: FONT.xs, color: C.brand, marginTop: 8, textAlign: 'center' },
  card: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm },
  simulacaoBloco: { gap: 10 },
  simulacaoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  simulacaoTitulo: { fontSize: FONT.md, fontWeight: '700', color: C.text },
  simulacaoSub: { fontSize: FONT.xs, color: C.textMid, marginTop: 1 },
  simulacaoValWrap: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs },
  simulacaoVal: { fontSize: FONT.lg, fontWeight: '800' },
  sliderTrack: { height: 32, justifyContent: 'center' },
  sliderBg: { height: 4, backgroundColor: C.surface3, borderRadius: 2, position: 'relative', justifyContent: 'center' },
  sliderFill: { height: '100%', borderRadius: 2, position: 'absolute', left: 0 },
  sliderThumb: { width: 20, height: 20, borderRadius: 10, position: 'absolute', top: -8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
  sliderLabelText: { fontSize: 10, color: C.textSub },
  pctRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  pctBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.surface3, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: C.border },
  pctBtnText: { fontSize: FONT.xs, color: C.textMid, fontWeight: '600' },
  impactoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: C.surface2, borderRadius: RADIUS.sm, borderWidth: 1, marginTop: 4 },
  impactoIconWrap: { width: 36, height: 36, borderRadius: RADIUS.xs, justifyContent: 'center', alignItems: 'center' },
  impactoLabel: { fontSize: FONT.xs, color: C.textMid, fontWeight: '500' },
  impactoValMes: { fontSize: FONT.lg, fontWeight: '800', marginTop: 1 },
  impactoValAno: { fontSize: FONT.xs, color: C.textMid },
  timelineCard: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: SPACE.md, marginBottom: SPACE.sm, gap: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  marcoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  marcoIcon: { fontSize: 18 },
  marcoLabel: { fontSize: FONT.xs, color: C.textMid, flex: 1 },
  marcoTempo: { fontSize: FONT.sm, fontWeight: '700' },
  marcoValor: { fontSize: FONT.xs, fontWeight: '600' },
  regra5020: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 10, backgroundColor: C.brandDim, borderRadius: RADIUS.xs },
  regra5020Text: { fontSize: FONT.xs, color: C.textMid, flex: 1, lineHeight: 16 },
  resetBtn: { alignSelf: 'center', marginTop: 4, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.surface2, borderRadius: RADIUS.pill },
  resetBtnText: { fontSize: FONT.sm, color: C.textMid },
  dicaCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: SPACE.md, backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.yellow + '25', marginBottom: SPACE.sm },
  dicaText: { flex: 1, fontSize: FONT.xs, color: C.textMid, lineHeight: 17 },
});
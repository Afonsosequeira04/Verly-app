// src/components/DynamicDashboardEngine.js — Verly Fase 5A: Dynamic Dashboard
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS, FONT, SPACE, RADIUS } from '../constants/theme';

const C = COLORS;

const PERFIS = {
  impulsivo: { label: 'Controlador de Impulsos', emoji: '⚡', cor: C.red, descricao: 'Tens padrões de gasto impulsivo. O dashboard foca em alertas e limites.', mensagemPersonalizada: 'Hoje: foca em não ultrapassar o limite diário' },
  disciplinado: { label: 'Gestor Estratégico', emoji: '📊', cor: C.green, descricao: 'Tens bom controlo financeiro. O dashboard foca em previsões e crescimento.', mensagemPersonalizada: 'Continua assim — estás no caminho certo' },
  gastador: { label: 'Otimizador de Gastos', emoji: '🔍', cor: C.yellow, descricao: 'Gastas acima do orçamento. O dashboard foca em onde cortar.', mensagemPersonalizada: 'Esta semana: identifica 1 categoria para cortar' },
  poupador: { label: 'Acumulador', emoji: '🏦', cor: C.brand, descricao: 'Poupas consistentemente. O dashboard foca em crescimento e objetivos.', mensagemPersonalizada: 'O teu ritmo de poupança está acima da média' },
  equilibrado: { label: 'Financeiramente Equilibrado', emoji: '⚖️', cor: C.brandMid, descricao: 'Gastos dentro do esperado. Dashboard equilibrado.', mensagemPersonalizada: 'Mantém o equilíbrio atual' },
};

export function detectarPerfil(resumo) {
  if (!resumo) return 'equilibrado';
  const { total_gasto = 0, orcamento_mensal = 0, variacao_pct = 0, variacao_subiu = false, total_subscricoes = 0, metas = [], historico_mensal = [] } = resumo;
  let pontos = { impulsivo: 0, disciplinado: 0, gastador: 0, poupador: 0, equilibrado: 0 };

  if (orcamento_mensal > 0) {
    const pct = (total_gasto / orcamento_mensal) * 100;
    if (pct > 120) pontos.gastador += 3;
    else if (pct > 100) pontos.gastador += 2;
    else if (pct > 80) pontos.equilibrado += 1;
    else if (pct < 60) pontos.poupador += 2;
    else pontos.equilibrado += 2;
  }
  if (variacao_subiu && variacao_pct > 20) pontos.impulsivo += 2;
  else if (variacao_subiu && variacao_pct > 10) pontos.gastador += 1;
  else if (!variacao_subiu && variacao_pct && variacao_pct < -10) pontos.disciplinado += 2;
  else if (!variacao_subiu) pontos.poupador += 1;
  if (total_subscricoes > 100) pontos.impulsivo += 2;
  else if (total_subscricoes > 50) pontos.gastador += 1;
  const metasUltrapassadas = metas.filter(m => m.ultrapassou).length;
  if (metasUltrapassadas >= 2) pontos.impulsivo += 2;
  else if (metasUltrapassadas >= 1) pontos.gastador += 1;
  else if (metas.length > 0) pontos.disciplinado += 1;
  if (historico_mensal.length >= 3) {
    const valores = historico_mensal.map(h => h.valor).filter(v => v > 0);
    if (valores.length >= 2) {
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;
      const desvio = Math.sqrt(valores.reduce((s, v) => s + Math.pow(v - media, 2), 0) / valores.length);
      const cv = media > 0 ? desvio / media : 0;
      if (cv > 0.3) pontos.impulsivo += 1;
      else if (cv < 0.1) pontos.disciplinado += 2;
    }
  }
  return Object.entries(pontos).reduce((a, b) => b[1] > a[1] ? b : a, ['equilibrado', 0])[0];
}

export function AIStateBanner({ resumo }) {
  const perfilKey = useMemo(() => detectarPerfil(resumo), [resumo]);
  const perfil = PERFIS[perfilKey];
  if (!resumo || !perfil) return null;

  return (
    <Animated.View entering={FadeInDown.delay(20).duration(500).springify()} style={[bannerStyles.wrap, { borderColor: perfil.cor + '30' }]}>
      <View style={[bannerStyles.strip, { backgroundColor: perfil.cor }]} />
      <View style={bannerStyles.content}>
        <View style={bannerStyles.row}>
          <View style={[bannerStyles.emojiWrap, { backgroundColor: perfil.cor + '18' }]}>
            <Text style={bannerStyles.emoji}>{perfil.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[bannerStyles.perfilLabel, { color: perfil.cor }]}>PERFIL DETETADO</Text>
            <Text style={bannerStyles.perfilNome}>{perfil.label}</Text>
            <Text style={bannerStyles.perfilDesc}>{perfil.descricao}</Text>
          </View>
        </View>
        <View style={[bannerStyles.mensagemWrap, { backgroundColor: perfil.cor + '10' }]}>
          <Text style={[bannerStyles.mensagem, { color: perfil.cor }]}>💬 {perfil.mensagemPersonalizada}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export function useDashboardLayout(resumo) {
  return useMemo(() => {
    const perfilKey = detectarPerfil(resumo);
    const perfil = PERFIS[perfilKey];
    const { total_gasto = 0, orcamento_mensal = 0, variacao_pct = 0, variacao_subiu = false, total_subscricoes = 0, metas = [], previsao_mensal = 0 } = resumo || {};
    const pctOrcamento = orcamento_mensal > 0 ? (total_gasto / orcamento_mensal) * 100 : 0;
    const nivelRisco = pctOrcamento > 100 ? 'critico' : pctOrcamento > 85 ? 'alto' : pctOrcamento > 60 ? 'medio' : 'baixo';
    const corRisco = nivelRisco === 'critico' ? C.red : nivelRisco === 'alto' ? C.yellow : nivelRisco === 'medio' ? C.brand : C.green;
    const alertasBanners = [];
    if (pctOrcamento > 100) alertasBanners.push({ tipo: 'critico', mensagem: `🚨 Ultrapassaste o orçamento em ${Math.round(pctOrcamento - 100)}%`, cor: C.red, prioridade: 1 });
    else if (previsao_mensal > orcamento_mensal && orcamento_mensal > 0) alertasBanners.push({ tipo: 'aviso', mensagem: `⚠️ Prevês ultrapassar o orçamento este mês`, cor: C.yellow, prioridade: 2 });
    else if (variacao_subiu && variacao_pct > 25) alertasBanners.push({ tipo: 'tendencia', mensagem: `📈 Gastos subiram ${variacao_pct}% vs mês passado`, cor: C.orange, prioridade: 3 });
    if (total_subscricoes > 80) alertasBanners.push({ tipo: 'subscricoes', mensagem: `🔁 ${total_subscricoes.toFixed(0)}€/mês em subscrições (${(total_subscricoes * 12).toFixed(0)}€/ano)`, cor: C.orange, prioridade: 4 });
    const metasUltrapassadas = metas.filter(m => m.ultrapassou);
    if (metasUltrapassadas.length > 0) alertasBanners.push({ tipo: 'metas', mensagem: `🎯 ${metasUltrapassadas.length} meta(s) ultrapassada(s) este mês`, cor: C.red, prioridade: 5 });
    return {
      perfilKey, perfil, nivelRisco, corRisco,
      alertasBanners: alertasBanners.sort((a, b) => a.prioridade - b.prioridade),
      mostrarSimulador: total_subscricoes > 20 || pctOrcamento > 75,
      destacarMetas: metasUltrapassadas.length > 0 || pctOrcamento > 80,
      destacarPrevisao: previsao_mensal > 0 && orcamento_mensal > 0,
    };
  }, [resumo]);
}

export function DynamicAlertBanners({ resumo }) {
  const { alertasBanners } = useDashboardLayout(resumo);
  if (!alertasBanners.length) return null;
  return (
    <View style={{ marginHorizontal: SPACE.lg, marginBottom: SPACE.sm, gap: 6 }}>
      {alertasBanners.slice(0, 2).map((alerta, i) => (
        <Animated.View key={alerta.tipo} entering={FadeInDown.delay(i * 80).duration(400).springify()} style={[alertStyles.banner, { borderColor: alerta.cor + '30', backgroundColor: alerta.cor + '0D' }]}>
          <View style={[alertStyles.bannerStrip, { backgroundColor: alerta.cor }]} />
          <Text style={[alertStyles.bannerText, { color: alerta.cor }]}>{alerta.mensagem}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

export function SimuladorQuickAccess({ resumo, onPress }) {
  const { mostrarSimulador } = useDashboardLayout(resumo);
  if (!mostrarSimulador) return null;
  return (
    <Animated.View entering={FadeInDown.delay(100).duration(400).springify()} style={simStyles.wrap}>
      <View style={[simStyles.icon, { backgroundColor: C.brand + '20' }]}>
        <Text style={simStyles.iconText}>🎛️</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={simStyles.titulo}>E se cortasses alguns gastos?</Text>
        <Text style={simStyles.sub}>Ver simulação interativa →</Text>
      </View>
      <Text style={simStyles.cta} onPress={onPress}>Simular</Text>
    </Animated.View>
  );
}

const bannerStyles = StyleSheet.create({
  wrap: { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, overflow: 'hidden', marginHorizontal: SPACE.lg, marginBottom: SPACE.sm },
  strip: { height: 3, width: '100%' },
  content: { padding: SPACE.md, gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  emojiWrap: { width: 38, height: 38, borderRadius: RADIUS.xs, justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 18 },
  perfilLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  perfilNome: { fontSize: FONT.md, fontWeight: '800', color: C.text, marginBottom: 2 },
  perfilDesc: { fontSize: FONT.xs, color: C.textMid, lineHeight: 16 },
  mensagemWrap: { borderRadius: RADIUS.xs, padding: 8 },
  mensagem: { fontSize: FONT.xs, fontWeight: '600' },
});

const alertStyles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.sm, borderWidth: 1, overflow: 'hidden', paddingVertical: 10, paddingRight: 12 },
  bannerStrip: { width: 3, alignSelf: 'stretch', marginRight: 10 },
  bannerText: { fontSize: FONT.sm, fontWeight: '700', flex: 1 },
});

const simStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: SPACE.lg, marginBottom: SPACE.sm, padding: SPACE.md, backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.brand + '30' },
  icon: { width: 38, height: 38, borderRadius: RADIUS.xs, justifyContent: 'center', alignItems: 'center' },
  iconText: { fontSize: 18 },
  titulo: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  sub: { fontSize: FONT.xs, color: C.brand, marginTop: 1 },
  cta: { fontSize: FONT.sm, fontWeight: '800', color: C.brand, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.brandDim, borderRadius: RADIUS.pill },
});
/**
 * src/screens/ScoreScreen.js
 * Valeu a Pena? — Score de compras
 * Design luxury dark · sem emojis · Lucide icons · círculo SVG animado
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Animated,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  ShoppingBag, Tag, RefreshCcw, TrendingUp, TrendingDown,
  Minus, CheckCircle, XCircle, AlertCircle, ChevronDown,
} from 'lucide-react-native';
import { scoreAPI } from '../services/api';

const C = {
  bg:      '#0A0A12',
  surface: '#111120',
  surface2:'#181828',
  surface3:'#1E1E32',
  border:  '#22223A',
  brand:   '#6C5CE7',
  text:    '#F0F0F8',
  textSub: '#6A6A90',
  textMid: '#9898C0',
  green:   '#00C896',
  red:     '#FF5370',
  yellow:  '#FFB300',
};

const CATEGORIAS = [
  'Alimentação', 'Vestuário', 'Tecnologia', 'Casa & Decoração',
  'Saúde & Beleza', 'Desporto', 'Entretenimento', 'Transportes',
  'Educação', 'Outros',
];

const USOS = [
  { key: 'daily',   label: 'Diário' },
  { key: 'weekly',  label: 'Semanal' },
  { key: 'monthly', label: 'Mensal' },
  { key: 'yearly',  label: 'Anual' },
  { key: 'once',    label: 'Uma vez' },
];

// ── Círculo de score SVG ──────────────────────────────────────────────────────
function ScoreCircle({ score }) {
  const r = 56;
  const cx = 72;
  const cy = 72;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circ * (1 - pct);

  const color =
    score >= 70 ? C.green :
    score >= 40 ? C.yellow :
    C.red;

  return (
    <View style={styles.circleWrap}>
      <Svg width={144} height={144} viewBox="0 0 144 144">
        {/* Track */}
        <Circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={C.surface3}
          strokeWidth={10}
        />
        {/* Fill */}
        <Circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${cx},${cy}`}
        />
      </Svg>
      <View style={styles.circleCenter}>
        <Text style={[styles.circleScore, { color }]}>{score}</Text>
        <Text style={styles.circleLabel}>/ 100</Text>
      </View>
    </View>
  );
}

// ── Selector pill ─────────────────────────────────────────────────────────────
function PillSelector({ items, selected, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
      {items.map(item => {
        const key   = typeof item === 'string' ? item : item.key;
        const label = typeof item === 'string' ? item : item.label;
        const active = selected === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onSelect(key)}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Score verdict ─────────────────────────────────────────────────────────────
function VerdictIcon({ recomendacao }) {
  if (recomendacao === 'Compra') return <CheckCircle size={18} color={C.green} />;
  if (recomendacao === 'Evitar') return <XCircle size={18} color={C.red} />;
  return <AlertCircle size={18} color={C.yellow} />;
}

// ── Ecrã ──────────────────────────────────────────────────────────────────────
export default function ScoreScreen() {
  const [item,      setItem]      = useState('');
  const [preco,     setPreco]     = useState('');
  const [categoria, setCategoria] = useState('Tecnologia');
  const [uso,       setUso]       = useState('monthly');
  const [loading,   setLoading]   = useState(false);
  const [resultado, setResultado] = useState(null);

  const analisar = async () => {
    if (!item.trim()) { Alert.alert('Atenção', 'Indica o nome do produto.'); return; }
    const p = parseFloat(preco.replace(',', '.'));
    if (!p || p <= 0) { Alert.alert('Atenção', 'Indica um preço válido.'); return; }

    setLoading(true);
    setResultado(null);
    try {
      const data = await scoreAPI.analisar({ item: item.trim(), preco: p, categoria, uso });
      setResultado(data.resultado);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResultado(null);
    setItem('');
    setPreco('');
  };

  const scoreColor =
    resultado?.score >= 70 ? C.green :
    resultado?.score >= 40 ? C.yellow :
    C.red;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Form */}
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Produto</Text>
        <View style={styles.inputRow}>
          <ShoppingBag size={16} color={C.textSub} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            value={item}
            onChangeText={setItem}
            placeholder="Ex: iPhone 16 Pro"
            placeholderTextColor={C.textSub}
          />
        </View>

        <Text style={styles.fieldLabel}>Preço (€)</Text>
        <View style={styles.inputRow}>
          <Tag size={16} color={C.textSub} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            value={preco}
            onChangeText={setPreco}
            placeholder="0.00"
            placeholderTextColor={C.textSub}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.fieldLabel}>Categoria</Text>
        <PillSelector items={CATEGORIAS} selected={categoria} onSelect={setCategoria} />

        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Frequência de uso</Text>
        <PillSelector items={USOS} selected={uso} onSelect={setUso} />

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={analisar}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Calcular Score</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Resultado */}
      {resultado && (
        <View style={styles.card}>
          {/* Círculo + Veredicto */}
          <View style={styles.resultTop}>
            <ScoreCircle score={resultado.score} />
            <View style={styles.resultInfo}>
              <Text style={styles.resultItem} numberOfLines={2}>{resultado.item}</Text>
              <View style={[
                styles.verdictBadge,
                { backgroundColor: scoreColor + '18', borderColor: scoreColor + '40' },
              ]}>
                <VerdictIcon recomendacao={resultado.recomendacao} />
                <Text style={[styles.verdictText, { color: scoreColor }]}>{resultado.recomendacao}</Text>
              </View>
            </View>
          </View>

          {/* Métricas */}
          <View style={styles.metricsRow}>
            {[
              { label: 'Custo/Uso', value: `${resultado.custo_por_uso?.toFixed(2) ?? '—'}€` },
              { label: 'Utilidade', value: `${resultado.utilidade ?? '—'}%` },
              { label: 'Durabilidade', value: `${resultado.durabilidade ?? '—'}` },
            ].map(m => (
              <View key={m.label} style={styles.metricBox}>
                <Text style={styles.metricVal}>{m.value}</Text>
                <Text style={styles.metricLbl}>{m.label}</Text>
              </View>
            ))}
          </View>

          {/* Frase */}
          {resultado.frase && (
            <View style={styles.quoteBox}>
              <Text style={styles.quoteText}>"{resultado.frase}"</Text>
            </View>
          )}

          {/* Justificação */}
          {resultado.justificacao && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <TrendingUp size={13} color={C.textSub} />
                <Text style={styles.sectionTitle}>Análise</Text>
              </View>
              <Text style={styles.sectionText}>{resultado.justificacao}</Text>
            </View>
          )}

          {/* Alternativas */}
          {resultado.alternativas?.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Minus size={13} color={C.textSub} />
                <Text style={styles.sectionTitle}>Alternativas</Text>
              </View>
              {resultado.alternativas.map((a, i) => (
                <Text key={i} style={[styles.sectionText, { marginTop: 4 }]}>· {a}</Text>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.resetBtn} onPress={reset}>
            <RefreshCcw size={14} color={C.textSub} />
            <Text style={styles.resetText}>Analisar outro produto</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },

  card: {
    backgroundColor: C.surface, borderRadius: 18, padding: 20,
    marginBottom: 14, borderWidth: 1, borderColor: C.border,
  },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 18 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface2, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  input: { flex: 1, color: C.text, fontSize: 15 },

  pillRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  pill:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  pillActive:     { backgroundColor: C.brand + '22', borderColor: C.brand },
  pillText:       { fontSize: 13, color: C.textSub, fontWeight: '600' },
  pillTextActive: { color: C.brand },

  btn:     { backgroundColor: C.brand, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 22 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Resultado
  resultTop:   { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 20 },
  circleWrap:  { position: 'relative', width: 144, height: 144, alignItems: 'center', justifyContent: 'center' },
  circleCenter:{ position: 'absolute', alignItems: 'center' },
  circleScore: { fontSize: 36, fontWeight: '900', lineHeight: 40 },
  circleLabel: { fontSize: 12, color: C.textSub, fontWeight: '600' },
  resultInfo:  { flex: 1, gap: 12 },
  resultItem:  { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.3 },

  verdictBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignSelf: 'flex-start' },
  verdictText:  { fontSize: 14, fontWeight: '800' },

  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  metricBox:  { flex: 1, backgroundColor: C.surface2, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  metricVal:  { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 4 },
  metricLbl:  { fontSize: 10, color: C.textSub, letterSpacing: 0.3 },

  quoteBox: {
    backgroundColor: C.surface2, borderRadius: 10, padding: 14,
    borderLeftWidth: 3, borderLeftColor: C.brand, marginBottom: 16,
  },
  quoteText: { fontSize: 14, color: C.textMid, fontStyle: 'italic', lineHeight: 22 },

  section:       { marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', color: C.textSub, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionText:   { fontSize: 14, color: C.text, lineHeight: 22 },

  resetBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginTop: 8 },
  resetText: { fontSize: 13, color: C.textSub, fontWeight: '600' },
});
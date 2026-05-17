// src/components/DonutCategorias.js
// Donut chart estilo PocketGuard — anel SVG clicável + drill-down de itens reais + insights Verly
// Props: categorias, insights, itensPorCategoria, delay

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions, ScrollView,
} from 'react-native';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { MotiView } from 'moti';
import {
  PieChart, Zap, ChevronDown, ChevronUp, ShoppingBag, Calendar,
} from 'lucide-react-native';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const { width: W } = Dimensions.get('window');

const CAT_COLORS = [
  '#7C6FE0', '#E24B4A', '#00D68F', '#FFB300',
  '#45B7D1', '#FF7340', '#B06FE0', '#E07090',
];

const CAT_ICONS = {
  'alimentação': '🛒', 'transporte': '🚗', 'saúde': '🏥',
  'lazer': '🎮', 'vestuário': '👕', 'electrónica': '💻',
  'casa': '🏠', 'educação': '📚', 'outros': '📦',
  'restaurantes': '🍽️', 'viagens': '✈️', 'streaming': '📺',
  'desporto': '🏃',
};

const TIPS = {
  'alimentação': { tip: 'Alimentação acima de 15% do rendimento é sinal de alerta. Planear refeições pode reduzir até 40% deste custo.', source: 'DECO Proteste, 2023' },
  'transporte': { tip: 'O custo total de um carro (seguro, manutenção, combustível, depreciação) ronda 500-800€/mês. Considera transportes públicos para percursos fixos.', source: 'IMTT / Análise Verly' },
  'lazer': { tip: 'A regra 50/30/20 cobre lazer + desejos em 30% do rendimento. Se o lazer sozinho excede 15%, analisa padrões de consumo impulsivo.', source: 'Elizabeth Warren (2005)' },
  'vestuário': { tip: 'O custo médio anual em vestuário em Portugal é ~650€. Usa o "custo por uso": divide o preço pelas vezes que vais usar.', source: 'INE Portugal, 2023' },
  'saúde': { tip: 'Despesas de saúde são dedutíveis em IRS em Portugal (15% até certo limite). Guarda todos os recibos para a declaração anual.', source: 'AT Portugal' },
  'streaming': { tip: 'O utilizador médio europeu tem 4,2 subscrições mas usa regularmente apenas 2,1. Faz uma auditoria: cancela o que não usas mais de 2x/mês.', source: 'Barclays Consumer Study (2023)' },
};

const fmt = (n) => (+(n || 0)).toFixed(2).replace('.', ',');

// ─── SVG helpers ──────────────────────────────────────────────────────────────
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegmentPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const gap = 1.5;
  const s = startAngle + gap / 2;
  const e = endAngle - gap / 2;
  if (e <= s) return '';
  const o1 = polarToCartesian(cx, cy, outerR, s);
  const o2 = polarToCartesian(cx, cy, outerR, e);
  const i1 = polarToCartesian(cx, cy, innerR, e);
  const i2 = polarToCartesian(cx, cy, innerR, s);
  const large = e - s > 180 ? 1 : 0;
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ');
}

// ─── Donut SVG ────────────────────────────────────────────────────────────────
function DonutSvg({ categorias, selected, onSelect, total }) {
  const SIZE = Math.min(W - SPACE.lg * 2, 260);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const outerR = SIZE / 2 - 8;
  const innerR = outerR * 0.62;

  let angle = 0;
  const segments = categorias.map((cat, i) => {
    const pct = total > 0 ? cat.valor / total : 0;
    const sweep = pct * 360;
    const seg = {
      cat, color: CAT_COLORS[i % CAT_COLORS.length],
      startAngle: angle, endAngle: angle + sweep, pct: pct * 100,
    };
    angle += sweep;
    return seg;
  });

  const selectedSeg = selected != null ? segments.find(s => s.cat.categoria === selected) : null;

  return (
    <View style={{ alignItems: 'center', marginBottom: 4 }}>
      <Svg width={SIZE} height={SIZE}>
        <G>
          {segments.map((seg) => {
            const isSelected = selected === seg.cat.categoria;
            const isDeselected = selected != null && !isSelected;
            const oR = isSelected ? outerR + 7 : outerR;
            const iR = isSelected ? innerR + 4 : innerR;
            return (
              <Path
                key={seg.cat.categoria}
                d={donutSegmentPath(cx, cy, oR, iR, seg.startAngle, seg.endAngle)}
                fill={seg.color}
                opacity={isDeselected ? 0.3 : 1}
                onPress={() => onSelect(isSelected ? null : seg.cat.categoria)}
              />
            );
          })}
        </G>
        {/* Centro */}
        <SvgText x={cx} y={cy - 12} textAnchor="middle"
          fill={selectedSeg ? selectedSeg.color : C.text}
          fontSize={selectedSeg ? 21 : 19} fontWeight="800">
          {fmt(selectedSeg ? selectedSeg.cat.valor : total)}€
        </SvgText>
        <SvgText x={cx} y={cy + 10} textAnchor="middle" fill={C.textMid} fontSize={11}>
          {selectedSeg ? selectedSeg.cat.categoria : 'Total'}
        </SvgText>
        {selectedSeg && (
          <SvgText x={cx} y={cy + 28} textAnchor="middle"
            fill={selectedSeg.color} fontSize={13} fontWeight="700">
            {Math.round(selectedSeg.pct)}%
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

// ─── Painel de drill-down: insight + itens reais ───────────────────────────────
function DrillDown({ cat, color, insights, itensPorCategoria }) {
  const [showItems, setShowItems] = useState(true);

  const catLower = cat.toLowerCase();
  const itens = itensPorCategoria?.[catLower] || itensPorCategoria?.[cat] || [];

  // Insight IA ou tip estático
  const matchedInsight = insights?.find(ins =>
    ins.texto?.toLowerCase().includes(catLower) ||
    ins.categoria?.toLowerCase() === catLower
  );
  const tip = TIPS[catLower];
  const insightText = matchedInsight?.texto || tip?.tip ||
    `A categoria "${cat}" representa uma parte significativa dos teus gastos. Compara com os teus objetivos mensais.`;
  const source = matchedInsight ? 'Análise IA Verly' : (tip?.source || 'Análise Verly');

  return (
    <Animated.View entering={FadeInDown.duration(280)} style={[styles.drillBox, { borderLeftColor: color }]}>
      {/* Insight */}
      <View style={styles.drillInsightHeader}>
        <Zap size={11} color={color} />
        <Text style={[styles.drillInsightLabel, { color }]}>INSIGHT VERLY</Text>
      </View>
      <Text style={styles.drillInsightText}>{insightText}</Text>
      <Text style={styles.drillInsightSource}>📖 {source}</Text>

      {/* Separador + toggle de itens */}
      {itens.length > 0 && (
        <>
          <View style={styles.drillDivider} />
          <Pressable onPress={() => setShowItems(v => !v)} style={styles.drillToggle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <ShoppingBag size={12} color={C.textMid} />
              <Text style={styles.drillToggleText}>
                {itens.length} {itens.length === 1 ? 'compra' : 'compras'} nesta categoria
              </Text>
            </View>
            {showItems
              ? <ChevronUp size={13} color={C.textMid} />
              : <ChevronDown size={13} color={C.textMid} />}
          </Pressable>

          {showItems && (
            <Animated.View entering={FadeInDown.duration(200)}>
              {itens.map((item, i) => (
                <View
                  key={`${item.loja}-${i}`}
                  style={[styles.itemRow, i < itens.length - 1 && styles.itemBorder]}
                >
                  <View style={[styles.itemDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemLoja} numberOfLines={1}>{item.loja}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Calendar size={10} color={C.textMid} />
                      <Text style={styles.itemData}>{item.data}</Text>
                    </View>
                  </View>
                  <Text style={[styles.itemValor, { color }]}>{fmt(item.valor)}€</Text>
                </View>
              ))}
            </Animated.View>
          )}
        </>
      )}
    </Animated.View>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function DonutCategorias({ categorias, insights, itensPorCategoria, delay = 100 }) {
  const [selected, setSelected] = useState(null);

  if (!categorias?.length) return null;

  const top = categorias.slice(0, 7);
  const total = top.reduce((s, c) => s + c.valor, 0);
  const selectedCat = top.find(c => c.categoria === selected);
  const selectedColor = selectedCat
    ? CAT_COLORS[top.findIndex(c => c.categoria === selected) % CAT_COLORS.length]
    : null;

  const handleSelect = useCallback((catName) => {
    setSelected(prev => prev === catName ? null : catName);
  }, []);

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(500).springify()} style={styles.section}>
      {/* Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <PieChart size={16} color={C.brand} />
          <Text style={styles.sectionTitle}>Distribuição de Gastos</Text>
        </View>
        <Text style={styles.totalText}>{fmt(total)}€</Text>
      </View>

      <View style={styles.card}>
        {/* Donut */}
        <DonutSvg categorias={top} selected={selected} onSelect={handleSelect} total={total} />

        {!selected && (
          <Text style={styles.tapHint}>Toca numa fatia ou categoria para ver detalhes</Text>
        )}

        {/* Drill-down: insight + itens */}
        {selected && selectedCat && (
          <DrillDown
            cat={selected}
            color={selectedColor}
            insights={insights}
            itensPorCategoria={itensPorCategoria}
          />
        )}

        <View style={styles.divider} />

        {/* Lista de categorias */}
        {top.map((cat, i) => {
          const pct = total > 0 ? (cat.valor / total) * 100 : 0;
          const color = CAT_COLORS[i % CAT_COLORS.length];
          const emoji = CAT_ICONS[cat.categoria?.toLowerCase()] || '📦';
          const isSelected = selected === cat.categoria;
          const isDeselected = selected != null && !isSelected;

          return (
            <Pressable
              key={cat.categoria}
              onPress={() => handleSelect(cat.categoria)}
              style={[
                styles.catRow,
                isSelected && { backgroundColor: color + '12', borderRadius: 10 },
                isDeselected && { opacity: 0.4 },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={styles.catEmoji}>{emoji}</Text>
              <Text style={[styles.catName, isSelected && { color, fontWeight: '700' }]} numberOfLines={1}>
                {cat.categoria}
              </Text>
              <View style={styles.barWrap}>
                <MotiView
                  from={{ width: '0%' }}
                  animate={{ width: `${Math.max(pct, 2)}%` }}
                  transition={{ type: 'timing', duration: 600 + i * 80 }}
                  style={[styles.bar, { backgroundColor: color, opacity: isDeselected ? 0.25 : 0.65 }]}
                />
              </View>
              <View style={styles.catRight}>
                <Text style={[styles.catPct, { color }]}>{Math.round(pct)}%</Text>
                <Text style={styles.catVal}>{fmt(cat.valor)}€</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  section: { marginHorizontal: SPACE.lg, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { color: C.text, fontSize: FONT.md, fontWeight: '700' },
  totalText: { color: C.brand, fontSize: FONT.sm, fontWeight: '700' },
  card: { backgroundColor: C.surface2, borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, borderColor: C.border },
  tapHint: { textAlign: 'center', color: C.textMid, fontSize: FONT.xs, marginBottom: 12, marginTop: -4 },

  // Drill-down box
  drillBox: {
    backgroundColor: C.surface3, borderRadius: RADIUS.sm,
    borderLeftWidth: 3, padding: 12, marginBottom: 14,
  },
  drillInsightHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  drillInsightLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  drillInsightText: { color: C.text, fontSize: FONT.sm, lineHeight: 18 },
  drillInsightSource: { color: C.textMid, fontSize: 10, marginTop: 6, fontStyle: 'italic' },

  drillDivider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  drillToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 2,
  },
  drillToggleText: { color: C.textMid, fontSize: FONT.sm },

  // Itens da categoria
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingVertical: 8,
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  itemDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  itemLoja: { color: C.text, fontSize: FONT.sm, fontWeight: '600' },
  itemData: { color: C.textMid, fontSize: 10 },
  itemValor: { fontSize: FONT.sm, fontWeight: '700' },

  divider: { height: 1, backgroundColor: C.border, marginBottom: 12 },

  // Lista de categorias
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  catEmoji: { fontSize: 15, width: 20, textAlign: 'center' },
  catName: { color: C.text, fontSize: FONT.sm, flex: 1, minWidth: 0 },
  barWrap: { width: 60, height: 4, backgroundColor: C.surface3, borderRadius: 2, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 2 },
  catRight: { alignItems: 'flex-end', minWidth: 64 },
  catPct: { fontSize: FONT.sm, fontWeight: '700' },
  catVal: { color: C.textMid, fontSize: 10, marginTop: 1 },
});
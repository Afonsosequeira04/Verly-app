/**
 * src/screens/ScoreScreen.js
 * "Valeu a Pena?" — Score de Compras
 * Design polished: SVG circle, Lucide icons, mapa de lojas via WebView+Leaflet
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Svg, { Circle } from 'react-native-svg';
import {
  ShoppingBag, Tag, Zap, Calendar, TrendingDown,
  ChevronDown, ChevronUp, MapPin, Star, AlertTriangle,
  CheckCircle, Clock, X,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { scoreAPI } from '../services/api';

const { width: SCREEN_W } = Dimensions.get('window');

const C = {
  brand:    '#6C5CE7',
  brandDim: 'rgba(108,92,231,0.15)',
  bg:       '#0C0C14',
  surface:  '#13131F',
  surface2: '#1C1C2E',
  border:   '#252540',
  text:     '#EEEEF8',
  textSub:  '#7070A0',
  green:    '#00C896',
  red:      '#FF5370',
  yellow:   '#FFB300',
  orange:   '#FF7043',
};

const CATEGORIAS = [
  'Alimentação','Vestuário','Tecnologia','Saúde & Beleza',
  'Entretenimento','Casa & Decoração','Desporto','Educação',
  'Transportes','Outros',
];

const USO_OPTIONS = [
  { key: 'daily',   label: 'Diário',    Icon: Zap },
  { key: 'weekly',  label: 'Semanal',   Icon: Calendar },
  { key: 'monthly', label: 'Mensal',    Icon: Clock },
  { key: 'rarely',  label: 'Raramente', Icon: TrendingDown },
  { key: 'never',   label: 'Nunca',     Icon: X },
];

// ── SVG Score Circle ──────────────────────────────────────────────────────────

function ScoreCircle({ score, color }) {
  const SIZE = 120;
  const R    = 50;
  const STROKE = 8;
  const circ = 2 * Math.PI * R;
  const dash = (score / 100) * circ;

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Track */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={C.surface2}
          strokeWidth={STROKE}
        />
        {/* Progress */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          rotation="-90"
          originX={SIZE / 2}
          originY={SIZE / 2}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color, letterSpacing: -1 }}>{score}</Text>
        <Text style={{ fontSize: 10, color: C.textSub, fontWeight: '600' }}>/100</Text>
      </View>
    </View>
  );
}

// ── Lojas Map WebView ─────────────────────────────────────────────────────────

function MapaLojas({ lojas, userLat, userLng, item }) {
  if (!lojas || lojas.length === 0 || userLat == null) return null;

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0C0C14; font-family: -apple-system, sans-serif; }
  #map { width:100%; height:220px; }
  .leaflet-container { background:#0C0C14 !important; }
  #list { max-height:160px; overflow-y:auto; padding:0 12px; }
  .loja { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #252540; }
  .loja:last-child { border-bottom:none; }
  .num { width:24px; height:24px; background:linear-gradient(135deg,#6C5CE7,#9B8FFF);
         border-radius:6px; display:flex; align-items:center; justify-content:center;
         font-size:11px; font-weight:800; color:white; flex-shrink:0; }
  .info { flex:1; min-width:0; }
  .nome { font-size:13px; font-weight:600; color:#EEEEF8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .end  { font-size:11px; color:#7070A0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .dist { font-size:11px; color:#6C5CE7; font-weight:700; flex-shrink:0; }
</style>
</head>
<body>
<div id="map"></div>
<div id="list">
  ${lojas.map((l, i) => `
    <div class="loja">
      <div class="num">${i + 1}</div>
      <div class="info">
        <div class="nome">${l.nome}</div>
        ${l.endereco ? `<div class="end">${l.endereco}</div>` : ''}
      </div>
      ${l.distancia ? `<div class="dist">${l.distancia}</div>` : ''}
    </div>
  `).join('')}
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('map', { zoomControl:false, attributionControl:false })
             .setView([${userLat},${userLng}], 14);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19 })
 .addTo(map);

// Utilizador
L.marker([${userLat},${userLng}], {
  icon: L.divIcon({
    html:'<div style="width:12px;height:12px;background:#6C5CE7;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(108,92,231,0.8);"></div>',
    className:'', iconAnchor:[6,6]
  })
}).addTo(map).bindPopup('A tua localização');

const lojas = ${JSON.stringify(lojas)};
lojas.forEach((l, i) => {
  L.marker([l.lat, l.lng], {
    icon: L.divIcon({
      html:\`<div style="width:26px;height:26px;background:linear-gradient(135deg,#6C5CE7,#9B8FFF);border:2px solid white;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.5);">\${i+1}</div>\`,
      className:'', iconAnchor:[13,13]
    })
  }).addTo(map).bindPopup(\`<b>\${l.nome}</b>\${l.endereco ? '<br>'+l.endereco : ''}\`);
});
</script>
</body>
</html>
`;

  return (
    <View style={styles.mapaCard}>
      <View style={styles.mapaHeader}>
        <MapPin size={14} color={C.brand} />
        <Text style={styles.mapaTitle}>{lojas.length} loja{lojas.length !== 1 ? 's' : ''} próximas para "{item}"</Text>
      </View>
      <WebView
        source={{ html }}
        style={{ width: '100%', height: 380, backgroundColor: C.bg }}
        scrollEnabled={false}
        javaScriptEnabled
      />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ScoreScreen() {
  const [item,       setItem]       = useState('');
  const [preco,      setPreco]      = useState('');
  const [categoria,  setCategoria]  = useState('Tecnologia');
  const [uso,        setUso]        = useState('monthly');
  const [showCats,   setShowCats]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [resultado,  setResultado]  = useState(null);
  const [lojas,      setLojas]      = useState([]);
  const [userLat,    setUserLat]    = useState(null);
  const [userLng,    setUserLng]    = useState(null);
  const [loadingMap, setLoadingMap] = useState(false);

  const scoreColor = (s) => {
    if (s >= 75) return C.green;
    if (s >= 50) return C.yellow;
    if (s >= 30) return C.orange;
    return C.red;
  };

  const chipStyle = (type) => {
    const map = {
      good: { bg: 'rgba(0,200,150,0.12)',  border: C.green,  text: C.green  },
      bad:  { bg: 'rgba(255,83,112,0.12)', border: C.red,    text: C.red    },
      mid:  { bg: 'rgba(255,179,0,0.12)',  border: C.yellow, text: C.yellow },
    };
    return map[type] || map.mid;
  };

  const buscarLojas = async (itemNome, cat) => {
    setLoadingMap(true);
    setLojas([]);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingMap(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setUserLat(lat);
      setUserLng(lng);

      const token = await import('../services/api').then(m => m.getToken ? m.getToken() : null);
      const resp = await fetch('http://127.0.0.1:5000/api/v1/scoring/lojas-proximas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ item: itemNome, categoria: cat, lat, lng }),
      });
      const data = await resp.json();
      if (data.success && data.lojas?.length > 0) {
        setLojas(data.lojas);
      }
    } catch (e) {
      // silently fail — mapa não é crítico
    } finally {
      setLoadingMap(false);
    }
  };

  const analisar = async () => {
    if (!preco || isNaN(parseFloat(preco))) {
      Alert.alert('Atenção', 'Insere um preço válido.');
      return;
    }
    setLoading(true);
    setResultado(null);
    setLojas([]);
    try {
      const data = await scoreAPI.analisar({
        item: item || 'Item',
        preco: parseFloat(preco),
        categoria,
        uso,
      });
      if (data.success) {
        setResultado(data.resultado);
        // buscar lojas em paralelo (não bloqueia o resultado)
        buscarLojas(item || categoria, categoria);
      }
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Valeu a Pena?</Text>
        <Text style={styles.headerSub}>Analisa qualquer compra antes ou depois de a fazer</Text>
      </View>

      {/* Form Card */}
      <View style={styles.card}>

        {/* Produto */}
        <Text style={styles.label}>Produto ou serviço</Text>
        <View style={styles.inputWrap}>
          <ShoppingBag size={16} color={C.textSub} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.inputText}
            value={item}
            onChangeText={setItem}
            placeholder="ex: iPhone 15, Sapatilhas Nike..."
            placeholderTextColor={C.textSub}
          />
        </View>

        {/* Preço */}
        <Text style={styles.label}>Preço (€)</Text>
        <View style={styles.inputWrap}>
          <Tag size={16} color={C.textSub} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.inputText}
            value={preco}
            onChangeText={setPreco}
            placeholder="0.00"
            placeholderTextColor={C.textSub}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Categoria — dropdown */}
        <Text style={styles.label}>Categoria</Text>
        <TouchableOpacity style={styles.selectWrap} onPress={() => setShowCats(!showCats)}>
          <Text style={styles.selectText}>{categoria}</Text>
          {showCats
            ? <ChevronUp size={16} color={C.textSub} />
            : <ChevronDown size={16} color={C.textSub} />
          }
        </TouchableOpacity>
        {showCats && (
          <View style={styles.dropdown}>
            {CATEGORIAS.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.dropItem, cat === categoria && styles.dropItemActive]}
                onPress={() => { setCategoria(cat); setShowCats(false); }}
              >
                <Text style={[styles.dropItemText, cat === categoria && { color: C.brand }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Frequência de uso — chips com ícones Lucide */}
        <Text style={styles.label}>Com que frequência usas?</Text>
        <View style={styles.usoGrid}>
          {USO_OPTIONS.map(op => {
            const active = uso === op.key;
            const { Icon } = op;
            return (
              <TouchableOpacity
                key={op.key}
                style={[styles.usoBtn, active && styles.usoBtnActive]}
                onPress={() => setUso(op.key)}
              >
                <Icon size={15} color={active ? C.brand : C.textSub} />
                <Text style={[styles.usoLabel, active && { color: C.brand }]}>{op.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={analisar}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Analisar Compra</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Resultado */}
      {resultado && (() => {
        const sc = scoreColor(resultado.score);
        return (
          <>
            <View style={styles.card}>

              {/* Score row */}
              <View style={styles.resultRow}>
                <ScoreCircle score={resultado.score} color={sc} />
                <View style={{ flex: 1, marginLeft: 20 }}>
                  <Text style={[styles.resultLabel, { color: sc }]}>{resultado.label}</Text>
                  <Text style={styles.resultMsg}>{resultado.message}</Text>
                </View>
              </View>

              {/* Chips good/bad/mid */}
              {resultado.chips?.length > 0 && (
                <View style={styles.chips}>
                  {resultado.chips.map((chip, i) => {
                    const cs = chipStyle(chip.type);
                    return (
                      <View key={i} style={[styles.chip, { backgroundColor: cs.bg, borderColor: cs.border }]}>
                        <Text style={[styles.chipText, { color: cs.text }]}>{chip.text}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Comparação de mercado */}
              {resultado.preco_medio_mercado && (
                <View style={styles.mercadoBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Star size={13} color={C.brand} />
                    <Text style={styles.mercadoTitle}>Comparação de Mercado</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.mercadoSub}>Preço médio em Portugal</Text>
                    <Text style={[styles.mercadoVal, { color: C.brand }]}>
                      {resultado.preco_medio_mercado.toFixed(2)}€
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <Text style={styles.mercadoSub}>Avaliação</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {resultado.avaliacao_mercado === 'barato'     && <CheckCircle  size={13} color={C.green}  />}
                      {resultado.avaliacao_mercado === 'caro'       && <AlertTriangle size={13} color={C.orange} />}
                      {resultado.avaliacao_mercado === 'muito_caro' && <AlertTriangle size={13} color={C.red}    />}
                      <Text style={[styles.mercadoVal, {
                        color: resultado.avaliacao_mercado === 'barato'     ? C.green
                             : resultado.avaliacao_mercado === 'caro'       ? C.orange
                             : resultado.avaliacao_mercado === 'muito_caro' ? C.red
                             : C.textSub,
                      }]}>
                        {resultado.avaliacao_mercado === 'barato'     ? 'Bom negócio'
                       : resultado.avaliacao_mercado === 'caro'       ? 'Acima do mercado'
                       : resultado.avaliacao_mercado === 'muito_caro' ? 'Muito caro'
                       : 'Preço justo'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Loading do mapa */}
            {loadingMap && (
              <View style={styles.mapaLoading}>
                <ActivityIndicator color={C.brand} size="small" />
                <Text style={styles.mapaLoadingText}>A procurar lojas próximas...</Text>
              </View>
            )}

            {/* Mapa Leaflet via WebView */}
            {!loadingMap && lojas.length > 0 && (
              <MapaLojas
                lojas={lojas}
                userLat={userLat}
                userLng={userLng}
                item={item || categoria}
              />
            )}
          </>
        );
      })()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 48 },

  header:      { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24 },
  headerTitle: { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: -0.5, marginBottom: 6 },
  headerSub:   { fontSize: 14, color: C.textSub, lineHeight: 20 },

  card: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: C.surface,
    borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: C.border,
  },

  label: {
    fontSize: 12, fontWeight: '700', color: C.textSub,
    marginBottom: 8, marginTop: 18,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: C.border,
  },
  inputText: { flex: 1, color: C.text, fontSize: 15 },

  selectWrap: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.surface2, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: C.border,
  },
  selectText:     { color: C.text, fontSize: 15 },
  dropdown:       { backgroundColor: C.surface2, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 4, overflow: 'hidden' },
  dropItem:       { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropItemActive: { backgroundColor: C.brandDim },
  dropItemText:   { color: C.text, fontSize: 14 },

  usoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  usoBtn: {
    flex: 1, minWidth: 58, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.surface2, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: C.border, justifyContent: 'center',
  },
  usoBtnActive: { borderColor: C.brand, backgroundColor: C.brandDim },
  usoLabel:     { fontSize: 11, fontWeight: '700', color: C.textSub },

  btn: {
    backgroundColor: C.brand, borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 22,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },

  resultRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  resultLabel: { fontSize: 20, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  resultMsg:   { fontSize: 13, color: C.textSub, lineHeight: 19 },

  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:     { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },

  mercadoBox: {
    backgroundColor: C.surface2, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.border, marginTop: 4,
  },
  mercadoTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  mercadoSub:   { fontSize: 12, color: C.textSub },
  mercadoVal:   { fontSize: 13, fontWeight: '800' },

  mapaLoading: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  mapaLoadingText: { color: C.textSub, fontSize: 13 },

  mapaCard: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  mapaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  mapaTitle: { fontSize: 13, fontWeight: '700', color: C.text, flex: 1 },
});
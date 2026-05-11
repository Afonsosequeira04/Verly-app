/**
 * src/screens/ScoreScreen.js
 * "Valeu a Pena?" — Score de Compras
 * Versão mobile completa: score, análise IA, mapa de lojas com react-native-maps
 *
 * NOTA: Requer react-native-maps instalado:
 *   npx expo install react-native-maps
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
  Dimensions, Modal,
} from 'react-native';
import * as Location from 'expo-location';
import { scoreAPI } from '../services/api';
import { COLORS } from '../constants/theme';

const { width: W } = Dimensions.get('window');

// ── Dados ─────────────────────────────────────────────────────────────────────

const CATEGORIAS = [
  'Tecnologia', 'Alimentação', 'Vestuário', 'Casa & Decoração',
  'Saúde & Beleza', 'Desporto', 'Entretenimento', 'Transportes', 'Educação', 'Outros',
];

const USO_OPCOES = [
  { key: 'daily',   label: 'Uso diário',     emoji: '🔥' },
  { key: 'weekly',  label: 'Uso regular',     emoji: '✅' },
  { key: 'monthly', label: 'Uso ocasional',   emoji: '📅' },
  { key: 'rarely',  label: 'Raramente',       emoji: '😬' },
  { key: 'never',   label: 'Nunca usei',      emoji: '💸' },
];

// ── Helpers visuais ───────────────────────────────────────────────────────────

function getScoreColor(score) {
  if (score >= 75) return COLORS.green;
  if (score >= 50) return COLORS.yellow;
  if (score >= 25) return '#FF8C00';
  return COLORS.red;
}

function getScoreLabel(score) {
  if (score >= 75) return 'Excelente compra! 🎉';
  if (score >= 50) return 'Compra razoável 👍';
  if (score >= 25) return 'Podes fazer melhor 😕';
  return 'Compra questionável 🚨';
}

function getAvaliacaoLabel(av) {
  const map = {
    barato:    { text: 'Preço abaixo do mercado 🟢', color: COLORS.green },
    justo:     { text: 'Preço de mercado 🔵',         color: COLORS.brand },
    caro:      { text: 'Acima do mercado 🟠',          color: COLORS.yellow },
    muito_caro:{ text: 'Muito acima do mercado 🔴',    color: COLORS.red },
  };
  return map[av] || { text: av, color: COLORS.textSub };
}

// ── Componente de score circular ──────────────────────────────────────────────

function ScoreCircle({ score }) {
  const color = getScoreColor(score);
  return (
    <View style={[sc.circle, { borderColor: color }]}>
      <Text style={[sc.circleScore, { color }]}>{score}</Text>
      <Text style={sc.circleLabel}>/100</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  circle: { width: 140, height: 140, borderRadius: 70, borderWidth: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surface },
  circleScore: { fontSize: 48, fontWeight: '900' },
  circleLabel: { fontSize: 14, color: COLORS.textSub, fontWeight: '600', marginTop: -4 },
});

// ── Mapa de lojas (usa react-native-maps se disponível) ───────────────────────

function MapaLojas({ lojas, userLat, userLng, visible, onClose }) {
  const [MapView, setMapView] = useState(null);
  const [Marker, setMarker] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    try {
      const maps = require('react-native-maps');
      setMapView(() => maps.default);
      setMarker(() => maps.Marker);
      setMapReady(true);
    } catch {
      setMapReady(false);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        {/* Header */}
        <View style={m.header}>
          <TouchableOpacity onPress={onClose} style={m.closeBtn}>
            <Text style={m.closeBtnText}>‹ Fechar</Text>
          </TouchableOpacity>
          <Text style={m.headerTitle}>Lojas Próximas ({lojas.length})</Text>
          <View style={{ width: 80 }} />
        </View>

        {!mapReady ? (
          // Fallback: lista de lojas sem mapa
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={m.noMapBanner}>
              <Text style={m.noMapText}>
                📍 Mapa não disponível.{'\n'}Instala react-native-maps para ver o mapa.
              </Text>
            </View>
            {lojas.map((loja, i) => (
              <View key={i} style={m.lojaCard}>
                <View style={m.lojaInfo}>
                  <Text style={m.lojaNome}>{loja.nome}</Text>
                  <Text style={m.lojaMeta}>{loja.distancia} · {loja.endereco || ''}</Text>
                  {loja.avaliacao ? <Text style={m.lojaRating}>⭐ {loja.avaliacao}</Text> : null}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {/* Mapa */}
            {React.createElement(MapView, {
              style: { flex: 1 },
              initialRegion: {
                latitude:      userLat || 38.7,
                longitude:     userLng || -9.14,
                latitudeDelta:  0.05,
                longitudeDelta: 0.05,
              },
            },
              // Marcador do utilizador
              userLat && React.createElement(Marker, {
                key: 'user',
                coordinate: { latitude: userLat, longitude: userLng },
                title: 'A tua localização',
                pinColor: COLORS.brand,
              }),
              // Marcadores das lojas
              ...lojas.map((loja, i) =>
                loja.lat && React.createElement(Marker, {
                  key: i,
                  coordinate: { latitude: loja.lat, longitude: loja.lng },
                  title: loja.nome,
                  description: `${loja.distancia}${loja.avaliacao ? ` · ⭐ ${loja.avaliacao}` : ''}`,
                })
              )
            )}

            {/* Lista overlay */}
            <View style={m.overlay}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 10 }}>
                {lojas.map((loja, i) => (
                  <View key={i} style={m.lojaChip}>
                    <Text style={m.lojaNomeChip}>{loja.nome}</Text>
                    <Text style={m.lojaDistChip}>{loja.distancia}</Text>
                    {loja.avaliacao ? <Text style={m.lojaRating}>⭐ {loja.avaliacao}</Text> : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg },
  closeBtn: { width: 80 },
  closeBtnText: { color: COLORS.brand, fontSize: 16, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  noMapBanner: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  noMapText: { color: COLORS.textSub, textAlign: 'center', lineHeight: 22 },
  lojaCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  lojaInfo: {},
  lojaNome: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  lojaMeta: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  lojaRating: { fontSize: 12, color: COLORS.yellow, marginTop: 4 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface + 'EE' },
  lojaChip: { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 12, minWidth: 130, borderWidth: 1, borderColor: COLORS.border },
  lojaNomeChip: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  lojaDistChip: { fontSize: 11, color: COLORS.textSub, marginTop: 2 },
});

// ── Ecrã principal ────────────────────────────────────────────────────────────

export default function ScoreScreen() {
  const [item, setItem]       = useState('');
  const [preco, setPreco]     = useState('');
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [uso, setUso]         = useState('weekly');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const [lojas, setLojas]     = useState([]);
  const [lojasLoad, setLojasLoad] = useState(false);
  const [showMapa, setShowMapa] = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });

  const scrollRef = useRef(null);

  // ── Analisar ──────────────────────────────────────────────────────────────

  const handleAnalisar = async () => {
    if (!item.trim()) return Alert.alert('Atenção', 'Indica o produto.');
    const precoNum = parseFloat(preco.replace(',', '.'));
    if (isNaN(precoNum) || precoNum <= 0) return Alert.alert('Atenção', 'Indica um preço válido.');

    setLoading(true);
    setResultado(null);
    setLojas([]);
    try {
      const data = await scoreAPI.analisar({ item: item.trim(), preco: precoNum, categoria, uso });
      setResultado(data);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 400, animated: true }), 300);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Lojas próximas ─────────────────────────────────────────────────────────

  const handleLojas = async () => {
    setLojasLoad(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Sem permissão', 'Preciso de acesso à localização para mostrar lojas próximas.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setUserCoords({ lat, lng });

      const data = await scoreAPI.lojasProximas({ item: item.trim(), categoria, lat, lng });
      setLojas(data.lojas || []);
      setShowMapa(true);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLojasLoad(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView ref={scrollRef} style={s.root} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      
      {/* Título */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>Valeu a Pena?</Text>
        <Text style={s.heroSub}>Avalia qualquer compra com inteligência artificial.</Text>
      </View>

      {/* Formulário */}
      <View style={s.card}>
        <Text style={s.label}>Produto / Serviço</Text>
        <TextInput
          style={s.input}
          value={item}
          onChangeText={setItem}
          placeholder="Ex: Nike Air Max, iPhone 16, Café..."
          placeholderTextColor={COLORS.textSub}
        />

        <Text style={s.label}>Preço Pago (€)</Text>
        <TextInput
          style={s.input}
          value={preco}
          onChangeText={setPreco}
          placeholder="0.00"
          placeholderTextColor={COLORS.textSub}
          keyboardType="decimal-pad"
        />

        <Text style={s.label}>Categoria</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
            {CATEGORIAS.map(c => (
              <TouchableOpacity key={c} style={[s.chip, categoria === c && s.chipActive]} onPress={() => setCategoria(c)}>
                <Text style={[s.chipText, categoria === c && s.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={s.label}>Frequência de Uso</Text>
        <View style={s.usoGrid}>
          {USO_OPCOES.map(u => (
            <TouchableOpacity key={u.key} style={[s.usoBtn, uso === u.key && s.usoBtnActive]} onPress={() => setUso(u.key)}>
              <Text style={s.usoEmoji}>{u.emoji}</Text>
              <Text style={[s.usoLabel, uso === u.key && { color: COLORS.brand }]}>{u.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[s.analyzeBtn, loading && { opacity: 0.6 }]} onPress={handleAnalisar} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.analyzeBtnText}>Analisar Compra</Text>}
        </TouchableOpacity>
      </View>

      {/* Resultado */}
      {resultado && (
        <View style={s.resultCard}>
          {/* Score */}
          <View style={s.scoreSection}>
            <ScoreCircle score={resultado.score_final ?? resultado.score ?? 0} />
            <Text style={[s.scoreLabel, { color: getScoreColor(resultado.score_final ?? resultado.score ?? 0) }]}>
              {getScoreLabel(resultado.score_final ?? resultado.score ?? 0)}
            </Text>
          </View>

          {/* Preço de mercado */}
          {resultado.avaliacao_mercado && resultado.avaliacao_mercado.preco_medio && (
            <View style={s.mercadoBox}>
              <Text style={s.mercadoLabel}>Preço de mercado estimado</Text>
              <Text style={s.mercadoPreco}>{resultado.avaliacao_mercado.preco_medio.toFixed(2)}€</Text>
              <Text style={[s.mercadoAv, { color: getAvaliacaoLabel(resultado.avaliacao_mercado.avaliacao).color }]}>
                {getAvaliacaoLabel(resultado.avaliacao_mercado.avaliacao).text}
              </Text>
              {resultado.avaliacao_mercado.comentario ? (
                <Text style={s.mercadoCom}>{resultado.avaliacao_mercado.comentario}</Text>
              ) : null}
            </View>
          )}

          {/* Fatores */}
          {resultado.fatores && resultado.fatores.length > 0 && (
            <View style={s.fatoresSection}>
              <Text style={s.fatoresTitle}>Análise Detalhada</Text>
              {resultado.fatores.map((f, i) => (
                <View key={i} style={s.fatorRow}>
                  <Text style={s.fatorNome}>{f.nome || f.label}</Text>
                  <View style={s.fatorBarBg}>
                    <View style={[s.fatorBar, { width: `${Math.min(f.score ?? f.valor ?? 0, 100)}%`, backgroundColor: getScoreColor(f.score ?? f.valor ?? 50) }]} />
                  </View>
                  <Text style={s.fatorVal}>{f.score ?? f.valor ?? 0}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Conselho da IA */}
          {resultado.conselho && (
            <View style={s.conselhoBox}>
              <Text style={s.conselhoIcon}>✦</Text>
              <Text style={s.conselhoText}>{resultado.conselho}</Text>
            </View>
          )}

          {/* Lojas próximas */}
          <TouchableOpacity style={[s.lojasBtn, lojasLoad && { opacity: 0.6 }]} onPress={handleLojas} disabled={lojasLoad}>
            {lojasLoad ? (
              <ActivityIndicator color={COLORS.brand} size="small" />
            ) : (
              <Text style={s.lojasBtnText}>📍 Ver Lojas Próximas</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Mapa */}
      <MapaLojas
        lojas={lojas}
        userLat={userCoords.lat}
        userLng={userCoords.lng}
        visible={showMapa}
        onClose={() => setShowMapa(false)}
      />
    </ScrollView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  hero: { marginBottom: 20 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: COLORS.text },
  heroSub: { fontSize: 14, color: COLORS.textSub, marginTop: 4 },

  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },

  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSub, textTransform: 'uppercase', marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 15, padding: 12 },

  chip: { backgroundColor: COLORS.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.brandDim, borderColor: COLORS.brand },
  chipText: { fontSize: 13, color: COLORS.textSub, fontWeight: '600' },
  chipTextActive: { color: COLORS.brand },

  usoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  usoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.border },
  usoBtnActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brandDim },
  usoEmoji: { fontSize: 16 },
  usoLabel: { fontSize: 13, color: COLORS.textSub, fontWeight: '600' },

  analyzeBtn: { backgroundColor: COLORS.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  analyzeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Resultado
  resultCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },

  scoreSection: { alignItems: 'center', marginBottom: 20 },
  scoreLabel: { fontSize: 18, fontWeight: '800', marginTop: 14 },

  mercadoBox: { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  mercadoLabel: { fontSize: 11, color: COLORS.textSub, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  mercadoPreco: { fontSize: 26, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  mercadoAv: { fontSize: 14, fontWeight: '700' },
  mercadoCom: { fontSize: 12, color: COLORS.textSub, marginTop: 4, textAlign: 'center' },

  fatoresSection: { marginBottom: 16 },
  fatoresTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textSub, textTransform: 'uppercase', marginBottom: 12 },
  fatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  fatorNome: { fontSize: 12, color: COLORS.textSub, width: 100 },
  fatorBarBg: { flex: 1, height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
  fatorBar: { height: 6, borderRadius: 3 },
  fatorVal: { fontSize: 12, fontWeight: '700', color: COLORS.text, width: 28, textAlign: 'right' },

  conselhoBox: { flexDirection: 'row', gap: 10, backgroundColor: COLORS.brandDim, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.brand + '40' },
  conselhoIcon: { fontSize: 18, color: COLORS.brand },
  conselhoText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },

  lojasBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface2, borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: COLORS.border },
  lojasBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
});
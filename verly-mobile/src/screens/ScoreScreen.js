/**
 * src/screens/ScoreScreen.js — FASE 1: Animações
 * Substituições:
 *  - ScoreCircle (estático) → ScoreGauge SVG animado com fill suave de 0→score
 *  - Botão "Analisar" → scale press + loading shimmer
 *  - Fatores → barras animadas com AnimatedBar
 *  - Resultado entra com FadeInDown stagger
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
  Dimensions, Modal, Linking,
} from 'react-native';
import * as Location from 'expo-location';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withTiming, FadeInDown, FadeIn, ZoomIn, SlideInDown,
  Easing,
} from 'react-native-reanimated';
import { MotiView } from 'moti';
import { scoreAPI } from '../services/api';
import { COLORS } from '../constants/theme';
import { getMapComponents } from '../utils/maps';
import {
  ScoreGauge, AnimatedBar, useToast, PressCard,
  AnimatedListItem, ShimmerCard,
} from '../components/UI';

const { width: W } = Dimensions.get('window');

// ── Dados ─────────────────────────────────────────────────────────────────────

const CATEGORIAS = [
  'Tecnologia', 'Alimentação', 'Vestuário', 'Casa & Decoração',
  'Saúde & Beleza', 'Desporto', 'Entretenimento', 'Transportes', 'Educação', 'Outros',
];

const USO_OPCOES = [
  { key: 'daily',   label: 'Uso diário',   emoji: '🔥' },
  { key: 'weekly',  label: 'Uso regular',  emoji: '✅' },
  { key: 'monthly', label: 'Ocasional',    emoji: '📅' },
  { key: 'rarely',  label: 'Raramente',    emoji: '😬' },
  { key: 'never',   label: 'Nunca usei',   emoji: '💸' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    barato:     { text: 'Preço abaixo do mercado 🟢', color: COLORS.green },
    justo:      { text: 'Preço de mercado 🔵',         color: COLORS.brand },
    caro:       { text: 'Acima do mercado 🟠',          color: COLORS.yellow },
    muito_caro: { text: 'Muito acima do mercado 🔴',    color: COLORS.red },
  };
  return map[av] || { text: av, color: COLORS.textSub };
}

// ── Botão animado ─────────────────────────────────────────────────────────────

function AnimatedButton({ onPress, disabled, loading, label }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onIn  = () => { scale.value = withSpring(0.96, { damping: 20, stiffness: 400 }); };
  const onOut = () => { scale.value = withSpring(1,    { damping: 18, stiffness: 300 }); };

  return (
    <Animated.View style={[animStyle, { marginTop: 20 }]}>
      <TouchableOpacity
        style={[s.analyzeBtn, disabled && { opacity: 0.6 }]}
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        disabled={disabled}
        activeOpacity={1}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.analyzeBtnText}>{label}</Text>
        }
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Mapa de lojas ─────────────────────────────────────────────────────────────

function MapaLojas({ lojas, userLat, userLng, visible, onClose }) {
  const [MapView, setMapView] = useState(null);
  const [Marker, setMarker]   = useState(null);
  const [mapReady, setMapReady] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    const maps = getMapComponents();
    setMapView(() => maps.MapView);
    setMarker(() => maps.Marker);
    setMapReady(!!maps.supported);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={m.header}>
          <TouchableOpacity onPress={onClose} style={m.closeBtn}>
            <Text style={m.closeBtnText}>‹ Fechar</Text>
          </TouchableOpacity>
          <Text style={m.headerTitle}>Lojas Próximas ({lojas.length})</Text>
          <View style={{ width: 80 }} />
        </View>

        {!mapReady ? (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={m.noMapBanner}>
              <Text style={m.noMapText}>
                📍 Mapa não disponível.{'\n'}Instala react-native-maps para ver o mapa.
              </Text>
            </View>
            {lojas.map((loja, i) => (
              <AnimatedListItem key={i} index={i}>
                <View style={m.lojaCard}>
                  <Text style={m.lojaNome}>{loja.nome}</Text>
                  <Text style={m.lojaMeta}>{loja.distancia} · {loja.endereco || ''}</Text>
                  {loja.avaliacao ? <Text style={m.lojaRating}>⭐ {loja.avaliacao}</Text> : null}
                </View>
              </AnimatedListItem>
            ))}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {React.createElement(MapView, {
              style: { flex: 1 },
              initialRegion: {
                latitude: userLat || 38.7, longitude: userLng || -9.14,
                latitudeDelta: 0.05, longitudeDelta: 0.05,
              },
            },
              userLat && React.createElement(Marker, {
                key: 'user',
                coordinate: { latitude: userLat, longitude: userLng },
                title: 'A tua localização', pinColor: COLORS.brand,
              }),
              ...lojas.map((loja, i) =>
                loja.lat && React.createElement(Marker, {
                  key: i,
                  coordinate: { latitude: loja.lat, longitude: loja.lng },
                  title: loja.nome,
                  description: `${loja.distancia}${loja.avaliacao ? ` · ⭐ ${loja.avaliacao}` : ''}`,
                })
              )
            )}
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
  lojaNome: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  lojaMeta: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  lojaRating: { fontSize: 12, color: COLORS.yellow, marginTop: 4 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface + 'EE' },
  lojaChip: { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 12, minWidth: 130, borderWidth: 1, borderColor: COLORS.border },
  lojaNomeChip: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  lojaDistChip: { fontSize: 11, color: COLORS.textSub, marginTop: 2 },
});

function MiniMapa({ lojas, userCoords, onOpen }) {
  const [MapView, setMapView] = useState(null);
  const [Marker, setMarker] = useState(null);

  useEffect(() => {
    const maps = getMapComponents();
    setMapView(() => maps.MapView);
    setMarker(() => maps.Marker);
  }, []);

  if (!lojas.length) return null;

  const hasMap = !!MapView && !!Marker && userCoords?.lat && userCoords?.lng;
  const firstStores = lojas.slice(0, 3);

  return (
    <Animated.View entering={FadeInDown.delay(90).springify()} style={s.marketCard}>
      <View style={s.marketHeader}>
        <View>
          <Text style={s.marketTitle}>Lojas próximas</Text>
          <Text style={s.marketSub}>{lojas.length} resultado{lojas.length !== 1 ? 's' : ''} perto de ti</Text>
        </View>
        <TouchableOpacity onPress={onOpen} style={s.marketGhostBtn}>
          <Text style={s.marketGhostText}>Mapa</Text>
        </TouchableOpacity>
      </View>

      {hasMap && (
        <View style={s.miniMapWrap}>
          {React.createElement(MapView, {
            style: { flex: 1 },
            pointerEvents: 'none',
            initialRegion: {
              latitude: userCoords.lat,
              longitude: userCoords.lng,
              latitudeDelta: 0.04,
              longitudeDelta: 0.04,
            },
          },
            React.createElement(Marker, {
              key: 'user',
              coordinate: { latitude: userCoords.lat, longitude: userCoords.lng },
              title: 'Tu',
              pinColor: COLORS.brand,
            }),
            ...firstStores.map((loja, index) => loja.lat && React.createElement(Marker, {
              key: `${loja.nome}-${index}`,
              coordinate: { latitude: loja.lat, longitude: loja.lng },
              title: loja.nome,
            })),
          )}
        </View>
      )}

      {firstStores.map((loja, index) => (
        <View key={`${loja.nome}-${index}`} style={s.storeRow}>
          <View style={s.storeDot} />
          <View style={{ flex: 1 }}>
            <Text style={s.storeName} numberOfLines={1}>{loja.nome}</Text>
            <Text style={s.storeMeta} numberOfLines={1}>{loja.distancia}{loja.endereco ? ` · ${loja.endereco}` : ''}</Text>
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

function PriceComparison({ precos, loading, message, precoPago }) {
  if (loading) {
    return (
      <View style={s.marketCard}>
        <ActivityIndicator color={COLORS.brand} />
        <Text style={[s.marketSub, { textAlign: 'center', marginTop: 8 }]}>A procurar preços reais...</Text>
      </View>
    );
  }

  if (!precos.length && !message) return null;

  return (
    <Animated.View entering={FadeInDown.delay(120).springify()} style={s.marketCard}>
      <View style={s.marketHeader}>
        <View>
          <Text style={s.marketTitle}>Comparação de preços</Text>
          <Text style={s.marketSub}>Outras lojas e preço mais barato encontrado</Text>
        </View>
      </View>

      {!!message && !precos.length && (
        <Text style={s.marketMessage}>{message}</Text>
      )}

      {precos.slice(0, 5).map((oferta, index) => {
        const diff = Number(precoPago || 0) - Number(oferta.preco || 0);
        return (
          <TouchableOpacity
            key={`${oferta.loja}-${oferta.preco}-${index}`}
            activeOpacity={oferta.link ? 0.78 : 1}
            onPress={() => oferta.link && Linking.openURL(oferta.link)}
            style={[s.priceRow, oferta.mais_barato && s.priceRowBest]}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.priceStore} numberOfLines={1}>{oferta.loja}</Text>
              <Text style={s.priceName} numberOfLines={1}>{oferta.nome}</Text>
              {diff > 0 && <Text style={s.priceSaving}>Pouparias {diff.toFixed(2)}€ vs preço indicado</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.priceValue, oferta.mais_barato && { color: COLORS.green }]}>
                {Number(oferta.preco || 0).toFixed(2)}€
              </Text>
              {oferta.mais_barato && <Text style={s.bestBadge}>Mais barato</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

// ── Ecrã principal ────────────────────────────────────────────────────────────

export default function ScoreScreen({ route }) {
  const [item, setItem]           = useState('');
  const [preco, setPreco]         = useState('');
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [uso, setUso]             = useState('weekly');
  const [loading, setLoading]     = useState(false);
  const [resultado, setResultado] = useState(null);

  const [lojas, setLojas]         = useState([]);
  const [lojasLoad, setLojasLoad] = useState(false);
  const [showMapa, setShowMapa]   = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [precos, setPrecos]       = useState([]);
  const [precosLoad, setPrecosLoad] = useState(false);
  const [precosMsg, setPrecosMsg] = useState('');
  const [marketError, setMarketError] = useState('');

  const scrollRef = useRef(null);
  const marketSeqRef = useRef(0);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    const prefill = route?.params?.prefill;
    if (!prefill) return;

    if (prefill.item) setItem(String(prefill.item));
    if (prefill.preco != null) setPreco(String(prefill.preco).replace('.', ','));
    if (prefill.categoria && CATEGORIAS.includes(prefill.categoria)) {
      setCategoria(prefill.categoria);
    }
  }, [route?.params?.prefill]);

  const resolveCoords = useCallback(async () => {
    if (userCoords.lat && userCoords.lng) return userCoords;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    setUserCoords(coords);
    return coords;
  }, [userCoords]);

  const loadMarketData = useCallback(async ({ openMap = false, silent = true } = {}) => {
    const cleanItem = item.trim();
    if (cleanItem.length < 3) return;

    const seq = ++marketSeqRef.current;
    setMarketError('');
    setPrecosLoad(true);
    setLojasLoad(true);

    try {
      const [priceResult, coords] = await Promise.all([
        scoreAPI.precos({ item: cleanItem, categoria }).catch(e => ({
          items: [],
          message: e.message || 'Nao foi possivel procurar precos agora.',
        })),
        resolveCoords().catch(() => null),
      ]);

      if (seq !== marketSeqRef.current) return;
      setPrecos(priceResult.items || []);
      setPrecosMsg(priceResult.message || '');

      if (!coords?.lat || !coords?.lng) {
        setLojas([]);
        setMarketError('Ativa a localizacao para veres lojas proximas.');
        return;
      }

      const lojasData = await scoreAPI.lojasProximas({
        item: cleanItem,
        categoria,
        lat: coords.lat,
        lng: coords.lng,
      });

      if (seq !== marketSeqRef.current) return;
      const nextLojas = lojasData.lojas || [];
      setLojas(nextLojas);
      if (openMap && nextLojas.length) setShowMapa(true);
    } catch (e) {
      if (seq === marketSeqRef.current) {
        setMarketError(e.message || 'Nao foi possivel carregar lojas e precos.');
        if (!silent) Alert.alert('Score de compra', e.message || 'Nao foi possivel carregar lojas e precos.');
      }
    } finally {
      if (seq === marketSeqRef.current) {
        setPrecosLoad(false);
        setLojasLoad(false);
      }
    }
  }, [categoria, item, resolveCoords]);

  useEffect(() => {
    const cleanItem = item.trim();
    if (cleanItem.length < 3) {
      setPrecos([]);
      setPrecosMsg('');
      setLojas([]);
      setMarketError('');
      return undefined;
    }
    const t = setTimeout(() => loadMarketData({ silent: true }), 850);
    return () => clearTimeout(t);
  }, [categoria, item, loadMarketData]);

  // ── Analisar ──────────────────────────────────────────────────────────────

  const handleAnalisar = async () => {
    if (!item.trim()) return Alert.alert('Atenção', 'Indica o produto.');
    const precoNum = parseFloat(preco.replace(',', '.'));
    if (isNaN(precoNum) || precoNum <= 0) return Alert.alert('Atenção', 'Indica um preço válido.');

    setLoading(true);
    setResultado(null);
    try {
      const data = await scoreAPI.analisar({ item: item.trim(), preco: precoNum, categoria, uso });
      setResultado(data);
      loadMarketData({ silent: true });
      showToast('Análise concluída!', 'success');
      setTimeout(() => scrollRef.current?.scrollTo({ y: 420, animated: true }), 400);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Lojas próximas ─────────────────────────────────────────────────────────

  const handleLojas = () => loadMarketData({ openMap: true, silent: false });

  const score = resultado?.score_final ?? resultado?.score ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ToastComponent />
      <ScrollView
        ref={scrollRef}
        style={s.root}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(400).springify()}>
          <View style={s.hero}>
            <Text style={s.heroTitle}>Valeu a Pena?</Text>
            <Text style={s.heroSub}>Avalia qualquer compra com inteligência artificial.</Text>
          </View>
        </Animated.View>

        {/* Formulário */}
        <Animated.View entering={FadeInDown.delay(80).duration(400).springify()} style={s.card}>
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

          <AnimatedButton onPress={handleAnalisar} disabled={loading} loading={loading} label="Analisar Compra" />
        </Animated.View>

        <PriceComparison
          precos={precos}
          loading={precosLoad}
          message={precosMsg}
          precoPago={parseFloat(preco.replace(',', '.'))}
        />

        <MiniMapa lojas={lojas} userCoords={userCoords} onOpen={handleLojas} />

        {!!marketError && item.trim().length >= 3 && !lojas.length && (
          <View style={s.marketHint}>
            <Text style={s.marketHintText}>{marketError}</Text>
          </View>
        )}

        {lojasLoad && item.trim().length >= 3 && !lojas.length && (
          <View style={s.marketHint}>
            <ActivityIndicator color={COLORS.brand} size="small" />
            <Text style={s.marketHintText}>A procurar lojas perto de ti...</Text>
          </View>
        )}

        {/* Loading shimmer */}
        {loading && (
          <Animated.View entering={FadeIn.duration(300)}>
            <ShimmerCard style={{ marginBottom: 16 }} />
            <ShimmerCard style={{ marginBottom: 16 }} />
          </Animated.View>
        )}

        {/* Resultado — entra com stagger */}
        {resultado && !loading && (
          <>
            {/* Score gauge animado */}
            <Animated.View entering={FadeInDown.delay(0).duration(500).springify()} style={s.resultCard}>
              <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 16 }}>
                {/* ScoreGauge SVG — substitui ScoreCircle estático */}
                <ScoreGauge score={score} size={220} strokeWidth={16} />

                <MotiView
                  from={{ opacity: 0, translateY: 12 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 500, delay: 800 }}
                >
                  <Text style={[s.scoreLabel, { color: getScoreColor(score) }]}>
                    {getScoreLabel(score)}
                  </Text>
                </MotiView>
              </View>
            </Animated.View>

            {/* Preço de mercado */}
            {resultado.avaliacao_mercado?.preco_medio && (
              <Animated.View entering={FadeInDown.delay(120).duration(400).springify()} style={s.mercadoBox}>
                <Text style={s.mercadoLabel}>Preço de mercado estimado</Text>
                <Text style={s.mercadoPreco}>{resultado.avaliacao_mercado.preco_medio.toFixed(2)}€</Text>
                <Text style={[s.mercadoAv, { color: getAvaliacaoLabel(resultado.avaliacao_mercado.avaliacao).color }]}>
                  {getAvaliacaoLabel(resultado.avaliacao_mercado.avaliacao).text}
                </Text>
                {resultado.avaliacao_mercado.comentario ? (
                  <Text style={s.mercadoCom}>{resultado.avaliacao_mercado.comentario}</Text>
                ) : null}
              </Animated.View>
            )}

            {/* Fatores — barras animadas */}
            {resultado.fatores?.length > 0 && (
              <Animated.View entering={FadeInDown.delay(200).duration(400).springify()} style={s.resultCard}>
                <Text style={s.fatoresTitle}>Análise Detalhada</Text>
                {resultado.fatores.map((f, i) => (
                  <View key={i} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={s.fatorNome}>{f.nome || f.label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: getScoreColor(f.score ?? f.valor ?? 50) }}>
                        {f.score ?? f.valor ?? 0}
                      </Text>
                    </View>
                    {/* AnimatedBar em vez da View estática */}
                    <AnimatedBar
                      pct={(f.score ?? f.valor ?? 0) / 100}
                      color={getScoreColor(f.score ?? f.valor ?? 50)}
                      height={7}
                      delay={i * 100}
                    />
                  </View>
                ))}
              </Animated.View>
            )}

            {/* Conselho */}
            {resultado.conselho && (
              <Animated.View entering={FadeInDown.delay(300).duration(400).springify()} style={s.conselhoBox}>
                <Text style={s.conselhoIcon}>✦</Text>
                <Text style={s.conselhoText}>{resultado.conselho}</Text>
              </Animated.View>
            )}

            {/* Lojas */}
            <Animated.View entering={FadeInDown.delay(380).duration(400).springify()}>
              <TouchableOpacity style={[s.lojasBtn, lojasLoad && { opacity: 0.6 }]} onPress={handleLojas} disabled={lojasLoad}>
                {lojasLoad
                  ? <ActivityIndicator color={COLORS.brand} size="small" />
                  : <Text style={s.lojasBtnText}>{lojas.length ? 'Abrir mapa completo' : 'Atualizar lojas e precos'}</Text>
                }
              </TouchableOpacity>
            </Animated.View>
          </>
        )}

        <MapaLojas lojas={lojas} userLat={userCoords.lat} userLng={userCoords.lng} visible={showMapa} onClose={() => setShowMapa(false)} />
      </ScrollView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  hero: { marginBottom: 20 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: COLORS.text },
  heroSub: { fontSize: 14, color: COLORS.textSub, marginTop: 4 },

  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  resultCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },

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

  analyzeBtn: { backgroundColor: COLORS.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  analyzeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  scoreLabel: { fontSize: 18, fontWeight: '800', marginTop: 8 },

  mercadoBox: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  mercadoLabel: { fontSize: 11, color: COLORS.textSub, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  mercadoPreco: { fontSize: 26, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  mercadoAv: { fontSize: 14, fontWeight: '700' },
  mercadoCom: { fontSize: 12, color: COLORS.textSub, marginTop: 4, textAlign: 'center' },

  fatoresTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textSub, textTransform: 'uppercase', marginBottom: 16 },
  fatorNome: { fontSize: 13, color: COLORS.textMid, fontWeight: '600' },

  conselhoBox: { flexDirection: 'row', gap: 10, backgroundColor: COLORS.brandDim, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.brand + '40' },
  conselhoIcon: { fontSize: 18, color: COLORS.brand },
  conselhoText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },

  lojasBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  lojasBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },

  marketCard: {
    backgroundColor: COLORS.glass || COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderHi || COLORS.border,
  },
  marketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  marketTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  marketSub: { color: COLORS.textMid || COLORS.textSub, fontSize: 12, marginTop: 3 },
  marketGhostBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.brand + '55',
    backgroundColor: COLORS.brandDim,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  marketGhostText: { color: COLORS.brandMid || COLORS.brand, fontSize: 12, fontWeight: '900' },
  marketMessage: { color: COLORS.textMid || COLORS.textSub, fontSize: 13, lineHeight: 19 },
  miniMapWrap: {
    height: 138,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    backgroundColor: COLORS.surface2,
  },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: COLORS.border },
  storeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.cyan },
  storeName: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  storeMeta: { color: COLORS.textSub, fontSize: 11, marginTop: 2 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  priceRowBest: {
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: COLORS.greenDim,
  },
  priceStore: { color: COLORS.text, fontSize: 13, fontWeight: '900' },
  priceName: { color: COLORS.textMid || COLORS.textSub, fontSize: 11, marginTop: 3 },
  priceSaving: { color: COLORS.green, fontSize: 11, fontWeight: '800', marginTop: 5 },
  priceValue: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  bestBadge: { color: COLORS.green, fontSize: 10, fontWeight: '900', marginTop: 3 },
  marketHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  marketHintText: { flex: 1, color: COLORS.textMid || COLORS.textSub, fontSize: 12, lineHeight: 17 },
});

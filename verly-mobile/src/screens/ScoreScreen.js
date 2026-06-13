import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MapPin, Navigation, Search, ShoppingBag, Sparkles } from 'lucide-react-native';

import { scoreAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SPACE, SHADOWS } from '../constants/theme';
import { getMapComponents } from '../utils/maps';
import { AnimatedBar, ScoreGauge, ShimmerCard, useToast } from '../components/UI';

const { width: W } = Dimensions.get('window');
const C = COLORS;

const CATEGORIAS = [
  'Tecnologia',
  'Alimentacao',
  'Vestuario',
  'Casa',
  'Saude',
  'Desporto',
  'Entretenimento',
  'Transportes',
  'Educacao',
  'Outros',
];

const USO_OPCOES = [
  { key: 'daily', label: 'Diario', sub: 'uso constante' },
  { key: 'weekly', label: 'Regular', sub: 'varias vezes' },
  { key: 'monthly', label: 'Ocasional', sub: 'as vezes' },
  { key: 'rarely', label: 'Raro', sub: 'pouco uso' },
  { key: 'never', label: 'Impulso', sub: 'nao planeado' },
];

const normalizeStoreName = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const money = (value) => `${Number(value || 0).toFixed(2)} EUR`;

function getScoreColor(score) {
  if (score >= 75) return C.green;
  if (score >= 50) return C.yellow;
  if (score >= 25) return C.orange;
  return C.red;
}

function getScoreLabel(score) {
  if (score >= 75) return 'Boa compra';
  if (score >= 50) return 'Compra aceitavel';
  if (score >= 25) return 'Pensa duas vezes';
  return 'Compra fraca';
}

function marketLabel(av) {
  const map = {
    barato: { text: 'Abaixo do mercado', color: C.green },
    justo: { text: 'Preco justo', color: C.brandMid || C.brand },
    caro: { text: 'Acima do mercado', color: C.yellow },
    muito_caro: { text: 'Muito caro', color: C.red },
  };
  return map[av] || { text: av || 'Sem avaliacao', color: C.textMid };
}

function findOfferForStore(loja, precos = []) {
  const store = normalizeStoreName(loja?.nome || loja?.name);
  if (!store) return null;
  return precos.find((oferta) => {
    const source = normalizeStoreName(oferta.loja || oferta.source || oferta.merchant);
    return source && (store.includes(source) || source.includes(store));
  }) || null;
}

function attachOffersToStores(lojas = [], precos = []) {
  return lojas.map((loja) => ({
    ...loja,
    oferta: loja.oferta || findOfferForStore(loja, precos),
  }));
}

function offerLabel(oferta) {
  if (!oferta?.preco) return null;
  return money(oferta.preco);
}

function AnimatedButton({ onPress, disabled, loading, label }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onIn = () => { scale.value = withSpring(0.97, { damping: 20, stiffness: 380 }); };
  const onOut = () => { scale.value = withSpring(1, { damping: 18, stiffness: 300 }); };

  return (
    <Animated.View style={[animStyle, { marginTop: SPACE.lg }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        disabled={disabled}
        activeOpacity={1}
        style={[s.primaryBtn, disabled && { opacity: 0.65 }]}
      >
        <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.primaryGradient}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{label}</Text>}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

function StoreMarker({ loja }) {
  return (
    <View style={mapStyles.markerBubble}>
      {!!loja.oferta && <Text style={mapStyles.markerPrice}>{offerLabel(loja.oferta)}</Text>}
      <Text style={mapStyles.markerName} numberOfLines={1}>{loja.nome}</Text>
    </View>
  );
}

function MapaLojas({ lojas, userLat, userLng, visible, onClose }) {
  const [MapView, setMapView] = useState(null);
  const [Marker, setMarker] = useState(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const maps = getMapComponents();
    setMapView(() => maps.MapView);
    setMarker(() => maps.Marker);
    setSupported(!!maps.supported);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={mapStyles.root}>
        <View style={mapStyles.header}>
          <TouchableOpacity onPress={onClose} style={mapStyles.closeBtn}>
            <Text style={mapStyles.closeText}>Fechar</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={mapStyles.title}>Lojas proximas</Text>
            <Text style={mapStyles.subtitle}>{lojas.length} resultado{lojas.length === 1 ? '' : 's'}</Text>
          </View>
          <View style={{ width: 70 }} />
        </View>

        {!supported ? (
          <ScrollView contentContainerStyle={mapStyles.listFallback}>
            {lojas.map((loja, index) => (
              <View key={`${loja.place_id || loja.id || loja.nome}-${index}`} style={mapStyles.storeCard}>
                <View style={{ flex: 1 }}>
                  <Text style={mapStyles.storeTitle}>{loja.nome}</Text>
                  <Text style={mapStyles.storeMeta} numberOfLines={1}>
                    {[loja.distancia, loja.endereco].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {!!loja.oferta && <Text style={mapStyles.storePrice}>{offerLabel(loja.oferta)}</Text>}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {React.createElement(MapView, {
              style: { flex: 1 },
              initialRegion: {
                latitude: userLat || 38.7223,
                longitude: userLng || -9.1393,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              },
            },
              userLat && React.createElement(Marker, {
                key: 'user',
                coordinate: { latitude: userLat, longitude: userLng },
                title: 'Tu',
                pinColor: C.brand,
              }),
              ...lojas.map((loja, index) => loja.lat && React.createElement(Marker, {
                key: `${loja.place_id || loja.id || loja.nome}-${index}`,
                coordinate: { latitude: loja.lat, longitude: loja.lng },
                title: loja.nome,
                description: [offerLabel(loja.oferta), loja.distancia, loja.avaliacao ? `Nota ${loja.avaliacao}` : null].filter(Boolean).join(' · '),
              }, <StoreMarker loja={loja} />)),
            )}

            <View style={mapStyles.overlay}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mapStyles.overlayContent}>
                {lojas.map((loja, index) => (
                  <View key={`${loja.place_id || loja.id || loja.nome}-chip-${index}`} style={mapStyles.storeChip}>
                    <Text style={mapStyles.storeTitle} numberOfLines={1}>{loja.nome}</Text>
                    <Text style={mapStyles.storeMeta} numberOfLines={1}>
                      {[offerLabel(loja.oferta), loja.distancia].filter(Boolean).join(' · ')}
                    </Text>
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

function MiniMapa({ lojas, userCoords, onOpen }) {
  const [MapView, setMapView] = useState(null);
  const [Marker, setMarker] = useState(null);

  useEffect(() => {
    const maps = getMapComponents();
    setMapView(() => maps.MapView);
    setMarker(() => maps.Marker);
  }, []);

  if (!userCoords?.lat || !userCoords?.lng) return null;

  const hasMap = !!MapView && !!Marker && userCoords?.lat && userCoords?.lng;
  const firstStores = lojas.slice(0, 4);

  return (
    <Animated.View entering={FadeInDown.delay(80).springify()} style={s.marketCard}>
      <View style={s.sectionTop}>
        <View style={s.sectionTitleWrap}>
          <MapPin size={16} color={C.cyan} />
          <View>
            <Text style={s.sectionTitle}>Mapa de lojas</Text>
            <Text style={s.sectionSub}>
              {lojas.length ? 'Precos encontrados junto das lojas proximas' : 'Localizacao ativa - procura lojas para este produto'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onOpen} style={s.ghostBtn}>
          <Navigation size={13} color={C.brandMid || C.brand} />
          <Text style={s.ghostText}>Abrir</Text>
        </TouchableOpacity>
      </View>

      {hasMap && (
        <View style={s.miniMap}>
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
              pinColor: C.brand,
            }),
            ...firstStores.map((loja, index) => loja.lat && React.createElement(Marker, {
              key: `${loja.place_id || loja.id || loja.nome}-${index}`,
              coordinate: { latitude: loja.lat, longitude: loja.lng },
              title: loja.nome,
              description: [offerLabel(loja.oferta), loja.distancia].filter(Boolean).join(' · '),
            }, <StoreMarker loja={loja} />)),
          )}
        </View>
      )}

      {firstStores.length ? firstStores.map((loja, index) => (
        <View key={`${loja.place_id || loja.id || loja.nome}-row-${index}`} style={s.storeRow}>
          <View style={s.storeIcon}><ShoppingBag size={14} color={C.cyan} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.storeName} numberOfLines={1}>{loja.nome}</Text>
            <Text style={s.storeMeta} numberOfLines={1}>{[loja.distancia, loja.endereco].filter(Boolean).join(' · ')}</Text>
          </View>
          {!!loja.oferta && <Text style={s.storePrice}>{offerLabel(loja.oferta)}</Text>}
        </View>
      )) : (
        <Text style={s.marketMessage}>Ainda nao ha lojas para mostrar. Toca em Abrir para procurar outra vez.</Text>
      )}
    </Animated.View>
  );
}

function PriceComparison({ precos, loading, message, precoPago }) {
  if (loading) {
    return (
      <View style={s.marketCard}>
        <ActivityIndicator color={C.brand} />
        <Text style={[s.sectionSub, { textAlign: 'center', marginTop: 8 }]}>A procurar precos reais...</Text>
      </View>
    );
  }

  if (!precos.length && !message) return null;

  return (
    <Animated.View entering={FadeInDown.delay(110).springify()} style={s.marketCard}>
      <View style={s.sectionTop}>
        <View style={s.sectionTitleWrap}>
          <Search size={16} color={C.brandMid || C.brand} />
          <View>
            <Text style={s.sectionTitle}>Comparacao de precos</Text>
            <Text style={s.sectionSub}>Usada tambem no mapa das lojas</Text>
          </View>
        </View>
      </View>

      {!!message && !precos.length && <Text style={s.marketMessage}>{message}</Text>}

      {precos.slice(0, 5).map((oferta, index) => {
        const diff = Number(precoPago || 0) - Number(oferta.preco || 0);
        return (
          <TouchableOpacity
            key={`${oferta.loja || 'loja'}-${oferta.preco || 0}-${index}`}
            activeOpacity={oferta.link ? 0.78 : 1}
            onPress={() => oferta.link && Linking.openURL(oferta.link)}
            style={[s.priceRow, oferta.mais_barato && s.priceBest]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.priceStore} numberOfLines={1}>{oferta.loja || 'Loja'}</Text>
              <Text style={s.priceName} numberOfLines={1}>{oferta.nome || 'Oferta encontrada'}</Text>
              {diff > 0 && <Text style={s.priceSaving}>Poupavas {money(diff)}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.priceValue, oferta.mais_barato && { color: C.green }]}>{money(oferta.preco)}</Text>
              {oferta.mais_barato && <Text style={s.bestBadge}>melhor</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

function LocationHint({ message, permission, onEnable, loading }) {
  if (!message) return null;
  return (
    <View style={s.locationHint}>
      <View style={s.locationIcon}>
        <MapPin size={18} color={C.brandMid || C.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.locationTitle}>Mapa e localizacao</Text>
        <Text style={s.locationText}>{message}</Text>
      </View>
      <TouchableOpacity onPress={onEnable} disabled={loading} style={[s.locationBtn, loading && { opacity: 0.65 }]}>
        <Text style={s.locationBtnText}>
          {loading ? 'A ativar...' : permission?.canAskAgain === false ? 'Definicoes' : 'Ativar'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ScoreScreen({ route }) {
  const [item, setItem] = useState('');
  const [preco, setPreco] = useState('');
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [uso, setUso] = useState('weekly');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [lojas, setLojas] = useState([]);
  const [lojasLoad, setLojasLoad] = useState(false);
  const [showMapa, setShowMapa] = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [precos, setPrecos] = useState([]);
  const [precosLoad, setPrecosLoad] = useState(false);
  const [precosMsg, setPrecosMsg] = useState('');
  const [marketError, setMarketError] = useState('');
  const [locationPermission, setLocationPermission] = useState({ status: null, canAskAgain: true });
  const [locationLoading, setLocationLoading] = useState(false);

  const scrollRef = useRef(null);
  const marketSeqRef = useRef(0);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    const prefill = route?.params?.prefill;
    if (!prefill) return;
    if (prefill.item) setItem(String(prefill.item));
    if (prefill.preco != null) setPreco(String(prefill.preco).replace('.', ','));
    if (prefill.categoria) {
      const match = CATEGORIAS.find(c => normalizeStoreName(c) === normalizeStoreName(prefill.categoria));
      if (match) setCategoria(match);
    }
  }, [route?.params?.prefill]);

  const resolveCoords = useCallback(async ({ force = false } = {}) => {
    if (userCoords.lat && userCoords.lng) return userCoords;
    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!servicesEnabled) {
      setLocationPermission(prev => ({ ...prev, status: 'services_off' }));
      return null;
    }
    const current = await Location.getForegroundPermissionsAsync();
    let permission = current;
    if (force || current.status !== 'granted') {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    setLocationPermission({ status: permission.status, canAskAgain: permission.canAskAgain });
    if (permission.status !== 'granted') return null;
    let loc = null;
    try {
      loc = await Location.getLastKnownPositionAsync();
      if (!loc?.coords) {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
    } catch (_) {
      loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }).catch(() => null);
    }
    if (!loc?.coords) return null;
    const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    setUserCoords(coords);
    return coords;
  }, [userCoords]);

  const loadMarketData = useCallback(async ({ openMap = false, silent = true, coordsOverride = null, forceLocation = false } = {}) => {
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
        coordsOverride || resolveCoords({ force: forceLocation }).catch(() => null),
      ]);

      if (seq !== marketSeqRef.current) return;
      const nextPrecos = priceResult.items || [];
      setPrecos(nextPrecos);
      setPrecosMsg(priceResult.message || '');

      if (!coords?.lat || !coords?.lng) {
        setLojas([]);
        setMarketError('Ativa a localizacao para veres lojas proximas e precos no mapa.');
        return;
      }

      const lojasData = await scoreAPI.lojasProximas({
        item: cleanItem,
        categoria,
        lat: coords.lat,
        lng: coords.lng,
      });

      if (seq !== marketSeqRef.current) return;
      const nextLojas = attachOffersToStores(lojasData.lojas || [], nextPrecos);
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

  const handleEnableLocation = useCallback(async () => {
    setLocationLoading(true);
    if (locationPermission.canAskAgain === false && Linking.openSettings) {
      await Linking.openSettings();
      setLocationLoading(false);
      return;
    }
    try {
      const coords = await resolveCoords({ force: true }).catch(() => null);
      if (coords?.lat && coords?.lng) {
        setMarketError('');
        showToast('Localizacao ativa', 'success');
        if (item.trim().length >= 3) {
          await loadMarketData({ silent: false, coordsOverride: coords });
        } else {
          Alert.alert('Localizacao ativa', 'Agora escreve um produto para veres lojas proximas.');
        }
      } else {
        setMarketError('Nao conseguimos obter a localizacao. Confirma permissoes e GPS do dispositivo.');
      }
    } finally {
      setLocationLoading(false);
    }
  }, [item, loadMarketData, locationPermission.canAskAgain, resolveCoords, showToast]);

  useEffect(() => {
    const cleanItem = item.trim();
    if (cleanItem.length < 3) {
      setPrecos([]);
      setPrecosMsg('');
      setLojas([]);
      setMarketError('');
      return undefined;
    }
    const timer = setTimeout(() => loadMarketData({ silent: true }), 800);
    return () => clearTimeout(timer);
  }, [categoria, item, loadMarketData]);

  const handleAnalisar = async () => {
    if (!item.trim()) return Alert.alert('Atencao', 'Indica o produto.');
    const precoNum = parseFloat(String(preco).replace(',', '.'));
    if (Number.isNaN(precoNum) || precoNum <= 0) return Alert.alert('Atencao', 'Indica um preco valido.');

    setLoading(true);
    setResultado(null);
    try {
      const data = await scoreAPI.analisar({ item: item.trim(), preco: precoNum, categoria, uso });
      setResultado(data);
      loadMarketData({ silent: true });
      showToast('Analise concluida', 'success');
      setTimeout(() => scrollRef.current?.scrollTo({ y: 420, animated: true }), 350);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLojas = () => loadMarketData({ openMap: true, silent: false, forceLocation: true });
  const score = resultado?.score_final ?? resultado?.score ?? 0;
  const precoPago = parseFloat(String(preco).replace(',', '.'));

  return (
    <View style={s.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={s.decorOne} />
      <View style={s.decorTwo} />
      <ToastComponent />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(420).springify()} style={s.hero}>
          <View style={s.heroIcon}>
            <Sparkles size={18} color={C.brandMid || C.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroKicker}>SCORE DE COMPRA</Text>
            <Text style={s.heroTitle}>Compra com contexto.</Text>
            <Text style={s.heroSub}>Score financeiro, lojas proximas e comparacao de preco no mesmo fluxo.</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).springify()} style={s.card}>
          <Text style={s.label}>Produto ou servico</Text>
          <TextInput
            style={s.input}
            value={item}
            onChangeText={setItem}
            placeholder="Ex: AirPods, tenis Nike, cafe..."
            placeholderTextColor={C.textSub}
          />

          <Text style={s.label}>Preco pago</Text>
          <TextInput
            style={[s.input, s.moneyInput]}
            value={preco}
            onChangeText={setPreco}
            placeholder="0,00"
            placeholderTextColor={C.textSub}
            keyboardType="decimal-pad"
          />

          <Text style={s.label}>Categoria</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRail}>
            {CATEGORIAS.map(categoriaItem => (
              <TouchableOpacity
                key={categoriaItem}
                style={[s.chip, categoria === categoriaItem && s.chipActive]}
                onPress={() => setCategoria(categoriaItem)}
              >
                <Text style={[s.chipText, categoria === categoriaItem && s.chipTextActive]}>{categoriaItem}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={s.label}>Frequencia de uso</Text>
          <View style={s.usoGrid}>
            {USO_OPCOES.map(opcao => (
              <TouchableOpacity
                key={opcao.key}
                style={[s.usoBtn, uso === opcao.key && s.usoActive]}
                onPress={() => setUso(opcao.key)}
              >
                <Text style={[s.usoTitle, uso === opcao.key && { color: C.text }]}>{opcao.label}</Text>
                <Text style={s.usoSub}>{opcao.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <AnimatedButton onPress={handleAnalisar} disabled={loading} loading={loading} label="Analisar compra" />
        </Animated.View>

        <PriceComparison precos={precos} loading={precosLoad} message={precosMsg} precoPago={precoPago} />
        <MiniMapa lojas={lojas} userCoords={userCoords} onOpen={handleLojas} />
        {!!marketError && item.trim().length >= 3 && !lojas.length && (
          <LocationHint message={marketError} permission={locationPermission} onEnable={handleEnableLocation} loading={locationLoading} />
        )}

        {lojasLoad && item.trim().length >= 3 && !lojas.length && (
          <View style={s.loadingLine}>
            <ActivityIndicator color={C.brand} size="small" />
            <Text style={s.loadingLineText}>A procurar lojas perto de ti...</Text>
          </View>
        )}

        {loading && (
          <Animated.View entering={FadeIn.duration(300)}>
            <ShimmerCard style={{ marginBottom: 14 }} />
            <ShimmerCard style={{ marginBottom: 14 }} />
          </Animated.View>
        )}

        {resultado && !loading && (
          <>
            <Animated.View entering={FadeInDown.duration(500).springify()} style={s.resultCard}>
              <ScoreGauge score={score} size={210} strokeWidth={15} />
              <Text style={[s.scoreLabel, { color: getScoreColor(score) }]}>{getScoreLabel(score)}</Text>
              <Text style={s.scoreSub}>Score {Math.round(score)}/100 calculado com o preco, uso e contexto financeiro.</Text>
            </Animated.View>

            {resultado.avaliacao_mercado?.preco_medio && (
              <Animated.View entering={FadeInDown.delay(80).springify()} style={s.marketInsight}>
                <Text style={s.label}>Preco de mercado estimado</Text>
                <Text style={s.marketPrice}>{money(resultado.avaliacao_mercado.preco_medio)}</Text>
                <Text style={[s.marketStatus, { color: marketLabel(resultado.avaliacao_mercado.avaliacao).color }]}>
                  {marketLabel(resultado.avaliacao_mercado.avaliacao).text}
                </Text>
                {!!resultado.avaliacao_mercado.comentario && (
                  <Text style={s.marketComment}>{resultado.avaliacao_mercado.comentario}</Text>
                )}
              </Animated.View>
            )}

            {resultado.fatores?.length > 0 && (
              <Animated.View entering={FadeInDown.delay(130).springify()} style={s.card}>
                <Text style={s.blockTitle}>Fatores do score</Text>
                {resultado.fatores.map((fator, index) => {
                  const value = fator.score ?? fator.valor ?? 0;
                  return (
                    <View key={`${fator.nome || fator.label || 'fator'}-${index}`} style={s.factorRow}>
                      <View style={s.factorTop}>
                        <Text style={s.factorName}>{fator.nome || fator.label}</Text>
                        <Text style={[s.factorValue, { color: getScoreColor(value) }]}>{Math.round(value)}</Text>
                      </View>
                      <AnimatedBar pct={value / 100} color={getScoreColor(value)} height={7} delay={index * 80} />
                    </View>
                  );
                })}
              </Animated.View>
            )}

            {!!resultado.conselho && (
              <Animated.View entering={FadeInDown.delay(170).springify()} style={s.adviceCard}>
                <Text style={s.adviceTitle}>Proximo passo</Text>
                <Text style={s.adviceText}>{resultado.conselho}</Text>
              </Animated.View>
            )}

            <TouchableOpacity style={s.secondaryBtn} onPress={handleLojas} disabled={lojasLoad}>
              {lojasLoad ? <ActivityIndicator color={C.brand} size="small" /> : <Text style={s.secondaryText}>{lojas.length ? 'Abrir mapa completo' : 'Atualizar lojas e precos'}</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <MapaLojas lojas={lojas} userLat={userCoords.lat} userLng={userCoords.lng} visible={showMapa} onClose={() => setShowMapa(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: SPACE.lg, paddingBottom: 56 },
  decorOne: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 58,
    right: -96,
    top: 72,
    backgroundColor: 'rgba(139,92,246,0.12)',
    transform: [{ rotate: '18deg' }],
  },
  decorTwo: {
    position: 'absolute',
    width: 126,
    height: 86,
    borderRadius: 26,
    left: -44,
    top: 230,
    backgroundColor: 'rgba(34,212,253,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '-12deg' }],
  },
  hero: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    ...SHADOWS.card,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: C.brandDim,
    borderWidth: 1,
    borderColor: C.brand + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroKicker: { color: C.brandMid || C.brand, fontSize: FONT.xs, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: C.text, fontSize: 25, fontWeight: '900', marginTop: 4 },
  heroSub: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, marginTop: 5 },
  card: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    ...SHADOWS.card,
  },
  label: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  input: {
    backgroundColor: C.surface2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: FONT.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
  },
  moneyInput: { fontSize: 24, fontWeight: '900' },
  chipRail: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.brandDim, borderColor: C.brand + '66' },
  chipText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
  chipTextActive: { color: C.brandMid || C.brand },
  usoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  usoBtn: {
    width: (W - SPACE.lg * 2 - SPACE.lg * 2 - 8) / 2,
    backgroundColor: C.glass,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 11,
  },
  usoActive: { backgroundColor: C.brandDim, borderColor: C.brand + '66' },
  usoTitle: { color: C.textMid, fontSize: FONT.sm, fontWeight: '900' },
  usoSub: { color: C.textSub, fontSize: 10, marginTop: 2 },
  primaryBtn: { borderRadius: RADIUS.pill, overflow: 'hidden', ...SHADOWS.brandGlow },
  primaryGradient: { minHeight: 52, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: FONT.md, fontWeight: '900' },
  marketCard: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: C.borderHi,
  },
  sectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  sectionSub: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.brand + '55',
    backgroundColor: C.brandDim,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostText: { color: C.brandMid || C.brand, fontSize: FONT.xs, fontWeight: '900' },
  marketMessage: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border },
  priceBest: { marginHorizontal: -8, paddingHorizontal: 8, borderRadius: RADIUS.md, backgroundColor: C.greenDim },
  priceStore: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  priceName: { color: C.textMid, fontSize: FONT.xs, marginTop: 3 },
  priceSaving: { color: C.green, fontSize: FONT.xs, fontWeight: '900', marginTop: 5 },
  priceValue: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  bestBadge: { color: C.green, fontSize: 10, fontWeight: '900', marginTop: 3 },
  miniMap: {
    height: 154,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
    backgroundColor: C.surface2,
  },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  storeIcon: { width: 30, height: 30, borderRadius: 11, backgroundColor: 'rgba(34,212,253,0.10)', alignItems: 'center', justifyContent: 'center' },
  storeName: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  storeMeta: { color: C.textSub, fontSize: FONT.xs, marginTop: 2 },
  storePrice: { color: C.green, fontSize: FONT.sm, fontWeight: '900' },
  locationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.borderHi,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  locationIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  locationTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  locationText: { color: C.textMid, fontSize: FONT.xs, lineHeight: 16, marginTop: 2 },
  locationBtn: {
    borderRadius: RADIUS.pill,
    backgroundColor: C.brandDim,
    borderWidth: 1,
    borderColor: C.brand + '55',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  locationBtnText: { color: C.brandMid || C.brand, fontSize: FONT.xs, fontWeight: '900' },
  loadingLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: C.glass,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  loadingLineText: { color: C.textMid, fontSize: FONT.xs },
  resultCard: {
    alignItems: 'center',
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    ...SHADOWS.card,
  },
  scoreLabel: { fontSize: FONT.xl, fontWeight: '900', marginTop: 8 },
  scoreSub: { color: C.textMid, fontSize: FONT.sm, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  marketInsight: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
  },
  marketPrice: { color: C.text, fontSize: 30, fontWeight: '900' },
  marketStatus: { fontSize: FONT.sm, fontWeight: '900', marginTop: 4 },
  marketComment: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, marginTop: 7 },
  blockTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900', marginBottom: SPACE.md },
  factorRow: { marginBottom: 14 },
  factorTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  factorName: { color: C.textMid, fontSize: FONT.sm, fontWeight: '800' },
  factorValue: { fontSize: FONT.sm, fontWeight: '900' },
  adviceCard: {
    backgroundColor: C.brandDim,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.brand + '40',
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  adviceTitle: { color: C.brandMid || C.brand, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase', marginBottom: 6 },
  adviceText: { color: C.text, fontSize: FONT.sm, lineHeight: 20 },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.borderHi,
    backgroundColor: C.glass,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  secondaryText: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
});

const mapStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  closeBtn: { width: 70 },
  closeText: { color: C.brandMid || C.brand, fontSize: FONT.sm, fontWeight: '900' },
  title: { color: C.text, fontSize: FONT.lg, fontWeight: '900' },
  subtitle: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  listFallback: { padding: SPACE.lg },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.glass,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
  },
  storeTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  storeMeta: { color: C.textMid, fontSize: FONT.xs, marginTop: 3 },
  storePrice: { color: C.green, fontSize: FONT.sm, fontWeight: '900' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,8,18,0.82)' },
  overlayContent: { padding: 12, gap: 10 },
  storeChip: {
    width: 148,
    backgroundColor: 'rgba(13,18,32,0.92)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: 12,
  },
  markerBubble: {
    minWidth: 78,
    maxWidth: 124,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(5,8,18,0.92)',
    borderWidth: 1,
    borderColor: C.borderHi,
    alignItems: 'center',
  },
  markerPrice: { color: C.green, fontSize: 11, fontWeight: '900' },
  markerName: { color: C.text, fontSize: 9, fontWeight: '800', marginTop: 1 },
});

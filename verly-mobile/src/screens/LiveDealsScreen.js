import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LocateFixed,
  MapPin,
  RefreshCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
} from 'lucide-react-native';

import { liveDealsAPI, perfilAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { formatMoney } from '../utils/money';
import { getMapComponents } from '../utils/maps';

const C = COLORS;

const CATEGORIES = ['Tecnologia', 'Alimentacao', 'Vestuario', 'Casa', 'Saude', 'Desporto', 'Outros'];
const URGENCIES = [
  { key: 'today', label: 'Hoje' },
  { key: 'soon', label: 'Semana' },
  { key: 'flexible', label: 'Esperar' },
];

function parseAmount(value) {
  const clean = String(value || '').replace(',', '.').trim();
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function SectionTitle({ icon, title, action, onAction }) {
  return (
    <View style={styles.sectionTop}>
      <View style={styles.sectionTitleWrap}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function OptionRow({ option }) {
  const color = option.type === 'nearby' ? C.cyan : option.type === 'coupon' ? C.yellow : C.brandMid;
  return (
    <Pressable
      onPress={() => option.link && Linking.openURL(option.link)}
      disabled={!option.link}
      style={styles.optionRow}
    >
      <View style={[styles.optionIcon, { backgroundColor: `${color}18` }]}>
        {option.thumbnail ? (
          <Image source={{ uri: option.thumbnail }} style={styles.optionImage} />
        ) : option.type === 'nearby' ? (
          <MapPin size={15} color={color} />
        ) : (
          <ShoppingBag size={15} color={color} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.optionMerchant} numberOfLines={1}>{option.merchant}</Text>
        <Text style={styles.optionMeta} numberOfLines={1}>
          {[
            option.type === 'nearby'
              ? option.distance_label
              : option.type === 'coupon'
                ? 'cupao/desconto'
                : `entrega ${option.delivery_label}`,
            option.estimated_price ? 'estimado' : option.price_confidence === 'high' ? 'preco real' : null,
            option.promotion_label || (option.coupon_signal ? 'cupao' : null),
          ].filter(Boolean).join(' - ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.optionPrice}>
          {option.price == null ? 'confirmar' : formatMoney(option.price, option.currency)}
        </Text>
        {!!option.link && <ExternalLink size={13} color={C.textMid} />}
      </View>
    </Pressable>
  );
}

function PromotionsBlock({ promotions = [] }) {
  if (!promotions.length) return null;
  return (
    <View style={styles.subPanel}>
      <SectionTitle icon={<Sparkles size={16} color={C.yellow} />} title="Descontos e cupoes agora" />
      {promotions.slice(0, 5).map((promo, index) => (
        <OptionRow key={`${promo.type || 'promo'}-${promo.merchant}-${index}`} option={promo} />
      ))}
    </View>
  );
}

function LiveDealsMap({ options = [] }) {
  const nearby = options.filter(item => item.type === 'nearby' && item.lat && item.lng).slice(0, 8);
  const [MapView, setMapView] = useState(null);
  const [Marker, setMarker] = useState(null);

  React.useEffect(() => {
    const maps = getMapComponents();
    if (maps.supported) {
      setMapView(() => maps.MapView);
      setMarker(() => maps.Marker);
    }
  }, []);

  if (!nearby.length) return null;

  const center = nearby[0];
  const hasMap = !!MapView && !!Marker;

  return (
    <View style={styles.subPanel}>
      <SectionTitle icon={<MapPin size={16} color={C.cyan} />} title="Lojas perto de ti" />
      {hasMap && (
        <View style={styles.dealsMap}>
          {React.createElement(MapView, {
            style: { flex: 1 },
            initialRegion: {
              latitude: center.lat,
              longitude: center.lng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            },
          },
            ...nearby.map((store, index) => React.createElement(Marker, {
              key: `${store.merchant}-${index}`,
              coordinate: { latitude: store.lat, longitude: store.lng },
              title: store.merchant,
              description: [
                store.price == null ? 'preco a confirmar' : formatMoney(store.price, store.currency),
                store.distance_label,
                store.open_now === true ? 'aberta' : store.open_now === false ? 'fechada' : null,
              ].filter(Boolean).join(' - '),
            })),
          )}
        </View>
      )}
      {nearby.map((store, index) => (
        <OptionRow key={`${store.merchant}-nearby-${index}`} option={store} />
      ))}
    </View>
  );
}

function ResultBlock({ result, onSave }) {
  if (!result) return null;
  const best = result?.decision?.best;
  const bestToday = result?.decision?.best_today;
  return (
    <Animated.View entering={FadeInDown.delay(60)} style={styles.panel}>
      <View style={styles.decisionTop}>
        <View style={styles.decisionIcon}><Sparkles size={18} color={C.green} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.decisionTitle}>{result.decision?.headline}</Text>
          <Text style={styles.decisionText}>{result.decision?.summary}</Text>
        </View>
      </View>

      {!!best && (
        <View style={styles.bestBox}>
          <Text style={styles.kicker}>Decisao</Text>
          <Text style={styles.bestMerchant}>{best.merchant}</Text>
          <Text style={styles.bestPrice}>
            {best.price == null ? 'preco por confirmar' : formatMoney(best.price, best.currency)}
          </Text>
          <View style={styles.reasonWrap}>
            {(best.reasons || []).map((reason) => (
              <Text key={reason} style={styles.reason}>{reason}</Text>
            ))}
          </View>
        </View>
      )}

      {!!bestToday && bestToday?.merchant !== best?.merchant && (
        <View style={styles.todayBox}>
          <Clock3 size={15} color={C.yellow} />
          <Text style={styles.todayText}>
            Se for para hoje: {bestToday.merchant} - {bestToday.price == null ? 'preco a confirmar' : formatMoney(bestToday.price, bestToday.currency)}
          </Text>
        </View>
      )}

      <SectionTitle icon={<Search size={16} color={C.brandMid} />} title="Opcoes encontradas" />
      {(result.options || []).slice(0, 6).map((option, index) => (
        <OptionRow key={`${option.type}-${option.merchant}-${index}`} option={option} />
      ))}

      <PromotionsBlock promotions={result.promotions || []} />
      <LiveDealsMap options={result.nearby_options || result.options || []} />

      <Pressable onPress={onSave} style={styles.saveBtn}>
        <Bell size={15} color="#fff" />
        <Text style={styles.saveText}>Seguir este produto</Text>
      </Pressable>
    </Animated.View>
  );
}

function optionsForWatch(item) {
  const result = item?.result || {};
  const rawOptions = [
    ...(result.promotions || []),
    ...(result.options || []),
    ...(result.online_options || []),
    ...(result.nearby_options || []),
  ];
  const seen = new Set();
  return rawOptions.filter((option) => {
    if (!option?.merchant) return false;
    const key = [
      option.type || '',
      option.merchant,
      option.link || '',
      option.price == null ? '' : option.price,
    ].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function WatchItem({ item, onCheck, onDelete }) {
  const alerts = item.alerts || [];
  const purchaseOptions = optionsForWatch(item);
  return (
    <View style={styles.watchCard}>
      <View style={styles.watchTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.watchTitle} numberOfLines={1}>{item.product_name}</Text>
          <Text style={styles.watchMeta}>
            {[item.last_store, item.last_checked_at ? 'verificado' : 'por verificar'].filter(Boolean).join(' - ')}
          </Text>
        </View>
        <Text style={styles.watchPrice}>
          {item.last_price == null ? '--' : formatMoney(item.last_price, item.currency)}
        </Text>
      </View>

      {!!item.target_price && (
        <Text style={styles.targetText}>Alvo: {formatMoney(item.target_price, item.currency)}</Text>
      )}

      {alerts.length ? alerts.map((alert) => (
        <View key={`${item.id}-${alert.type}`} style={styles.alertPill}>
          <Text style={styles.alertText}>{alert.title}</Text>
        </View>
      )) : (
        <Text style={styles.noAlert}>Sem alerta ativo.</Text>
      )}

      {!!purchaseOptions.length && (
        <View style={styles.watchOptions}>
          <SectionTitle icon={<ShoppingBag size={16} color={C.brandMid} />} title="Opcoes de compra" />
          {purchaseOptions.map((option, index) => (
            <OptionRow key={`${item.id}-${option.type || 'option'}-${option.merchant}-${index}`} option={option} />
          ))}
        </View>
      )}

      <View style={styles.watchActions}>
        <Pressable onPress={() => onCheck(item)} style={styles.smallBtn}>
          <RefreshCcw size={14} color={C.text} />
          <Text style={styles.smallBtnText}>Verificar</Text>
        </Pressable>
        <Pressable onPress={() => onDelete(item)} style={[styles.smallBtn, styles.deleteBtn]}>
          <Trash2 size={14} color={C.red} />
          <Text style={[styles.smallBtnText, { color: C.red }]}>Remover</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReplayBlock({ replay, currency }) {
  const replayCurrency = replay?.currency || currency || 'EUR';
  return (
    <View style={styles.panel}>
      <SectionTitle icon={<Clock3 size={16} color={C.cyan} />} title="Replay do mes" />
      <View style={styles.replaySummary}>
        <Text style={styles.replayValue}>{formatMoney(replay?.total_spent || 0, replayCurrency)}</Text>
        <Text style={styles.replayMeta}>
          {replay?.summary?.days_with_spend || 0} dias com gastos - {replay?.summary?.records || 0} movimentos
        </Text>
      </View>
      {(replay?.events || []).map((event, index) => (
        <View key={`${event.type}-${event.date}-${index}`} style={styles.timelineRow}>
          <View style={styles.timelineDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.timelineTitle}>{event.title}</Text>
            <Text style={styles.timelineMsg}>{event.message}</Text>
          </View>
        </View>
      ))}
      {!(replay?.events || []).length && (
        <View style={styles.emptyMini}>
          <CheckCircle2 size={22} color={C.green} />
          <Text style={styles.emptyMiniText}>Ainda nao ha eventos suficientes este mes.</Text>
        </View>
      )}
    </View>
  );
}

export default function LiveDealsScreen({ navigation }) {
  const [tab, setTab] = useState('search');
  const [product, setProduct] = useState('Whey Protein 1kg');
  const [category, setCategory] = useState('Desporto');
  const [urgency, setUrgency] = useState('flexible');
  const [budget, setBudget] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [coords, setCoords] = useState(null);
  const [currency, setCurrency] = useState('EUR');
  const [result, setResult] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [replay, setReplay] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifyStock, setNotifyStock] = useState(true);
  const [notifyCoupon, setNotifyCoupon] = useState(true);

  const loadBasics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const perfil = await perfilAPI.get().catch(() => ({}));
      const nextCurrency = perfil.moeda_preferida || 'EUR';
      setCurrency(nextCurrency);
      const [watchRes, replayRes] = await Promise.all([
        liveDealsAPI.watchlist().catch(() => ({ items: [] })),
        liveDealsAPI.replay({ currency: nextCurrency }).catch(() => null),
      ]);
      setWatchlist(watchRes.items || []);
      if (replayRes) setReplay(replayRes);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadBasics(); }, [loadBasics]));

  const enableLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Localizacao', 'Permite localizacao para misturar preco e lojas proximas.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (_) {
      Alert.alert('Localizacao', 'Nao foi possivel obter a localizacao agora.');
    } finally {
      setLocating(false);
    }
  };

  const searchDeal = async () => {
    if (!product.trim()) {
      Alert.alert('Live Deals', 'Escreve o produto que queres comprar.');
      return;
    }
    setLoading(true);
    try {
      const res = await liveDealsAPI.search({
        product_name: product.trim(),
        category,
        urgency,
        budget_limit: parseAmount(budget),
        radius_km: 6,
        lat: coords?.lat,
        lng: coords?.lng,
        currency,
      });
      setResult(res);
      setTab('search');
    } catch (e) {
      Alert.alert('Live Deals', e.message || 'Nao foi possivel comparar agora.');
    } finally {
      setLoading(false);
    }
  };

  const saveWatch = async () => {
    if (!product.trim()) return;
    setLoading(true);
    try {
      await liveDealsAPI.addWatch({
        product_name: product.trim(),
        category,
        urgency,
        target_price: parseAmount(targetPrice),
        budget_limit: parseAmount(budget),
        radius_km: 6,
        lat: coords?.lat,
        lng: coords?.lng,
        currency,
        notify_stock: notifyStock,
        notify_coupon: notifyCoupon,
      });
      await loadBasics(true);
      setTab('watchlist');
    } catch (e) {
      Alert.alert('Wishlist', e.message || 'Nao foi possivel seguir o produto.');
    } finally {
      setLoading(false);
    }
  };

  const checkWatch = async (item) => {
    setLoading(true);
    try {
      const res = await liveDealsAPI.checkWatch(item.id);
      setResult(res.result);
      await loadBasics(true);
      setTab('search');
    } catch (e) {
      Alert.alert('Wishlist', e.message || 'Nao foi possivel verificar.');
    } finally {
      setLoading(false);
    }
  };

  const deleteWatch = async (item) => {
    Alert.alert('Remover produto', `Deixar de seguir ${item.product_name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await liveDealsAPI.deleteWatch(item.id);
          loadBasics(true);
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live Deals</Text>
          <Text style={styles.subtitle}>Decisao de compra em tempo real.</Text>
        </View>
        <View style={styles.headerBadge}><Sparkles size={18} color={C.cyan} /></View>
      </View>

      <View style={styles.tabs}>
        {[
          ['search', 'Procurar'],
          ['watchlist', 'Wishlist'],
        ].map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadBasics(true)} tintColor={C.brand} />}
      >
        {tab === 'search' && (
          <>
            <View style={styles.panel}>
              <SectionTitle icon={<Search size={16} color={C.brandMid} />} title="Antes de comprar" />
              <TextInput
                value={product}
                onChangeText={setProduct}
                placeholder="Produto"
                placeholderTextColor={C.textSub}
                style={styles.input}
              />
              <View style={styles.chips}>
                {CATEGORIES.map((cat) => (
                  <Pressable key={cat} onPress={() => setCategory(cat)} style={[styles.chip, category === cat && styles.chipActive]}>
                    <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.segment}>
                {URGENCIES.map((item) => (
                  <Pressable key={item.key} onPress={() => setUrgency(item.key)} style={[styles.segmentItem, urgency === item.key && styles.segmentActive]}>
                    <Text style={[styles.segmentText, urgency === item.key && styles.segmentTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  value={budget}
                  onChangeText={setBudget}
                  placeholder="Budget"
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textSub}
                  style={[styles.input, styles.halfInput]}
                />
                <TextInput
                  value={targetPrice}
                  onChangeText={setTargetPrice}
                  placeholder="Alerta abaixo de"
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textSub}
                  style={[styles.input, styles.halfInput]}
                />
              </View>
              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleTitle}>Stock perto</Text>
                  <Text style={styles.toggleSub}>Avisar quando houver loja proxima</Text>
                </View>
                <Switch value={notifyStock} onValueChange={setNotifyStock} trackColor={{ true: C.brand, false: C.surface3 }} thumbColor="#fff" />
              </View>
              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleTitle}>Cupoes</Text>
                  <Text style={styles.toggleSub}>Avisar quando houver sinal de promocao</Text>
                </View>
                <Switch value={notifyCoupon} onValueChange={setNotifyCoupon} trackColor={{ true: C.brand, false: C.surface3 }} thumbColor="#fff" />
              </View>
              <View style={styles.actionRow}>
                <Pressable onPress={enableLocation} disabled={locating} style={styles.locationBtn}>
                  <LocateFixed size={15} color={coords ? C.green : C.text} />
                  <Text style={styles.locationText}>{locating ? 'A ativar' : coords ? 'Local ativo' : 'Usar localizacao'}</Text>
                </Pressable>
                <Pressable onPress={searchDeal} disabled={loading} style={styles.primaryBtn}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Comparar agora</Text>}
                </Pressable>
              </View>
            </View>
            <ResultBlock result={result} onSave={saveWatch} />
          </>
        )}

        {tab === 'watchlist' && (
          <View style={styles.panel}>
            <SectionTitle icon={<Bell size={16} color={C.yellow} />} title="Produtos seguidos" action="Atualizar" onAction={() => loadBasics(true)} />
            {watchlist.length ? watchlist.map((item) => (
              <WatchItem key={item.id} item={item} onCheck={checkWatch} onDelete={deleteWatch} />
            )) : (
              <View style={styles.emptyMini}>
                <Bell size={24} color={C.textMid} />
                <Text style={styles.emptyMiniText}>Segue um produto para receber alertas de preco, stock e cupoes.</Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACE.lg, paddingTop: SPACE.xl },
  iconBtn: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerBadge: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: FONT.xl, fontWeight: '900' },
  subtitle: { color: C.textMid, fontSize: FONT.sm, marginTop: 2 },
  tabs: { flexDirection: 'row', marginHorizontal: SPACE.lg, backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: 4 },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm },
  tabActive: { backgroundColor: C.brandDim },
  tabText: { color: C.textMid, fontSize: FONT.sm, fontWeight: '800' },
  tabTextActive: { color: C.text },
  content: { padding: SPACE.lg, paddingBottom: 120 },
  panel: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  subPanel: { backgroundColor: C.surface2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 12 },
  sectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  sectionAction: { color: C.brandMid, fontSize: FONT.sm, fontWeight: '900' },
  input: { minHeight: 46, borderRadius: RADIUS.sm, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 12, fontSize: FONT.md, fontWeight: '700', marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { minHeight: 34, justifyContent: 'center', borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, paddingHorizontal: 11 },
  chipActive: { backgroundColor: C.brandDim, borderColor: C.brand },
  chipText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900' },
  chipTextActive: { color: C.text },
  segment: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border, padding: 4, marginBottom: 12 },
  segmentItem: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.xs },
  segmentActive: { backgroundColor: C.surface3 },
  segmentText: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900' },
  segmentTextActive: { color: C.text },
  toggleRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 },
  toggleTitle: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  toggleSub: { color: C.textMid, fontSize: FONT.xs, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  locationBtn: { minHeight: 44, flex: 0.9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: RADIUS.sm, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10 },
  locationText: { color: C.text, fontSize: FONT.xs, fontWeight: '900' },
  primaryBtn: { minHeight: 44, flex: 1.1, borderRadius: RADIUS.sm, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
  decisionTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 14 },
  decisionIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.greenDim },
  decisionTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900', lineHeight: 22 },
  decisionText: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, marginTop: 4 },
  bestBox: { backgroundColor: C.surface2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  bestMerchant: { color: C.text, fontSize: FONT.lg, fontWeight: '900', marginTop: 5 },
  bestPrice: { color: C.green, fontSize: 26, fontWeight: '900', marginTop: 2 },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  reason: { color: C.textMid, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4, fontSize: FONT.xs, fontWeight: '800' },
  todayBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.yellowDim, borderRadius: RADIUS.sm, padding: 11, marginBottom: 12 },
  todayText: { flex: 1, color: C.text, fontSize: FONT.sm, fontWeight: '800', lineHeight: 18 },
  optionRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 },
  optionIcon: { width: 42, height: 42, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  optionImage: { width: '100%', height: '100%' },
  optionMerchant: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  optionMeta: { color: C.textMid, fontSize: FONT.xs, marginTop: 3 },
  optionPrice: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  dealsMap: { height: 178, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  saveBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.green, borderRadius: RADIUS.sm, marginTop: 14 },
  saveText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
  watchCard: { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 13 },
  watchTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  watchTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  watchMeta: { color: C.textMid, fontSize: FONT.xs, marginTop: 3 },
  watchPrice: { color: C.green, fontSize: FONT.md, fontWeight: '900' },
  targetText: { color: C.textMid, fontSize: FONT.xs, marginTop: 6 },
  alertPill: { alignSelf: 'flex-start', backgroundColor: C.brandDim, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8 },
  alertText: { color: C.text, fontSize: FONT.xs, fontWeight: '800' },
  noAlert: { color: C.textMid, fontSize: FONT.xs, marginTop: 8 },
  watchOptions: { borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, backgroundColor: C.surface2, padding: 12, marginTop: 12 },
  watchActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallBtn: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, paddingHorizontal: 10 },
  deleteBtn: { borderColor: `${C.red}55` },
  smallBtnText: { color: C.text, fontSize: FONT.xs, fontWeight: '900' },
  replaySummary: { backgroundColor: C.surface2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  replayValue: { color: C.text, fontSize: 26, fontWeight: '900' },
  replayMeta: { color: C.textMid, fontSize: FONT.sm, marginTop: 4 },
  timelineRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.cyan, marginTop: 5 },
  timelineTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900' },
  timelineMsg: { color: C.textMid, fontSize: FONT.sm, lineHeight: 18, marginTop: 3 },
  emptyMini: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 8 },
  emptyMiniText: { color: C.textMid, fontSize: FONT.sm, textAlign: 'center', lineHeight: 19 },
});

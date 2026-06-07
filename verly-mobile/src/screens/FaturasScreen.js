/**
 * src/screens/FaturasScreen.js
 * Faturas com swipe actions — swipe esquerda: apagar | swipe direita: score + arquivar
 * Pesquisa integrada, upload no header, pull-to-refresh.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert,
  Animated, PanResponder, Dimensions, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker   from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Search, Upload, Trash2, Star, Archive,
  ChevronRight, AlertTriangle, Shield,
} from 'lucide-react-native';
import { faturasAPI } from '../services/api';
import { COLORS } from '../constants/theme';

const C = {
  brand:   '#6C5CE7',
  brandDim:'rgba(108,92,231,0.15)',
  bg:      '#0C0C14',
  surface: '#13131F',
  surface2:'#1C1C2E',
  border:  '#252540',
  text:    '#EEEEF8',
  textSub: '#7070A0',
  green:   '#00C896',
  red:     '#FF5370',
  yellow:  '#FFB300',
  orange:  '#FF7043',
};

const SCREEN_W = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 60;
const SWIPE_FULL      = 100;

const CAT_COLORS = {
  'Tecnologia':     '#6C5CE7',
  'Alimentação':    '#00C896',
  'Vestuário':      '#FF7043',
  'Casa & Decoração':'#FFB300',
  'Saúde & Beleza': '#EC4899',
  'Desporto':       '#3B82F6',
  'Entretenimento': '#A855F7',
  'Transportes':    '#14B8A6',
  'Educação':       '#F59E0B',
  'Outros':         '#7070A0',
};

// ── Swipeable card ────────────────────────────────────────────────────────────

// ── Mapa de domínios para lojas portuguesas comuns ───────────────────────────
const MERCHANT_DOMAINS = {
  'worten': 'worten.pt', 'fnac': 'fnac.pt', 'continente': 'continente.pt',
  'pingo doce': 'pingodoce.pt', 'lidl': 'lidl.pt', 'aldi': 'aldi.pt',
  'ikea': 'ikea.com', 'zara': 'zara.com', 'pull&bear': 'pullandbear.com',
  'pull and bear': 'pullandbear.com', 'bershka': 'bershka.com',
  'stradivarius': 'stradivarius.com', 'mango': 'mango.com', 'h&m': 'hm.com',
  'sport zone': 'sportzone.pt', 'decathlon': 'decathlon.pt',
  'amazon': 'amazon.es', 'spotify': 'spotify.com', 'netflix': 'netflix.com',
  'apple': 'apple.com', 'google': 'google.com', 'uber': 'uber.com',
  'glovo': 'glovoapp.com', 'bolt': 'bolt.eu', 'mcdonald': 'mcdonalds.com',
  'kfc': 'kfc.com', 'burger king': 'burgerking.com', 'nandos': 'nandos.com',
  'el corte inglés': 'elcorteingles.pt', 'modelo': 'continente.pt',
  'intermarché': 'intermarche.pt', 'pingo': 'pingodoce.pt',
};

function getMerchantDomain(loja = '') {
  const lower = loja.toLowerCase().trim();
  for (const [key, domain] of Object.entries(MERCHANT_DOMAINS)) {
    if (lower.includes(key)) return domain;
  }
  // fallback: normaliza o nome
  return lower.replace(/[^a-z0-9]/g, '') + '.com';
}

function MerchantLogo({ loja, size = 42 }) {
  const [failed, setFailed] = useState(false);
  const domain = getMerchantDomain(loja);
  const initials = (loja || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();

  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.28,
      backgroundColor: '#1C1C2E',
      borderWidth: 1, borderColor: '#252540',
      justifyContent: 'center', alignItems: 'center',
      marginRight: 12, overflow: 'hidden',
    }}>
      {!failed ? (
        <Image
          source={{ uri: `https://img.logo.dev/${domain}?token=pk_FYu-xwzARFCydRMNlm6imQ` }}
          style={{ width: size - 10, height: size - 10, borderRadius: 4 }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={{ fontSize: size * 0.33, fontWeight: '800', color: C.brand }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

function SwipeableFaturaCard({ fatura, onPress, onDelete, onScore }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dy) < 20,
      onPanResponderGrant: () => { isSwipingRef.current = true; },
      onPanResponderMove: (_, g) => {
        // Limita o range de swipe
        const x = Math.max(-SWIPE_FULL, Math.min(SWIPE_FULL, g.dx));
        translateX.setValue(x);
      },
      onPanResponderRelease: (_, g) => {
        isSwipingRef.current = false;
        if (g.dx < -SWIPE_THRESHOLD) {
          // Swipe esquerda — mostrar delete
          Animated.spring(translateX, { toValue: -SWIPE_FULL, useNativeDriver: true }).start();
        } else if (g.dx > SWIPE_THRESHOLD) {
          // Swipe direita — mostrar score
          Animated.spring(translateX, { toValue: SWIPE_FULL, useNativeDriver: true }).start();
        } else {
          // Volta ao centro
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const resetSwipe = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  };

  const accentColor = CAT_COLORS[fatura.categoria] || C.brand;
  const hasAlertas  = fatura.data_garantia || fatura.data_devolucao;

  return (
    <View style={styles.swipeContainer}>
      {/* Fundo esquerda — DELETE */}
      <View style={styles.bgLeft}>
        <TouchableOpacity
          style={styles.bgActionDelete}
          onPress={() => { resetSwipe(); onDelete(fatura.id); }}
        >
          <Trash2 size={22} color="#fff" strokeWidth={2} />
          <Text style={styles.bgActionText}>Apagar</Text>
        </TouchableOpacity>
      </View>

      {/* Fundo direita — SCORE */}
      <View style={styles.bgRight}>
        <TouchableOpacity
          style={styles.bgActionScore}
          onPress={() => { resetSwipe(); onScore(fatura); }}
        >
          <Star size={22} color="#fff" strokeWidth={2} />
          <Text style={styles.bgActionText}>Score</Text>
        </TouchableOpacity>
      </View>

      {/* Card deslizável */}
      <Animated.View
        style={[styles.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.cardInner}
          onPress={() => { if (!isSwipingRef.current) { resetSwipe(); onPress(); } }}
          activeOpacity={0.8}
        >
          {/* Logo da marca */}
          <MerchantLogo loja={fatura.loja} />

          {/* Conteúdo */}
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={styles.cardLoja} numberOfLines={1}>{fatura.loja || 'Sem nome'}</Text>
              <Text style={[styles.cardTotal, (fatura.total || 0) > 150 && { color: C.red }]}>
                {(fatura.total || 0).toFixed(2)}€
              </Text>
            </View>

            <View style={styles.cardMeta}>
              <View style={[styles.catBadge, { backgroundColor: accentColor + '20', borderColor: accentColor + '40' }]}>
                <Text style={[styles.catBadgeText, { color: accentColor }]}>
                  {fatura.categoria || 'Outros'}
                </Text>
              </View>
              <Text style={styles.cardDate}>{fatura.data_compra || fatura.data_upload?.slice(0, 10) || '—'}</Text>
            </View>

            {hasAlertas && (
              <View style={styles.alertasRow}>
                {fatura.data_devolucao && (
                  <View style={styles.alertaTag}>
                    <AlertTriangle size={10} color={C.yellow} />
                    <Text style={[styles.alertaTagText, { color: C.yellow }]}>Dev: {fatura.data_devolucao}</Text>
                  </View>
                )}
                {fatura.data_garantia && (
                  <View style={styles.alertaTag}>
                    <Shield size={10} color={C.green} />
                    <Text style={[styles.alertaTagText, { color: C.green }]}>Gar: {fatura.data_garantia}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <ChevronRight size={14} color={C.textSub} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── Ecrã principal ────────────────────────────────────────────────────────────

export default function FaturasScreen({ navigation }) {
  const [faturas,   setFaturas]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [search,    setSearch]    = useState('');
  const [total,     setTotal]     = useState(0);
  const [uploading, setUploading] = useState(false);

  const fetchFaturas = async (q = '') => {
    try {
      const data = await faturasAPI.listar(q ? { q } : {});
      setFaturas(data.faturas || []);
      setTotal(data.total_gasto || data.total || 0);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); fetchFaturas(); }, []));

  const handleSearch = (text) => {
    setSearch(text);
    fetchFaturas(text);
  };

  const handleDelete = (id) => {
    Alert.alert(
      'Eliminar fatura',
      'Esta ação é irreversível. Tens a certeza?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            try {
              await faturasAPI.apagar(id);
              setFaturas(prev => prev.filter(f => f.id !== id));
            } catch (e) { Alert.alert('Erro', e.message); }
          },
        },
      ]
    );
  };

  const handleScore = (fatura) => {
    navigation.navigate('Score', { faturaId: fatura.id, prefill: { item: fatura.loja, categoria: fatura.categoria, preco: fatura.total } });
  };

  // ── Upload ──────────────────────────────────────────────────────────────────

  const _uploadFile = async (uri, name, type) => {
    setUploading(true);
    try {
      await faturasAPI.upload(uri, name, type);
      Alert.alert('Fatura enviada!', 'Pode demorar alguns segundos a processar.');
      fetchFaturas(search);
    } catch (e) {
      Alert.alert('Erro no upload', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = () => {
    Alert.alert('Carregar fatura', 'Escolhe a origem:', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Câmara',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permissão negada'); return; }
          const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
          if (!r.canceled) {
            const a = r.assets[0];
            await _uploadFile(a.uri, a.fileName || 'fatura.jpg', 'image/jpeg');
          }
        },
      },
      {
        text: 'Galeria',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
          if (!r.canceled) {
            const a = r.assets[0];
            await _uploadFile(a.uri, a.fileName || 'fatura.jpg', 'image/jpeg');
          }
        },
      },
      {
        text: 'PDF',
        onPress: async () => {
          const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
          if (!r.canceled) {
            const f = r.assets[0];
            await _uploadFile(f.uri, f.name, 'application/pdf');
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>;
  }

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Faturas</Text>
          <Text style={styles.sub}>{faturas.length} faturas · {(total || 0).toFixed(2)}€</Text>
        </View>
        <TouchableOpacity
          style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Upload size={14} color="#fff" strokeWidth={2.5} />
                <Text style={styles.uploadBtnText}>Upload</Text>
              </>
          }
        </TouchableOpacity>
      </View>

      {/* ── Pesquisa ── */}
      <View style={styles.searchWrap}>
        <Search size={16} color={C.textSub} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearch}
          placeholder="Pesquisar loja, categoria..."
          placeholderTextColor={C.textSub}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Text style={{ color: C.textSub, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Dica de swipe (primeira vez) ── */}
      <View style={styles.swipeHint}>
        <Text style={styles.swipeHintText}>← Swipe para apagar  ·  Swipe para score →</Text>
      </View>

      {/* ── Lista ── */}
      <FlatList
        data={faturas}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchFaturas(search); }}
            tintColor={C.brand}
          />
        }
        renderItem={({ item }) => (
          <SwipeableFaturaCard
            fatura={item}
            onPress={() => navigation.navigate('FaturaDetalhe', { id: item.id })}
            onDelete={handleDelete}
            onScore={handleScore}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {search ? `Sem resultados para "${search}"` : 'Nenhuma fatura ainda'}
            </Text>
            {!search && (
              <>
                <Text style={styles.emptySub}>Carrega a tua primeira fatura para começar a controlar as tuas finanças.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={handleUpload}>
                  <Upload size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>Carregar fatura</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: 0 },
  sub:   { fontSize: 13, color: C.textSub, marginTop: 4 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.brand, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9, marginTop: 4,
  },
  uploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderRadius: 14,
    marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 12 },

  swipeHint: { paddingHorizontal: 20, marginBottom: 8 },
  swipeHintText: { fontSize: 11, color: C.textSub, textAlign: 'center', fontStyle: 'italic' },

  list: { paddingHorizontal: 16, paddingBottom: 32 },

  // Swipe
  swipeContainer: { marginBottom: 10, position: 'relative', overflow: 'hidden', borderRadius: 16 },

  bgLeft: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: SWIPE_FULL, justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.red, borderRadius: 16,
  },
  bgRight: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: SWIPE_FULL, justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.brand, borderRadius: 16,
  },
  bgActionDelete: { alignItems: 'center', gap: 4 },
  bgActionScore:  { alignItems: 'center', gap: 4 },
  bgActionText:   { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardInner: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingRight: 14,
  },
  accentLine: { width: 3, alignSelf: 'stretch', marginRight: 14, borderRadius: 2 },
  cardBody:   { flex: 1 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardLoja:   { fontSize: 15, fontWeight: '700', color: C.text, flex: 1, marginRight: 8 },
  cardTotal:  { fontSize: 16, fontWeight: '900', color: C.text },
  cardMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge:   { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  catBadgeText:{ fontSize: 11, fontWeight: '700' },
  cardDate:   { fontSize: 12, color: C.textSub },
  alertasRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  alertaTag:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  alertaTagText:{ fontSize: 11, fontWeight: '600' },

  // Empty
  empty:       { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 10, textAlign: 'center' },
  emptySub:    { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.brand, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13 },
  emptyBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },
});

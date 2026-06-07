/**
 * src/screens/FaturasScreen.js
 * Faturas com pesquisa integrada, upload no header e pull-to-refresh.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert,
  Dimensions, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker   from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search, Upload, AlertTriangle, Shield, X,
} from 'lucide-react-native';
import { faturasAPI } from '../services/api';
import { COLORS, RADIUS, SPACE, FONT, SHADOWS } from '../constants/theme';
import { useToast } from '../components/UI';

const C = COLORS;

const SCREEN_W = Dimensions.get('window').width;
const formatCurrency = (value = 0) => `${(value || 0).toFixed(2)}\u20ac`;

const CAT_COLORS = {
  'Tecnologia':     '#8B5CF6',
  'Alimentação':    '#00D68F',
  'Vestuário':      '#FF7340',
  'Casa & Decoração':'#FFB300',
  'Saúde & Beleza': '#EC4899',
  'Desporto':       '#3B82F6',
  'Entretenimento': '#A855F7',
  'Transportes':    '#14B8A6',
  'Educação':       '#F59E0B',
  'Outros':         '#A7B0C7',
};

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
    <LinearGradient
      colors={C.gradients.icon}
      style={[
        styles.logoShell,
        { width: size, height: size, borderRadius: size / 2, marginRight: 14 },
      ]}
    >
      <View style={[
        styles.logoInner,
        { width: size - 7, height: size - 7, borderRadius: (size - 7) / 2 },
      ]}>
        {!failed ? (
          <Image
            source={{ uri: `https://img.logo.dev/${domain}?token=pk_FYu-xwzARFCydRMNlm6imQ` }}
            style={{ width: size - 14, height: size - 14, borderRadius: (size - 14) / 2 }}
            resizeMode="contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <Text style={{ fontSize: size * 0.31, fontWeight: '900', color: C.brand }}>
            {initials}
          </Text>
        )}
      </View>
    </LinearGradient>
  );
}

function DecorativeScene() {
  return (
    <View pointerEvents="none" style={styles.decorLayer}>
      <View style={styles.decorStack}>
        <LinearGradient colors={['rgba(59,130,246,0.16)', 'rgba(139,92,246,0.05)']} style={[styles.decorReceipt, styles.decorReceiptBack]}>
          <View style={styles.decorFold} />
          <View style={[styles.decorLine, { width: '58%' }]} />
          <View style={[styles.decorLine, { width: '42%' }]} />
        </LinearGradient>
        <LinearGradient colors={['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.045)']} style={styles.decorReceipt}>
          <View style={styles.decorFold} />
          <View style={[styles.decorLine, { width: '64%' }]} />
          <View style={[styles.decorLine, { width: '48%' }]} />
          <View style={[styles.decorLine, { width: '72%' }]} />
        </LinearGradient>
      </View>

      <LinearGradient colors={['rgba(236,72,153,0.14)', 'rgba(34,212,253,0.06)']} style={styles.decorCard}>
        <View style={styles.decorCardChip} />
        <View style={styles.decorCardBar} />
      </LinearGradient>
    </View>
  );
}

function EmptyIllustration() {
  return (
    <View style={styles.emptyArt} pointerEvents="none">
      <LinearGradient colors={['rgba(139,92,246,0.22)', 'rgba(34,212,253,0.10)']} style={[styles.emptyDoc, styles.emptyDocBack]}>
        <View style={styles.emptyDocLine} />
        <View style={[styles.emptyDocLine, { width: 42 }]} />
      </LinearGradient>
      <LinearGradient colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.055)']} style={styles.emptyDoc}>
        <View style={styles.emptyDocFold} />
        <View style={styles.emptyDocLine} />
        <View style={[styles.emptyDocLine, { width: 36 }]} />
        <View style={[styles.emptyDocLine, { width: 52 }]} />
      </LinearGradient>
    </View>
  );
}

function SkeletonLine({ style }) {
  return <View style={[styles.skeletonLine, style]} />;
}

function FaturasLoading() {
  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <DecorativeScene />
      <View style={styles.header}>
        <View>
          <SkeletonLine style={{ width: 118, height: 30, marginBottom: 8 }} />
          <SkeletonLine style={{ width: 150, height: 14 }} />
        </View>
        <SkeletonLine style={{ width: 98, height: 42, borderRadius: RADIUS.pill }} />
      </View>
      <View style={styles.searchWrap}>
        <SkeletonLine style={{ width: '100%', height: 18 }} />
      </View>
      <View style={styles.list}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={styles.skeletonCard}>
            <SkeletonLine style={{ width: 44, height: 44, borderRadius: 22, marginRight: 14 }} />
            <View style={{ flex: 1 }}>
              <SkeletonLine style={{ width: '70%', height: 16, marginBottom: 10 }} />
              <SkeletonLine style={{ width: '46%', height: 12 }} />
            </View>
            <SkeletonLine style={{ width: 58, height: 18 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

function FaturaCard({ fatura, onPress }) {
  const accentColor = CAT_COLORS[fatura.categoria] || C.brand;
  const hasAlertas  = fatura.data_garantia || fatura.data_devolucao;
  const title = fatura.loja || fatura.nome_ficheiro || 'Fatura';
  const date = fatura.data_compra || fatura.data_upload?.slice(0, 10);

  return (
    <View style={styles.card}>
      <LinearGradient colors={C.gradients.card} style={styles.cardGradient}>
        <LinearGradient colors={[accentColor, C.cyan, C.magenta]} style={styles.accentLine} />
        <TouchableOpacity
          style={styles.cardInner}
          onPress={onPress}
          activeOpacity={0.86}
        >
          <MerchantLogo loja={fatura.loja} />

          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={styles.cardLoja} numberOfLines={1}>{title}</Text>
              <Text style={[styles.cardTotal, (fatura.total || 0) > 150 && { color: C.red }]}>
                {formatCurrency(fatura.total || 0)}
              </Text>
            </View>

            <View style={styles.cardMeta}>
              <View style={[styles.catBadge, { backgroundColor: accentColor + '18', borderColor: accentColor + '30' }]}>
                <Text style={[styles.catBadgeText, { color: accentColor }]} numberOfLines={1}>
                  {fatura.categoria || 'Outros'}
                </Text>
              </View>
              {!!date && <Text style={styles.cardDate}>{date}</Text>}
            </View>

            {hasAlertas && (
              <View style={styles.alertasRow}>
                {fatura.data_devolucao && (
                  <View style={[styles.alertaTag, { backgroundColor: C.yellow + '12', borderColor: C.yellow + '28' }]}>
                    <AlertTriangle size={10} color={C.yellow} strokeWidth={2.2} />
                    <Text style={[styles.alertaTagText, { color: C.yellow }]}>Dev {fatura.data_devolucao}</Text>
                  </View>
                )}
                {fatura.data_garantia && (
                  <View style={[styles.alertaTag, { backgroundColor: C.green + '12', borderColor: C.green + '28' }]}>
                    <Shield size={10} color={C.green} strokeWidth={2.2} />
                    <Text style={[styles.alertaTagText, { color: C.green }]}>Gar {fatura.data_garantia}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </LinearGradient>
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
  const [searchFocused, setSearchFocused] = useState(false);
  const { showToast, ToastComponent } = useToast();

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

  // ── Upload ──────────────────────────────────────────────────────────────────

  const _uploadFile = async (uri, name, type) => {
    setUploading(true);
    try {
      await faturasAPI.upload(uri, name, type);
      showToast('Fatura enviada para processamento.', 'success');
      fetchFaturas(search);
    } catch (e) {
      showToast(e.message || 'Erro no upload.', 'error');
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
    return <FaturasLoading />;
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <DecorativeScene />
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Faturas</Text>
          <Text style={styles.sub}>{faturas.length} faturas · {formatCurrency(total || 0)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          <LinearGradient colors={C.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.uploadBtnGradient}>
            {uploading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Upload size={15} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.uploadBtnText}>Upload</Text>
                </>
            }
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Pesquisa ── */}
      <View style={[styles.searchWrap, searchFocused && styles.searchWrapFocused]}>
        <Search size={16} color={searchFocused ? C.brandMid : C.textSub} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearch}
          placeholder="Pesquisar loja, categoria..."
          placeholderTextColor={C.textSub}
          selectionColor={C.brandMid}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')} style={styles.clearSearchBtn}>
            <X size={15} color={C.textMid} strokeWidth={2.2} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Lista ── */}
      <FlatList
        data={faturas}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={[styles.list, faturas.length === 0 && styles.listEmpty]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchFaturas(search); }}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }
        renderItem={({ item }) => (
          <FaturaCard
            fatura={item}
            onPress={() => navigation.navigate('FaturaDetalhe', { id: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <EmptyIllustration />
            <Text style={styles.emptyTitle}>
              {search ? `Sem resultados para "${search}"` : 'Nenhuma fatura ainda'}
            </Text>
            {!search && (
              <>
                <Text style={styles.emptySub}>Carrega a primeira fatura para começar a organizar compras, garantias e devoluções.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={handleUpload}>
                  <LinearGradient colors={C.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyBtnGradient}>
                    <Upload size={16} color="#fff" strokeWidth={2.4} />
                    <Text style={styles.emptyBtnText}>Carregar fatura</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />
      <ToastComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },

  decorLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  decorStack: {
    position: 'absolute',
    top: -18,
    right: -22,
    width: Math.min(150, SCREEN_W * 0.38),
    height: 150,
    opacity: 0.72,
  },
  decorReceipt: {
    position: 'absolute',
    top: 32,
    right: 28,
    width: 86,
    height: 112,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    transform: [{ rotate: '11deg' }],
    ...SHADOWS.soft,
  },
  decorReceiptBack: {
    top: 22,
    right: 70,
    opacity: 0.7,
    transform: [{ rotate: '-13deg' }],
  },
  decorFold: {
    alignSelf: 'flex-end',
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.11)',
    marginBottom: 22,
  },
  decorLine: {
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 8,
  },
  decorCard: {
    position: 'absolute',
    left: -30,
    top: 132,
    width: 110,
    height: 70,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 13,
    opacity: 0.54,
    transform: [{ rotate: '-10deg' }],
    ...SHADOWS.card,
  },
  decorCardChip: {
    width: 22,
    height: 16,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: 16,
  },
  decorCardBar: {
    width: 54,
    height: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACE.lg,
    paddingTop: 18,
    paddingBottom: 14,
    zIndex: 1,
  },
  title: {
    fontSize: 29,
    fontWeight: '900',
    color: C.text,
    letterSpacing: 0,
  },
  sub: {
    fontSize: FONT.sm,
    color: C.textSub,
    marginTop: 5,
    fontWeight: '600',
  },
  uploadBtn: {
    borderRadius: RADIUS.pill,
    marginTop: 4,
    ...SHADOWS.brandGlow,
  },
  uploadBtnGradient: {
    minWidth: 94,
    height: 40,
    borderRadius: RADIUS.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  uploadBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: FONT.sm,
  },

  searchWrap: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.glass,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACE.lg,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
    zIndex: 1,
  },
  searchWrapFocused: {
    borderColor: 'rgba(139,92,246,0.58)',
    backgroundColor: C.glassHi,
    shadowColor: C.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: FONT.md,
    paddingVertical: 12,
    fontWeight: '600',
  },
  clearSearchBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  list: {
    paddingHorizontal: SPACE.md,
    paddingTop: 2,
    paddingBottom: 36,
    zIndex: 1,
  },
  listEmpty: {
    flexGrow: 1,
  },

  card: {
    marginBottom: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
    ...SHADOWS.card,
  },
  cardGradient: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  cardInner: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 16,
  },
  accentLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  logoShell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  logoInner: {
    backgroundColor: 'rgba(5,8,18,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 9,
    gap: 10,
  },
  cardLoja: {
    fontSize: FONT.md,
    fontWeight: '800',
    color: C.text,
    flex: 1,
    lineHeight: 19,
  },
  cardTotal: {
    fontSize: FONT.lg,
    fontWeight: '900',
    color: C.text,
    letterSpacing: 0,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catBadge: {
    maxWidth: '58%',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  cardDate: {
    fontSize: FONT.xs,
    color: C.textSub,
    fontWeight: '600',
  },
  alertasRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  alertaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  alertaTagText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: 46,
  },
  emptyArt: {
    width: 128,
    height: 116,
    marginBottom: 18,
  },
  emptyDoc: {
    position: 'absolute',
    top: 10,
    left: 38,
    width: 68,
    height: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    padding: 12,
    transform: [{ rotate: '8deg' }],
    ...SHADOWS.card,
  },
  emptyDocBack: {
    top: 24,
    left: 16,
    opacity: 0.78,
    transform: [{ rotate: '-12deg' }],
  },
  emptyDocFold: {
    width: 16,
    height: 16,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignSelf: 'flex-end',
    marginBottom: 18,
  },
  emptyDocLine: {
    width: 48,
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: FONT.xl,
    fontWeight: '900',
    color: C.text,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0,
  },
  emptySub: {
    fontSize: FONT.md,
    color: C.textMid,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  emptyBtn: {
    borderRadius: RADIUS.pill,
    ...SHADOWS.brandGlow,
  },
  emptyBtnGradient: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: FONT.md,
  },

  skeletonLine: {
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.085)',
  },
  skeletonCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.glass,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
});

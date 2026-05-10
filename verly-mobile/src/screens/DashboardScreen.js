/**
 * src/screens/DashboardScreen.js
 * Dashboard principal — FAB upload, badge de notificações, pesquisa global,
 * saudação dinâmica, mood, métricas, quick actions com ícones Lucide.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, FlatList,
  Animated, Keyboard, Alert, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker  from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Bell, Search, X, Upload, Camera, Image, FileText,
  History, BarChart2, Star, Brain, TrendingUp, Shield,
  ChevronRight, TrendingDown, Plus, Zap,
} from 'lucide-react-native';
import { useAuth }       from '../context/AuthContext';
import { dashboardAPI, faturasAPI, historicoAPI } from '../services/api';

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

const QUICK_ACTIONS = [
  { key: 'Historico',    label: 'Histórico',    Icon: History,    color: '#6C5CE7' },
  { key: 'Relatorio',   label: 'Relatório',    Icon: BarChart2,  color: '#00C896' },
  { key: 'Score',       label: 'Score',        Icon: Star,       color: '#FFB300' },
  { key: 'Impulse',     label: 'Impulse',      Icon: Brain,      color: '#FF5370' },
  { key: 'Estatisticas',label: 'Estatísticas', Icon: TrendingUp, color: '#FF7043' },
  { key: 'Subscricoes', label: 'Subscrições',  Icon: Shield,     color: '#A855F7' },
];

// ── Saudação dinâmica ─────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 19) return 'Boa tarde';
  return 'Boa noite';
}

// ── Metric card com linha de acento ──────────────────────────────────────────
function MetricCard({ label, value, sub, subColor, accent }) {
  return (
    <View style={[styles.metricCard, { borderTopColor: accent || C.brand, borderTopWidth: 2 }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {sub ? <Text style={[styles.metricSub, { color: subColor || C.textSub }]}>{sub}</Text> : null}
    </View>
  );
}

// ── Upload FAB modal ──────────────────────────────────────────────────────────
function UploadModal({ visible, onClose, onUploaded, navigation }) {
  const [uploading, setUploading] = useState(false);

  const _upload = async (uri, name, type) => {
    setUploading(true);
    try {
      await faturasAPI.upload(uri, name, type);
      onClose();
      Alert.alert('Fatura enviada!', 'Será processada em segundos.', [
        { text: 'Ver faturas', onPress: () => navigation.navigate('Faturas') },
        { text: 'OK' },
      ]);
      onUploaded();
    } catch (e) {
      Alert.alert('Erro no upload', e.message);
    } finally {
      setUploading(false);
    }
  };

  const fromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão negada'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!r.canceled) {
      const a = r.assets[0];
      await _upload(a.uri, a.fileName || 'fatura.jpg', 'image/jpeg');
    }
  };

  const fromGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
    if (!r.canceled) {
      const a = r.assets[0];
      await _upload(a.uri, a.fileName || 'fatura.jpg', 'image/jpeg');
    }
  };

  const fromPDF = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (!r.canceled) {
      const f = r.assets[0];
      await _upload(f.uri, f.name, 'application/pdf');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Carregar Fatura</Text>
          <Text style={styles.modalSub}>Escolhe a origem do ficheiro</Text>

          {uploading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={C.brand} size="large" />
              <Text style={styles.modalLoadingText}>A enviar fatura...</Text>
            </View>
          ) : (
            <View style={styles.modalOptions}>
              <TouchableOpacity style={styles.modalOption} onPress={fromCamera}>
                <View style={[styles.modalOptionIcon, { backgroundColor: 'rgba(108,92,231,0.15)' }]}>
                  <Camera size={24} color={C.brand} />
                </View>
                <Text style={styles.modalOptionLabel}>Câmara</Text>
                <Text style={styles.modalOptionSub}>Fotografar fatura</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalOption} onPress={fromGallery}>
                <View style={[styles.modalOptionIcon, { backgroundColor: 'rgba(0,200,150,0.15)' }]}>
                  <Image size={24} color={C.green} />
                </View>
                <Text style={styles.modalOptionLabel}>Galeria</Text>
                <Text style={styles.modalOptionSub}>Escolher imagem</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalOption} onPress={fromPDF}>
                <View style={[styles.modalOptionIcon, { backgroundColor: 'rgba(255,112,67,0.15)' }]}>
                  <FileText size={24} color={C.orange} />
                </View>
                <Text style={styles.modalOptionLabel}>PDF</Text>
                <Text style={styles.modalOptionSub}>Seleccionar PDF</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Pesquisa global ───────────────────────────────────────────────────────────
function GlobalSearch({ visible, onClose, navigation }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async (text) => {
    setQuery(text);
    if (text.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await historicoAPI.listar({ q: text, limite: 8 });
      setResults(data.faturas || []);
    } catch (_) {}
    finally { setLoading(false); }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    Keyboard.dismiss();
    onClose();
  };

  if (!visible) return null;

  return (
    <View style={styles.searchOverlay}>
      <View style={styles.searchBar}>
        <Search size={18} color={C.textSub} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={search}
          placeholder="Pesquisar faturas, lojas..."
          placeholderTextColor={C.textSub}
          autoFocus
          returnKeyType="search"
        />
        <TouchableOpacity onPress={handleClose}>
          <X size={18} color={C.textSub} />
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator color={C.brand} style={{ marginTop: 20 }} />
      )}

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={item => String(item.id)}
          style={styles.searchResults}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.searchResultItem}
              onPress={() => {
                handleClose();
                navigation.navigate('FaturaDetalhe', { id: item.id });
              }}
            >
              <View style={styles.searchResultLeft}>
                <Text style={styles.searchResultLoja} numberOfLines={1}>{item.loja}</Text>
                <Text style={styles.searchResultMeta}>{item.categoria} · {item.data_compra || '—'}</Text>
              </View>
              <Text style={styles.searchResultTotal}>{(item.total || 0).toFixed(2)}€</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length >= 2 && !loading
              ? <Text style={styles.searchEmpty}>Sem resultados para "{query}"</Text>
              : null
          }
        />
      )}

      {results.length === 0 && query.length >= 2 && !loading && (
        <Text style={styles.searchEmpty}>Sem resultados para "{query}"</Text>
      )}
    </View>
  );
}

// ── Ecrã principal ────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState(null);
  const [uploadModal,  setUploadModal]  = useState(false);
  const [searchVisible,setSearchVisible]= useState(false);

  const fabAnim = useRef(new Animated.Value(1)).current;

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const result = await dashboardAPI.get();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const openUpload = () => {
    Animated.sequence([
      Animated.timing(fabAnim, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(fabAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    setUploadModal(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Erro: {error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData()}>
          <Text style={styles.retryText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mood = data?.mood;
  const pct = (data?.orcamento > 0)
    ? Math.min((data.total_gasto / data.orcamento) * 100, 100)
    : 0;

  return (
    <View style={styles.root}>
      {/* Pesquisa global — sobrepõe tudo quando activa */}
      <GlobalSearch
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        navigation={navigation}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            tintColor={C.brand}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Saudação + ações topo ─────────────────────────────────────── */}
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.userName}>{user?.nome?.split(' ')[0] || 'Utilizador'}</Text>
          </View>
          <View style={styles.topActions}>
            {/* Pesquisa */}
            <TouchableOpacity
              style={styles.topIconBtn}
              onPress={() => setSearchVisible(true)}
            >
              <Search size={20} color={C.text} strokeWidth={1.8} />
            </TouchableOpacity>
            {/* Notificações */}
            <TouchableOpacity
              style={styles.topIconBtn}
              onPress={() => navigation.navigate('Notificacoes')}
            >
              <Bell size={20} color={C.text} strokeWidth={1.8} />
              {data?.notificacoes?.length > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Mood card ──────────────────────────────────────────────────── */}
        {mood && (
          <View style={styles.moodCard}>
            <View style={styles.moodLeft}>
              <Text style={[styles.moodNivel, { color: mood.cor }]}>
                {mood.nivel?.toUpperCase()}
              </Text>
              <Text style={styles.moodFrase}>"{mood.frase}"</Text>
              {data.orcamento > 0 && (
                <View style={styles.progressWrap}>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: mood.cor }]} />
                  </View>
                  <Text style={styles.progressLabel}>{Math.round(pct)}% do orçamento</Text>
                </View>
              )}
            </View>
            <View style={styles.streakBox}>
              <Zap size={18} color={C.yellow} />
              <Text style={styles.streakNum}>{data?.streak || 0}</Text>
              <Text style={styles.streakLabel}>dias</Text>
            </View>
          </View>
        )}

        {/* ── Alertas urgentes ───────────────────────────────────────────── */}
        {data?.alertas?.slice(0, 2).map((a, i) => (
          <View key={i} style={[styles.alertBanner, { borderLeftColor: a.urgencia === 'critico' ? C.red : C.yellow }]}>
            <TrendingDown size={16} color={a.urgencia === 'critico' ? C.red : C.yellow} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>
                {a.tipo === 'devolucao' ? 'Devolução expira' : 'Garantia expira'} em {a.dias} dia(s)
              </Text>
              <Text style={styles.alertSub}>{a.loja} · até {a.data}</Text>
            </View>
          </View>
        ))}

        {/* ── Métricas ───────────────────────────────────────────────────── */}
        <View style={styles.metricsRow}>
          <MetricCard
            label="Total Gasto"
            value={`${(data?.total_gasto || 0).toFixed(2)}€`}
            sub={
              data?.comparacao?.variacao_pct != null
                ? `${data.comparacao.variacao_pct > 0 ? '+' : ''}${data.comparacao.variacao_pct}% vs mês anterior`
                : 'primeiro mês'
            }
            subColor={data?.comparacao?.subiu ? C.red : C.green}
            accent={C.brand}
          />
          <MetricCard
            label="Faturas"
            value={data?.num_faturas || 0}
            sub="registadas"
            accent={C.green}
          />
          <MetricCard
            label="Desperdício"
            value={`${(data?.desperdicado_mes || 0).toFixed(0)}€`}
            sub="este mês"
            subColor={(data?.desperdicado_mes || 0) > 100 ? C.red : C.textSub}
            accent={(data?.desperdicado_mes || 0) > 100 ? C.red : C.yellow}
          />
        </View>

        {/* ── Quick actions ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ferramentas</Text>
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map(({ key, label, Icon, color }) => (
              <TouchableOpacity
                key={key}
                style={styles.quickBtn}
                onPress={() => navigation.navigate(key)}
                activeOpacity={0.75}
              >
                <View style={[styles.quickIconBox, { backgroundColor: color + '1A', borderColor: color + '33' }]}>
                  <Icon size={22} color={color} strokeWidth={1.8} />
                </View>
                <Text style={styles.quickLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Subscrições leak ───────────────────────────────────────────── */}
        {data?.subscricoes?.total_mensal > 0 && (
          <TouchableOpacity
            style={styles.subsCard}
            onPress={() => navigation.navigate('Subscricoes')}
            activeOpacity={0.8}
          >
            <Shield size={18} color={C.red} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={styles.subsLabel}>Leak de subscrições</Text>
              <Text style={styles.subsSub}>≈ {Math.round(data.subscricoes.total_mensal * 12)}€/ano</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.subsValue}>{data.subscricoes.total_mensal.toFixed(2)}€/mês</Text>
            </View>
            <ChevronRight size={16} color={C.textSub} />
          </TouchableOpacity>
        )}

        {/* ── Últimas faturas ────────────────────────────────────────────── */}
        <View style={[styles.card, { marginBottom: 100 }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Últimas faturas</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Historico')}>
              <Text style={styles.cardLink}>Ver tudo</Text>
            </TouchableOpacity>
          </View>
          {data?.ultimas_faturas?.length > 0
            ? data.ultimas_faturas.map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={styles.faturaRow}
                  onPress={() => navigation.navigate('FaturaDetalhe', { id: f.id })}
                  activeOpacity={0.7}
                >
                  <View style={styles.faturaDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.faturaLoja} numberOfLines={1}>{f.loja}</Text>
                    <Text style={styles.faturaData}>{f.data_compra || f.data_upload?.slice(0, 10) || '—'}</Text>
                  </View>
                  <Text style={styles.faturaTotal}>{(f.total || 0).toFixed(2)}€</Text>
                  <ChevronRight size={14} color={C.textSub} />
                </TouchableOpacity>
              ))
            : (
              <View style={styles.emptyFaturas}>
                <FileText size={32} color={C.textSub} strokeWidth={1.2} />
                <Text style={styles.emptyText}>Ainda sem faturas</Text>
                <TouchableOpacity style={styles.emptyUploadBtn} onPress={openUpload}>
                  <Text style={styles.emptyUploadText}>Carregar primeira fatura</Text>
                </TouchableOpacity>
              </View>
            )
          }
        </View>

        {/* ── Feed Verly ─────────────────────────────────────────────────── */}
        {data?.feed?.length > 0 && (
          <View style={[styles.card, { marginBottom: 32 }]}>
            <Text style={styles.cardTitle}>Verly diz</Text>
            {data.feed.map((item, i) => (
              <View key={i} style={styles.feedItem}>
                <View style={styles.feedDot} />
                <Text style={styles.feedText}>{item.texto}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── FAB upload ─────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.fab, { transform: [{ scale: fabAnim }] }]}>
        <TouchableOpacity style={styles.fabBtn} onPress={openUpload} activeOpacity={0.85}>
          <Plus size={26} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Upload modal ────────────────────────────────────────────────────── */}
      <UploadModal
        visible={uploadModal}
        onClose={() => setUploadModal(false)}
        onUploaded={() => fetchData()}
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content:{ padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  // Topo
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting:    { fontSize: 14, color: C.textSub, fontWeight: '500' },
  userName:    { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  topActions:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  topIconBtn:  {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  bellDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.red,
  },

  // Mood
  moodCard: {
    backgroundColor: C.surface, borderRadius: 18, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: C.border,
    flexDirection: 'row', alignItems: 'center', gap: 16,
  },
  moodLeft:   { flex: 1 },
  moodNivel:  { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  moodFrase:  { fontSize: 13, color: C.textSub, fontStyle: 'italic', lineHeight: 19 },
  progressWrap: { marginTop: 12 },
  progressBg:   { height: 5, backgroundColor: C.surface2, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  progressLabel:{ fontSize: 11, color: C.textSub, marginTop: 5 },
  streakBox: {
    alignItems: 'center', backgroundColor: C.surface2,
    borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border,
  },
  streakNum:   { fontSize: 22, fontWeight: '900', color: C.text, lineHeight: 28 },
  streakLabel: { fontSize: 10, color: C.textSub, fontWeight: '600' },

  // Alertas
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 12, borderLeftWidth: 3,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  alertTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  alertSub:   { fontSize: 12, color: C.textSub, marginTop: 2 },

  // Métricas
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
  },
  metricLabel: { fontSize: 10, color: C.textSub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  metricValue: { fontSize: 18, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  metricSub:   { fontSize: 11, marginTop: 4 },

  // Card genérico
  card: {
    backgroundColor: C.surface, borderRadius: 18, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: C.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle:  { fontSize: 15, fontWeight: '800', color: C.text },
  cardLink:   { fontSize: 13, color: C.brand, fontWeight: '600' },

  // Quick actions
  quickGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  quickBtn:     { width: '30%', alignItems: 'center', gap: 7 },
  quickIconBox: {
    width: 52, height: 52, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  quickLabel: { fontSize: 11, fontWeight: '700', color: C.textSub, textAlign: 'center' },

  // Subscrições
  subsCard: {
    backgroundColor: 'rgba(255,83,112,0.06)', borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255,83,112,0.2)',
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  subsLabel: { fontSize: 13, color: C.text, fontWeight: '700' },
  subsSub:   { fontSize: 12, color: C.textSub, marginTop: 2 },
  subsValue: { fontSize: 16, fontWeight: '900', color: C.red },

  // Faturas mini
  faturaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border,
  },
  faturaDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand },
  faturaLoja:  { fontSize: 14, fontWeight: '600', color: C.text },
  faturaData:  { fontSize: 12, color: C.textSub, marginTop: 2 },
  faturaTotal: { fontSize: 14, fontWeight: '800', color: C.text },
  emptyFaturas:   { alignItems: 'center', padding: 24, gap: 12 },
  emptyText:      { fontSize: 14, color: C.textSub },
  emptyUploadBtn: { backgroundColor: C.brandDim, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1, borderColor: C.brand },
  emptyUploadText:{ color: C.brand, fontWeight: '700', fontSize: 13 },

  // Feed
  feedItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  feedDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand, marginTop: 7 },
  feedText: { flex: 1, fontSize: 13, color: C.textSub, lineHeight: 20 },

  // FAB
  fab: {
    position: 'absolute', bottom: 90, right: 20,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 10,
  },
  fabBtn: {
    width: 58, height: 58, borderRadius: 18,
    backgroundColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
  },

  // Upload modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 4 },
  modalSub:     { fontSize: 13, color: C.textSub, marginBottom: 24 },
  modalLoading: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  modalLoadingText: { color: C.textSub, fontSize: 14 },
  modalOptions: { flexDirection: 'row', gap: 12 },
  modalOption:  {
    flex: 1, alignItems: 'center', gap: 8,
    backgroundColor: C.surface2, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  modalOptionIcon:  { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  modalOptionLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  modalOptionSub:   { fontSize: 11, color: C.textSub, textAlign: 'center' },
  modalCancel:  { marginTop: 16, alignItems: 'center', padding: 14 },
  modalCancelText: { fontSize: 14, color: C.textSub, fontWeight: '600' },

  // Pesquisa global
  searchOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.bg, zIndex: 999, padding: 16, paddingTop: 20,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15 },
  searchResults: { flex: 1 },
  searchResultItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  searchResultLeft:  { flex: 1 },
  searchResultLoja:  { fontSize: 14, fontWeight: '700', color: C.text },
  searchResultMeta:  { fontSize: 12, color: C.textSub, marginTop: 2 },
  searchResultTotal: { fontSize: 14, fontWeight: '800', color: C.text },
  searchEmpty: { textAlign: 'center', color: C.textSub, marginTop: 40, fontSize: 14 },

  // Erros
  errorText: { color: C.red, fontSize: 14, marginBottom: 16 },
  retryBtn:  { backgroundColor: C.brand, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#fff', fontWeight: '700' },
});
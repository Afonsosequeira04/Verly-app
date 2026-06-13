import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, ExternalLink, LocateFixed, Newspaper } from 'lucide-react-native';

import { discoverAPI, perfilAPI } from '../services/api';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';

const C = COLORS;

export default function DiscoverScreen({ navigation }) {
  const [articles, setArticles] = useState([]);
  const [country, setCountry] = useState('PT');
  const [language, setLanguage] = useState('pt');
  const [source, setSource] = useState('fallback');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async (params = {}, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const perfil = await perfilAPI.get().catch(() => ({}));
      const lang = params.language || perfil.lingua || language;
      const nextCountry = params.country || country;
      setLanguage(lang);
      const data = await discoverAPI.news({ country: nextCountry, language: lang });
      setCountry(data.country || nextCountry);
      setSource(data.source || 'fallback');
      setArticles(data.articles || []);
    } catch (e) {
      Alert.alert('Descobrir', e.message || 'Nao foi possivel carregar noticias.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [country, language]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const useLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Localizacao', 'Ativa a localizacao para personalizar noticias.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(loc.coords);
      const nextCountry = places?.[0]?.isoCountryCode || 'PT';
      await load({ country: nextCountry }, true);
    } catch (e) {
      Alert.alert('Localizacao', e.message || 'Nao foi possivel obter localizacao.');
    } finally {
      setLocating(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={C.brand} size="large" /></View>;

  return (
    <View style={styles.root}>
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ArrowLeft size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Descobrir</Text>
          <Text style={styles.subtitle}>Noticias financeiras relevantes para {country}.</Text>
        </View>
        <Pressable onPress={useLocation} disabled={locating} style={styles.primaryIcon}>
          {locating ? <ActivityIndicator color="#fff" size="small" /> : <LocateFixed size={18} color="#fff" />}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({}, true)} tintColor={C.brand} />}
      >
        <Animated.View entering={FadeInDown.delay(40)} style={styles.hero}>
          <Newspaper size={24} color={C.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{source === 'gnews' || source === 'google_news_rss' ? 'Noticias reais' : 'Radar local'}</Text>
            <Text style={styles.heroTitle}>Contexto para o teu dinheiro</Text>
            <Text style={styles.heroSub}>Inflacao, juros, banca e consumo filtrados pela localizacao.</Text>
          </View>
        </Animated.View>

        {articles.map((article, index) => (
          <Animated.View key={`${article.title}-${index}`} entering={FadeInDown.delay(80 + index * 45)}>
            <Pressable
              disabled={!article.url}
              onPress={() => article.url && Linking.openURL(article.url)}
              style={styles.article}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.articleSource}>{article.source || 'Fonte'}</Text>
                <Text style={styles.articleTitle}>{article.title}</Text>
                {!!article.description && <Text style={styles.articleDesc} numberOfLines={3}>{article.description}</Text>}
              </View>
              {article.url ? <ExternalLink size={16} color={C.textMid} /> : null}
            </Pressable>
          </Animated.View>
        ))}
        {!articles.length && (
          <View style={styles.empty}>
            <Newspaper size={24} color={C.textMid} />
            <Text style={styles.emptyText}>Ainda nao apareceram noticias. Tenta atualizar ou usar a localizacao.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACE.lg, paddingTop: SPACE.xl },
  iconBtn: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  primaryIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: FONT.xl, fontWeight: '900' },
  subtitle: { color: C.textMid, fontSize: FONT.sm, marginTop: 2 },
  content: { padding: SPACE.lg, paddingTop: 0, paddingBottom: 100 },
  hero: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 16, flexDirection: 'row', gap: 14, marginBottom: 14 },
  kicker: { color: C.textMid, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '900', marginTop: 3 },
  heroSub: { color: C.textMid, fontSize: FONT.sm, marginTop: 3, lineHeight: 19 },
  article: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, padding: 15, marginBottom: 10, flexDirection: 'row', gap: 10 },
  articleSource: { color: C.brand, fontSize: FONT.xs, fontWeight: '900', textTransform: 'uppercase', marginBottom: 5 },
  articleTitle: { color: C.text, fontSize: FONT.md, fontWeight: '900', lineHeight: 20 },
  articleDesc: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, marginTop: 6 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 36 },
  emptyText: { color: C.textMid, fontSize: FONT.sm, textAlign: 'center', lineHeight: 19 },
});

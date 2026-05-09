/**
 * src/screens/NotificacoesScreen.js
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { notificacoesAPI } from '../services/api';
import { COLORS } from '../constants/theme';

const URGENCIA_COLORS = { alta: COLORS.red, media: COLORS.yellow, info: COLORS.brand };

export default function NotificacoesScreen({ navigation }) {
  const [notifs, setNotifs]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    notificacoesAPI.listar()
      .then(data => setNotifs(data.notificacoes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brand} /></View>;
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notificações</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={notifs}
        keyExtractor={(item, i) => `${item.tipo}-${i}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const color = URGENCIA_COLORS[item.urgencia] || COLORS.textSub;
          return (
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}
              onPress={() => {}}
              activeOpacity={0.7}
            >
              <Text style={styles.cardIcon}>{item.icone}</Text>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.titulo}</Text>
                <Text style={styles.cardMsg}>{item.mensagem}</Text>
                <View style={[styles.urgBadge, { backgroundColor: `${color}22` }]}>
                  <Text style={[styles.urgBadgeText, { color }]}>
                    {item.urgencia === 'alta' ? 'URGENTE' : item.urgencia === 'media' ? 'ATENÇÃO' : 'INFO'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>Tudo em ordem!</Text>
            <Text style={styles.emptySub}>Não tens notificações por agora.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  back:   { color: COLORS.brand, fontSize: 15, fontWeight: '600', width: 60 },
  title:  { fontSize: 17, fontWeight: '800', color: COLORS.text },
  list:   { padding: 20, paddingBottom: 40 },
  card:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardIcon: { fontSize: 22, marginTop: 2 },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardMsg:   { fontSize: 13, color: COLORS.textSub, lineHeight: 19 },
  urgBadge:  { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  urgBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  empty:      { alignItems: 'center', paddingTop: 80 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: COLORS.textSub },
});
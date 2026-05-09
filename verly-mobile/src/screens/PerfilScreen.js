/**
 * src/screens/PerfilScreen.js
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Switch,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { COLORS } from '../constants/theme';

const PERSONALIDADES = [
  { key: 'calm',      nome: 'Calmo',          desc: 'Coach gentil e construtivo.', cor: COLORS.green },
  { key: 'pro',       nome: 'Profissional',   desc: 'CFO pessoal. Números e factos.', cor: COLORS.brand },
  { key: 'savage',    nome: 'Savage',         desc: 'Sem filtros. Verdade brutal.', cor: COLORS.red },
  { key: 'sarcastic', nome: 'Sarcástico',     desc: 'Ironia refinada. Construtivo.', cor: COLORS.yellow },
];

export default function PerfilScreen() {
  const { user, logout, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);

  const handlePersonalidade = async (key) => {
    try {
      setSaving(true);
      await authAPI.updateMe({ personalidade: key });
      updateUser({ personalidade: key });
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNotifToggle = async (val) => {
    try {
      await authAPI.updateMe({ notificacoes_email: val });
      updateUser({ notificacoes_email: val });
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  const handleLogout = () => {
    Alert.alert('Terminar sessão', 'Tens a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  };

  const initial = user?.nome?.[0]?.toUpperCase() || '?';
  const personalidade = user?.personalidade || 'calm';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.heroNome}>{user?.nome}</Text>
        <Text style={styles.heroEmail}>{user?.email}</Text>
        {user?.streak_dias > 0 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>🔥 {user.streak_dias} dias de streak</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{user?.orcamento_mensal ? `${user.orcamento_mensal}€` : '—'}</Text>
          <Text style={styles.statLabel}>Orçamento</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{user?.streak_dias || 0}</Text>
          <Text style={styles.statLabel}>Streak dias</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{personalidade[0].toUpperCase() + personalidade.slice(1)}</Text>
          <Text style={styles.statLabel}>Modo</Text>
        </View>
      </View>

      {/* Personalidade */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personalidade da Verly</Text>
        <View style={styles.persGrid}>
          {PERSONALIDADES.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.persCard, personalidade === p.key && { borderColor: p.cor, backgroundColor: `${p.cor}15` }]}
              onPress={() => handlePersonalidade(p.key)}
              disabled={saving}
            >
              {personalidade === p.key && (
                <View style={[styles.persDot, { backgroundColor: p.cor }]} />
              )}
              <Text style={[styles.persNome, personalidade === p.key && { color: p.cor }]}>{p.nome}</Text>
              <Text style={styles.persDesc}>{p.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Notificações */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferências</Text>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Notificações por email</Text>
            <Text style={styles.settingDesc}>Alertas de garantias e orçamento</Text>
          </View>
          <Switch
            value={user?.notificacoes_email || false}
            onValueChange={handleNotifToggle}
            trackColor={{ false: COLORS.surface2, true: COLORS.brand }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Terminar sessão</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  hero:    { alignItems: 'center', paddingVertical: 24 },
  avatar:  { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  heroNome:  { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  heroEmail: { fontSize: 14, color: COLORS.textSub },
  streakBadge: { marginTop: 10, backgroundColor: 'rgba(255,107,53,0.12)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,107,53,0.2)' },
  streakText: { color: '#FF6B35', fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statVal:   { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  statLabel: { fontSize: 11, color: COLORS.textSub, textAlign: 'center' },
  section:   { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  persGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  persCard: { width: '47%', backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: COLORS.border, position: 'relative' },
  persDot:  { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
  persNome: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  persDesc: { fontSize: 11, color: COLORS.textSub, lineHeight: 15 },
  settingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  settingLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 3 },
  settingDesc:  { fontSize: 12, color: COLORS.textSub },
  logoutBtn: { backgroundColor: 'rgba(255,71,87,0.08)', borderWidth: 1, borderColor: 'rgba(255,71,87,0.2)', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { color: COLORS.red, fontSize: 15, fontWeight: '700' },
});
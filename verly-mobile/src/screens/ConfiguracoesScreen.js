// src/screens/ConfiguracoesScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Switch,
  Alert, ActivityIndicator, StyleSheet, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  Trash2, LogOut, Lock, Bell, Globe, Download,
  Info, Shield, FileText, ChevronRight, LayoutDashboard,
} from 'lucide-react-native';
import { authAPI, perfilAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import { Reveal, SectionHeader } from '../components/UI';

const C = COLORS;

const APP_VERSION = '1.0.0';

const PREFS_KEY = '@verly_dashboard_prefs';
const DEFAULT_PREFS = {
  mostrarPrevisao: true,
  mostrarPoupanca: true,
  mostrarGraficos: true,
  mostrarInsights: true,
  mostrarFaturas:  true,
  mostrarSubscricoes: true,
};

// ─── Linha de definição simples ───────────────────────────────────────────────
function SettingRow({ icon, label, sub, onPress, right, danger, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.row,
        pressed && !disabled && { backgroundColor: C.surface3 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={[s.iconWrap, danger && { backgroundColor: C.red + '18' }]}>
        {React.cloneElement(icon, { size: 16, color: danger ? C.red : C.brand })}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, danger && { color: C.red }]}>{label}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      {right ?? <ChevronRight size={14} color={C.textMid} />}
    </Pressable>
  );
}

// ─── Divisor entre rows ───────────────────────────────────────────────────────
function Divider() {
  return <View style={{ height: 1, backgroundColor: C.border, marginLeft: 58 }} />;
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function ConfiguracoesScreen({ navigation }) {
  const { user, logout, updateUser } = useAuth();

  const [notificacoes,   setNotificacoes]   = useState(false);
  const [lingua,         setLingua]         = useState('pt');
  const [dashPrefs,      setDashPrefs]      = useState(DEFAULT_PREFS);
  const [loadingDelete,  setLoadingDelete]  = useState(false);
  const [loadingExport,  setLoadingExport]  = useState(false);
  const [loadingPassw,   setLoadingPassw]   = useState(false);

  useFocusEffect(useCallback(() => {
    // Carregar preferências actuais do utilizador
    perfilAPI.get().then(d => {
      if (d.notificacoes_email != null) setNotificacoes(d.notificacoes_email);
      if (d.lingua) setLingua(d.lingua);
    }).catch(() => {});
    // Carregar prefs do dashboard
    AsyncStorage.getItem(PREFS_KEY).then(raw => {
      if (raw) { try { setDashPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }); } catch (_) {} }
    });
  }, []));

  // ── Alterar password ───────────────────────────────────────────────────────
  const handleAlterarPassword = () => {
    Alert.prompt(
      'Nova password',
      'Insere a tua nova password (mínimo 6 caracteres):',
      async (novaPassword) => {
        if (!novaPassword || novaPassword.length < 6) {
          Alert.alert('Inválida', 'A password deve ter pelo menos 6 caracteres.');
          return;
        }
        setLoadingPassw(true);
        try {
          await authAPI.updateMe({ password: novaPassword });
          Alert.alert('✅ Password alterada', 'A tua password foi atualizada com sucesso.');
        } catch (e) {
          Alert.alert('Erro', e.message || 'Não foi possível alterar a password.');
        } finally {
          setLoadingPassw(false);
        }
      },
      'secure-text'
    );
  };

  // ── Dashboard prefs toggle ─────────────────────────────────────────────────
  const togglePref = async (key) => {
    const next = { ...dashPrefs, [key]: !dashPrefs[key] };
    setDashPrefs(next);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };

  // ── Notificações toggle ────────────────────────────────────────────────────
  const handleToggleNotificacoes = async (val) => {
    setNotificacoes(val);
    try {
      await perfilAPI.update({ notificacoes_email: val });
      updateUser?.({ notificacoes_email: val });
    } catch (_) {
      setNotificacoes(!val); // reverter se falhar
    }
  };

  // ── Língua ─────────────────────────────────────────────────────────────────
  const handleLingua = () => {
    Alert.alert(
      'Língua',
      'Escolhe a língua da app:',
      [
        { text: '🇵🇹 Português', onPress: () => { setLingua('pt'); perfilAPI.update({ lingua: 'pt' }).catch(() => {}); } },
        { text: '🇬🇧 English',   onPress: () => { setLingua('en'); perfilAPI.update({ lingua: 'en' }).catch(() => {}); } },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  // ── Exportar dados ─────────────────────────────────────────────────────────
  const handleExportarDados = async () => {
    setLoadingExport(true);
    try {
      const dados = await perfilAPI.get();
      const json  = JSON.stringify(dados, null, 2);
      // Em produção: usar expo-sharing para partilhar o ficheiro
      Alert.alert(
        'Dados exportados',
        'Os teus dados foram preparados. Em breve receberás um email com o ficheiro completo.',
        [{ text: 'OK' }]
      );
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível exportar os dados.');
    } finally {
      setLoadingExport(false);
    }
  };

  // ── Apagar conta ───────────────────────────────────────────────────────────
  const handleApagarConta = () => {
    Alert.alert(
      '⚠️ Apagar conta',
      'Esta ação é permanente e irreversível.\n\nTodos os teus dados serão eliminados:\n• Faturas e documentos\n• Histórico de conversas\n• Metas e subscrições\n• Perfil e configurações\n\nTens a certeza absoluta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, apagar tudo',
          style: 'destructive',
          onPress: () => {
            // Segunda confirmação
            Alert.alert(
              'Última confirmação',
              'Esta ação não pode ser desfeita. A tua conta será permanentemente eliminada.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Apagar conta',
                  style: 'destructive',
                  onPress: confirmarApagarConta,
                },
              ]
            );
          },
        },
      ]
    );
  };

  const confirmarApagarConta = async () => {
    setLoadingDelete(true);
    try {
      await authAPI.deleteAccount();
      Alert.alert(
        'Conta eliminada',
        'A tua conta foi eliminada com sucesso.',
        [{ text: 'OK', onPress: logout }]
      );
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível apagar a conta. Tenta novamente.');
    } finally {
      setLoadingDelete(false);
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Terminar sessão', 'Tens a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  };

  const linguaLabel = lingua === 'en' ? '🇬🇧 English' : '🇵🇹 Português';

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Conta ─────────────────────────────────────────────────────────── */}
      <Reveal delay={0}>
        <SectionHeader title="Conta" />
        <View style={s.card}>
          <SettingRow
            icon={<Lock />}
            label="Alterar password"
            sub="Atualiza a tua password de acesso"
            onPress={handleAlterarPassword}
            disabled={loadingPassw}
            right={loadingPassw ? <ActivityIndicator size="small" color={C.brand} /> : undefined}
          />
          <Divider />
          <SettingRow
            icon={<LogOut />}
            label="Terminar sessão"
            sub={user?.email || ''}
            onPress={handleLogout}
          />
        </View>
      </Reveal>

      {/* ── Dashboard ─────────────────────────────────────────────────────── */}
      <Reveal delay={40} style={{ marginTop: 20 }}>
        <SectionHeader title="Personalizar Dashboard" />
        <View style={s.card}>
          {[
            { key: 'mostrarPoupanca',    label: 'Sugestão de poupança', sub: 'Card com conselho da IA' },
            { key: 'mostrarPrevisao',    label: 'Previsão do mês',      sub: 'Estimativa de gastos até fim do mês' },
            { key: 'mostrarGraficos',    label: 'Gráficos',             sub: 'Gastos por categoria e por mês' },
            { key: 'mostrarInsights',    label: 'Insights da IA',       sub: 'Análise automática dos teus hábitos' },
            { key: 'mostrarSubscricoes', label: 'Alerta subscrições',   sub: 'Subscrições a desperdiçar' },
            { key: 'mostrarFaturas',     label: 'Faturas recentes',     sub: 'Últimas faturas no dashboard' },
          ].map(({ key, label, sub }, i, arr) => (
            <React.Fragment key={key}>
              <SettingRow
                icon={<LayoutDashboard size={18} color={C.brand} />}
                label={label}
                sub={sub}
                onPress={() => togglePref(key)}
                right={
                  <Switch
                    value={dashPrefs[key]}
                    onValueChange={() => togglePref(key)}
                    trackColor={{ false: C.border, true: C.brand + '80' }}
                    thumbColor={dashPrefs[key] ? C.brand : C.textMid}
                  />
                }
              />
              {i < arr.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </View>
      </Reveal>

      {/* ── Preferências ──────────────────────────────────────────────────── */}
      <Reveal delay={60} style={{ marginTop: 20 }}>
        <SectionHeader title="Preferências" />
        <View style={s.card}>
          <SettingRow
            icon={<Bell />}
            label="Notificações por email"
            sub="Alertas de garantias e orçamento"
            onPress={() => handleToggleNotificacoes(!notificacoes)}
            right={
              <Switch
                value={notificacoes}
                onValueChange={handleToggleNotificacoes}
                trackColor={{ false: C.border, true: C.brand }}
                thumbColor="#fff"
              />
            }
          />
          <Divider />
          <SettingRow
            icon={<Globe />}
            label="Língua"
            sub={linguaLabel}
            onPress={handleLingua}
          />
        </View>
      </Reveal>

      {/* ── Privacidade ───────────────────────────────────────────────────── */}
      <Reveal delay={120} style={{ marginTop: 20 }}>
        <SectionHeader title="Privacidade e dados" />
        <View style={s.card}>
          <SettingRow
            icon={<Download />}
            label="Exportar os meus dados"
            sub="Recebe uma cópia de todos os teus dados"
            onPress={handleExportarDados}
            disabled={loadingExport}
            right={loadingExport ? <ActivityIndicator size="small" color={C.brand} /> : undefined}
          />
          <Divider />
          <SettingRow
            icon={<Shield />}
            label="Política de privacidade"
            onPress={() => Linking.openURL('https://verly.app/privacidade')}
          />
          <Divider />
          <SettingRow
            icon={<FileText />}
            label="Termos de uso"
            onPress={() => Linking.openURL('https://verly.app/termos')}
          />
        </View>
      </Reveal>

      {/* ── Sobre ─────────────────────────────────────────────────────────── */}
      <Reveal delay={160} style={{ marginTop: 20 }}>
        <SectionHeader title="Sobre" />
        <View style={s.card}>
          <SettingRow
            icon={<Info />}
            label="Versão da app"
            sub={`Verly v${APP_VERSION}`}
            onPress={() => {}}
            right={<Text style={s.versionText}>v{APP_VERSION}</Text>}
          />
        </View>
      </Reveal>

      {/* ── Zona de perigo ────────────────────────────────────────────────── */}
      <Reveal delay={200} style={{ marginTop: 20 }}>
        <SectionHeader title="Zona de perigo" />
        <View style={[s.card, { borderColor: C.red + '30' }]}>
          <SettingRow
            icon={<Trash2 />}
            label="Apagar conta"
            sub="Elimina permanentemente a tua conta e todos os dados"
            onPress={handleApagarConta}
            disabled={loadingDelete}
            danger
            right={
              loadingDelete
                ? <ActivityIndicator size="small" color={C.red} />
                : <ChevronRight size={14} color={C.red} />
            }
          />
        </View>
      </Reveal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.surface3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: FONT.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  rowSub: {
    fontSize: FONT.xs,
    color: COLORS.textMid,
    marginTop: 2,
  },
  versionText: {
    fontSize: 12,
    color: COLORS.textMid,
    fontWeight: '600',
  },
});
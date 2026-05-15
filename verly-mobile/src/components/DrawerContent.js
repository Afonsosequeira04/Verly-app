import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator, View, Text, StyleSheet,
  TouchableOpacity, ScrollView, SafeAreaView,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { useRevenueCat } from '../context/RevenueCatContext';

import LoginScreen         from '../screens/auth/LoginScreen';
import RegisterScreen      from '../screens/auth/RegisterScreen';
import DashboardScreen     from '../screens/DashboardScreen';
import FaturasScreen       from '../screens/FaturasScreen';
import FaturaDetalheScreen from '../screens/FaturaDetalheScreen';
import ChatScreen          from '../screens/ChatScreen';
import SubscricoesScreen   from '../screens/SubscricoesScreen';
import PerfilScreen        from '../screens/PerfilScreen';
import NotificacoesScreen  from '../screens/NotificacoesScreen';
import MetasScreen         from '../screens/MetasScreen';
import EstatisticasScreen  from '../screens/EstatisticasScreen';
import ScoreScreen         from '../screens/ScoreScreen';
import ImpulseScreen       from '../screens/ImpulseScreen';
import RelatorioScreen     from '../screens/RelatorioScreen';
import HistoricoScreen     from '../screens/HistoricoScreen';

import TabIcon from '../components/TabIcon';

const Stack     = createStackNavigator();
const AuthStack = createStackNavigator();
const MainStack = createStackNavigator();
const Tab       = createBottomTabNavigator();

export const COLORS = {
  brand:   '#6C5CE7',
  bg:      '#0C0C14',
  surface: '#13131F',
  surface2:'#1C1C2E',
  border:  '#252540',
  text:    '#EEEEF8',
  textSub: '#7070A0',
  red:     '#FF5370',
  green:   '#00C896',
  yellow:  '#FFB300',
  brandDim:'rgba(108,92,231,0.15)',
  gold:    '#FFD700',
};

// ── Menu Screen ───────────────────────────────────────────────────────────────
function MenuScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { isPro } = useRevenueCat();

  const initials = user?.nome
    ? user.nome.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';

  const sections = [
    {
      label: 'SOCIAL',
      items: [
        { label: 'Amigos',             screen: 'Amigos',      icon: '👥' },
        { label: 'Playlists de compras',screen: 'Playlists',  icon: '🎵' },
      ],
    },
    {
      label: 'ANÁLISE',
      items: [
        { label: 'Estatísticas',  screen: 'Estatisticas', icon: '📊' },
        { label: 'Relatório',     screen: 'Relatorio',    icon: '📄' },
        { label: 'Histórico',     screen: 'Historico',    icon: '🕐' },
      ],
    },
    {
      label: 'FERRAMENTAS',
      items: [
        { label: 'Score de compra', screen: 'Score',       icon: '⭐' },
        {
          label:  isPro ? 'Modo Pro ✦' : 'Modo Pro',
          screen: 'Subscricoes',
          icon:   '👑',
          isPro:  true,
        },
      ],
    },
    {
      label: 'CONTA',
      items: [
        { label: 'Notificações', screen: 'Notificacoes', icon: '🔔' },
      ],
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>

        {/* Botão fechar */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ alignSelf: 'flex-end', marginBottom: 8 }}
          activeOpacity={0.7}
        >
          <Text style={{ color: COLORS.textSub, fontSize: 22 }}>✕</Text>
        </TouchableOpacity>

        {/* Profile */}
        <View style={mStyles.profileRow}>
          <View style={mStyles.avatar}>
            <Text style={mStyles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={mStyles.name}>{user?.nome || 'Utilizador'}</Text>
            <Text style={mStyles.email} numberOfLines={1}>{user?.email || ''}</Text>
          </View>
          {/* Badge Pro no perfil */}
          {isPro && (
            <View style={mStyles.proBadge}>
              <Text style={mStyles.proBadgeText}>✦ Pro</Text>
            </View>
          )}
        </View>

        <View style={mStyles.divider} />

        {/* Secções */}
        {sections.map(section => (
          <View key={section.label} style={{ marginBottom: 8 }}>
            <Text style={mStyles.sectionLabel}>{section.label}</Text>
            {section.items.map(item => {
              const isProItem = item.isPro;
              return (
                <TouchableOpacity
                  key={item.screen}
                  style={[
                    mStyles.item,
                    isProItem && !isPro && mStyles.itemProUnlocked,
                    isProItem && isPro  && mStyles.itemProActive,
                  ]}
                  onPress={() => navigation.navigate(item.screen)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                    <Text style={[
                      mStyles.itemText,
                      isProItem && isPro && { color: COLORS.gold },
                    ]}>
                      {item.label}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isProItem && !isPro && (
                      <View style={mStyles.lockBadge}>
                        <Text style={mStyles.lockBadgeText}>FREE</Text>
                      </View>
                    )}
                    {isProItem && isPro && (
                      <View style={mStyles.activeBadge}>
                        <Text style={mStyles.activeBadgeText}>ATIVO</Text>
                      </View>
                    )}
                    <Text style={{ color: COLORS.textSub }}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={mStyles.divider} />

        <TouchableOpacity style={mStyles.logout} onPress={logout} activeOpacity={0.7}>
          <Text style={mStyles.logoutText}>Terminar Sessão</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const mStyles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: COLORS.brandDim, borderWidth: 1.5, borderColor: COLORS.brand,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:  { fontSize: 17, fontWeight: '800', color: COLORS.brand },
  name:        { fontSize: 15, fontWeight: '700', color: COLORS.text },
  email:       { fontSize: 12, color: COLORS.textSub },
  divider:     { height: 1, backgroundColor: COLORS.border, marginVertical: 16 },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    color: COLORS.textSub, marginBottom: 4, marginTop: 8,
  },

  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  itemProUnlocked: {
    // nada especial — mostra FREE badge
  },
  itemProActive: {
    // item dourado quando Pro ativo
  },
  itemText: { fontSize: 15, fontWeight: '600', color: COLORS.text },

  proBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  proBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.gold },

  lockBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: COLORS.brandDim,
    borderWidth: 1, borderColor: COLORS.brand + '50',
  },
  lockBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.brand },

  activeBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  activeBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.gold },

  logout:     { paddingVertical: 14 },
  logoutText: { fontSize: 15, fontWeight: '700', color: COLORS.red },
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
function MainTabs({ navigation }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        headerStyle: { backgroundColor: COLORS.bg, shadowColor: 'transparent', elevation: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 18 },
        tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, borderTopWidth: 1, paddingBottom: 10, paddingTop: 8, height: 68 },
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.textSub,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
        tabBarIcon: ({ color, size }) => <TabIcon name={route.name} color={color} size={size} />,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Início', headerShown: false }}
      />
      <Tab.Screen name="Faturas"   component={FaturasScreen}   options={{ tabBarLabel: 'Faturas', headerTitle: 'Faturas' }} />
      <Tab.Screen name="Chat"      component={ChatScreen}      options={{ tabBarLabel: 'Chat IA', headerTitle: 'Chat IA' }} />
      <Tab.Screen name="Metas"     component={MetasScreen}     options={{ tabBarLabel: 'Metas',   headerTitle: 'Metas' }} />
      <Tab.Screen name="Perfil"    component={PerfilScreen}    options={{ tabBarLabel: 'Perfil',  headerTitle: 'Perfil' }} />
    </Tab.Navigator>
  );
}

// ── Main Stack ────────────────────────────────────────────────────────────────
function MainStackNav() {
  const commonHeader = {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.bg, shadowColor: 'transparent', elevation: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    headerTintColor: COLORS.text,
    headerTitleStyle: { fontWeight: '800', fontSize: 17 },
    headerBackTitleVisible: false,
  };

  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs"          component={MainTabs} />
      <MainStack.Screen name="Menu"          component={MenuScreen}          options={{ ...commonHeader, headerTitle: 'Menu', presentation: 'modal' }} />
      <MainStack.Screen name="FaturaDetalhe" component={FaturaDetalheScreen} options={{ ...commonHeader, headerTitle: 'Detalhe da Fatura' }} />
      <MainStack.Screen name="Notificacoes"  component={NotificacoesScreen}  options={{ ...commonHeader, headerTitle: 'Notificações' }} />
      <MainStack.Screen name="Subscricoes"   component={SubscricoesScreen}   options={{ ...commonHeader, headerTitle: 'Modo Pro' }} />
      <MainStack.Screen name="Estatisticas"  component={EstatisticasScreen}  options={{ ...commonHeader, headerTitle: 'Estatísticas' }} />
      <MainStack.Screen name="Score"         component={ScoreScreen}         options={{ ...commonHeader, headerTitle: 'Score de Compra' }} />
      <MainStack.Screen name="Impulse"       component={ImpulseScreen}       options={{ ...commonHeader, headerTitle: 'Impulse Control' }} />
      <MainStack.Screen name="Relatorio"     component={RelatorioScreen}     options={{ ...commonHeader, headerTitle: 'Relatório Mensal' }} />
      <MainStack.Screen name="Historico"     component={HistoricoScreen}     options={{ ...commonHeader, headerTitle: 'Histórico' }} />
    </MainStack.Navigator>
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login"    component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainStackNav} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
/**
 * src/navigation/AppNavigator.js
 * Drawer lateral + Tab bar em baixo + Stack para ecrãs secundários.
 * Badge de notificações actualizado a cada 60s em background.
 */

import React, { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator }      from '@react-navigation/stack';
import { createBottomTabNavigator }  from '@react-navigation/bottom-tabs';
import { createDrawerNavigator }     from '@react-navigation/drawer';

import { useAuth }        from '../context/AuthContext';
import { notificacoesAPI } from '../services/api';

// ── Ecrãs ─────────────────────────────────────────────────────────────────────
import LoginScreen        from '../screens/auth/LoginScreen';
import RegisterScreen     from '../screens/auth/RegisterScreen';
import DashboardScreen    from '../screens/DashboardScreen';
import FaturasScreen      from '../screens/FaturasScreen';
import FaturaDetalheScreen from '../screens/FaturaDetalheScreen';
import ChatScreen         from '../screens/ChatScreen';
import SubscricoesScreen  from '../screens/SubscricoesScreen';
import PerfilScreen       from '../screens/PerfilScreen';
import NotificacoesScreen from '../screens/NotificacoesScreen';
import MetasScreen        from '../screens/MetasScreen';
import EstatisticasScreen from '../screens/EstatisticasScreen';
import ScoreScreen        from '../screens/ScoreScreen';
import ImpulseScreen      from '../screens/ImpulseScreen';
import RelatorioScreen    from '../screens/RelatorioScreen';
import HistoricoScreen    from '../screens/HistoricoScreen';

import TabIcon     from '../components/TabIcon';
import DrawerContent from '../components/DrawerContent';

const Stack   = createStackNavigator();
const Tab     = createBottomTabNavigator();
const AuthStack = createStackNavigator();
const MainStack = createStackNavigator();
const Drawer  = createDrawerNavigator();

export const COLORS = {
  brand:   '#6C5CE7',
  bg:      '#0C0C14',
  surface: '#13131F',
  border:  '#252540',
  text:    '#EEEEF8',
  textSub: '#7070A0',
  red:     '#FF5370',
  green:   '#00C896',
  yellow:  '#FFB300',
};

// ── Botão hamburger para o header ─────────────────────────────────────────────
function HamburgerBtn({ onPress, badgeCount }) {
  return (
    <TouchableOpacity onPress={onPress} style={hStyles.wrap} activeOpacity={0.7}>
      <View style={hStyles.line} />
      <View style={[hStyles.line, { width: 16 }]} />
      <View style={hStyles.line} />
      {badgeCount > 0 && (
        <View style={hStyles.badge}>
          <Text style={hStyles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const hStyles = StyleSheet.create({
  wrap:  { padding: 14, marginLeft: 4, position: 'relative' },
  line:  { width: 22, height: 2, backgroundColor: COLORS.text, borderRadius: 2, marginVertical: 2.5 },
  badge: {
    position: 'absolute', top: 8, right: 6,
    backgroundColor: COLORS.red, borderRadius: 8,
    minWidth: 16, height: 16,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
});

// ── Tabs principais ───────────────────────────────────────────────────────────
function MainTabs({ navigation, notifCount }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle:       { backgroundColor: COLORS.bg, shadowColor: 'transparent', elevation: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
        headerTintColor:   COLORS.text,
        headerTitleStyle:  { fontWeight: '800', fontSize: 18 },
        headerLeft: () => (
          <HamburgerBtn
            onPress={() => navigation.openDrawer()}
            badgeCount={notifCount}
          />
        ),
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor:  COLORS.border,
          borderTopWidth:  1,
          paddingBottom:   10,
          paddingTop:      8,
          height:          68,
        },
        tabBarActiveTintColor:   COLORS.brand,
        tabBarInactiveTintColor: COLORS.textSub,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
        tabBarIcon: ({ color, size }) => (
          <TabIcon name={route.name} color={color} size={size} />
        ),
      })}
    >
      <Tab.Screen name="Dashboard"  component={DashboardScreen}  options={{ tabBarLabel: 'Início',  headerTitle: 'Verly' }} />
      <Tab.Screen name="Faturas"    component={FaturasScreen}     options={{ tabBarLabel: 'Faturas', headerTitle: 'Faturas' }} />
      <Tab.Screen name="Chat"       component={ChatScreen}        options={{ tabBarLabel: 'Chat IA', headerTitle: 'Chat IA' }} />
      <Tab.Screen name="Metas"      component={MetasScreen}       options={{ tabBarLabel: 'Metas',   headerTitle: 'Metas' }} />
      <Tab.Screen name="Perfil"     component={PerfilScreen}      options={{ tabBarLabel: 'Perfil',  headerTitle: 'Perfil' }} />
    </Tab.Navigator>
  );
}

// ── Stack com ecrãs secundários ───────────────────────────────────────────────
function MainStackNav({ navigation, notifCount }) {
  const commonHeader = {
    headerShown: true,
    headerStyle:      { backgroundColor: COLORS.bg, shadowColor: 'transparent', elevation: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    headerTintColor:  COLORS.text,
    headerTitleStyle: { fontWeight: '800', fontSize: 17 },
    headerBackTitleVisible: false,
  };

  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs">
        {(props) => <MainTabs {...props} notifCount={notifCount} />}
      </MainStack.Screen>

      <MainStack.Screen name="FaturaDetalhe" component={FaturaDetalheScreen}
        options={{ ...commonHeader, headerTitle: 'Detalhe da Fatura' }} />
      <MainStack.Screen name="Notificacoes"  component={NotificacoesScreen}
        options={{ ...commonHeader, headerTitle: 'Notificações' }} />
      <MainStack.Screen name="Subscricoes"   component={SubscricoesScreen}
        options={{ ...commonHeader, headerTitle: 'Subscrições' }} />
      <MainStack.Screen name="Estatisticas"  component={EstatisticasScreen}
        options={{ ...commonHeader, headerTitle: 'Estatísticas' }} />
      <MainStack.Screen name="Score"         component={ScoreScreen}
        options={{ ...commonHeader, headerTitle: 'Score de Compra' }} />
      <MainStack.Screen name="Impulse"       component={ImpulseScreen}
        options={{ ...commonHeader, headerTitle: 'Impulse Control' }} />
      <MainStack.Screen name="Relatorio"     component={RelatorioScreen}
        options={{ ...commonHeader, headerTitle: 'Relatório Mensal' }} />
      <MainStack.Screen name="Historico"     component={HistoricoScreen}
        options={{ ...commonHeader, headerTitle: 'Histórico' }} />
    </MainStack.Navigator>
  );
}

// ── Drawer que envolve tudo ───────────────────────────────────────────────────
function DrawerNav() {
  const [notifCount, setNotifCount] = useState(0);
  const intervalRef = useRef(null);

  const fetchNotifCount = async () => {
    try {
      const data = await notificacoesAPI.listar();
      setNotifCount(data.notificacoes?.length || 0);
    } catch (_) {}
  };

  useEffect(() => {
    fetchNotifCount();
    intervalRef.current = setInterval(fetchNotifCount, 60_000); // polling 60s
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <Drawer.Navigator
      drawerContent={(props) => (
        <DrawerContent {...props} notifCount={notifCount} />
      )}
      screenOptions={{
        headerShown:       false,
        drawerType:        'slide',
        drawerStyle:       { backgroundColor: '#0C0C14', width: 290 },
        overlayColor:      'rgba(0,0,0,0.6)',
        swipeEdgeWidth:    60,
        sceneContainerStyle: { backgroundColor: '#0C0C14' },
      }}
    >
      <Drawer.Screen name="MainStack">
        {(props) => <MainStackNav {...props} notifCount={notifCount} />}
      </Drawer.Screen>
    </Drawer.Navigator>
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
          <Stack.Screen name="Main" component={DrawerNav} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
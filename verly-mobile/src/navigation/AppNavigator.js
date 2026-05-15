// src/navigation/AppNavigator.js — Verly completo sem emojis no menu
import 'react-native-gesture-handler';
import React, { useRef, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView,
  ActivityIndicator, StyleSheet, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer }      from '@react-navigation/native';
import { createStackNavigator }     from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, {
  Path, Line, Polyline, Circle, Rect,
} from 'react-native-svg';

import { useAuth }             from '../context/AuthContext';
import WelcomeScreen           from '../screens/auth/WelcomeScreen';
import LoginScreen             from '../screens/auth/LoginScreen';
import RegisterScreen          from '../screens/auth/RegisterScreen';
import ConfirmEmailScreen      from '../screens/auth/ConfirmEmailScreen';
import OnboardingScreen        from '../screens/OnboardingScreen';
import DashboardScreen         from '../screens/DashboardScreen';
import FaturasScreen           from '../screens/FaturasScreen';
import FaturaDetalheScreen     from '../screens/FaturaDetalheScreen';
import ChatScreen              from '../screens/ChatScreen';
import SubscricoesScreen       from '../screens/SubscricoesScreen';
import PerfilScreen            from '../screens/PerfilScreen';
import NotificacoesScreen      from '../screens/NotificacoesScreen';
import MetasScreen             from '../screens/MetasScreen';
import EstatisticasScreen      from '../screens/EstatisticasScreen';
import ScoreScreen             from '../screens/ScoreScreen';
import RelatorioScreen         from '../screens/RelatorioScreen';
import HistoricoScreen         from '../screens/HistoricoScreen';
import CriarEmScreen           from '../screens/CriarEmScreen';
import AmigosScreen            from '../screens/AmigosScreen';

export const COLORS = {
  brand:    '#7C6FE0',
  brandMid: '#9D93E8',
  brandDim: 'rgba(124,111,224,0.12)',
  bg:       '#080810',
  surface:  '#0F0F1A',
  surface2: '#161624',
  surface3: '#1E1E30',
  border:   'rgba(255,255,255,0.06)',
  borderHi: 'rgba(255,255,255,0.11)',
  text:     '#EEEEF8',
  textMid:  '#8888B0',
  textSub:  '#50507A',
  green:    '#00D68F',
  red:      '#FF4D6D',
  yellow:   '#FFB300',
};

const C = COLORS;

const Stack     = createStackNavigator();
const AuthStack = createStackNavigator();
const MainStack = createStackNavigator();
const Tab       = createBottomTabNavigator();

// ─── Ícones SVG da tab bar ────────────────────────────────────────────────────
function TabIcon({ name, color, size = 22, focused }) {
  const s  = size * 0.82;
  const sw = focused ? '2.2' : '1.8';

  switch (name) {
    case 'Dashboard':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="3" y="3" width="7" height="7" rx="1.5" />
          <Rect x="14" y="3" width="7" height="7" rx="1.5" />
          <Rect x="3" y="14" width="7" height="7" rx="1.5" />
          <Rect x="14" y="14" width="7" height="7" rx="1.5" />
        </Svg>
      );
    case 'Faturas':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline points="14 2 14 8 20 8" />
          <Line x1="16" y1="13" x2="8" y2="13" />
          <Line x1="16" y1="17" x2="8" y2="17" />
        </Svg>
      );
    case 'Chat':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </Svg>
      );
    case 'Metas':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="10" />
          <Circle cx="12" cy="12" r="6" />
          <Circle cx="12" cy="12" r="2" />
        </Svg>
      );
    case 'Perfil':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <Circle cx="12" cy="7" r="4" />
        </Svg>
      );
    default:
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw}>
          <Circle cx="12" cy="12" r="10" />
        </Svg>
      );
  }
}

// ─── Ícones SVG para o menu lateral (sem emojis, sem Polygon) ─────────────────
function MenuIcon({ name, color = C.textMid, size = 16 }) {
  const sw = '1.8';
  switch (name) {
    case 'users':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <Circle cx="9" cy="7" r="4" />
          <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </Svg>
      );
    case 'playlist':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Line x1="8" y1="6" x2="21" y2="6" />
          <Line x1="8" y1="12" x2="21" y2="12" />
          <Line x1="8" y1="18" x2="21" y2="18" />
          <Line x1="3" y1="6" x2="3.01" y2="6" />
          <Line x1="3" y1="12" x2="3.01" y2="12" />
          <Line x1="3" y1="18" x2="3.01" y2="18" />
        </Svg>
      );
    case 'barchart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Line x1="18" y1="20" x2="18" y2="10" />
          <Line x1="12" y1="20" x2="12" y2="4" />
          <Line x1="6" y1="20" x2="6" y2="14" />
        </Svg>
      );
    case 'filereport':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline points="14 2 14 8 20 8" />
          <Line x1="16" y1="13" x2="8" y2="13" />
          <Line x1="16" y1="17" x2="8" y2="17" />
        </Svg>
      );
    case 'clock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="10" />
          <Polyline points="12 6 12 12 16 14" />
        </Svg>
      );
    case 'star':
      // Polygon não existe no react-native-svg — usar Path
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </Svg>
      );
    case 'shield':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </Svg>
      );
    case 'bell':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </Svg>
      );
    case 'logout':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <Polyline points="16 17 21 12 16 7" />
          <Line x1="21" y1="12" x2="9" y2="12" />
        </Svg>
      );
    default:
      return null;
  }
}

// ─── Botão hambúrguer (reutilizável) ──────────────────────────────────────────
function MenuButton({ onPress }) {
  return (
    <Pressable onPress={onPress} style={{ paddingRight: 16, paddingLeft: 8 }} hitSlop={8}>
      <View style={{ gap: 4 }}>
        <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: C.text }} />
        <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: C.textMid }} />
        <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: C.textMid }} />
      </View>
    </Pressable>
  );
}

// ─── Menu Screen (fullscreen, animado, sem emojis) ────────────────────────────
function MenuScreen({ navigation }) {
  const { user, logout } = useAuth();
  const translateX = useRef(new Animated.Value(-320)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, damping: 24, stiffness: 180, useNativeDriver: true }),
    ]).start();
  }, []);

  const closeAndGo = (screen) => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: -320, duration: 200, useNativeDriver: true }),
    ]).start(() => navigation.navigate(screen));
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: -320, duration: 200, useNativeDriver: true }),
    ]).start(() => navigation.goBack());
  };

  const initials = (n = '') =>
    n.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

  const groups = [
    {
      label: 'Social',
      items: [
        { label: 'Amigos',               screen: 'Amigos',      icon: 'users'     },
        { label: 'Playlists de compras',  screen: 'CriarEm',    icon: 'playlist'  },
      ],
    },
    {
      label: 'Análise',
      items: [
        { label: 'Estatísticas', screen: 'Estatisticas', icon: 'barchart'  },
        { label: 'Relatório',    screen: 'Relatorio',    icon: 'filereport'},
        { label: 'Histórico',    screen: 'Historico',    icon: 'clock'     },
      ],
    },
    {
      label: 'Ferramentas',
      items: [
        { label: 'Score de compra', screen: 'Score',       icon: 'star'   },
        { label: 'Subscrições',     screen: 'Subscricoes', icon: 'shield' },
      ],
    },
    {
      label: 'Conta',
      items: [
        { label: 'Notificações', screen: 'Notificacoes', icon: 'bell' },
      ],
    },
  ];

  return (
    <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', opacity }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      <Animated.View style={[ms.sidebar, { transform: [{ translateX }] }]}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>

            {/* Cabeçalho */}
            <View style={ms.header}>
              <View style={ms.avatar}>
                <Text style={ms.avatarText}>{initials(user?.nome)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ms.name}>{user?.nome || 'Utilizador'}</Text>
                <Text style={ms.email}>{user?.email || ''}</Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={12} style={ms.closeBtn}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.textMid} strokeWidth="2" strokeLinecap="round">
                  <Line x1="18" y1="6" x2="6" y2="18" />
                  <Line x1="6" y1="6" x2="18" y2="18" />
                </Svg>
              </Pressable>
            </View>

            <View style={ms.divider} />

            {/* Grupos */}
            {groups.map(g => (
              <View key={g.label} style={{ marginBottom: 24 }}>
                <Text style={ms.groupLabel}>{g.label}</Text>
                {g.items.map(item => (
                  <Pressable
                    key={item.screen}
                    onPress={() => closeAndGo(item.screen)}
                    style={({ pressed }) => [ms.item, pressed && { backgroundColor: C.surface2 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={ms.iconWrap}>
                        <MenuIcon name={item.icon} color={C.brand} size={15} />
                      </View>
                      <Text style={ms.itemText}>{item.label}</Text>
                    </View>
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.textMid} strokeWidth="2" strokeLinecap="round">
                      <Polyline points="9 18 15 12 9 6" />
                    </Svg>
                  </Pressable>
                ))}
              </View>
            ))}

            <View style={ms.divider} />

            <Pressable
              onPress={() => {
                handleClose();
                setTimeout(logout, 300);
              }}
              style={ms.logout}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <MenuIcon name="logout" size={16} />
                <Text style={ms.logoutText}>Terminar sessão</Text>
              </View>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </Animated.View>
  );
}

const ms = StyleSheet.create({
  sidebar: {
    width: 300,
    flex: 1,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: C.brandDim, borderWidth: 1.5, borderColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '900', color: C.brand },
  name:       { fontSize: 15, fontWeight: '700', color: C.text },
  email:      { fontSize: 12, color: C.textMid },
  closeBtn:   { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },

  divider:    { height: 1, backgroundColor: C.border, marginVertical: 16 },
  groupLabel: {
    fontSize: 10, fontWeight: '800', color: C.textMid,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
  },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 10, marginBottom: 2,
  },
  iconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: C.brandDim,
    justifyContent: 'center', alignItems: 'center',
  },
  itemText:   { fontSize: 14, fontWeight: '600', color: C.text },
  logout:     { paddingVertical: 14 },
  logoutText: { fontSize: 15, fontWeight: '700', color: C.red },
});

// ─── Tab Bar customizada ──────────────────────────────────────────────────────
function CustomTabBar({ state, descriptors, navigation }) {
  return (
    <View style={tb.container}>
      {state.routes.map((route, idx) => {
        const focused = state.index === idx;
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel || route.name;
        const scale = useRef(new Animated.Value(1)).current;

        const onPress = () => {
          Animated.sequence([
            Animated.timing(scale, { toValue: 0.88, duration: 80,  useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1,    speed: 20, bounciness: 8, useNativeDriver: true }),
          ]).start();

          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        const color = focused ? C.brand : C.textMid;

        return (
          <Pressable key={route.key} onPress={onPress} style={tb.tab}>
            <Animated.View style={[tb.tabInner, { transform: [{ scale }] }, focused && tb.tabActive]}>
              <TabIcon name={route.name} color={color} focused={focused} />
            </Animated.View>
            <Text style={[tb.label, focused && { color: C.brand }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const tb = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingBottom: 20, paddingTop: 10,
    paddingHorizontal: 8,
  },
  tab:       { flex: 1, alignItems: 'center', gap: 4 },
  tabInner:  {
    width: 42, height: 36, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  tabActive: { backgroundColor: C.brandDim },
  label:     { fontSize: 10, fontWeight: '700', color: C.textMid, letterSpacing: 0.2 },
});

// ─── Tabs principais ──────────────────────────────────────────────────────────
function MainTabs({ navigation }) {
  const menuBtn = () => (
    <MenuButton onPress={() => navigation.navigate('Menu')} />
  );

  const hdrStyle = {
    headerStyle: {
      backgroundColor: C.bg, shadowColor: 'transparent',
      elevation: 0, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    headerTintColor: C.text,
    headerTitleStyle: { fontWeight: '800', fontSize: 17, color: C.text },
    headerRight: menuBtn,
  };

  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: true, ...hdrStyle }}
    >
      {/*
        Dashboard: headerShown: true agora, para que o botão do menu apareça.
        O DashboardScreen gere o seu próprio espaçamento com useSafeAreaInsets.
      */}
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Início', headerShown: false }}
      />
      <Tab.Screen name="Faturas"   component={FaturasScreen}   options={{ tabBarLabel: 'Faturas', headerTitle: 'Faturas' }} />
      <Tab.Screen name="Chat"      component={ChatScreen}      options={{ tabBarLabel: 'Chat IA', headerTitle: 'Chat IA' }} />
      <Tab.Screen name="Metas"     component={MetasScreen}     options={{ tabBarLabel: 'Metas',   headerTitle: 'Metas'   }} />
      <Tab.Screen name="Perfil"    component={PerfilScreen}    options={{ tabBarLabel: 'Perfil',  headerTitle: 'Perfil'  }} />
    </Tab.Navigator>
  );
}

// ─── Main Stack ───────────────────────────────────────────────────────────────
function MainStackNav() {
  const hdr = {
    headerShown: true,
    headerStyle: {
      backgroundColor: C.bg, shadowColor: 'transparent',
      elevation: 0, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    headerTintColor: C.text,
    headerTitleStyle: { fontWeight: '800', fontSize: 17 },
    headerBackTitleVisible: false,
  };

  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs"          component={MainTabs} />
      <MainStack.Screen name="Menu"          component={MenuScreen}          options={{ presentation: 'transparentModal' }} />
      <MainStack.Screen name="FaturaDetalhe" component={FaturaDetalheScreen} options={{ ...hdr, headerTitle: 'Fatura' }} />
      <MainStack.Screen name="Notificacoes"  component={NotificacoesScreen}  options={{ ...hdr, headerTitle: 'Notificações' }} />
      <MainStack.Screen name="Subscricoes"   component={SubscricoesScreen}   options={{ ...hdr, headerTitle: 'Subscrições' }} />
      <MainStack.Screen name="Estatisticas"  component={EstatisticasScreen}  options={{ ...hdr, headerTitle: 'Estatísticas' }} />
      <MainStack.Screen name="Score"         component={ScoreScreen}         options={{ ...hdr, headerTitle: 'Score de compra' }} />
      <MainStack.Screen name="Relatorio"     component={RelatorioScreen}     options={{ ...hdr, headerTitle: 'Relatório' }} />
      <MainStack.Screen name="Historico"     component={HistoricoScreen}     options={{ ...hdr, headerTitle: 'Histórico' }} />
      <MainStack.Screen name="CriarEm"       component={CriarEmScreen}       options={{ ...hdr, headerTitle: 'Playlists de compras' }} />
      <MainStack.Screen name="Amigos"        component={AmigosScreen}        options={{ ...hdr, headerTitle: 'Amigos' }} />
    </MainStack.Navigator>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome"      component={WelcomeScreen} />
      <AuthStack.Screen name="Login"        component={LoginScreen} />
      <AuthStack.Screen name="Register"     component={RegisterScreen} />
      <AuthStack.Screen name="ConfirmEmail" component={ConfirmEmailScreen} />
      <AuthStack.Screen name="Onboarding"   component={OnboardingScreen} />
    </AuthStack.Navigator>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user
          ? user.onboarding_completo
            ? <Stack.Screen name="Main" component={MainStackNav} />
            : <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          : <Stack.Screen name="Auth" component={AuthNavigator} />
        }
      </Stack.Navigator>
    </NavigationContainer>
  );
}
/**
 * src/navigation/AppNavigator.js
 * Navegação principal da app.
 *
 * Estrutura:
 *   - Stack raiz → AuthStack | MainStack
 *   - AuthStack  → Login, Register
 *   - MainStack  → Bottom Tabs + ecrãs de detalhe
 *   - Bottom Tabs → Dashboard, Faturas, Chat, Subscrições, Perfil
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';

// ── Ecrãs de autenticação ─────────────────────────────────────────────────────
import LoginScreen    from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// ── Ecrãs principais ──────────────────────────────────────────────────────────
import DashboardScreen    from '../screens/DashboardScreen';
import FaturasScreen      from '../screens/FaturasScreen';
import FaturaDetalheScreen from '../screens/FaturaDetalheScreen';
import ChatScreen         from '../screens/ChatScreen';
import SubscricoesScreen  from '../screens/SubscricoesScreen';
import PerfilScreen       from '../screens/PerfilScreen';
import NotificacoesScreen from '../screens/NotificacoesScreen';

// ── Ícones (usar react-native-vector-icons ou emojis por simplicidade) ─────────
import TabIcon from '../components/TabIcon';

const Stack   = createNativeStackNavigator();
const Tab     = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();
const MainStack = createNativeStackNavigator();

// Cores e estilo global
export const COLORS = {
  brand:     '#534AB7',
  brandLight:'#EEF0FF',
  bg:        '#0F0F1A',
  surface:   '#1A1A2E',
  surface2:  '#22223A',
  border:    '#2E2E4E',
  text:      '#F0F0F8',
  textSub:   '#8888AA',
  green:     '#00D68F',
  red:       '#FF4757',
  yellow:    '#FFB800',
};


// ── Auth Stack ────────────────────────────────────────────────────────────────

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login"    component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}


// ── Bottom Tabs ───────────────────────────────────────────────────────────────

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown:    false,
        tabBarStyle:    {
          backgroundColor: COLORS.surface,
          borderTopColor:  COLORS.border,
          borderTopWidth:  1,
          paddingBottom:   8,
          paddingTop:      8,
          height:          64,
        },
        tabBarActiveTintColor:   COLORS.brand,
        tabBarInactiveTintColor: COLORS.textSub,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ color, size }) => (
          <TabIcon name={route.name} color={color} size={size} />
        ),
      })}
    >
      <Tab.Screen name="Dashboard"   component={DashboardScreen}   options={{ tabBarLabel: 'Início' }} />
      <Tab.Screen name="Faturas"     component={FaturasScreen}      options={{ tabBarLabel: 'Faturas' }} />
      <Tab.Screen name="Chat"        component={ChatScreen}         options={{ tabBarLabel: 'Chat IA' }} />
      <Tab.Screen name="Subscricoes" component={SubscricoesScreen}  options={{ tabBarLabel: 'Subs' }} />
      <Tab.Screen name="Perfil"      component={PerfilScreen}       options={{ tabBarLabel: 'Perfil' }} />
    </Tab.Navigator>
  );
}


// ── Main Stack (tabs + ecrãs de detalhe) ─────────────────────────────────────

function MainNavigator() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs"           component={MainTabs} />
      <MainStack.Screen name="FaturaDetalhe"  component={FaturaDetalheScreen} />
      <MainStack.Screen name="Notificacoes"   component={NotificacoesScreen} />
    </MainStack.Navigator>
  );
}


// ── Root Navigator ────────────────────────────────────────────────────────────

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
          <Stack.Screen name="Main" component={MainNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

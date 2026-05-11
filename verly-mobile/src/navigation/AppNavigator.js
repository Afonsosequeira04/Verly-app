import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator, View, Text, StyleSheet,
  TouchableOpacity, ScrollView, SafeAreaView,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { notificacoesAPI } from '../services/api';

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
};

function MenuScreen({ navigation }) {
  const { user, logout } = useAuth();

  const initials = user?.nome
    ? user.nome.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';

  const items = [
    { label: 'Histórico',       screen: 'Historico'    },
    { label: 'Relatório',       screen: 'Relatorio'    },
    { label: 'Score',           screen: 'Score'        },
    { label: 'Impulse Control', screen: 'Impulse'      },
    { label: 'Estatísticas',    screen: 'Estatisticas' },
    { label: 'Subscrições',     screen: 'Subscricoes'  },
    { label: 'Notificações',    screen: 'Notificacoes' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View style={mStyles.profileRow}>
          <View style={mStyles.avatar}>
            <Text style={mStyles.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={mStyles.name}>{user?.nome || 'Utilizador'}</Text>
            <Text style={mStyles.email}>{user?.email || ''}</Text>
          </View>
        </View>

        <View style={mStyles.divider} />

        {items.map(item => (
          <TouchableOpacity
            key={item.screen}
            style={mStyles.item}
            onPress={() => navigation.navigate(item.screen)}
            activeOpacity={0.7}
          >
            <Text style={mStyles.itemText}>{item.label}</Text>
            <Text style={{ color: COLORS.textSub }}>›</Text>
          </TouchableOpacity>
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
  avatarText: { fontSize: 17, fontWeight: '800', color: COLORS.brand },
  name:       { fontSize: 15, fontWeight: '700', color: COLORS.text },
  email:      { fontSize: 12, color: COLORS.textSub },
  divider:    { height: 1, backgroundColor: COLORS.border, marginVertical: 16 },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  itemText:   { fontSize: 15, fontWeight: '600', color: COLORS.text },
  logout:     { paddingVertical: 14 },
  logoutText: { fontSize: 15, fontWeight: '700', color: COLORS.red },
});

function MainTabs({ navigation }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.bg, shadowColor: 'transparent', elevation: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 18 },
        headerRight: () => (
          <TouchableOpacity onPress={() => navigation.navigate('Menu')} style={{ paddingRight: 16 }}>
            <Text style={{ color: COLORS.text, fontSize: 22 }}>☰</Text>
          </TouchableOpacity>
        ),
        tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, borderTopWidth: 1, paddingBottom: 10, paddingTop: 8, height: 68 },
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.textSub,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
        tabBarIcon: ({ color, size }) => <TabIcon name={route.name} color={color} size={size} />,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarLabel: 'Início',  headerTitle: 'Verly' }} />
      <Tab.Screen name="Faturas"   component={FaturasScreen}   options={{ tabBarLabel: 'Faturas', headerTitle: 'Faturas' }} />
      <Tab.Screen name="Chat"      component={ChatScreen}      options={{ tabBarLabel: 'Chat IA', headerTitle: 'Chat IA' }} />
      <Tab.Screen name="Metas"     component={MetasScreen}     options={{ tabBarLabel: 'Metas',   headerTitle: 'Metas' }} />
      <Tab.Screen name="Perfil"    component={PerfilScreen}    options={{ tabBarLabel: 'Perfil',  headerTitle: 'Perfil' }} />
    </Tab.Navigator>
  );
}

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
      <MainStack.Screen name="Menu"          component={MenuScreen}          options={{ ...commonHeader, headerTitle: 'Menu' }} />
      <MainStack.Screen name="FaturaDetalhe" component={FaturaDetalheScreen} options={{ ...commonHeader, headerTitle: 'Detalhe da Fatura' }} />
      <MainStack.Screen name="Notificacoes"  component={NotificacoesScreen}  options={{ ...commonHeader, headerTitle: 'Notificações' }} />
      <MainStack.Screen name="Subscricoes"   component={SubscricoesScreen}   options={{ ...commonHeader, headerTitle: 'Subscrições' }} />
      <MainStack.Screen name="Estatisticas"  component={EstatisticasScreen}  options={{ ...commonHeader, headerTitle: 'Estatísticas' }} />
      <MainStack.Screen name="Score"         component={ScoreScreen}         options={{ ...commonHeader, headerTitle: 'Score de Compra' }} />
      <MainStack.Screen name="Impulse"       component={ImpulseScreen}       options={{ ...commonHeader, headerTitle: 'Impulse Control' }} />
      <MainStack.Screen name="Relatorio"     component={RelatorioScreen}     options={{ ...commonHeader, headerTitle: 'Relatório Mensal' }} />
      <MainStack.Screen name="Historico"     component={HistoricoScreen}     options={{ ...commonHeader, headerTitle: 'Histórico' }} />
    </MainStack.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login"    component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

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
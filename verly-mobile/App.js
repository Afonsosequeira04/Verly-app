import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { RevenueCatProvider } from './src/context/RevenueCatContext';
import AppNavigator, { COLORS } from './src/navigation/AppNavigator';

// ─── Wrapper que passa o userId ao RevenueCat depois do login ─────────────────
function AppWithRevenueCat() {
  const { user } = useAuth();
  return (
    <RevenueCatProvider userId={user?.id}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <AppNavigator />
    </RevenueCatProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppWithRevenueCat />
    </AuthProvider>
  );
}
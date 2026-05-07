/**
 * App.js — Ponto de entrada da app Verly Mobile
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator, { COLORS } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <AppNavigator />
    </AuthProvider>
  );
}

/**
 * src/screens/auth/LoginScreen.js
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../navigation/AppNavigator';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Erro', 'Preenche o email e a password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // Navegação automática pelo AuthContext → AppNavigator
    } catch (err) {
      Alert.alert('Erro', err.message || 'Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoWrap}>
          <Text style={styles.logo}>💰 Verly</Text>
          <Text style={styles.logoSub}>O teu assistente financeiro pessoal</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.title}>Entrar</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="o.teu@email.com"
            placeholderTextColor={COLORS.textSub}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={COLORS.textSub}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Entrar →</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkWrap}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.link}>Não tens conta? <Text style={styles.linkBold}>Regista-te</Text></Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  logoSub: {
    fontSize: 14,
    color: COLORS.textSub,
    marginTop: 6,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSub,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 15,
    padding: 12,
  },
  btn: {
    backgroundColor: COLORS.brand,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkWrap: {
    alignItems: 'center',
    marginTop: 16,
  },
  link: {
    color: COLORS.textSub,
    fontSize: 14,
  },
  linkBold: {
    color: COLORS.brand,
    fontWeight: '700',
  },
});

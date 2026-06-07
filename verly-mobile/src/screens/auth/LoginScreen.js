// src/screens/auth/LoginScreen.js — com Google Sign-In
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Alert, Animated, Easing, StyleSheet,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE } from '../../constants/theme';

const C = COLORS;

export default function LoginScreen({ navigation }) {
  const { login, loginWithGoogle } = useAuth();
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [loading,       setLoading]       = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [focused,       setFocused]       = useState(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const slideY  = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Email + Password ──────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password)
      return Alert.alert('Campos obrigatórios', 'Preenche o email e a password.');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // AuthContext atualiza o user → AppNavigator redireciona automaticamente
    } catch (err) {
      if (err.code === 'EMAIL_NOT_CONFIRMED') {
        // Redireciona para o ecrã de confirmação de email
        navigation.navigate('ConfirmEmail', { email: email.trim().toLowerCase() });
      } else {
        Alert.alert('Erro ao entrar', err.message || 'Credenciais inválidas.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Google Sign-In ────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setLoadingGoogle(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      if (err.message !== 'LOGIN_CANCELADO') {
        Alert.alert('Erro ao entrar com Google', err.message || 'Tenta novamente.');
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  const inputStyle = (name) => [s.input, focused === name && s.inputFocused];

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity, transform: [{ translateY: slideY }] }}>

          {/* Logo */}
          <View style={s.logoWrap}>
            <View style={s.logoMark}>
              <Text style={s.logoMarkText}>V</Text>
            </View>
            <Text style={s.logoText}>Verly</Text>
            <Text style={s.logoSub}>O teu assistente financeiro pessoal</Text>
          </View>

          {/* Card */}
          <View style={s.card}>
            <Text style={s.title}>Entrar</Text>

            {/* Google Sign-In */}
            <Pressable
              style={({ pressed }) => [s.btnGoogle, pressed && { opacity: 0.85 }, loadingGoogle && s.btnDisabled]}
              onPress={handleGoogle}
              disabled={loadingGoogle || loading}
            >
              {loadingGoogle ? (
                <ActivityIndicator color={C.text} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={s.googleIcon}>G</Text>
                  <Text style={s.btnGoogleText}>Continuar com Google</Text>
                </View>
              )}
            </Pressable>

            {/* Separador */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>ou entra com email</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Email */}
            <Text style={s.label}>Email</Text>
            <TextInput
              style={inputStyle('email')}
              value={email}
              onChangeText={setEmail}
              placeholder="o.teu@email.com"
              placeholderTextColor={C.textMid}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
            />

            {/* Password */}
            <Text style={[s.label, { marginTop: 14 }]}>Password</Text>
            <TextInput
              style={inputStyle('password')}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={C.textMid}
              secureTextEntry
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
            />

            {/* Botão Entrar */}
            <Pressable
              style={({ pressed }) => [s.btn, loading && s.btnDisabled, pressed && { opacity: 0.85 }]}
              onPress={handleLogin}
              disabled={loading || loadingGoogle}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Entrar</Text>
              }
            </Pressable>

            <Pressable style={s.link} onPress={() => navigation.navigate('Register')}>
              <Text style={s.linkText}>Não tens conta? <Text style={{ color: C.brand, fontWeight: '700' }}>Regista-te</Text></Text>
            </Pressable>
          </View>

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACE.lg },

  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoMark: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14,
  },
  logoMarkText: { fontSize: 22, fontWeight: '900', color: '#fff' },
  logoText: { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: 0 },
  logoSub:  { fontSize: FONT.sm, color: C.textMid, marginTop: 6 },

  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    padding: 24, borderWidth: 1, borderColor: C.border,
  },
  title: { fontSize: FONT.xxl, fontWeight: '800', color: C.text, marginBottom: 20 },
  label: { fontSize: FONT.xs, fontWeight: '700', color: C.textMid, marginBottom: 7, letterSpacing: 0.3 },

  btnGoogle: {
    backgroundColor: C.surface2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    alignItems: 'center',
    marginBottom: 6,
  },
  googleIcon:    { fontSize: 16, fontWeight: '900', color: '#4285F4' },
  btnGoogleText: { color: C.text, fontSize: FONT.md, fontWeight: '600' },

  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: FONT.xs, color: C.textMid },

  input: {
    backgroundColor: C.surface2, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border,
    color: C.text, fontSize: FONT.md, padding: 13,
  },
  inputFocused: { borderColor: C.brand + '70' },

  btn: {
    backgroundColor: C.brand, borderRadius: RADIUS.md,
    padding: 15, alignItems: 'center', marginTop: 24,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700', letterSpacing: 0.2 },

  link:     { alignItems: 'center', marginTop: 18 },
  linkText: { color: C.textMid, fontSize: FONT.sm },
});

// src/screens/auth/ConfirmEmailScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, ActivityIndicator,
  Alert, Animated, Easing, StyleSheet,
} from 'react-native';
import { authAPI } from '../../services/api';
import { COLORS, RADIUS, FONT, SPACE } from '../../constants/theme';

const C = COLORS;

export default function ConfirmEmailScreen({ navigation, route }) {
  const { email } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const slideY  = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleResend = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await authAPI.resendConfirm(email);
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Tenta novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <Animated.View style={[s.content, { opacity, transform: [{ translateY: slideY }] }]}>

        <View style={s.iconWrap}>
          <Text style={s.icon}>✉️</Text>
        </View>

        <Text style={s.title}>Confirma o teu email</Text>
        <Text style={s.sub}>
          Enviámos um link de confirmação para{'\n'}
          <Text style={s.email}>{email}</Text>
        </Text>

        <View style={s.card}>
          <Text style={s.step}>1. Abre o teu email</Text>
          <Text style={s.step}>2. Clica em "Confirmar Email"</Text>
          <Text style={s.step}>3. Volta à app e faz login</Text>
        </View>

        {sent && (
          <View style={s.successBanner}>
            <Text style={s.successText}>✅ Email reenviado!</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [s.btn, loading && s.btnDisabled, pressed && { opacity: 0.85 }]}
          onPress={handleResend}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Reenviar email</Text>
          }
        </Pressable>

        <Pressable style={s.link} onPress={() => navigation.navigate('Login')}>
          <Text style={s.linkText}>
            Já confirmei →{' '}
            <Text style={{ color: C.brand, fontWeight: '700' }}>Entrar</Text>
          </Text>
        </Pressable>

      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: SPACE.lg },
  content: { alignItems: 'center' },

  iconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(124,111,224,0.12)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 24,
  },
  icon:  { fontSize: 36 },
  title: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 12, textAlign: 'center' },
  sub:   { fontSize: 15, color: C.textMid, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  email: { color: C.brand, fontWeight: '600' },

  card: {
    width: '100%', backgroundColor: C.surface,
    borderRadius: RADIUS.lg, padding: 20, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  step: { fontSize: 15, color: C.text, lineHeight: 22 },

  successBanner: {
    backgroundColor: 'rgba(0,214,143,0.1)',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20,
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,214,143,0.2)',
  },
  successText: { color: '#00D68F', fontWeight: '600', fontSize: 14 },

  btn: {
    width: '100%', backgroundColor: C.brand,
    borderRadius: RADIUS.md, paddingVertical: 16,
    alignItems: 'center', marginBottom: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  link:     { paddingVertical: 8 },
  linkText: { color: C.textMid, fontSize: 14 },
});
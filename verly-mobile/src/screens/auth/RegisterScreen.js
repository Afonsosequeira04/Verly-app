// src/screens/auth/RegisterScreen.js — Redesign Luxury
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Alert, Animated, Easing, StyleSheet,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE } from '../../constants/theme';

const C = COLORS;

export default function RegisterScreen({ navigation, route }) {
  const { register } = useAuth();
  const [nome,     setNome]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [focused,  setFocused]  = useState(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const slideY  = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleRegister = async () => {
    if (!nome.trim() || !email.trim() || !password)
      return Alert.alert('Campos obrigatórios', 'Preenche todos os campos.');
    setLoading(true);
    try {
      const result = await register(nome.trim(), email.trim().toLowerCase(), password);
      // Navega para o ecrã de confirmação de email
      navigation.replace('ConfirmEmail', { email: result.email });
    } catch (err) {
      Alert.alert('Erro ao registar', err.message || 'Tenta novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (name) => [s.input, focused === name && s.inputFocused];

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity, transform: [{ translateY: slideY }] }}>

          <View style={s.logoWrap}>
            <View style={s.logoMark}>
              <Text style={s.logoMarkText}>V</Text>
            </View>
            <Text style={s.logoText}>Verly</Text>
            <Text style={s.logoSub}>Cria a tua conta gratuitamente</Text>
          </View>

          <View style={s.card}>
            <Text style={s.title}>Registo</Text>

            {[
              { label: 'Nome', key: 'nome', value: nome, set: setNome, placeholder: 'O teu nome', opts: {} },
              { label: 'Email', key: 'email', value: email, set: setEmail, placeholder: 'o.teu@email.com', opts: { keyboardType: 'email-address', autoCapitalize: 'none' } },
              { label: 'Password', key: 'password', value: password, set: setPassword, placeholder: '••••••••', opts: { secureTextEntry: true } },
            ].map(({ label, key, value, set, placeholder, opts }) => (
              <View key={key}>
                <Text style={[s.label, key !== 'nome' && { marginTop: 14 }]}>{label}</Text>
                <TextInput
                  style={inputStyle(key)}
                  value={value}
                  onChangeText={set}
                  placeholder={placeholder}
                  placeholderTextColor={C.textMid}
                  autoCorrect={false}
                  onFocus={() => setFocused(key)}
                  onBlur={() => setFocused(null)}
                  {...opts}
                />
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [s.btn, loading && s.btnDisabled, pressed && { opacity: 0.85 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Criar Conta</Text>
              }
            </Pressable>

            <Pressable style={s.link} onPress={() => navigation.navigate('Login')}>
              <Text style={s.linkText}>Já tens conta? <Text style={{ color: C.brand, fontWeight: '700' }}>Entrar</Text></Text>
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
    width: 52, height: 52, borderRadius: 16, backgroundColor: C.brand,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14,
  },
  logoMarkText: { fontSize: 22, fontWeight: '900', color: '#fff' },
  logoText:     { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: 0 },
  logoSub:      { fontSize: FONT.sm, color: C.textMid, marginTop: 6 },

  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    padding: 24, borderWidth: 1, borderColor: C.border,
  },
  title: { fontSize: FONT.xxl, fontWeight: '800', color: C.text, marginBottom: 20 },
  label: { fontSize: FONT.xs, fontWeight: '700', color: C.textMid, marginBottom: 7, letterSpacing: 0.3 },

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
  btnText:     { color: '#fff', fontSize: FONT.md, fontWeight: '700', letterSpacing: 0.2 },

  link:     { alignItems: 'center', marginTop: 18 },
  linkText: { color: C.textMid, fontSize: FONT.sm },
});

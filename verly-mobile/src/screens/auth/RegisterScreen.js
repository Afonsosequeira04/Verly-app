import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants/theme';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [nome, setNome]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!nome.trim() || !email.trim() || !password) {
      Alert.alert('Erro', 'Preenche todos os campos.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Erro', 'A password deve ter pelo menos 8 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await register(nome.trim(), email.trim().toLowerCase(), password);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Text style={styles.logo}>💰 Verly</Text>
          <Text style={styles.logoSub}>Começa a verificar as tuas finanças hoje.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Criar conta</Text>

          <Text style={styles.label}>Nome</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome}
            placeholder="O teu nome" placeholderTextColor={COLORS.textSub} autoCapitalize="words" />

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail}
            placeholder="o.teu@email.com" placeholderTextColor={COLORS.textSub}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPass}
            placeholder="Mínimo 8 caracteres" placeholderTextColor={COLORS.textSub} secureTextEntry />

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Criar conta →</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkWrap} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Já tens conta? <Text style={styles.linkBold}>Iniciar sessão</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: COLORS.bg },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap:  { alignItems: 'center', marginBottom: 36 },
  logo:      { fontSize: 32, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  logoSub:   { fontSize: 14, color: COLORS.textSub, marginTop: 6, textAlign: 'center' },
  card:      { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  title:     { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 20 },
  label:     { fontSize: 13, fontWeight: '600', color: COLORS.textSub, marginBottom: 6, marginTop: 12 },
  input:     { backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 15, padding: 12 },
  btn:       { backgroundColor: COLORS.brand, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.6 },
  btnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkWrap:  { alignItems: 'center', marginTop: 16 },
  link:      { color: COLORS.textSub, fontSize: 14 },
  linkBold:  { color: COLORS.brand, fontWeight: '700' },
});
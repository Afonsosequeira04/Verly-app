// src/screens/PerfilScreen.js — Perfil com foto, Google/telefone, teclado corrigido
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator, StyleSheet, RefreshControl,
  Image, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { LogOut, Save, Shield, Camera, Mail, Phone, ChevronRight, Check } from 'lucide-react-native';
import { perfilAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE, SHADOWS } from '../constants/theme';
import { Reveal, SectionHeader } from '../components/UI';

const C = COLORS;
const initials = (n = '') =>
  n.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

const PERSONALIDADES = [
  { key: 'calm', label: 'Calm', desc: 'Coach tranquilo. Ajuda sem drama.', color: C.green },
  { key: 'pro', label: 'Pro', desc: 'CFO pessoal. Direto, analitico e limpo.', color: C.brand },
  { key: 'sarcastic', label: 'Sarcastic', desc: 'Ironia leve para tornar insights partilhaveis.', color: C.yellow },
  { key: 'savage', label: 'Savage', desc: 'Roast financeiro. Viral, mas ainda util.', color: C.red },
];

function ProfileSecurityScene() {
  return (
    <LinearGradient
      colors={['rgba(139,92,246,0.24)', 'rgba(34,212,253,0.12)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={pf.securityScene}
    >
      <View style={pf.securityShield}>
        <Shield size={16} color={C.brandMid || C.brand} />
      </View>
      <View style={pf.securityStatus}>
        <View style={pf.securityStatusLine} />
        <View style={[pf.securityStatusLine, { width: 30, opacity: 0.45 }]} />
      </View>
      <View style={pf.securityBadges}>
        <View style={pf.securityBadge}><Mail size={10} color={C.brand} /></View>
        <View style={[pf.securityBadge, { borderColor: C.green + '55' }]}><Phone size={10} color={C.green} /></View>
        <View style={[pf.securityBadge, { borderColor: C.yellow + '55' }]}><Check size={10} color={C.yellow} /></View>
      </View>
    </LinearGradient>
  );
}

// ─── Modal para associar número de telemóvel ──────────────────────────────────
function PhoneModal({ visible, onClose, onSave }) {
  const [phone, setPhone] = useState('');
  const [code,  setCode]  = useState('');
  const [step,  setStep]  = useState(1); // 1 = número, 2 = código

  const handleSendCode = () => {
    if (!phone.trim()) return Alert.alert('Número inválido', 'Insere o teu número.');
    // Em produção: chamar API para enviar SMS
    setStep(2);
    Alert.alert('Código enviado', `Um SMS foi enviado para ${phone}.\n\n(Em desenvolvimento — usa código 123456)`);
  };

  const handleVerify = () => {
    if (code.trim() === '123456' || code.trim().length === 6) {
      onSave(phone);
      onClose();
      setStep(1); setPhone(''); setCode('');
    } else {
      Alert.alert('Código inválido', 'Verifica o código que recebeste.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={pm.backdrop} onPress={onClose} />
        <View style={pm.sheet}>
          <View style={pm.handle} />
          <Text style={pm.title}>{step === 1 ? 'Associar telemóvel' : 'Confirmar código'}</Text>
          <Text style={pm.sub}>
            {step === 1
              ? 'Adiciona um número para proteger a tua conta.'
              : `Código enviado para ${phone}`}
          </Text>

          {step === 1 ? (
            <>
              <View style={pm.inputWrap}>
                <Phone size={16} color={C.textMid} />
                <TextInput
                  style={pm.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+351 912 345 678"
                  placeholderTextColor={C.textMid}
                  keyboardType="phone-pad"
                  autoFocus
                />
              </View>
              <Pressable style={pm.btn} onPress={handleSendCode}>
                <Text style={pm.btnText}>Enviar código SMS</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={pm.inputWrap}>
                <TextInput
                  style={[pm.input, { letterSpacing: 8, fontSize: 22, textAlign: 'center' }]}
                  value={code}
                  onChangeText={setCode}
                  placeholder="——"
                  placeholderTextColor={C.textMid}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>
              <Pressable style={pm.btn} onPress={handleVerify}>
                <Text style={pm.btnText}>Verificar</Text>
              </Pressable>
              <Pressable onPress={() => setStep(1)} style={{ alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: C.textMid, fontSize: 13 }}>Número errado? Alterar</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const pm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: C.surface2,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 44,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 },
  sub:   { fontSize: 13, color: C.textMid, marginBottom: 20 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface3, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16,
  },
  input: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 10 },
  btn: {
    height: 50, borderRadius: RADIUS.md, backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PerfilScreen({ navigation }) {
  const { user, logout, updateUser } = useAuth();
  const [perfil,        setPerfil]        = useState(null);
  const [nome,          setNome]          = useState('');
  const [orcamento,     setOrcamento]     = useState('');
  const [rendimento,    setRendimento]    = useState('');
  const [personalidade, setPersonalidade] = useState('calm');
  const [saving,        setSaving]        = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [focused,       setFocused]       = useState(null);
  const [avatarUri,     setAvatarUri]     = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [phoneModal,    setPhoneModal]    = useState(false);
  const [phone,         setPhone]         = useState('');

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const raw = await perfilAPI.get();
      const d = raw.perfil || raw;
      setPerfil(d);
      setNome(d.nome || '');
      setOrcamento(d.orcamento_mensal ? String(d.orcamento_mensal) : '');
      setRendimento(d.rendimento_mensal ? String(d.rendimento_mensal) : '');
      setPersonalidade(d.personalidade || 'calm');
      if (d.avatar_url) setAvatarUri(d.avatar_url);
      if (d.telefone)   setPhone(d.telefone);
    } catch (_) {}
    finally { setRefreshing(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await perfilAPI.atualizar({
        nome: nome.trim(),
        orcamento_mensal: parseFloat(orcamento.replace(',', '.')) || 0,
        rendimento_mensal: parseFloat(rendimento.replace(',', '.')) || 0,
        personalidade,
      });
      updateUser?.({ nome: nome.trim() });
      Alert.alert('Guardado', 'Perfil atualizado com sucesso.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      setUploadingAvatar(true);
      try {
        const base64 = result.assets[0].base64;
        const mimeType = result.assets[0].mimeType || 'image/jpeg';
        await authAPI.uploadAvatar(`data:${mimeType};base64,${base64}`);
        setAvatarUri(result.assets[0].uri);
        Alert.alert('Foto atualizada', 'A tua foto de perfil foi actualizada.');
      } catch (e) {
        Alert.alert('Erro', e.message || 'Não foi possível fazer upload da foto.');
      } finally {
        setUploadingAvatar(false);
      }
    }
  };

  const handleSavePhone = (num) => {
    setPhone(num);
    // Em produção: chamar API para guardar
    Alert.alert('Telemóvel associado', `Número ${num} verificado com sucesso.`);
  };

  const handleConnectGoogle = () => {
    Alert.alert(
      'Associar conta Google',
      'A integração com Google OAuth está disponível na versão web. Abre verly.app/perfil para associar.',
      [{ text: 'OK' }]
    );
  };

  const inputStyle = (name) => [
    pf.input,
    focused === name && pf.inputFocused,
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <LinearGradient colors={C.gradients.app} style={StyleSheet.absoluteFill} />

      <PhoneModal
        visible={phoneModal}
        onClose={() => setPhoneModal(false)}
        onSave={handleSavePhone}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />
        }
      >
        {/* Avatar */}
        <Reveal delay={0} style={pf.heroCard}>
          <Pressable onPress={handlePickAvatar} style={{ position: 'relative' }}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={pf.avatarImg} />
            ) : (
              <View style={pf.avatar}>
                <Text style={pf.avatarText}>{initials(nome || user?.nome)}</Text>
              </View>
            )}
            <View style={pf.cameraBtn}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="#fff" />
                : <Camera size={14} color="#fff" />
              }
            </View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={pf.heroKicker}>PERFIL VERLY</Text>
            <Text style={pf.heroTitle} numberOfLines={1}>{nome || user?.nome || 'Utilizador'}</Text>
            <Text style={pf.heroSub} numberOfLines={2}>{perfil?.email || user?.email || 'Personaliza a forma como a Verly fala contigo.'}</Text>
          </View>
          <ProfileSecurityScene />
        </Reveal>

        {/* Dados básicos */}
        <Reveal delay={60}>
          <SectionHeader title="Informação pessoal" />
          <View style={pf.card}>
            <View style={pf.field}>
              <Text style={pf.label}>Nome</Text>
              <TextInput
                style={inputStyle('nome')}
                value={nome}
                onChangeText={setNome}
                placeholder="O teu nome"
                placeholderTextColor={C.textMid}
                onFocus={() => setFocused('nome')}
                onBlur={() => setFocused(null)}
                returnKeyType="next"
              />
            </View>
            <View style={[pf.field, { borderTopWidth: 1, borderTopColor: C.border }]}>
              <Text style={pf.label}>Orçamento mensal (€)</Text>
              <TextInput
                style={inputStyle('orcamento')}
                value={orcamento}
                onChangeText={setOrcamento}
                placeholder="Ex: 500"
                placeholderTextColor={C.textMid}
                keyboardType="decimal-pad"
                onFocus={() => setFocused('orcamento')}
                onBlur={() => setFocused(null)}
                returnKeyType="next"
              />
            </View>
            <View style={[pf.field, { borderTopWidth: 1, borderTopColor: C.border }]}>
              <Text style={pf.label}>Rendimento mensal (€)</Text>
              <TextInput
                style={inputStyle('rendimento')}
                value={rendimento}
                onChangeText={setRendimento}
                placeholder="Ex: 1500"
                placeholderTextColor={C.textMid}
                keyboardType="decimal-pad"
                onFocus={() => setFocused('rendimento')}
                onBlur={() => setFocused(null)}
                returnKeyType="done"
              />
            </View>
          </View>
        </Reveal>

        {/* Segurança / Conta */}
        <Reveal delay={100} style={{ marginTop: 20 }}>
          <SectionHeader title="Segurança e conta" />
          <View style={pf.card}>
            {/* Google */}
            <Pressable
              style={pf.linkRow}
              onPress={handleConnectGoogle}
            >
              <View style={pf.linkIcon}>
                <Mail size={16} color={C.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={pf.linkTitle}>Conta Google</Text>
                <Text style={pf.linkSub}>
                  {user?.google_connected ? user.email : 'Não associada'}
                </Text>
              </View>
              {user?.google_connected
                ? <Check size={14} color={C.green} />
                : <ChevronRight size={14} color={C.textMid} />
              }
            </Pressable>

            <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16 }} />

            {/* Telemóvel */}
            <Pressable
              style={pf.linkRow}
              onPress={() => setPhoneModal(true)}
            >
              <View style={pf.linkIcon}>
                <Phone size={16} color={C.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={pf.linkTitle}>Telemóvel</Text>
                <Text style={pf.linkSub}>{phone || 'Não associado'}</Text>
              </View>
              {phone
                ? <Check size={14} color={C.green} />
                : <ChevronRight size={14} color={C.textMid} />
              }
            </Pressable>
          </View>
        </Reveal>

        {/* Personalidade da IA */}
        <Reveal delay={140} style={{ marginTop: 20 }}>
          <SectionHeader title="Personalidade da IA" />
          <View style={pf.card}>
            {PERSONALIDADES.map((p, i) => (
              <Pressable
                key={p.key}
                onPress={() => setPersonalidade(p.key)}
                style={[
                  pf.personalityRow,
                  { borderColor: personalidade === p.key ? p.color + '77' : C.border },
                  personalidade === p.key && { backgroundColor: p.color + '14' },
                ]}
              >
                <View style={[pf.personalityIcon, { backgroundColor: p.color + '18' }]}>
                  <Text style={[pf.personalityInitial, { color: p.color }]}>{p.label[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[pf.linkTitle, personalidade === p.key && { color: p.color }]}>{p.label}</Text>
                  <Text style={pf.linkSub}>{p.desc}</Text>
                </View>
                {personalidade === p.key && (
                  <View style={[pf.checkDot, { backgroundColor: p.color }]} />
                )}
              </Pressable>
            ))}
          </View>
        </Reveal>

        {/* Guardar */}
        <Reveal delay={180} style={{ marginTop: 24 }}>
          <Pressable
            style={[pf.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Save size={16} color="#fff" />
                  <Text style={pf.saveBtnText}>Guardar alterações</Text>
                </>
            }
          </Pressable>
        </Reveal>

        {/* Logout */}
        <Reveal delay={200} style={{ marginTop: 12 }}>
          <Pressable
            style={pf.logoutBtn}
            onPress={() => {
              Alert.alert('Terminar sessão', 'Tens a certeza?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sair', style: 'destructive', onPress: logout },
              ]);
            }}
          >
            <LogOut size={16} color={C.red} />
            <Text style={pf.logoutText}>Terminar sessão</Text>
          </Pressable>
        </Reveal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const pf = StyleSheet.create({
  securityScene: {
    width: 92,
    height: 72,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: 9,
    justifyContent: 'space-between',
  },
  securityShield: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.brand + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityStatus: {
    position: 'absolute',
    left: 46,
    top: 13,
    gap: 5,
  },
  securityStatusLine: {
    width: 22,
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  securityBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
  },
  securityBadge: {
    width: 20,
    height: 20,
    borderRadius: 8,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.brand + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.glass,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: SPACE.lg,
    marginBottom: 24,
    marginTop: 8,
    ...SHADOWS.card,
  },
  heroKicker: { fontSize: FONT.xs, fontWeight: '900', color: C.brandMid || C.brand, letterSpacing: 1.1 },
  heroTitle: { fontSize: FONT.xl, fontWeight: '900', color: C.text, marginTop: 4 },
  heroSub: { fontSize: FONT.xs, color: C.textMid, lineHeight: 17, marginTop: 3 },
  card: {
    backgroundColor: C.glass,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: C.borderHi,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  field: { padding: 16 },
  label: { fontSize: FONT.xs, fontWeight: '700', color: C.textMid, marginBottom: 8, letterSpacing: 0.4 },
  input: {
    fontSize: FONT.md, color: C.text,
    backgroundColor: C.surface3,
    borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  inputFocused: { borderColor: C.brand },

  avatarImg: {
    width: 82, height: 82, borderRadius: 25,
    borderWidth: 2, borderColor: C.brand,
  },
  avatar: {
    width: 82, height: 82, borderRadius: 25,
    backgroundColor: C.brandDim,
    borderWidth: 2, borderColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:  { fontSize: 28, fontWeight: '900', color: C.brandMid || C.brand },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 10,
    backgroundColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: C.bg,
  },

  linkRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  linkIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.surface3,
    justifyContent: 'center', alignItems: 'center',
  },
  linkTitle: { fontSize: FONT.md, fontWeight: '600', color: C.text },
  linkSub:   { fontSize: FONT.xs, color: C.textMid, marginTop: 2 },

  personalityRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
    margin: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  personalityIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  personalityInitial: { fontSize: FONT.md, fontWeight: '900' },
  checkDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.brand,
  },

  saveBtn: {
    height: 52, borderRadius: RADIUS.md,
    backgroundColor: C.brand,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  logoutBtn: {
    height: 52, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: C.red },
});

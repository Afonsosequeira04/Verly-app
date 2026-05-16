// src/screens/ChatScreen.js — Redesign
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StyleSheet, Animated, Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Send, Zap } from 'lucide-react-native';
import { chatAPI, dashboardAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';

const C = COLORS;
const initials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

const SUGESTOES_FALLBACK = [
  'Quanto gastei este mês?',
  'Qual a minha categoria mais cara?',
  'Tenho garantias a expirar?',
  'Estou a cumprir as minhas metas?',
];

function Bubble({ item, userInitials }) {
  const isUser = item.role === 'user';
  const opacity  = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[
      s.bubbleRow,
      isUser ? s.bubbleRowUser : s.bubbleRowAI,
      { opacity, transform: [{ translateY }] },
    ]}>
      {!isUser && (
        <View style={s.aiAvatar}>
          <Zap size={13} color={C.brand} />
        </View>
      )}

      <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAI]}>
        <Text style={[s.bubbleText, isUser && { color: '#fff' }]}>{item.content}</Text>
      </View>

      {isUser && (
        <View style={s.userAvatar}>
          <Text style={s.userAvatarText}>{userInitials}</Text>
        </View>
      )}
    </Animated.View>
  );
}

export default function ChatScreen() {
  const { user } = useAuth();
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [focused,   setFocused]   = useState(false);
  const [sugestoes, setSugestoes] = useState(SUGESTOES_FALLBACK);

  useEffect(() => {
    dashboardAPI.get().then(data => {
      const s = [];
      const totalGasto = data.total_gasto || 0;
      const orcamento  = data.orcamento || 0;
      const pctOrc     = orcamento > 0 ? (totalGasto / orcamento) * 100 : 0;
      const topCat     = data.categorias?.[0]?.nome;
      const numFat     = data.num_faturas || 0;
      if (totalGasto > 0) s.push(`Gastei ${totalGasto.toFixed(0)}€ este mês. Está bem?`);
      if (pctOrc >= 80) s.push(`Usei ${Math.round(pctOrc)}% do orçamento. O que cortar?`);
      if (topCat) s.push(`Qual a tendência em ${topCat}?`);
      if (numFat === 0) s.push('Como começo a usar a Verly?');
      else s.push('Tenho garantias a expirar?');
      s.push('Estou a cumprir as minhas metas?');
      setSugestoes(s.slice(0, 4));
    }).catch(() => {});
  }, []);

  const listRef = useRef(null);

  useFocusEffect(useCallback(() => {
    loadHistory();
  }, []));

  const loadHistory = async () => {
    try {
      const d = await chatAPI.historico();
      const msgs = (d.conversas || []).flatMap(c => [
        { id: `u-${c.id}`, role: 'user',      content: c.pergunta },
        { id: `a-${c.id}`, role: 'assistant', content: c.resposta },
      ]);
      setMessages(msgs);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (_) {}
  };

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');

    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const d = await chatAPI.enviar(msg);
      const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', content: d.resposta || d.response || '—' };
      setMessages(prev => [...prev, aiMsg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Erro ao responder. Tenta novamente.' }]);
    } finally {
      setSending(false);
    }
  };

  const userInitials = initials(user?.nome);

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>

      {/* Mensagens */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: SPACE.md, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Zap size={24} color={C.brand} />
            </View>
            <Text style={s.emptyTitle}>Verly IA</Text>
            <Text style={s.emptySub}>Faz qualquer pergunta sobre as tuas finanças.</Text>
          </View>
        )}
        ListFooterComponent={sending ? (
          <View style={s.typingRow}>
            <View style={s.aiAvatar}>
              <Zap size={13} color={C.brand} />
            </View>
            <View style={[s.bubble, s.bubbleAI, { paddingVertical: 14, paddingHorizontal: 18 }]}>
              <ActivityIndicator size="small" color={C.brand} />
            </View>
          </View>
        ) : null}
        renderItem={({ item }) => <Bubble item={item} userInitials={userInitials} />}
      />

      {/* Sugestões (só quando vazio) */}
      {messages.length === 0 && (
        <View style={s.sugestoesWrap}>
          {sugestoes.map(s2 => (
            <Pressable key={s2} onPress={() => send(s2)}
              style={({ pressed }) => [s.sugestao, pressed && { opacity: 0.75 }]}>
              <Text style={s.sugestaoText}>{s2}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Input */}
      <View style={[s.inputBar, focused && { borderTopColor: C.brand + '40' }]}>
        <TextInput
          style={s.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Escreve uma mensagem…"
          placeholderTextColor={C.textMid}
          multiline
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => send()}
          blurOnSubmit
        />
        <Pressable
          onPress={() => send()}
          disabled={!input.trim() || sending}
          style={({ pressed }) => [s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled, pressed && { opacity: 0.8 }]}
        >
          <Send size={16} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  bubbleRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAI:   { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '78%', borderRadius: RADIUS.lg,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: C.brand,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: FONT.md, color: C.text, lineHeight: 21 },

  aiAvatar: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
  },
  userAvatar: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  userAvatarText: { fontSize: 11, fontWeight: '800', color: C.textMid },

  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },

  emptyWrap:  { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: C.brandDim, borderWidth: 1, borderColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: FONT.xl, fontWeight: '800', color: C.text },
  emptySub:   { fontSize: FONT.sm, color: C.textMid, textAlign: 'center', maxWidth: 240 },

  sugestoesWrap: {
    padding: SPACE.md, paddingTop: 0, gap: 8,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  sugestao: {
    backgroundColor: C.surface, borderRadius: RADIUS.pill,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: C.border,
  },
  sugestaoText: { fontSize: FONT.sm, color: C.textMid, fontWeight: '600' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: SPACE.md, paddingBottom: 24,
    borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  textInput: {
    flex: 1,
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border,
    color: C.text, fontSize: FONT.md,
    paddingHorizontal: 14, paddingVertical: 10,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: RADIUS.md,
    backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.surface2 },
});
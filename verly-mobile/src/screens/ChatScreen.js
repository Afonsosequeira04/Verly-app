/**
 * src/screens/ChatScreen.js
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from 'react-native';
import { chatAPI } from '../services/api';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

const SUGESTOES = [
  'Quanto gastei este mês?',
  'Qual a minha categoria mais cara?',
  'Tenho garantias a expirar?',
  'Onde gasto mais dinheiro?',
];

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
      {!isUser && <View style={styles.avatar}><Text style={styles.avatarText}>✦</Text></View>}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{msg.text}</Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [histLoading, setHistLoading] = useState(true);
  const flatRef = useRef(null);

  useEffect(() => {
    chatAPI.historico(20).then(data => {
      const msgs = [];
      (data.historico || []).forEach(c => {
        msgs.push({ id: `u-${c.id}`, role: 'user', text: c.pergunta });
        msgs.push({ id: `b-${c.id}`, role: 'bot',  text: c.resposta });
      });
      setMessages(msgs);
    }).catch(() => {}).finally(() => setHistLoading(false));
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const data = await chatAPI.enviar(text);
      setMessages(prev => [...prev, { id: Date.now().toString() + 'b', role: 'bot', text: data.resposta }]);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    Alert.alert('Limpar histórico', 'Tens a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: async () => {
        await chatAPI.limpar();
        setMessages([]);
      }},
    ]);
  };

  const allMessages = loading
    ? [...messages, { id: 'loading', role: 'bot', text: '...' }]
    : messages;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <Text style={styles.headerTitle}>Assistente Verly</Text>
        </View>
        <TouchableOpacity onPress={clearChat}>
          <Text style={styles.clearBtn}>Limpar</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {histLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.brand} /></View>
      ) : (
        <FlatList
          ref={flatRef}
          data={allMessages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatIcon}>✦</Text>
              <Text style={styles.emptyChatTitle}>Assistente Verly</Text>
              <Text style={styles.emptyChatSub}>Faz perguntas sobre as tuas faturas e gastos.</Text>
              <View style={styles.sugestoesWrap}>
                {SUGESTOES.map((s, i) => (
                  <TouchableOpacity key={i} style={styles.sugestao} onPress={() => { setInput(s); }}>
                    <Text style={styles.sugestaoText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            item.id === 'loading'
              ? <View style={styles.bubbleWrap}><View style={styles.avatar}><Text style={styles.avatarText}>✦</Text></View><View style={styles.bubbleBot}><Text style={styles.bubbleText}>...</Text></View></View>
              : <Bubble msg={item} />
          )}
        />
      )}

      {/* Input */}
      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Pergunta algo..."
          placeholderTextColor={COLORS.textSub}
          multiline
          maxLength={500}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={sendMessage} disabled={!input.trim() || loading}>
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  clearBtn: { fontSize: 13, color: COLORS.textSub, fontWeight: '600' },
  messageList: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  bubbleWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12, maxWidth: '82%' },
  bubbleWrapUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { width: 30, height: 30, borderRadius: 8, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bubble: { borderRadius: 14, padding: 12 },
  bubbleBot: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: COLORS.brand, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyChatIcon: { fontSize: 40, color: COLORS.brand, marginBottom: 12, opacity: 0.4 },
  emptyChatTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  emptyChatSub: { fontSize: 13, color: COLORS.textSub, marginBottom: 24, textAlign: 'center' },
  sugestoesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingHorizontal: 20 },
  sugestao: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  sugestaoText: { fontSize: 12, color: COLORS.textSub, fontWeight: '600' },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  input: { flex: 1, backgroundColor: COLORS.surface2, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 14, padding: 12, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, backgroundColor: COLORS.brand, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
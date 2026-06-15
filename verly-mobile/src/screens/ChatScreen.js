// src/screens/ChatScreen.js — Redesign
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StyleSheet, Animated, Easing, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Send, Zap, ChevronRight, Check, Trash2 } from 'lucide-react-native';
import {
  billsAPI,
  chatAPI,
  dashboardAPI,
  familiaAPI,
  gmailAPI,
  liveDealsAPI,
  metasAPI,
  netWorthAPI,
  openBankingAPI,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, RADIUS, FONT, SPACE } from '../constants/theme';
import RefinedEmptyState from '../components/RefinedEmptyState';

const C = COLORS;
const initials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

const SUGESTOES_FALLBACK = [
  'Quanto gastei este mês?',
  'Qual a minha categoria mais cara?',
  'Tenho garantias a expirar?',
  'Audita as minhas subscrições',
  'Adiciona 1000€ de poupança ao net worth',
];

function ActionCard({ action, onAction, executing }) {
  const isDanger = action.type === 'clear_chat';
  const isApi = [
    'add_live_deal_watch',
    'create_bills_from_subscriptions',
    'create_family_category_budget',
    'create_family_plan',
    'create_family_plan_and_invite',
    'create_family_plan_and_budget',
    'create_meta',
    'create_networth_item',
    'invite_family_member',
    'mark_family_expense',
    'sync_bank',
    'sync_gmail',
  ].includes(action.type);
  return (
    <Pressable
      onPress={() => onAction(action)}
      disabled={executing}
      style={({ pressed }) => [
        s.actionCard,
        isDanger && s.actionDanger,
        pressed && { opacity: 0.78 },
        executing && { opacity: 0.55 },
      ]}
    >
      <View style={[s.actionIcon, isDanger && { backgroundColor: C.redDim }]}>
        {isDanger
          ? <Trash2 size={13} color={C.red} />
          : isApi
            ? <Check size={13} color={C.green} />
            : <Zap size={13} color={C.brand} />
        }
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.actionLabel, isDanger && { color: C.red }]} numberOfLines={1}>
          {action.label}
        </Text>
        {!!action.description && (
          <Text style={s.actionDesc} numberOfLines={1}>{action.description}</Text>
        )}
      </View>
      {executing
        ? <ActivityIndicator size="small" color={isDanger ? C.red : C.brand} />
        : <ChevronRight size={14} color={C.textMid} />
      }
    </Pressable>
  );
}

function Bubble({ item, userInitials, onAction, executingActionId }) {
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
        {!isUser && Array.isArray(item.actions) && item.actions.length > 0 && (
          <View style={s.actionsWrap}>
            {item.actions.map(action => (
              <ActionCard
                key={action.id}
                action={action}
                onAction={onAction}
                executing={executingActionId === action.id}
              />
            ))}
          </View>
        )}
      </View>

      {isUser && (
        <View style={s.userAvatar}>
          <Text style={s.userAvatarText}>{userInitials}</Text>
        </View>
      )}
    </Animated.View>
  );
}

export default function ChatScreen({ navigation }) {
  const { user } = useAuth();
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [focused,   setFocused]   = useState(false);
  const [sugestoes, setSugestoes] = useState(SUGESTOES_FALLBACK);
  const [executingActionId, setExecutingActionId] = useState(null);

  useEffect(() => {
    dashboardAPI.get().then(data => {
      const s = [];
      const totalGasto = data.total_gasto || 0;
      const orcamento  = data.orcamento || 0;
      const pctOrc     = orcamento > 0 ? (totalGasto / orcamento) * 100 : 0;
      const topCatData = data.categorias?.[0];
      const topCat     = topCatData?.nome || topCatData?.categoria;
      const topTotal   = Number(topCatData?.total || topCatData?.valor || 0);
      const numFat     = data.num_faturas || 0;
      if (totalGasto > 0) s.push(`Gastei ${totalGasto.toFixed(0)}€ este mês. Está bem?`);
      if (pctOrc >= 80) s.push(`Usei ${Math.round(pctOrc)}% do orçamento. O que cortar?`);
      if (topCat) s.push(`Qual a tendência em ${topCat}?`);
      if (topCat && topTotal > 0) {
        const suggestedLimit = Math.max(20, Math.ceil((topTotal * 0.9) / 10) * 10);
        s.push(`Cria uma meta de ${topCat} de ${suggestedLimit}€`);
      }
      if (numFat === 0) s.push('Como começo a usar a Verly?');
      else s.push('Tenho garantias a expirar?');
      s.push('Quero dividir uma despesa com amigos');
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
      const rows = d.historico || d.conversas || [];
      const msgs = rows.flatMap(c => [
        { id: `u-${c.id}`, role: 'user',      content: c.pergunta },
        { id: `a-${c.id}`, role: 'assistant', content: c.resposta, actions: c.actions || [] },
      ]);
      setMessages(msgs);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (_) {}
  };

  const appendAssistant = (content) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      role: 'assistant',
      content,
    }]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const executeAction = async (action) => {
    if (!action) return;

    const run = async () => {
      setExecutingActionId(action.id);
      try {
        if (action.type === 'navigate') {
          navigation?.navigate(action.route, action.params || {});
          return;
        }

        if (action.type === 'create_meta') {
          const payload = action.payload || {};
          await metasAPI.criar(payload.nome || payload.categoria, payload.limite, payload.categoria);
          appendAssistant(`Feito. Criei a meta de ${payload.categoria} com limite de ${Number(payload.limite).toFixed(2)}€.`);
          return;
        }

        if (action.type === 'create_networth_item') {
          const payload = action.payload || {};
          await netWorthAPI.criarItem(payload);
          appendAssistant(`Feito. Adicionei ${payload.nome || 'o item'} ao net worth.`);
          return;
        }

        if (action.type === 'create_bills_from_subscriptions') {
          const bills = action.payload?.bills || [];
          for (const bill of bills) {
            await billsAPI.criar(bill);
          }
          appendAssistant(`Feito. Criei ${bills.length} bill${bills.length === 1 ? '' : 's'} a partir das subscricoes detetadas.`);
          return;
        }

        if (action.type === 'add_live_deal_watch') {
          const payload = action.payload || {};
          await liveDealsAPI.addWatch(payload);
          appendAssistant(`Feito. ${payload.product_name || 'O produto'} ficou na wishlist do Live Deals.`);
          navigation?.navigate('LiveDeals');
          return;
        }

        if (action.type === 'draft_refund_email') {
          const payload = action.payload || {};
          appendAssistant(`${payload.subject || 'Rascunho de reclamacao'}\n\n${payload.message || 'Nao encontrei uma oportunidade com rascunho pronto.'}`);
          if (payload.route) navigation?.navigate(payload.route, payload.params || {});
          return;
        }

        if (action.type === 'create_family_category_budget') {
          const payload = action.payload || {};
          await familiaAPI.salvarBudgetCategoria(payload);
          appendAssistant(`Feito. Criei o budget familiar de ${payload.category || 'categoria'} com limite de ${Number(payload.amount || payload.monthly_limit || 0).toFixed(2)}EUR.`);
          navigation?.navigate('FamilyPlan');
          return;
        }

        if (action.type === 'invite_family_member') {
          const payload = action.payload || {};
          const res = await familiaAPI.convidar(payload.email, payload.role || 'partner');
          const inviteLink = res?.invite?.invite_link;
          appendAssistant(inviteLink
            ? `Convite criado para ${payload.email}. Link: ${inviteLink}`
            : `Convite enviado para ${payload.email}.`);
          navigation?.navigate('FamilyPlan');
          return;
        }

        if (action.type === 'create_family_plan') {
          const payload = action.payload || {};
          const res = await familiaAPI.criar(payload);
          appendAssistant(res?.already_exists ? 'O plano familiar ja estava ativo.' : 'Feito. O plano familiar ficou ativo.');
          navigation?.navigate('FamilyPlan');
          return;
        }

        if (action.type === 'create_family_plan_and_invite') {
          const payload = action.payload || {};
          await familiaAPI.criar(payload.family || {});
          const res = await familiaAPI.convidar(payload.email, payload.role || 'partner');
          const inviteLink = res?.invite?.invite_link;
          appendAssistant(inviteLink
            ? `Plano familiar ativo. Convite criado para ${payload.email}: ${inviteLink}`
            : `Plano familiar ativo. Convite enviado para ${payload.email}.`);
          navigation?.navigate('FamilyPlan');
          return;
        }

        if (action.type === 'create_family_plan_and_budget') {
          const payload = action.payload || {};
          await familiaAPI.criar(payload.family || {});
          await familiaAPI.salvarBudgetCategoria(payload.budget || {});
          appendAssistant(`Plano familiar ativo. Budget de ${payload.budget?.category || 'categoria'} criado.`);
          navigation?.navigate('FamilyPlan');
          return;
        }

        if (action.type === 'mark_family_expense') {
          const payload = action.payload || {};
          await familiaAPI.marcarDespesa(payload);
          appendAssistant(`Feito. Marquei ${payload.description || 'a despesa'} como ${payload.include_family ? 'familiar' : 'pessoal'}.`);
          navigation?.navigate('FamilyPlan');
          return;
        }

        if (action.type === 'sync_gmail') {
          const res = await gmailAPI.sync();
          appendAssistant(`Feito. Gmail sincronizado: ${res?.faturas_criadas || res?.created || 0} faturas novas.`);
          return;
        }

        if (action.type === 'sync_bank') {
          const res = await openBankingAPI.sync();
          appendAssistant(`Feito. Banco sincronizado: ${res?.imported || res?.transactions_imported || 0} movimentos novos.`);
          return;
        }

        if (action.type === 'clear_chat') {
          await chatAPI.limpar();
          setMessages([]);
          return;
        }
      } catch (e) {
        appendAssistant(e.message || 'Não consegui executar essa ação.');
      } finally {
        setExecutingActionId(null);
      }
    };

    if (action.requires_confirmation) {
      Alert.alert(action.label, action.description || 'Queres executar esta ação?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Executar', onPress: run },
      ]);
      return;
    }

    await run();
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
      const aiMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: d.resposta || d.response || 'Não consegui encontrar uma resposta útil.',
        actions: d.actions || [],
      };
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
          <RefinedEmptyState
            framed={false}
            variant="command"
            accent={C.brand}
            icon={<Zap size={17} color={C.brandMid || C.brand} />}
            title="Verly IA"
            subtitle="Pede analise, cria metas, segue produtos ou prepara acoes financeiras com confirmacao."
            style={s.emptyWrap}
          />
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
        renderItem={({ item }) => (
          <Bubble
            item={item}
            userInitials={userInitials}
            onAction={executeAction}
            executingActionId={executingActionId}
          />
        )}
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
  actionsWrap: { marginTop: 10, gap: 8 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  actionDanger: { borderColor: `${C.red}35`, backgroundColor: C.redDim },
  actionIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: C.brandDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: C.text, fontSize: FONT.sm, fontWeight: '900' },
  actionDesc: { color: C.textMid, fontSize: FONT.xs, marginTop: 1 },

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

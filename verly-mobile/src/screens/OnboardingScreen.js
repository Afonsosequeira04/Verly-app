// src/screens/OnboardingScreen.js — com slide de rendimento mensal real
import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, Dimensions,
  ScrollView, Animated, Platform, StatusBar, TextInput, KeyboardAvoidingView,
} from 'react-native';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { authAPI, onboardingAPI } from '../services/api';

const { width: W, height: H } = Dimensions.get('window');

const C = {
  brand:    '#7C6FE0',
  brandDim: 'rgba(124,111,224,0.15)',
  brandHi:  'rgba(124,111,224,0.25)',
  bg:       '#080810',
  surface:  '#0F0F1A',
  surface2: '#161624',
  border:   'rgba(255,255,255,0.07)',
  borderHi: 'rgba(255,255,255,0.13)',
  text:     '#EEEEF8',
  textMid:  '#8888B0',
  green:    '#00D68F',
  yellow:   '#FFB300',
  red:      '#FF4D6D',
  pink:     '#EC4899',
};

// ─── Ícones SVG ───────────────────────────────────────────────────────────────
function Icon({ name, color, size = 56 }) {
  const sw = '1.6';
  switch (name) {
    case 'zap':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </Svg>
      );
    case 'receipt':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline points="14 2 14 8 20 8" />
          <Line x1="16" y1="13" x2="8" y2="13" />
          <Line x1="16" y1="17" x2="8" y2="17" />
        </Svg>
      );
    case 'chart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Line x1="18" y1="20" x2="18" y2="10" />
          <Line x1="12" y1="20" x2="12" y2="4" />
          <Line x1="6" y1="20" x2="6" y2="14" />
          <Line x1="2" y1="20" x2="22" y2="20" />
        </Svg>
      );
    case 'users':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <Circle cx="9" cy="7" r="4" />
          <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </Svg>
      );
    case 'wallet':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 12V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5z" />
          <Path d="M20 12h-4a2 2 0 0 0 0 4h4" />
        </Svg>
      );
    case 'target':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="10" />
          <Circle cx="12" cy="12" r="6" />
          <Circle cx="12" cy="12" r="2" />
        </Svg>
      );
    case 'robot':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="3" y="8" width="18" height="12" rx="3" />
          <Path d="M12 8V4" />
          <Circle cx="12" cy="3" r="1" />
          <Line x1="8" y1="13" x2="8" y2="15" />
          <Line x1="16" y1="13" x2="16" y2="15" />
          <Line x1="9" y1="17" x2="15" y2="17" />
        </Svg>
      );
    case 'euro':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 10h12" />
          <Path d="M4 14h12" />
          <Path d="M19.5 9a6.5 6.5 0 1 0 0 6" />
        </Svg>
      );
    default:
      return null;
  }
}

// ─── Slides ───────────────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: 'intro',
    type: 'info',
    icon: 'zap',
    accent: C.brand,
    title: 'Bem-vindo à Verly',
    sub: 'O teu assistente financeiro pessoal com IA. Vamos configurar o teu perfil em 2 minutos.',
    showLogin: true,
  },
  {
    id: 'faturas',
    type: 'info',
    icon: 'receipt',
    accent: C.green,
    title: 'Analisa as tuas faturas',
    sub: 'Tira foto ou faz upload de qualquer fatura. A IA extrai automaticamente os dados e categoriza as tuas despesas.',
  },
  {
    id: 'insights',
    type: 'info',
    icon: 'chart',
    accent: C.yellow,
    title: 'Insights em tempo real',
    sub: 'Gráficos interativos, alertas de garantias e sugestões personalizadas para poupares mais.',
  },
  {
    id: 'q_categoria',
    type: 'choice',
    icon: 'wallet',
    accent: C.pink,
    title: 'Onde gastas mais?',
    sub: 'Ajuda-nos a dar-te insights mais relevantes desde o início.',
    key: 'top_categoria',
    options: [
      { id: 'alimentacao', label: '🛒 Alimentação', sub: 'Supermercado, restaurantes' },
      { id: 'tecnologia',  label: '💻 Tecnologia',  sub: 'Gadgets, software, apps' },
      { id: 'moda',        label: '👗 Moda',         sub: 'Roupa, calçado, acessórios' },
      { id: 'lazer',       label: '🎮 Lazer',        sub: 'Entretenimento, viagens' },
      { id: 'casa',        label: '🏠 Casa',          sub: 'Mobília, eletrodomésticos' },
      { id: 'outro',       label: '📦 Outro',         sub: 'Diversificado' },
    ],
  },
  {
    id: 'q_objetivo',
    type: 'choice',
    icon: 'target',
    accent: C.green,
    title: 'Qual é o teu principal objetivo?',
    sub: 'Vamos focar os insights no que mais importa para ti.',
    key: 'objetivo',
    options: [
      { id: 'poupar',     label: '💰 Poupar mais',         sub: 'Reduzir despesas desnecessárias' },
      { id: 'controlar',  label: '📊 Controlar melhor',    sub: 'Saber para onde vai o dinheiro' },
      { id: 'garantias',  label: '🛡 Gerir garantias',      sub: 'Alertas de expiração de garantias' },
      { id: 'investir',   label: '📈 Planear investimento', sub: 'Entender onde posso cortar' },
    ],
  },
  // ── SLIDE NOVO: Rendimento mensal com input numérico ──────────────────────
  {
    id: 'q_rendimento',
    type: 'number_input',
    icon: 'euro',
    accent: C.green,
    title: 'Qual é o teu rendimento mensal?',
    sub: 'Usado apenas para calcular a % do rendimento que gastas. Fica sempre privado.',
    key: 'rendimento_mensal',
    placeholder: 'ex: 1500',
    suffix: '€ / mês',
    hint: 'Rendimento líquido (depois de impostos)',
    quickOptions: [
      { label: '< 800 €', value: '700' },
      { label: '1000 €',  value: '1000' },
      { label: '1500 €',  value: '1500' },
      { label: '2000 €',  value: '2000' },
      { label: '2500 €',  value: '2500' },
      { label: '3000+ €', value: '3500' },
    ],
    optional: true, // pode saltar
  },
  {
    id: 'q_orcamento',
    type: 'number_input',
    icon: 'wallet',
    accent: '#FF7340',
    title: 'Qual é o teu orçamento mensal?',
    sub: 'O limite que queres gastar por mês. A Verly avisa quando estás perto.',
    key: 'orcamento_mensal',
    placeholder: 'ex: 1000',
    suffix: '€ / mês',
    hint: 'Podes alterar a qualquer momento no Perfil',
    quickOptions: [
      { label: '300 €',  value: '300' },
      { label: '500 €',  value: '500' },
      { label: '800 €',  value: '800' },
      { label: '1000 €', value: '1000' },
      { label: '1500 €', value: '1500' },
      { label: '2000 €', value: '2000' },
    ],
    optional: true,
  },
  {
    id: 'q_personalidade',
    type: 'personality',
    icon: 'robot',
    accent: C.brand,
    title: 'Como queres que a Verly te fale?',
    sub: 'Escolhe a personalidade. Podes mudar quando quiseres.',
    key: 'personalidade',
    options: [
      { id: 'calm',      label: 'Equilibrada', emoji: '😌', desc: 'Tom neutro e profissional. Direto ao ponto, sem drama.',                 accent: C.green  },
      { id: 'savage',    label: 'Brutal',      emoji: '🔥', desc: 'Sem filtros. A Verly diz-te exatamente o que não queres ouvir.',         accent: C.red    },
      { id: 'sarcastic', label: 'Sarcástica',  emoji: '😏', desc: 'Humor negro financeiro. Comenta os teus gastos com ironia afiada.',      accent: C.yellow },
      { id: 'pro',       label: 'Analista',    emoji: '📊', desc: 'Dados, métricas e recomendações técnicas. Para quem quer profundidade.', accent: C.brand  },
    ],
  },
];

// ─── ChoiceOption ─────────────────────────────────────────────────────────────
function ChoiceOption({ option, selected, onPress, accent }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.spring(scale,  { toValue: 1, speed: 20, bounciness: 6, useNativeDriver: true }),
    ]).start();
    onPress(option.id);
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={handlePress}
        style={[
          cs.option,
          selected && { borderColor: accent, backgroundColor: accent + '18' },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[cs.optLabel, selected && { color: C.text }]}>{option.label}</Text>
          {option.sub ? <Text style={cs.optSub}>{option.sub}</Text> : null}
        </View>
        <View style={[cs.radio, selected && { borderColor: accent, backgroundColor: accent }]}>
          {selected && (
            <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── NumberInputSlide — input numérico com atalhos rápidos ────────────────────
function NumberInputSlide({ slide, answers, setAnswer }) {
  const value = answers[slide.key] || '';

  const handleQuick = (val) => {
    setAnswer(slide.key, val);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ width: W }}
    >
      <ScrollView
        contentContainerStyle={[s.slide, { justifyContent: 'flex-start', paddingTop: H * 0.07, paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.iconRingSmall, {
          borderColor: slide.accent + '50',
          backgroundColor: slide.accent + '12',
          marginBottom: 14,
        }]}>
          <Icon name={slide.icon} color={slide.accent} size={36} />
        </View>
        <Text style={[s.title, { marginBottom: 6 }]}>{slide.title}</Text>
        <Text style={[s.sub, { marginBottom: 28 }]}>{slide.sub}</Text>

        {/* Input principal */}
        <View style={[cs.numberInputWrap, { borderColor: value ? slide.accent : C.border }]}>
          <TextInput
            style={[cs.numberInput, { color: value ? C.text : C.textMid }]}
            placeholder={slide.placeholder}
            placeholderTextColor={C.textMid}
            keyboardType="numeric"
            value={value}
            onChangeText={(t) => {
              // Só aceita números
              const clean = t.replace(/[^0-9]/g, '');
              setAnswer(slide.key, clean);
            }}
            returnKeyType="done"
            maxLength={6}
          />
          <Text style={cs.numberSuffix}>{slide.suffix}</Text>
        </View>

        {slide.hint && (
          <Text style={[cs.optSub, { textAlign: 'center', marginBottom: 24 }]}>
            {slide.hint}
          </Text>
        )}

        {/* Atalhos rápidos */}
        <Text style={[cs.optSub, { marginBottom: 10, alignSelf: 'flex-start' }]}>Ou escolhe rapidamente:</Text>
        <View style={cs.quickGrid}>
          {slide.quickOptions.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => handleQuick(opt.value)}
              style={[
                cs.quickBtn,
                value === opt.value && { borderColor: slide.accent, backgroundColor: slide.accent + '18' },
              ]}
            >
              <Text style={[cs.quickLabel, value === opt.value && { color: slide.accent }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── PersonalityCard ──────────────────────────────────────────────────────────
function PersonalityCard({ option, selected, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const cardW = (W - 28 * 2 - 10) / 2;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.spring(scale,  { toValue: 1, speed: 20, bounciness: 6, useNativeDriver: true }),
    ]).start();
    onPress(option.id);
  };

  return (
    <Animated.View style={{ transform: [{ scale }], width: cardW }}>
      <Pressable
        onPress={handlePress}
        style={[
          cs.pCard,
          selected && { borderColor: option.accent, backgroundColor: option.accent + '15' },
        ]}
      >
        {selected && (
          <View style={[cs.pBadge, { backgroundColor: option.accent }]}>
            <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round">
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          </View>
        )}
        <Text style={cs.pEmoji}>{option.emoji}</Text>
        <Text style={[cs.pName, selected && { color: option.accent }]}>{option.label}</Text>
        <Text style={cs.pDesc}>{option.desc}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── InfoSlide ────────────────────────────────────────────────────────────────
function InfoSlide({ slide, onLogin }) {
  return (
    <View style={s.slide}>
      <View style={[s.glowCircle, { backgroundColor: slide.accent + '12' }]} />
      <View style={[s.iconRing, {
        borderColor: slide.accent + '50',
        backgroundColor: slide.accent + '12',
      }]}>
        <Icon name={slide.icon} color={slide.accent} size={64} />
      </View>
      <Text style={s.title}>{slide.title}</Text>
      <Text style={s.sub}>{slide.sub}</Text>
      {slide.showLogin && !slide.userLoggedIn && (
        <Pressable onPress={onLogin} style={s.alreadyHaveAccount}>
          <Text style={s.alreadyHaveAccountText}>Já tenho conta →</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── ChoiceSlide ──────────────────────────────────────────────────────────────
function ChoiceSlide({ slide, answers, setAnswer }) {
  const selected = answers[slide.key];
  return (
    <View style={[s.slide, { justifyContent: 'flex-start', paddingTop: H * 0.07 }]}>
      <View style={[s.iconRingSmall, {
        borderColor: slide.accent + '50',
        backgroundColor: slide.accent + '12',
      }]}>
        <Icon name={slide.icon} color={slide.accent} size={36} />
      </View>
      <Text style={[s.title, { marginBottom: 6 }]}>{slide.title}</Text>
      <Text style={[s.sub, { marginBottom: 20 }]}>{slide.sub}</Text>

      <ScrollView
        style={{ width: '100%' }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 20 }}
      >
        {slide.options.map((opt) => (
          <ChoiceOption
            key={opt.id}
            option={opt}
            selected={selected === opt.id}
            onPress={(id) => setAnswer(slide.key, id)}
            accent={slide.accent}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── PersonalitySlide ─────────────────────────────────────────────────────────
function PersonalitySlide({ slide, answers, setAnswer }) {
  const selected = answers[slide.key];
  const row1 = slide.options.slice(0, 2);
  const row2 = slide.options.slice(2, 4);

  return (
    <ScrollView
      style={{ width: W }}
      contentContainerStyle={[s.slide, { justifyContent: 'flex-start', paddingTop: H * 0.06, paddingBottom: 20 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.iconRingSmall, {
        borderColor: slide.accent + '50',
        backgroundColor: slide.accent + '12',
        marginBottom: 14,
      }]}>
        <Icon name={slide.icon} color={slide.accent} size={36} />
      </View>
      <Text style={[s.title, { marginBottom: 6 }]}>{slide.title}</Text>
      <Text style={[s.sub, { marginBottom: 22 }]}>{slide.sub}</Text>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10, width: '100%' }}>
        {row1.map((opt) => (
          <PersonalityCard
            key={opt.id} option={opt}
            selected={selected === opt.id}
            onPress={(id) => setAnswer(slide.key, id)}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
        {row2.map((opt) => (
          <PersonalityCard
            key={opt.id} option={opt}
            selected={selected === opt.id}
            onPress={(id) => setAnswer(slide.key, id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function OnboardingScreen({ navigation }) {
  const { user, updateUser } = useAuth();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({ personalidade: 'calm' });
  const scrollRef = useRef(null);
  const dotAnim   = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  const setAnswer = useCallback((key, val) => {
    setAnswers(prev => ({ ...prev, [key]: val }));
  }, []);

  const animateDots = (idx) => {
    SLIDES.forEach((_, i) => {
      Animated.timing(dotAnim[i], {
        toValue: i === idx ? 1 : 0,
        duration: 220,
        useNativeDriver: false,
      }).start();
    });
  };

  const goTo = (idx) => {
    scrollRef.current?.scrollTo({ x: W * idx, animated: true });
    setCurrent(idx);
    animateDots(idx);
  };

  const handleScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / W);
    if (idx !== current) { setCurrent(idx); animateDots(idx); }
  };

  const canProceed = () => {
    const slide = SLIDES[current];
    if (slide.type === 'choice' || slide.type === 'personality') {
      return !!answers[slide.key];
    }
    if (slide.type === 'number_input') {
      // Slides de número são opcionais — pode avançar sem preencher
      return true;
    }
    return true;
  };

  const saveAndFinish = async (dest) => {
    try {
      await AsyncStorage.setItem('@verly_onboarding_profile', JSON.stringify(answers));
    } catch (_) {}

    if (dest === 'Done') {
      try {
        // Usa o novo endpoint que guarda rendimento + objetivo
        await onboardingAPI.save(answers);
        updateUser({
          onboarding_completo: true,
          personalidade: answers.personalidade || 'calm',
          objetivo: answers.objetivo,
          orcamento_mensal: answers.orcamento_mensal ? parseFloat(answers.orcamento_mensal) : undefined,
          rendimento_mensal: answers.rendimento_mensal ? parseFloat(answers.rendimento_mensal) : undefined,
        });
      } catch (_) {
        // Fallback para endpoint antigo
        try { await authAPI.completeOnboarding(answers); } catch (_) {}
        updateUser({ onboarding_completo: true, personalidade: answers.personalidade || 'calm' });
      }
    } else if (dest === 'Register') {
      navigation.replace('Register', { onboardingAnswers: answers });
    } else {
      navigation.replace('Login');
    }
  };

  const isLast  = current === SLIDES.length - 1;
  const blocked = !canProceed();
  const slide   = SLIDES[current];
  const isOptional = slide.type === 'number_input' && slide.optional;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        scrollEnabled={false}
        style={{ flex: 1 }}
      >
        {SLIDES.map((sl) => {
          if (sl.type === 'info') {
            return (
              <InfoSlide
                key={sl.id}
                slide={{ ...sl, userLoggedIn: !!user }}
                onLogin={() => navigation.replace('Login')}
              />
            );
          }
          if (sl.type === 'choice') {
            return (
              <ChoiceSlide key={sl.id} slide={sl} answers={answers} setAnswer={setAnswer} />
            );
          }
          if (sl.type === 'number_input') {
            return (
              <NumberInputSlide key={sl.id} slide={sl} answers={answers} setAnswer={setAnswer} />
            );
          }
          if (sl.type === 'personality') {
            return (
              <PersonalitySlide key={sl.id} slide={sl} answers={answers} setAnswer={setAnswer} />
            );
          }
          return null;
        })}
      </ScrollView>

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => {
          const w  = dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [5, 20] });
          const bg = dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [C.border, C.brand] });
          return <Animated.View key={i} style={[s.dot, { width: w, backgroundColor: bg }]} />;
        })}
      </View>

      {/* Footer */}
      <View style={s.footer}>
        {isLast ? (
          <>
            <Pressable style={s.btnPrimary} onPress={() => saveAndFinish(user ? 'Done' : 'Register')}>
              <Text style={s.btnPrimaryText}>{user ? 'Guardar' : 'Criar conta'}</Text>
            </Pressable>
            {!user && (
              <Pressable style={s.btnSecondary} onPress={() => saveAndFinish('Login')}>
                <Text style={s.btnSecondaryText}>Já tenho conta</Text>
              </Pressable>
            )}
          </>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Pressable
              onPress={() => current > 0 ? goTo(current - 1) : null}
              hitSlop={12}
              style={{ opacity: current > 0 ? 1 : 0 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.textMid} strokeWidth="2.5" strokeLinecap="round">
                  <Polyline points="15 18 9 12 15 6" />
                </Svg>
                <Text style={s.skipText}>Voltar</Text>
              </View>
            </Pressable>

            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {/* Label "opcional" em slides de número */}
              {isOptional && (
                <Pressable onPress={() => goTo(current + 1)}>
                  <Text style={[s.skipText, { fontSize: 12, opacity: 0.6 }]}>Saltar →</Text>
                </Pressable>
              )}
              <Pressable
                style={[s.btnNext, blocked && !isOptional && s.btnNextBlocked]}
                onPress={() => goTo(current + 1)}
              >
                <Text style={s.btnPrimaryText}>Seguinte</Text>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <Polyline points="9 18 15 12 9 6" />
                </Svg>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface, marginBottom: 8, gap: 12,
  },
  optLabel: { fontSize: 14, fontWeight: '700', color: C.textMid },
  optSub:   { fontSize: 12, color: C.textMid, marginTop: 2, opacity: 0.75 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  pCard: {
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface, borderRadius: 18,
    padding: 14, alignItems: 'center', gap: 7, position: 'relative',
  },
  pBadge: {
    position: 'absolute', top: 10, right: 10,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  pEmoji: { fontSize: 28 },
  pName:  { fontSize: 13, fontWeight: '800', color: C.textMid, textAlign: 'center' },
  pDesc:  { fontSize: 11, color: C.textMid, textAlign: 'center', lineHeight: 16, opacity: 0.8 },
  // Number input
  numberInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 2, borderRadius: 18,
    backgroundColor: C.surface,
    paddingHorizontal: 20, paddingVertical: 14,
    marginBottom: 12, width: '100%', gap: 10,
  },
  numberInput: {
    flex: 1, fontSize: 28, fontWeight: '800',
    color: C.text,
  },
  numberSuffix: {
    fontSize: 14, color: C.textMid, fontWeight: '600',
  },
  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 8, width: '100%',
  },
  quickBtn: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface,
  },
  quickLabel: {
    fontSize: 13, fontWeight: '700', color: C.textMid,
  },
});

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: C.bg,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  slide: {
    width: W, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28,
  },
  glowCircle: {
    position: 'absolute', width: W * 0.8, height: W * 0.8,
    borderRadius: W * 0.4, top: '5%',
  },
  iconRing: {
    width: 136, height: 136, borderRadius: 38, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 36,
  },
  iconRingSmall: {
    width: 72, height: 72, borderRadius: 22, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: {
    fontSize: 26, fontWeight: '900', color: C.text,
    textAlign: 'center', marginBottom: 10, letterSpacing: 0,
  },
  sub: {
    fontSize: 14, color: C.textMid,
    textAlign: 'center', lineHeight: 22, maxWidth: 320,
  },
  alreadyHaveAccount: {
    marginTop: 28, paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1, borderColor: C.borderHi,
  },
  alreadyHaveAccountText: { fontSize: 14, fontWeight: '700', color: C.textMid },
  dots: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 5, paddingVertical: 14,
  },
  dot: { height: 5, borderRadius: 3 },
  footer: { paddingHorizontal: 24, paddingTop: 4 },
  btnPrimary: {
    height: 52, borderRadius: 16, backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  btnSecondary: {
    height: 48, borderRadius: 16, borderWidth: 1.5, borderColor: C.borderHi,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimaryText:   { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  btnSecondaryText: { fontSize: 15, fontWeight: '700', color: C.textMid },
  skipText:         { fontSize: 14, fontWeight: '600', color: C.textMid },
  btnNext: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 48, paddingHorizontal: 24, borderRadius: 14,
    backgroundColor: C.brand,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  btnNextBlocked: {
    backgroundColor: C.surface2, shadowOpacity: 0, elevation: 0,
  },
});

// src/screens/auth/WelcomeScreen.js
import React, { useRef, useEffect } from 'react';
import {
  View, Text, Pressable,
  Animated, Easing, StyleSheet, Dimensions,
} from 'react-native';
import { COLORS, RADIUS, FONT, SPACE } from '../../constants/theme';

const C = COLORS;
const { height } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const slideY  = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.root}>
      <Animated.View style={[s.content, { opacity, transform: [{ translateY: slideY }] }]}>

        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoMark}>
            <Text style={s.logoMarkText}>V</Text>
          </View>
          <Text style={s.logoText}>Verly</Text>
        </View>

        {/* Tagline */}
        <Text style={s.tagline}>O teu assistente financeiro inteligente</Text>
        <Text style={s.sub}>Controla as tuas despesas, faturas e subscrições num só lugar.</Text>

        {/* Botões */}
        <View style={s.btnGroup}>
          <Pressable
            style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={s.btnPrimaryText}>Criar conta</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.btnSecondary, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={s.btnSecondaryText}>Já tenho conta</Text>
          </Pressable>
        </View>

      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg || '#080810',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#7C6FE0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoMarkText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#EEEEF8',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EEEEF8',
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    fontSize: 14,
    color: '#8888B0',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 56,
  },
  btnGroup: {
    width: '100%',
    gap: 12,
  },
  btnPrimary: {
    backgroundColor: '#7C6FE0',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  btnSecondary: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8888B0',
  },
});
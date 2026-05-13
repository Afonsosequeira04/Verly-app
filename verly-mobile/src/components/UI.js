// src/components/UI.js — Componentes primitivos partilhados (zero deps externas)
// Animated nativo do React Native — funciona 100% no Expo Go

import React, { useRef, useEffect } from 'react';
import {
  View, Text, Pressable,
  Animated, Easing, StyleSheet,
} from 'react-native';
import { COLORS, RADIUS } from '../constants/theme';

// ─── Hook: fade + slide de entrada ───────────────────────────────────────────
export function useFadeSlide(delay = 0, fromY = 16) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fromY)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1, duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0, duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return { opacity, transform: [{ translateY }] };
}

// ─── FadeSlide wrapper ────────────────────────────────────────────────────────
export function Reveal({ delay = 0, style, children }) {
  const anim = useFadeSlide(delay);
  return (
    <Animated.View style={[anim, style]}>
      {children}
    </Animated.View>
  );
}

// ─── Hook: scale press (micro-interação) ─────────────────────────────────────
export function useScalePress(to = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(scale, { toValue: to,  useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  return { scale, onPressIn, onPressOut };
}

// ─── Card com press feedback ──────────────────────────────────────────────────
export function Card({ onPress, style, children, delay = 0 }) {
  const { scale, onPressIn, onPressOut } = useScalePress();
  const anim = useFadeSlide(delay);

  const inner = (
    <Animated.View style={[anim, { transform: [...anim.transform, { scale }] }, style]}>
      {children}
    </Animated.View>
  );

  if (!onPress) return inner;

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress}>
      {inner}
    </Pressable>
  );
}

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
export function Skeleton({ width, height = 16, radius = RADIUS.sm, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[{
      width: width || '100%',
      height,
      borderRadius: radius,
      backgroundColor: COLORS.surface3,
      opacity,
    }, style]} />
  );
}

// ─── Pill badge ───────────────────────────────────────────────────────────────
export function Badge({ label, color = COLORS.brand, style }) {
  return (
    <View style={[{
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: RADIUS.pill,
      backgroundColor: color + '20',
    }, style]}>
      <Text style={{ fontSize: 10, fontWeight: '700', color, letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
export function Divider({ style }) {
  return <View style={[{ height: 1, backgroundColor: COLORS.border }, style]} />;
}

// ─── Section header ───────────────────────────────────────────────────────────
export function SectionHeader({ title, action, onAction, style }) {
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, style]}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.textMid, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {title}
      </Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.brand }}>
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

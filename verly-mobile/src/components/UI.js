// src/components/UI.js — Componentes primitivos com Moti + Reanimated 4
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MotiView, MotiText, useAnimationState } from 'moti';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  interpolate,
  Easing,
  FadeInDown,
  FadeIn,
  ZoomIn,
  BounceIn,
} from 'react-native-reanimated';
import { COLORS, RADIUS, FONT } from '../constants/theme';

const C = COLORS;

// ─── Hook: scale press com Reanimated 4 ──────────────────────────────────────
export function useScalePress(to = 0.96) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const onPressIn  = () => { scale.value = withSpring(to,  { damping: 20, stiffness: 400 }); };
  const onPressOut = () => { scale.value = withSpring(1,   { damping: 18, stiffness: 300 }); };
  return { animStyle, onPressIn, onPressOut };
}

// ─── Reveal — fade + slide com Moti ──────────────────────────────────────────
export function Reveal({ delay = 0, fromY = 18, style, children }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: fromY }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{
        type: 'timing',
        duration: 400,
        delay,
        easing: Easing.out(Easing.cubic),
      }}
      style={style}
    >
      {children}
    </MotiView>
  );
}

// ─── Card com press feedback e entrada animada ────────────────────────────────
export function Card({ onPress, style, children, delay = 0, entering }) {
  const { animStyle, onPressIn, onPressOut } = useScalePress();

  const inner = (
    <Animated.View
      entering={entering ?? FadeInDown.delay(delay).duration(380).springify()}
      style={[animStyle, style]}
    >
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

// ─── PressCard — card interativo com glow ao pressionar ──────────────────────
export function PressCard({ onPress, style, children, delay = 0, glowColor }) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const onPressIn = () => {
    scale.value   = withSpring(0.97, { damping: 20, stiffness: 400 });
    opacity.value = withTiming(1, { duration: 120 });
  };

  const onPressOut = () => {
    scale.value   = withSpring(1, { damping: 18, stiffness: 300 });
    opacity.value = withTiming(0, { duration: 200 });
  };

  const color = glowColor || C.brand;

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(380).springify()}
      style={animStyle}
    >
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} style={style}>
        {/* Glow overlay ao pressionar */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: RADIUS.lg, backgroundColor: color + '15' },
            glowStyle,
          ]}
        />
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Skeleton shimmer com Moti ────────────────────────────────────────────────
export function Skeleton({ width, height = 16, radius = RADIUS.sm, style }) {
  return (
    <MotiView
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.9 }}
      transition={{
        type: 'timing',
        duration: 700,
        loop: true,
        repeatReverse: true,
      }}
      style={[
        {
          width: width || '100%',
          height,
          borderRadius: radius,
          backgroundColor: C.surface3,
        },
        style,
      ]}
    />
  );
}

// ─── Badge com entrada bounce ─────────────────────────────────────────────────
export function Badge({ label, color = C.brand, style, animated = false }) {
  const inner = (
    <View
      style={[
        {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: RADIUS.pill,
          backgroundColor: color + '20',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color, letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );

  if (!animated) return inner;

  return (
    <Animated.View entering={BounceIn.duration(500)}>
      {inner}
    </Animated.View>
  );
}

// ─── NumberTicker — número que anima ao mudar ─────────────────────────────────
export function NumberTicker({ value, style, prefix = '', suffix = '' }) {
  const displayed = useSharedValue(0);

  useEffect(() => {
    displayed.value = withTiming(value, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [value]);

  // Usa MotiText para mostrar o valor formatado
  return (
    <MotiView
      key={value}
      from={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
    >
      <Text style={style}>{prefix}{value}{suffix}</Text>
    </MotiView>
  );
}

// ─── Pulse dot — indicador animado ───────────────────────────────────────────
export function PulseDot({ color = C.brand, size = 8 }) {
  return (
    <MotiView
      from={{ scale: 1, opacity: 1 }}
      animate={{ scale: 1.8, opacity: 0 }}
      transition={{
        type: 'timing',
        duration: 900,
        loop: true,
        easing: Easing.out(Easing.ease),
      }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ style }) {
  return <View style={[{ height: 1, backgroundColor: C.border }, style]} />;
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({ title, action, onAction, style }) {
  const { animStyle, onPressIn, onPressOut } = useScalePress(0.94);

  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, style]}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textMid, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {title}
      </Text>
      {action && (
        <Animated.View style={animStyle}>
          <Pressable onPress={onAction} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={8}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.brand }}>
              {action}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ─── AnimatedListItem — item de lista que entra em stagger ───────────────────
export function AnimatedListItem({ index = 0, children, style }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).duration(350).springify()}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

// ─── IconButton — botão de ícone com feedback ────────────────────────────────
export function IconButton({ onPress, children, active = false, activeColor, style }) {
  const scale = useSharedValue(1);
  const bg    = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: active
      ? (activeColor || C.brand) + '18'
      : C.surface,
  }));

  const onPressIn  = () => { scale.value = withSpring(0.9,  { damping: 20, stiffness: 400 }); };
  const onPressOut = () => { scale.value = withSpring(1,    { damping: 18, stiffness: 300 }); };

  return (
    <Animated.View style={[styles.iconBtn, animStyle, style]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── ShimmerLine — linha de loading animada ───────────────────────────────────
export function ShimmerLine({ width = '100%', height = 14, radius = 6, style }) {
  return (
    <MotiView
      from={{ opacity: 0.3 }}
      animate={{ opacity: 0.8 }}
      transition={{ type: 'timing', duration: 800, loop: true, repeatReverse: true }}
      style={[{ width, height, borderRadius: radius, backgroundColor: C.surface3 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40, height: 40,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
// src/components/UI.js — Componentes primitivos com Moti + Reanimated 4
// FASE 1: Adicionados AnimatedCounter, GlowPulse, ShimmerCard, ProgressRing, SpringList, ToastNotification

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
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
  runOnJS,
  useDerivedValue,
  useAnimatedProps,
  Easing,
  FadeInDown,
  FadeIn,
  ZoomIn,
  BounceIn,
  SlideInRight,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { COLORS, RADIUS, FONT } from '../constants/theme';

const C = COLORS;
const W = Dimensions.get('window').width;

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

// ════════════════════════════════════════════════════════════════
// FASE 1 — NOVAS ANIMAÇÕES ABAIXO
// ════════════════════════════════════════════════════════════════

// ─── AnimatedCounter — saldo que conta de 0 até ao valor ─────────────────────
// Uso: <AnimatedCounter value={1234.56} prefix="€ " style={styles.saldo} />
export function AnimatedCounter({ value = 0, prefix = '', suffix = '', style, decimals = 2, duration = 1200 }) {
  const [displayed, setDisplayed] = useState('0');
  const animValue = useSharedValue(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const from = prevValue.current;
    prevValue.current = value;
    animValue.value = from;
    animValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value]);

  // Atualiza o texto JS-side a partir do worklet
  useDerivedValue(() => {
    runOnJS(setDisplayed)(animValue.value.toFixed(decimals).replace('.', ','));
  });

  const scaleStyle = useAnimatedStyle(() => {
    const s = interpolate(animValue.value, [0, value * 0.5, value], [0.94, 1.02, 1]);
    return { transform: [{ scale: Math.max(s, 0.9) }] };
  });

  return (
    <Animated.Text style={[style, scaleStyle]}>
      {prefix}{displayed}{suffix}
    </Animated.Text>
  );
}

// ─── GlowPulse — card com brilho pulsante (para destaques) ───────────────────
// Uso: <GlowPulse color={C.green}><View>...</View></GlowPulse>
export function GlowPulse({ color = C.brand, children, style, intensity = 0.35, period = 2000 }) {
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sine) }),
        withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.sine) }),
      ),
      -1,
      false,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: color,
    shadowOpacity: glow.value * intensity,
    shadowRadius: 18 + glow.value * 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6 + glow.value * 8,
  }));

  return (
    <Animated.View style={[style, glowStyle]}>
      {children}
    </Animated.View>
  );
}

// ─── ProgressRing — círculo de progresso SVG animado ─────────────────────────
// Uso: <ProgressRing value={72} max={100} size={120} color={C.brand} />
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ProgressRing({ value = 0, max = 100, size = 120, strokeWidth = 10, color = C.brand, bg = C.surface3, children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = useSharedValue(0);

  useEffect(() => {
    pct.value = withDelay(300, withTiming(value / max, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    }));
  }, [value, max]);

  const animProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - pct.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bg}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}

// ─── AnimatedBar — barra horizontal com fill animado ─────────────────────────
// Uso: <AnimatedBar pct={0.65} color={C.brand} delay={200} />
export function AnimatedBar({ pct = 0, color = C.brand, height = 6, radius = 4, delay = 0, style }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withTiming(Math.min(Math.max(pct, 0), 1) * 100, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    }));
  }, [pct]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={[{ height, borderRadius: radius, backgroundColor: C.surface3, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ height: '100%', borderRadius: radius, backgroundColor: color }, barStyle]} />
    </View>
  );
}

// ─── SpringList — lista em que os itens entram com spring escalonado ──────────
// Uso: <SpringList data={arr} renderItem={(item, i) => <Card key={i}>...</Card>} />
export function SpringList({ data = [], renderItem, style, baseDelay = 0, stagger = 80 }) {
  return (
    <View style={style}>
      {data.map((item, i) => (
        <Animated.View
          key={i}
          entering={FadeInDown.delay(baseDelay + i * stagger).duration(400).springify().damping(18)}
        >
          {renderItem(item, i)}
        </Animated.View>
      ))}
    </View>
  );
}

// ─── ToastNotification — toast que aparece do topo e desaparece ────────────────
// Uso: const { showToast, ToastComponent } = useToast();
//      showToast('Fatura adicionada!', 'success');
//      return <View>...<ToastComponent /></View>
export function useToast() {
  const [toast, setToast] = useState(null);
  const translateY = useSharedValue(-100);
  const opacity    = useSharedValue(0);
  const timerRef   = useRef(null);

  const showToast = (message, type = 'info', duration = 2800) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    translateY.value = withSpring(0, { damping: 18, stiffness: 280 });
    opacity.value    = withTiming(1, { duration: 200 });
    timerRef.current = setTimeout(() => {
      translateY.value = withTiming(-100, { duration: 300 });
      opacity.value    = withTiming(0, { duration: 300 });
      setTimeout(() => setToast(null), 350);
    }, duration);
  };

  const toastStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const COLORS_MAP = { success: C.green, error: C.red, info: C.brand, warning: '#FFB300' };

  const ToastComponent = () => {
    if (!toast) return null;
    const col = COLORS_MAP[toast.type] || C.brand;
    return (
      <Animated.View style={[styles.toast, { borderLeftColor: col }, toastStyle]} pointerEvents="none">
        <View style={[styles.toastDot, { backgroundColor: col }]} />
        <Text style={styles.toastText}>{toast.message}</Text>
      </Animated.View>
    );
  };

  return { showToast, ToastComponent };
}

// ─── ScoreGauge — gauge semicircular SVG para o ScoreScreen ──────────────────
// Uso: <ScoreGauge score={72} size={220} />
export function ScoreGauge({ score = 0, size = 220, strokeWidth = 16 }) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10; // ligeiramente abaixo para semicírculo
  const circumference = Math.PI * radius; // só metade (semicírculo)
  const pct = useSharedValue(0);

  useEffect(() => {
    pct.value = withDelay(400, withTiming(score / 100, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    }));
  }, [score]);

  const animProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - pct.value),
  }));

  const color = score >= 75 ? C.green : score >= 50 ? '#FFB300' : score >= 25 ? '#FF8C00' : C.red;
  const label = score >= 75 ? 'Excelente' : score >= 50 ? 'Razoável' : score >= 25 ? 'Fraco' : 'Mau';

  return (
    <View style={{ width: size, height: size / 2 + 30, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0 }}>
        <Circle
          cx={cx} cy={cy} r={radius}
          stroke={C.surface3} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={0}
          rotation="180" origin={`${cx}, ${cy}`}
          strokeLinecap="round"
        />
        <AnimatedCircle
          cx={cx} cy={cy} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animProps}
          rotation="180" origin={`${cx}, ${cy}`}
          strokeLinecap="round"
        />
      </Svg>
      <View style={{ alignItems: 'center', paddingBottom: 4 }}>
        <Text style={{ fontSize: 48, fontWeight: '900', color, letterSpacing: 0 }}>{score}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSub, marginTop: -4 }}>{label}</Text>
      </View>
    </View>
  );
}

// ─── ShimmerCard — skeleton completo de card com shimmer ─────────────────────
export function ShimmerCard({ style }) {
  return (
    <MotiView
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.85 }}
      transition={{ type: 'timing', duration: 750, loop: true, repeatReverse: true }}
      style={[styles.shimmerCard, style]}
    >
      <View style={[styles.shimmerLine, { width: '40%', height: 10 }]} />
      <View style={[styles.shimmerLine, { width: '70%', height: 28, marginTop: 8 }]} />
      <View style={[styles.shimmerLine, { width: '55%', height: 10, marginTop: 12 }]} />
    </MotiView>
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
  toast: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    backgroundColor: C.surface2 || '#181828',
    borderRadius: RADIUS.md || 12,
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  toastDot: {
    width: 8, height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text || '#F0F0F8',
    flex: 1,
  },
  shimmerCard: {
    backgroundColor: C.surface || '#111120',
    borderRadius: RADIUS.lg || 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border || '#22223A',
  },
  shimmerLine: {
    backgroundColor: C.surface3 || '#1E1E32',
    borderRadius: 6,
  },
});

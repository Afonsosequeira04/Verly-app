import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';

const C = COLORS;

export function BitReveal({ children, delay = 0, style }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 18, scale: 0.98 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 18, stiffness: 160, delay }}
      style={style}
    >
      {children}
    </MotiView>
  );
}

export function GlowShell({ children, colors, style, delay = 0 }) {
  return (
    <BitReveal delay={delay} style={style}>
      <MotiView
        from={{ opacity: 0.72, scale: 0.995 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'timing', duration: 1800, loop: true, repeatReverse: true }}
        style={styles.glowWrap}
      >
        <LinearGradient
          colors={colors || [C.brand + '66', C.green + '33', C.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        >
          <View style={styles.inner}>{children}</View>
        </LinearGradient>
      </MotiView>
    </BitReveal>
  );
}

export function KineticPressable({ children, onPress, style, disabled = false }) {
  return (
    <MotiView
      from={{ scale: 1 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', damping: 18 }}
    >
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          style,
          pressed && !disabled && { transform: [{ scale: 0.97 }], opacity: 0.88 },
          disabled && { opacity: 0.5 },
        ]}
      >
        {children}
      </Pressable>
    </MotiView>
  );
}

export function SignalPill({ label, value, color = C.brand }) {
  return (
    <View style={[styles.signalPill, { borderColor: color + '45' }]}>
      <MotiView
        from={{ scale: 0.7, opacity: 0.4 }}
        animate={{ scale: 1.35, opacity: 0 }}
        transition={{ type: 'timing', duration: 950, loop: true }}
        style={[styles.signalPulse, { backgroundColor: color }]}
      />
      <View style={[styles.signalDot, { backgroundColor: color }]} />
      <Text style={styles.signalLabel}>{label}</Text>
      {!!value && <Text style={[styles.signalValue, { color }]}>{value}</Text>}
    </View>
  );
}

export function MorphingBars({ bars = [], color = C.brand }) {
  const source = bars.length ? bars : [0.35, 0.72, 0.48, 0.88, 0.56];
  return (
    <View style={styles.bars}>
      {source.slice(0, 6).map((item, index) => {
        const height = Math.max(18, Math.min(74, Number(item) * 76 || 24));
        return (
          <MotiView
            key={index}
            from={{ height: 16, opacity: 0.55 }}
            animate={{ height, opacity: 1 }}
            transition={{
              type: 'timing',
              duration: 760 + index * 90,
              loop: true,
              repeatReverse: true,
              delay: index * 65,
            }}
            style={[styles.bar, { backgroundColor: index % 2 ? C.green : color }]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  glowWrap: {
    borderRadius: RADIUS.lg,
    shadowColor: C.brand,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  gradientBorder: { borderRadius: RADIUS.lg, padding: 1 },
  inner: {
    borderRadius: RADIUS.lg - 1,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  signalPill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    backgroundColor: C.bg,
    paddingHorizontal: SPACE.sm,
    overflow: 'hidden',
  },
  signalPulse: {
    position: 'absolute',
    left: 9,
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  signalDot: { width: 7, height: 7, borderRadius: 999 },
  signalLabel: { color: C.textMid, fontSize: FONT.xs, fontWeight: '800' },
  signalValue: { fontSize: FONT.xs, fontWeight: '900' },
  bars: {
    height: 86,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  bar: {
    width: 10,
    borderRadius: 999,
  },
});

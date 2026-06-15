import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { Plus } from 'lucide-react-native';

import { COLORS, FONT, RADIUS, SHADOWS, SPACE } from '../constants/theme';

const C = COLORS;

function StackArt({ icon, accent }) {
  return (
    <View style={styles.art}>
      <MotiView
        from={{ translateY: 0, rotate: '-7deg' }}
        animate={{ translateY: -5, rotate: '-4deg' }}
        transition={{ type: 'timing', duration: 2100, loop: true, repeatReverse: true }}
        style={[styles.stackBack, { borderColor: `${accent}30` }]}
      />
      <MotiView
        from={{ translateY: 4, rotate: '6deg' }}
        animate={{ translateY: 0, rotate: '3deg' }}
        transition={{ type: 'timing', duration: 1800, loop: true, repeatReverse: true }}
        style={[styles.stackMid, { backgroundColor: `${accent}16` }]}
      />
      <LinearGradient colors={[`${accent}28`, C.glassHi]} style={styles.iconTile}>
        {icon}
      </LinearGradient>
      <View style={[styles.artLine, { width: 48, bottom: 19 }]} />
      <View style={[styles.artLine, { width: 31, bottom: 10, opacity: 0.55 }]} />
    </View>
  );
}

function CalendarArt({ icon, accent }) {
  return (
    <View style={styles.art}>
      <View style={[styles.calendarShell, { borderColor: `${accent}42` }]}>
        <View style={[styles.calendarTop, { backgroundColor: `${accent}28` }]} />
        <View style={styles.calendarGrid}>
          {Array.from({ length: 12 }).map((_, index) => (
            <MotiView
              key={index}
              from={{ opacity: 0.42 }}
              animate={{ opacity: index === 8 ? 1 : 0.72 }}
              transition={{ type: 'timing', duration: 900 + index * 35, loop: true, repeatReverse: true }}
              style={[
                styles.calendarCell,
                index === 8 && { backgroundColor: accent, borderColor: accent },
              ]}
            />
          ))}
        </View>
      </View>
      <LinearGradient colors={[`${accent}30`, C.glassHi]} style={[styles.smallFloat, { right: 13, top: 14 }]}>
        {icon}
      </LinearGradient>
    </View>
  );
}

function RadarArt({ icon, accent }) {
  return (
    <View style={styles.art}>
      <View style={[styles.radarFrame, { borderColor: `${accent}44` }]}>
        <View style={styles.radarCrossH} />
        <View style={styles.radarCrossV} />
        <MotiView
          from={{ translateX: -42, opacity: 0.2 }}
          animate={{ translateX: 42, opacity: 0.9 }}
          transition={{ type: 'timing', duration: 1600, loop: true, repeatReverse: true }}
          style={[styles.scanLine, { backgroundColor: accent }]}
        />
        <View style={[styles.radarTarget, { borderColor: `${accent}66` }]}>{icon}</View>
      </View>
      <View style={[styles.artLine, { width: 62, bottom: 9 }]} />
    </View>
  );
}

function FeedArt({ icon, accent }) {
  return (
    <View style={styles.art}>
      <MotiView
        from={{ translateX: -2, rotate: '-5deg' }}
        animate={{ translateX: 4, rotate: '-2deg' }}
        transition={{ type: 'timing', duration: 1900, loop: true, repeatReverse: true }}
        style={[styles.feedCardBack, { borderColor: `${accent}2f` }]}
      />
      <View style={styles.feedCard}>
        <View style={[styles.feedBadge, { backgroundColor: `${accent}25` }]}>{icon}</View>
        <View style={[styles.feedLine, { width: 58 }]} />
        <View style={[styles.feedLine, { width: 78, opacity: 0.65 }]} />
        <View style={[styles.feedLine, { width: 44, opacity: 0.45 }]} />
      </View>
    </View>
  );
}

function CommandArt({ icon, accent }) {
  return (
    <View style={styles.art}>
      <View style={[styles.commandPanel, { borderColor: `${accent}3d` }]}>
        <View style={styles.commandTop}>
          <View style={[styles.commandDot, { backgroundColor: accent }]} />
          <View style={[styles.commandDot, { backgroundColor: C.cyan }]} />
          <View style={[styles.commandDot, { backgroundColor: C.magenta }]} />
        </View>
        <View style={styles.commandPrompt}>
          <View style={[styles.promptIcon, { backgroundColor: `${accent}22` }]}>{icon}</View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.feedLine, { width: '92%' }]} />
            <MotiView
              from={{ width: 26 }}
              animate={{ width: 58 }}
              transition={{ type: 'timing', duration: 1300, loop: true, repeatReverse: true }}
              style={[styles.feedLine, { backgroundColor: `${accent}66` }]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function GroupArt({ icon, accent }) {
  return (
    <View style={styles.art}>
      <View style={[styles.groupTile, styles.groupTileLeft, { borderColor: `${C.cyan}40` }]} />
      <View style={[styles.groupTile, styles.groupTileRight, { borderColor: `${C.magenta}36` }]} />
      <LinearGradient colors={[`${accent}30`, C.glassHi]} style={styles.groupMain}>
        {icon}
      </LinearGradient>
      <View style={[styles.groupBar, { backgroundColor: `${accent}55`, width: 54 }]} />
      <View style={[styles.groupBar, { backgroundColor: C.borderHi, width: 34, top: 74 }]} />
    </View>
  );
}

function EmptyArt({ variant, icon, accent }) {
  if (variant === 'calendar') return <CalendarArt icon={icon} accent={accent} />;
  if (variant === 'radar') return <RadarArt icon={icon} accent={accent} />;
  if (variant === 'feed') return <FeedArt icon={icon} accent={accent} />;
  if (variant === 'command') return <CommandArt icon={icon} accent={accent} />;
  if (variant === 'group') return <GroupArt icon={icon} accent={accent} />;
  return <StackArt icon={icon} accent={accent} />;
}

export default function RefinedEmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  actionIcon,
  loading = false,
  variant = 'stack',
  accent = C.brand,
  framed = true,
  style,
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 16, scale: 0.98 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 18, stiffness: 150 }}
      style={[framed && styles.frame, style]}
    >
      <EmptyArt variant={variant} icon={icon} accent={accent} />
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && (
        <Pressable onPress={onAction} disabled={loading} style={[styles.action, { backgroundColor: accent }, loading && { opacity: 0.62 }]}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : (actionIcon || <Plus size={14} color="#fff" />)}
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.borderHi,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACE.lg,
    paddingVertical: 28,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  art: {
    width: 128,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  iconTile: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderHi,
    zIndex: 3,
  },
  stackBack: {
    position: 'absolute',
    width: 78,
    height: 56,
    borderRadius: 18,
    backgroundColor: C.surface2,
    borderWidth: 1,
    left: 18,
    top: 24,
  },
  stackMid: {
    position: 'absolute',
    width: 72,
    height: 62,
    borderRadius: 20,
    right: 18,
    top: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  artLine: {
    position: 'absolute',
    height: 5,
    borderRadius: 999,
    backgroundColor: C.borderHi,
  },
  calendarShell: {
    width: 92,
    height: 78,
    borderRadius: 18,
    backgroundColor: C.surface2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  calendarTop: { height: 17 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10 },
  calendarCell: {
    width: 13,
    height: 11,
    borderRadius: 4,
    backgroundColor: C.surface3,
    borderWidth: 1,
    borderColor: C.border,
  },
  smallFloat: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderHi,
  },
  radarFrame: {
    width: 88,
    height: 78,
    borderRadius: 22,
    backgroundColor: C.surface2,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarCrossH: { position: 'absolute', width: '100%', height: 1, backgroundColor: C.border },
  radarCrossV: { position: 'absolute', height: '100%', width: 1, backgroundColor: C.border },
  scanLine: { position: 'absolute', width: 2, height: '100%', opacity: 0.72 },
  radarTarget: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg2,
  },
  feedCardBack: {
    position: 'absolute',
    width: 92,
    height: 68,
    borderRadius: 18,
    backgroundColor: C.surface2,
    borderWidth: 1,
    left: 18,
    top: 20,
  },
  feedCard: {
    width: 96,
    height: 76,
    borderRadius: 20,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.borderHi,
    padding: 12,
    gap: 7,
  },
  feedBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  feedLine: { height: 5, borderRadius: 999, backgroundColor: C.borderHi },
  commandPanel: {
    width: 108,
    minHeight: 76,
    borderRadius: 20,
    backgroundColor: C.surface2,
    borderWidth: 1,
    padding: 10,
  },
  commandTop: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  commandDot: { width: 6, height: 6, borderRadius: 3 },
  commandPrompt: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  promptIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTile: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: C.surface2,
    borderWidth: 1,
  },
  groupTileLeft: { left: 18, top: 28, transform: [{ rotate: '-10deg' }] },
  groupTileRight: { right: 18, top: 20, transform: [{ rotate: '12deg' }] },
  groupMain: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderHi,
  },
  groupBar: { position: 'absolute', height: 5, borderRadius: 999, top: 65 },
  title: { color: C.text, fontSize: FONT.lg, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: C.textMid, fontSize: FONT.sm, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 270 },
  action: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 18,
    marginTop: 16,
    ...SHADOWS.brandGlow,
  },
  actionText: { color: '#fff', fontSize: FONT.sm, fontWeight: '900' },
});

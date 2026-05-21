// src/components/DraggableDashboard.js
// Drag & drop de cards no Dashboard usando react-native-reanimated
// Sem dependencias novas — usa apenas Reanimated + Gesture Handler (ja instalados)
//
// Uso no DashboardScreen:
//   import DraggableDashboard from '../components/DraggableDashboard';
//
//   const CARDS_DEFAULT = ['metricas', 'faturas', 'insights', 'metas'];
//
//   <DraggableDashboard
//     cardOrder={cardOrder}
//     onOrderChange={setCardOrder}
//     renderCard={(id) => { ... }}
//     cardHeight={120}
//   />

import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation, UIManager, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { haptic } from '../utils/haptics';
import { COLORS, RADIUS } from '../constants/theme';

const C = COLORS;

// Ativa LayoutAnimation no Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Card individual draggavel
function DraggableCard({ id, index, total, cardHeight, gap, onDragStart, onDragEnd, onDragMove, renderCard, isDragging, dragIndex }) {
  const translateY = useSharedValue(0);
  const scale      = useSharedValue(1);
  const zIndex     = useSharedValue(0);
  const opacity    = useSharedValue(1);
  const startY     = useSharedValue(0);

  const isBeingDragged = isDragging && dragIndex === index;

  const gesture = Gesture.LongPress()
    .minDuration(350)
    .onStart(() => {
      runOnJS(haptic.heavy)();
      runOnJS(onDragStart)(index);
      scale.value    = withSpring(1.04, { damping: 15, stiffness: 300 });
      zIndex.value   = 999;
      opacity.value  = withTiming(0.92, { duration: 150 });
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (!isBeingDragged) return;
      translateY.value = e.translationY;
      const newIndex = Math.round(index + e.translationY / (cardHeight + gap));
      const clamped  = Math.max(0, Math.min(total - 1, newIndex));
      runOnJS(onDragMove)(index, clamped);
    })
    .onEnd(() => {
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      scale.value      = withSpring(1, { damping: 18, stiffness: 280 });
      zIndex.value     = 0;
      opacity.value    = withTiming(1, { duration: 150 });
      runOnJS(onDragEnd)();
    });

  const composed = Gesture.Simultaneous(gesture, panGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ marginBottom: gap }, animStyle]}>
        {renderCard(id, isBeingDragged)}
      </Animated.View>
    </GestureDetector>
  );
}

// Lista draggavel
export default function DraggableDashboard({
  cardOrder,
  onOrderChange,
  renderCard,
  cardHeight = 120,
  gap = 12,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex]   = useState(null);
  const orderRef = useRef(cardOrder);

  const handleDragStart = useCallback((index) => {
    setIsDragging(true);
    setDragIndex(index);
    orderRef.current = [...cardOrder];
  }, [cardOrder]);

  const handleDragMove = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    const newOrder = [...orderRef.current];
    const [moved]  = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onOrderChange(newOrder);
    orderRef.current = newOrder;
    haptic.select();
  }, [onOrderChange]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragIndex(null);
    haptic.medium();
  }, []);

  return (
    <View>
      {cardOrder.map((id, index) => (
        <DraggableCard
          key={id}
          id={id}
          index={index}
          total={cardOrder.length}
          cardHeight={cardHeight}
          gap={gap}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragMove={handleDragMove}
          renderCard={renderCard}
          isDragging={isDragging}
          dragIndex={dragIndex}
        />
      ))}
      {isDragging && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Solta para confirmar</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    bottom: -36,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 11,
    color: C.textSub,
    fontWeight: '600',
  },
});
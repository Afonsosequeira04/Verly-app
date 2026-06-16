import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT, SPACE } from '../constants/theme';

export default function ScoreScreen({ navigation, route }) {
  useEffect(() => {
    navigation.replace('LiveDeals', {
      prefill: route?.params?.prefill || {},
      fromScore: true,
    });
  }, [navigation, route?.params?.prefill]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={COLORS.brand} />
      <Text style={styles.text}>A abrir Live Deals...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    backgroundColor: COLORS.bg,
  },
  text: {
    color: COLORS.textMid,
    fontSize: FONT.sm,
    fontWeight: '800',
  },
});

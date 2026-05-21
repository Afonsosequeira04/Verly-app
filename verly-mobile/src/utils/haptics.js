// src/utils/haptics.js
// Haptic feedback centralizado — usa expo-haptics
// Uso: import { haptic } from '../utils/haptics';
//      haptic.light()   — toque leve (botoes normais)
//      haptic.medium()  — toque medio (acoes importantes)
//      haptic.heavy()   — toque forte (erros, alertas)
//      haptic.success() — padrao de sucesso
//      haptic.error()   — padrao de erro

import * as Haptics from 'expo-haptics';

const safe = (fn) => async () => {
  try { await fn(); } catch {}
};

export const haptic = {
  light:   safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium:  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy:   safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error:   safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warning: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  select:  safe(() => Haptics.selectionAsync()),
};
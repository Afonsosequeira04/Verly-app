/**
 * src/components/TabIcon.js — atualizado com ícone de Metas e Estatísticas
 */
import React from 'react';
import Svg, { Path, Line, Polyline, Circle, Rect } from 'react-native-svg';

export default function TabIcon({ name, color, size = 22 }) {
  const s = size * 0.85;
  switch (name) {
    case 'Dashboard':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Rect x="3" y="3" width="7" height="7" rx="1" /><Rect x="14" y="3" width="7" height="7" rx="1" />
          <Rect x="3" y="14" width="7" height="7" rx="1" /><Rect x="14" y="14" width="7" height="7" rx="1" />
        </Svg>
      );
    case 'Faturas':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline points="14 2 14 8 20 8" /><Line x1="16" y1="13" x2="8" y2="13" /><Line x1="16" y1="17" x2="8" y2="17" />
        </Svg>
      );
    case 'Chat':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </Svg>
      );
    case 'Metas':
      // Ícone de alvo / target
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="10" />
          <Circle cx="12" cy="12" r="6" />
          <Circle cx="12" cy="12" r="2" />
        </Svg>
      );
    case 'Estatisticas':
      // Ícone de barras de gráfico
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Line x1="18" y1="20" x2="18" y2="10" />
          <Line x1="12" y1="20" x2="12" y2="4" />
          <Line x1="6" y1="20" x2="6" y2="14" />
        </Svg>
      );
    case 'Subscricoes':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </Svg>
      );
    case 'Perfil':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" />
        </Svg>
      );
    default:
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><Circle cx="12" cy="12" r="10" /></Svg>;
  }
}
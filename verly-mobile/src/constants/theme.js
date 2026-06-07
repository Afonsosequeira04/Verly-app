// src/constants/theme.js — Verly Design System

export const COLORS = {
  // Brand
  brand:    '#8B5CF6',
  brandMid: '#A78BFA',
  brandDim: 'rgba(139,92,246,0.12)',
  brandGlow:'rgba(139,92,246,0.22)',
  blue:     '#3B82F6',
  cyan:     '#22D4FD',
  magenta:  '#EC4899',
  violet:   '#A855F7',

  // Backgrounds
  bg:       '#050812',
  bg2:      '#09111F',
  surface:  '#0D1220',
  surface2: '#121A2B',
  surface3: '#1A2438',
  glass:    'rgba(255,255,255,0.055)',
  glassHi:  'rgba(255,255,255,0.085)',

  // Borders
  border:   'rgba(255,255,255,0.075)',
  borderHi: 'rgba(255,255,255,0.14)',

  // Text
  text:     '#F6F7FB',
  textMid:  '#A7B0C7',
  textSub:  '#687086',   // ← era '#5050780' (7 dígitos inválido → texto preto)

  // Status
  green:  '#00D68F',
  red:    '#FF4D6D',
  yellow: '#FFB300',
  orange: '#FF7340',

  // Semantic dims
  greenDim:  'rgba(0,214,143,0.10)',
  redDim:    'rgba(255,77,109,0.10)',
  yellowDim: 'rgba(255,179,0,0.10)',

  gradients: {
    app: ['#050812', '#08101D', '#0B1020'],
    card: ['rgba(255,255,255,0.088)', 'rgba(255,255,255,0.045)'],
    cardPressed: ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.055)'],
    brand: ['#8B5CF6', '#3B82F6'],
    action: ['#8B5CF6', '#EC4899'],
    accent: ['#8B5CF6', '#22D4FD', '#EC4899'],
    mutedAccent: ['rgba(139,92,246,0.35)', 'rgba(34,212,253,0.18)'],
    icon: ['rgba(139,92,246,0.22)', 'rgba(34,212,253,0.12)'],
    danger: ['#FF4D6D', '#FF7340'],
  },
};

export const FONT = {
  xs:  11,
  sm:  12,
  md:  14,
  lg:  16,
  xl:  18,
  xxl: 22,
  h1:  28,
};

export const RADIUS = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 100,
};

export const SPACE = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
};

export const SHADOWS = {
  soft: {
    shadowColor: '#000A18',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 6,
  },
  card: {
    shadowColor: '#000A18',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  brandGlow: {
    shadowColor: COLORS.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
};

import { type GraphEdgeKind, type GraphNodeType } from '../shared/graphState';

export type ThemeSetting = 'dark' | 'light' | 'auto';
export type EffectiveTheme = 'dark' | 'light';

export interface ThemeTokens {
  canvas: {
    background: string;
    accents: string;
    stroke: string;
  };
  nodes: {
    borderWidth: number;
    borderOpacity: number;
    radius: number;
    padding: number;
    shadow: string;
    textColor: string;
    textOutline: string;
    textOutlineWidth: number;
    fontSize: number;
    labelMaxWidth: string;
  };
  nodePalette: Record<GraphNodeType, { fill: string; border: string }>;
  edges: {
    executionColor: string;
    dataColor: string;
    width: number;
    arrowScale: number;
    activeGlow: string;
    labelFontSize: number;
    labelBackground: string;
    labelColor: string;
  };
  ports: {
    palette: Record<GraphEdgeKind, string>;
    labelFontSize: number;
    labelColor: string;
  };
  geometry: {
    arrowThickness: number;
    portRadius: number;
  };
  ui: {
    bodyBackground: string;
    bodyText: string;
    mutedText: string;
    toolbarFrom: string;
    toolbarTo: string;
    toolbarBorder: string;
    surface: string;
    surfaceStrong: string;
    surfaceBorder: string;
    panelTitle: string;
    badgeOkBg: string;
    badgeOkText: string;
    badgeOkBorder: string;
    badgeWarnBg: string;
    badgeWarnText: string;
    badgeWarnBorder: string;
    toastInfo: string;
    toastSuccess: string;
    toastWarning: string;
    toastError: string;
    shadow: string;
    buttonBg: string;
    buttonBorder: string;
    buttonText: string;
    buttonHoverShadow: string;
  };
}

const sharedGeometry = {
  arrowThickness: 1.6,
  portRadius: 6
};

const darkTokens: ThemeTokens = {
  canvas: {
    background: '#0d1424',
    accents:
      'radial-gradient(circle at 20% 20%, rgba(91, 152, 255, 0.08), transparent 34%), radial-gradient(circle at 78% 8%, rgba(72, 182, 138, 0.08), transparent 32%)',
    stroke: '#1e2a43'
  },
  nodes: {
    borderWidth: 3,
    borderOpacity: 0.9,
    radius: 14,
    padding: 18,
    shadow: '0 10px 32px rgba(10, 12, 26, 0.55)',
    textColor: '#e6edf7',
    textOutline: '#0a0d1a',
    textOutlineWidth: 3,
    fontSize: 12,
    labelMaxWidth: '180px'
  },
  nodePalette: {
    Start: { fill: '#0ea5e9', border: '#38bdf8' },
    Function: { fill: '#1c2433', border: '#60a5fa' },
    End: { fill: '#be123c', border: '#f43f5e' },
    Variable: { fill: '#312e81', border: '#6366f1' },
    Custom: { fill: '#2c1810', border: '#f97316' }
  },
  edges: {
    executionColor: '#60a5fa',
    dataColor: '#f59e0b',
    width: 4,
    arrowScale: 1.6,
    activeGlow: '#a855f7',
    labelFontSize: 11,
    labelBackground: '#0b1021',
    labelColor: '#e2e8f0'
  },
  ports: {
    palette: {
      execution: '#60a5fa',
      data: '#f59e0b'
    },
    labelFontSize: 10,
    labelColor: '#cbd5e1'
  },
  geometry: sharedGeometry,
  ui: {
    bodyBackground: '#0b1021',
    bodyText: '#e2e8f0',
    mutedText: '#94a3b8',
    toolbarFrom: 'rgba(12, 20, 36, 0.95)',
    toolbarTo: 'rgba(22, 30, 48, 0.95)',
    toolbarBorder: 'rgba(96, 165, 250, 0.35)',
    surface: 'rgba(15, 23, 42, 0.85)',
    surfaceStrong: '#0f172a',
    surfaceBorder: 'rgba(148, 163, 184, 0.25)',
    panelTitle: '#93c5fd',
    badgeOkBg: 'rgba(34, 197, 94, 0.15)',
    badgeOkText: '#bbf7d0',
    badgeOkBorder: 'rgba(34, 197, 94, 0.4)',
    badgeWarnBg: 'rgba(251, 191, 36, 0.15)',
    badgeWarnText: '#fef08a',
    badgeWarnBorder: 'rgba(251, 191, 36, 0.5)',
    toastInfo: '#0ea5e9',
    toastSuccess: '#16a34a',
    toastWarning: '#d97706',
    toastError: '#b91c1c',
    shadow: '0 12px 48px rgba(0, 0, 0, 0.35)',
    buttonBg: '#1e293b',
    buttonBorder: 'rgba(96, 165, 250, 0.4)',
    buttonText: '#e2e8f0',
    buttonHoverShadow: '0 5px 18px rgba(96, 165, 250, 0.25)'
  }
};

const lightTokens: ThemeTokens = {
  canvas: {
    background: '#f4f7fb',
    accents:
      'radial-gradient(circle at 16% 18%, rgba(96, 165, 250, 0.12), transparent 30%), radial-gradient(circle at 84% 6%, rgba(45, 164, 124, 0.12), transparent 30%)',
    stroke: '#d8e2f1'
  },
  nodes: {
    borderWidth: 3,
    borderOpacity: 0.9,
    radius: 14,
    padding: 18,
    shadow: '0 10px 26px rgba(23, 41, 71, 0.18)',
    textColor: '#0f172a',
    textOutline: '#f8fafc',
    textOutlineWidth: 3,
    fontSize: 12,
    labelMaxWidth: '180px'
  },
  nodePalette: {
    Start: { fill: '#0ea5e9', border: '#0284c7' },
    Function: { fill: '#e2e8f0', border: '#1d4ed8' },
    End: { fill: '#f8d7da', border: '#e11d48' },
    Variable: { fill: '#e0e7ff', border: '#4338ca' },
    Custom: { fill: '#fff4e5', border: '#f97316' }
  },
  edges: {
    executionColor: '#1d4ed8',
    dataColor: '#d97706',
    width: 4,
    arrowScale: 1.4,
    activeGlow: '#7c3aed',
    labelFontSize: 11,
    labelBackground: '#f8fafc',
    labelColor: '#0f172a'
  },
  ports: {
    palette: {
      execution: '#1d4ed8',
      data: '#d97706'
    },
    labelFontSize: 10,
    labelColor: '#0f172a'
  },
  geometry: sharedGeometry,
  ui: {
    bodyBackground: '#f6f8fb',
    bodyText: '#0f172a',
    mutedText: '#334155',
    toolbarFrom: 'rgba(248, 250, 252, 0.95)',
    toolbarTo: 'rgba(231, 235, 243, 0.95)',
    toolbarBorder: 'rgba(59, 130, 246, 0.35)',
    surface: 'rgba(255, 255, 255, 0.9)',
    surfaceStrong: '#e2e8f0',
    surfaceBorder: 'rgba(148, 163, 184, 0.3)',
    panelTitle: '#1d4ed8',
    badgeOkBg: 'rgba(34, 197, 94, 0.16)',
    badgeOkText: '#14532d',
    badgeOkBorder: 'rgba(34, 197, 94, 0.45)',
    badgeWarnBg: 'rgba(234, 179, 8, 0.2)',
    badgeWarnText: '#854d0e',
    badgeWarnBorder: 'rgba(234, 179, 8, 0.55)',
    toastInfo: '#0284c7',
    toastSuccess: '#15803d',
    toastWarning: '#c2410c',
    toastError: '#b91c1c',
    shadow: '0 12px 32px rgba(102, 123, 162, 0.25)',
    buttonBg: '#e2e8f0',
    buttonBorder: 'rgba(148, 163, 184, 0.65)',
    buttonText: '#0f172a',
    buttonHoverShadow: '0 5px 16px rgba(96, 165, 250, 0.25)'
  }
};

export const resolveEffectiveTheme = (
  preference: ThemeSetting,
  hostTheme: EffectiveTheme
): EffectiveTheme => {
  if (preference === 'auto') {
    return hostTheme;
  }
  return preference;
};

export const getThemeTokens = (mode: EffectiveTheme): ThemeTokens =>
  mode === 'light' ? lightTokens : darkTokens;

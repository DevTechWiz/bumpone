export interface ColorToken {
  name: string;
  value: string;
  description: string;
  category: 'surface' | 'brand' | 'rank' | 'status';
}

export const DESIGN_TOKENS = {
  colors: {
    surfaces: {
      canvas: '#121316',        // Deep neutral dark charcoal canvas
      card: '#18191d',          // Refined dark grey surface
      cardHover: '#222328',     // Elevated neutral grey hover
      borderSubtle: 'rgba(255, 255, 255, 0.08)', // Subtle border
      borderStrong: 'rgba(255, 255, 255, 0.18)', // Focused border
      overlay: 'rgba(12, 13, 16, 0.88)',
    },
    brand: {
      // Platinum & Neutral Grey Luxury
      celestial: '#f3f4f6',
      celestialHover: '#ffffff',
      starlight: '#9ca3af',
      cosmicGlow: 'rgba(156, 163, 175, 0.15)',
      accent: '#e5e7eb',       // Crisp platinum / neutral silver
    },
    ranks: {
      // #1 Supreme King: Refined Celestial Gold
      king: '#f59e0b',
      kingBg: 'rgba(245, 158, 11, 0.12)',
      kingBorder: 'rgba(245, 158, 11, 0.4)',
      // #2 - #13 Elite: Neutral Silver Platinum
      elite: '#e5e7eb',
      eliteBg: 'rgba(229, 231, 235, 0.1)',
      eliteBorder: 'rgba(229, 231, 235, 0.3)',
      // #14 - #54 Lords: Balanced Neutral Ash/Grey
      contender: '#71717a',
      contenderBg: 'rgba(113, 113, 122, 0.08)',
      // #100 The Bubble / Drop-off: Subtle Crimson Beacon
      dropZone: '#f43f5e',
      dropZoneBg: 'rgba(244, 63, 94, 0.15)',
      dropZoneBorder: 'rgba(244, 63, 94, 0.5)',
    },
    status: {
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#9ca3af',
    },
  },
  typography: {
    fontSans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontMono: "'JetBrains Mono', monospace",
  },
  geometry: {
    cardRadius: '14px',
    innerRadius: '8px',
    pillRadius: '9999px',
  },
} as const;

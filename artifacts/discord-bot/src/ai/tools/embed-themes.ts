export interface EmbedTheme {
  name: string;
  description: string;
  color: number;
  /** Optional secondary accent color */
  accent?: number;
}

export const EMBED_THEMES: Record<string, EmbedTheme> = {
  dark: {
    name: 'Dark',
    description: 'Deep charcoal — classic dark mode aesthetic',
    color: 0x2c2f33,
    accent: 0x7289da,
  },
  light: {
    name: 'Light',
    description: 'Clean white/light grey — professional light mode',
    color: 0xf2f3f5,
    accent: 0x5865f2,
  },
  gaming: {
    name: 'Gaming',
    description: 'Vibrant green — energetic gaming vibe',
    color: 0x00ff41,
    accent: 0xff0080,
  },
  professional: {
    name: 'Professional',
    description: 'Slate blue — corporate, trustworthy',
    color: 0x2d3e50,
    accent: 0x3498db,
  },
  minimal: {
    name: 'Minimal',
    description: 'Pure white — clean, distraction-free',
    color: 0xffffff,
    accent: 0x95a5a6,
  },
  modern: {
    name: 'Modern',
    description: 'Discord blurple — familiar, modern',
    color: 0x5865f2,
    accent: 0xeb459e,
  },
  neon: {
    name: 'Neon',
    description: 'Electric cyan — eye-catching neon style',
    color: 0x00ffff,
    accent: 0xff00ff,
  },
  // Additional presets
  success: {
    name: 'Success',
    description: 'Green — confirmation and positive actions',
    color: 0x57f287,
  },
  warning: {
    name: 'Warning',
    description: 'Amber — caution and alerts',
    color: 0xfee75c,
  },
  danger: {
    name: 'Danger',
    description: 'Red — errors and destructive actions',
    color: 0xed4245,
  },
  info: {
    name: 'Info',
    description: 'Blue — informational content',
    color: 0x3498db,
  },
  gold: {
    name: 'Gold',
    description: 'Gold — premium, VIP, achievements',
    color: 0xf1c40f,
  },
  purple: {
    name: 'Purple',
    description: 'Royal purple — events and announcements',
    color: 0x9b59b6,
  },
  pink: {
    name: 'Pink',
    description: 'Pink — community and fun events',
    color: 0xff6b9d,
  },
};

export function resolveThemeColor(theme: string, fallback = 0x5865f2): number {
  const t = EMBED_THEMES[theme.toLowerCase()];
  return t?.color ?? fallback;
}

export function parseColor(color: string): number {
  if (color.startsWith('#')) color = color.slice(1);
  const n = parseInt(color, 16);
  return isNaN(n) ? 0x5865f2 : n;
}

export function listThemes(): string {
  return Object.entries(EMBED_THEMES)
    .map(([key, t]) => `• **${t.name}** (\`${key}\`) — ${t.description}`)
    .join('\n');
}

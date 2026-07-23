import type { Config } from 'tailwindcss';
import { colors } from '@armada/ui/tokens';

/**
 * Brand tokens come from packages/ui (the single source of truth, pulled from
 * armadadiscipleship.org). Warm cream, muted earthy neutrals, deep teal + olive.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1e1c18',
        'ink-soft': colors.inkSoft,
        deep: colors.deep,
        'deep-2': colors.deepMid,
        'deep-dark': colors.deepDark,
        cream: colors.cream,
        surface: colors.surface,
        sand: colors.sand,
        line: colors.line,
        muted: colors.muted,
        olive: colors.olive,
        'olive-soft': colors.oliveSoft,
        slate: colors.slate,
        'slate-dark': colors.slateDark,
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        slab: ['var(--font-slab)', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '22px',
        hero: '28px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(30,28,24,0.04), 0 6px 20px -8px rgba(30,28,24,0.10)',
        hero: '0 10px 40px -12px rgba(21,58,67,0.45)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease both',
      },
    },
  },
  plugins: [],
};

export default config;

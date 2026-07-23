import type { Config } from 'tailwindcss';
import { colors } from '@armada/ui/tokens';

/**
 * Brand tokens come from packages/ui (the single source of truth, pulled from
 * armadadiscipleship.org). Do not hardcode hex values in components.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: colors.ink,
        'ink-soft': colors.inkSoft,
        deep: colors.deep,
        cream: colors.cream,
        olive: colors.olive,
        slate: colors.slate,
        'slate-dark': colors.slateDark,
        'grey-200': colors.grey200,
        'grey-300': colors.grey300,
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        expanded: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        display: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

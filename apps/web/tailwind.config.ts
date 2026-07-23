import type { Config } from 'tailwindcss';
import { colors, fonts } from '@armada/ui/tokens';

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
      },
      fontFamily: {
        sans: [fonts.sans],
        expanded: [fonts.expanded],
        display: [fonts.display],
      },
    },
  },
  plugins: [],
};

export default config;

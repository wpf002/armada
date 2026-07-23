/**
 * Armada design tokens — the single source of truth for brand color & type.
 *
 * Colors extracted from the live Webflow stylesheet on armadadiscipleship.org
 * (per roadmap §9), filtering out Webflow's default interaction blues
 * (#1f6fff / #2d40ea / #3898ec) which are not brand colors.
 *
 * Fonts: Archivo (workhorse, Google Fonts) + Archivo Expanded (all-caps
 * eyebrows/headlines) + Archivo Black (heavy display). `henderson-slab-basic`
 * is an Adobe Typekit accent face on the marketing site; the app substitutes
 * Archivo until a Typekit kit is provisioned. Ask the Armada team for the brand
 * guide + anchor SVG (full-color / mono-black / mono-white) for icon & splash.
 */

export const colors = {
  /** Primary ink — anchor mark, headlines, dark surfaces. */
  ink: '#000000',
  inkSoft: '#181913',
  inkMuted: '#1a1b1f',
  /** Deep nautical teal/green — the brand accent. */
  deep: '#153a43',
  /** Warm off-white / cream page background. */
  cream: '#f9f5f1',
  white: '#ffffff',
  /** Olive secondary. */
  olive: '#6f7051',
  /** Slate blue-grey — secondary text, disciple/grey nodes in the hierarchy. */
  slate: '#758696',
  slateDark: '#3a4554',
  /** Neutral greys. */
  grey100: '#fafafa',
  grey200: '#e2e2e2',
  grey300: '#c8c8c8',
  grey400: '#b4b4b4',
  /** Warm neutrals tuned to the cream background. */
  sand: '#efe8dd',
  line: '#e7dfd3',
  muted: '#8c8578',
  surface: '#fffdfa',
} as const;

export const fonts = {
  /** Body + UI. */
  sans: '"Archivo", system-ui, -apple-system, "Segoe UI", sans-serif',
  /** All-caps eyebrows & headlines. */
  expanded: '"Archivo Expanded", "Archivo", sans-serif',
  /** Heavy display. */
  display: '"Archivo Black", "Archivo", sans-serif',
} as const;

/** Semantic aliases used across the app. Leaders render dark, disciples grey. */
export const semantic = {
  background: colors.cream,
  surface: colors.white,
  foreground: colors.inkSoft,
  accent: colors.deep,
  leaderNode: colors.inkSoft,
  discipleNode: colors.slate,
  mentorNode: colors.olive,
} as const;

export type ColorToken = keyof typeof colors;
export type FontToken = keyof typeof fonts;

export const tokens = { colors, fonts, semantic } as const;

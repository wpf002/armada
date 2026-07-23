/** Solid Armada-style anchor mark (ring, shank, stock, flukes with barbs). */
export function Anchor({ size = 32, className = '', color = 'currentColor' }: { size?: number; className?: string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} aria-hidden fill={color}>
      <path d="M256 40c-31 0-56 25-56 56 0 25 16 46 38 53v31h-44v44h44v150c-60-10-107-58-113-120h35l-60-80-60 80h39c7 100 90 179 191 179s184-79 191-179h39l-60-80-60 80h35c-6 62-53 110-113 120V224h44v-44h-44v-31c22-7 38-28 38-53 0-31-25-56-56-56zm0 44c7 0 13 6 13 13s-6 13-13 13-13-6-13-13 6-13 13-13z" />
    </svg>
  );
}

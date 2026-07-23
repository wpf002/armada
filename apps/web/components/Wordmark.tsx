/** The real Armada lockup (anchor + wordmark) pulled from armadadiscipleship.org. */
export function Wordmark({ height = 30 }: { height?: number }) {
  return (
    <img
      src="/brand/lockup-black.svg"
      alt="Armada Discipleship"
      height={height}
      style={{ height }}
      className="w-auto"
    />
  );
}

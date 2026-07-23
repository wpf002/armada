// PWA manifest (installable, standalone). Anchor mark + brand colors.
export function GET() {
  const manifest = {
    name: 'Armada Discipleship',
    short_name: 'Armada',
    description: 'Discipleship relationship management for Armada Discipleship.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#f9f5f1',
    theme_color: '#153a43',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'content-type': 'application/manifest+json' },
  });
}

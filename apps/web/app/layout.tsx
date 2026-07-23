import type { Metadata, Viewport } from 'next';
import { Archivo, Zilla_Slab } from 'next/font/google';
import './globals.css';
import { ServiceWorker } from '@/components/ServiceWorker';

// Archivo (variable, incl. the width axis) — body, heavy headlines, and the
// wide all-caps eyebrows that define the Armada brand. Zilla Slab approximates
// the Henderson Slab wordmark on armadadiscipleship.org.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
});
const slab = Zilla_Slab({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-slab',
});

export const metadata: Metadata = {
  title: 'Armada',
  description: 'Discipleship relationship management for Armada Discipleship.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#42432e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${slab.variable}`}>
      <body className="min-h-screen bg-cream font-sans text-ink antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

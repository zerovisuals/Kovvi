import type { Metadata, Viewport } from 'next';
import { fontClassNames } from '@/styles/fonts';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Kovvi',
    template: '%s · Kovvi',
  },
  description:
    'Discover organizations that fit your work. Get the evidence, contact and approach prepared.',
  applicationName: 'Kovvi',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` is required and narrow in scope: the script
    // below stamps `data-theme` before React hydrates, so the server-rendered
    // <html> deliberately differs by that one attribute.
    <html lang="en" suppressHydrationWarning className={fontClassNames}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip-link bg-card text-ink rounded-sm px-3 py-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

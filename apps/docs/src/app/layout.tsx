import '@/styles/globals.css';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';

export const metadata = {
  title: 'Zeno Docs',
  description: 'Documentation for Zeno — a personal agent that operates across the apps you use.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <RootProvider theme={{ enabled: false, defaultTheme: 'dark' }}>
          <DocsLayout tree={source.pageTree} nav={{ title: 'Zeno Docs' }}>
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}

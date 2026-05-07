import '@/styles/globals.css';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { Crest } from '@/components/crest';
import { source } from '@/lib/source';

export const metadata = {
  title: 'Zeno Docs',
  description: 'Documentation for Zeno — a personal agent that operates across the apps you use.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider theme={{ defaultTheme: 'system', enableSystem: true }}>
          <DocsLayout
            tree={source.pageTree}
            nav={{
              title: (
                <span className="inline-flex items-center gap-2 font-medium">
                  <Crest size={20} />
                  <span>zeno</span>
                </span>
              ),
              url: '/',
            }}
            githubUrl="https://github.com/ribeirogab/zeno-agent"
            themeSwitch={{ mode: 'light-dark-system' }}
          >
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}

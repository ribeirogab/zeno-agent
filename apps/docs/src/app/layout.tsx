import '@/styles/globals.css';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata, Viewport } from 'next';
import { Fraunces, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { Crest } from '@/components/crest';
import { source } from '@/lib/source';

// Brand fonts mirror the apps/web landing. next/font fetches at build time
// and self-hosts in production so there is zero runtime request to Google.
const sans = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-sans',
});

const serif = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-serif',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-mono',
});

const SITE_URL = 'https://docs.zeno-agent.dev';
const SITE_NAME = 'Zeno Docs';
const SITE_TITLE = 'Zeno Docs — Personal agent that gets the work done';
const SITE_DESCRIPTION =
  'Operator documentation for Zeno — a self-hosted, single-user agent that operates across the apps you already use, by composing the connectors you install.';
const OG_IMAGE = '/og-image.png';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s · Zeno Docs' },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'zeno',
    'agent',
    'ai agent',
    'mcp',
    'model context protocol',
    'slack',
    'github',
    'linear',
    'claude',
    'self-hosted',
    'open source',
    'personal agent',
    'docs',
  ],
  authors: [{ name: 'ribeirogab', url: 'https://github.com/ribeirogab' }],
  creator: 'ribeirogab',
  publisher: 'ribeirogab',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  alternates: { canonical: SITE_URL },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Zeno',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Zeno — Personal agent that gets the work done.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  category: 'technology',
};

export const viewport: Viewport = {
  themeColor: '#08090F',
  colorScheme: 'dark',
};

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: SITE_TITLE,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  inLanguage: 'en',
  isPartOf: {
    '@type': 'WebSite',
    name: 'Zeno',
    url: 'https://zeno-agent.dev',
  },
  about: {
    '@type': 'SoftwareApplication',
    name: 'Zeno',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, WSL2',
    url: 'https://github.com/ribeirogab/zeno-agent',
    license: 'https://github.com/ribeirogab/zeno-agent/blob/main/LICENSE',
    codeRepository: 'https://github.com/ribeirogab/zeno-agent',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  },
  author: {
    '@type': 'Person',
    name: 'ribeirogab',
    url: 'https://github.com/ribeirogab',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${sans.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: schema.org JSON-LD must ship as inline JSON.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        <RootProvider theme={{ enabled: false, defaultTheme: 'dark' }}>
          <DocsLayout
            tree={source.pageTree}
            nav={{
              mode: 'top',
              title: (
                <span className="inline-flex items-center gap-2 font-medium">
                  <Crest size={20} />
                  <span>zeno</span>
                </span>
              ),
              url: '/',
            }}
            githubUrl="https://github.com/ribeirogab/zeno-agent"
            themeSwitch={{ enabled: false }}
          >
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}

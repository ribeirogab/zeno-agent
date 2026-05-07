import { CTATilesSection } from './sections/cta-tiles-section';
import { FooterSection } from './sections/footer-section';
import { HeroSection } from './sections/hero-section';
import { HowItWorksSection } from './sections/how-it-works-section';
import { QuickStartSection } from './sections/quick-start-section';
import { WarningSection } from './sections/warning-section';

// Single-page landing. Six sections in a fixed top-to-bottom order.
// No router, no anchor nav, no SSR. Pure composition.
export function App() {
  return (
    <>
      <HeroSection />
      <WarningSection />
      <QuickStartSection />
      <HowItWorksSection />
      <CTATilesSection />
      <FooterSection />
    </>
  );
}

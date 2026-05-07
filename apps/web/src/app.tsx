import { FooterSection } from './sections/footer-section';
import { HeroSection } from './sections/hero-section';
import { HowItWorksSection } from './sections/how-it-works-section';
import { QuickStartSection } from './sections/quick-start-section';
import { WarningSection } from './sections/warning-section';

// Single-page landing. Five sections in a fixed top-to-bottom order.
// No router, no anchor nav, no SSR. Pure composition.
//
// Hero carries the GitHub / Docs / Roadmap inline links — there is no
// separate bottom-CTA tiles section anymore.
export function App() {
  return (
    <>
      <HeroSection />
      <WarningSection />
      <QuickStartSection />
      <HowItWorksSection />
      <FooterSection />
    </>
  );
}

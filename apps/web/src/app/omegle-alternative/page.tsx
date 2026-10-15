import { landingMetadata, SeoLanding } from '@/components/SeoLanding';
import { landingPage } from '@/lib/landingPages';

const page = landingPage('omegle-alternative');

export const metadata = landingMetadata(page);

export default function Page() {
  return <SeoLanding page={page} />;
}

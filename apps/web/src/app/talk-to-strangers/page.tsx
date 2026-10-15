import { landingMetadata, SeoLanding } from '@/components/SeoLanding';
import { landingPage } from '@/lib/landingPages';

const page = landingPage('talk-to-strangers');

export const metadata = landingMetadata(page);

export default function Page() {
  return <SeoLanding page={page} />;
}

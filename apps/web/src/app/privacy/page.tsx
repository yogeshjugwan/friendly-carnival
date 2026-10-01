import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy — randomCall' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what randomCall collects, why, and how long we keep it.</p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Device id:</strong> a random id stored in your browser, used for blocks, bans and abuse prevention.
        </li>
        <li>
          <strong>IP address:</strong> used to connect calls and show your country. We store only a salted one-way hash of it, for
          abuse prevention.
        </li>
        <li>
          <strong>Your choices:</strong> the gender and interests you enter, and your settings.
        </li>
        <li>
          <strong>Account (optional):</strong> your email and a securely hashed password.
        </li>
        <li>
          <strong>Reports:</strong> when someone reports you (or you report someone), the report, any note, and a small still image
          of the reported video.
        </li>
      </ul>
      <h2>What we do not collect</h2>
      <ul>
        <li>We do not record your calls or store chat messages. Messages are relayed to your partner and not saved.</li>
        <li>We do not use advertising or analytics cookies, and we do not sell your data.</li>
        <li>Nudity screening runs on your own device; video frames are not sent to us unless a report is filed.</li>
      </ul>
      <h2>Who sees your information</h2>
      <p>
        Your chat partner sees your video, messages, chosen gender, shared interests and your country (unless you hide it). Our
        moderators see reports. Our hosting providers process data on our behalf (web hosting, the realtime server, the database,
        and email delivery).
      </p>
      <h2>How long we keep it</h2>
      <ul>
        <li>Report images: deleted after 30 days.</li>
        <li>Reports and bans: kept while needed for safety and appeals.</li>
        <li>Accounts: until you delete them in Settings, which removes your email, password and settings.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You can access, correct or delete your account data in Settings, or contact us at {CONTACT_EMAIL} for anything else,
        including questions about this policy.
      </p>
    </LegalPage>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, ghostLink, LegalPage, primaryLink } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy — randomCall' };

const chip = 'flex h-9 items-center rounded-full bg-pick px-3 text-[13px] font-semibold text-lime';

export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      cols={3}
      title={
        <>
          Privacy <span className="text-lime">Policy</span>
        </>
      }
      phoneTitle="Privacy Policy"
      subtitle="This policy explains what randomCall collects, why, and how long we keep it."
      aside={
        <div className="flex flex-wrap gap-2">
          <span className={chip}>We never sell your data</span>
          <span className={chip}>Calls are not recorded</span>
        </div>
      }
      sections={[
        {
          title: 'What we collect',
          body: (
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
          ),
        },
        {
          title: 'What we do not collect',
          body: (
            <ul>
              <li>We do not record your calls or store chat messages. Messages are relayed to your partner and not saved.</li>
              <li>We do not use advertising or analytics cookies, and we do not sell your data.</li>
              <li>Nudity screening runs on your own device; video frames are not sent to us unless a report is filed.</li>
            </ul>
          ),
        },
        {
          title: 'Who sees your information',
          body: (
            <>
              <p>
                Your chat partner sees your video, messages, chosen gender, shared interests and your country (unless you hide it). Our
                moderators see reports. Our hosting providers process data on our behalf (web hosting, the realtime server, the database,
                and email delivery).
              </p>
              <p>
                When you tap Translate on a message, your browser translates it on your device if it can. If it can&apos;t, that one message
                is sent through our server to a translation service (MyMemory or Google Cloud Translation) and isn&apos;t stored by us.
              </p>
            </>
          ),
        },
        {
          title: 'How long we keep it',
          body: (
            <ul>
              <li>Report images: deleted after 30 days.</li>
              <li>Reports and bans: kept while needed for safety and appeals.</li>
              <li>Accounts: until you delete them in Settings, which removes your email, password and settings.</li>
            </ul>
          ),
        },
        {
          title: 'Your rights',
          body: (
            <p>
              You can access, correct or delete your account data in Settings, or contact us at {CONTACT_EMAIL} for anything else,
              including questions about this policy.
            </p>
          ),
        },
      ]}
      footer={
        <>
          Privacy questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · <Link href="/terms">Terms</Link> ·{' '}
          <Link href="/guidelines">Guidelines</Link>
        </>
      }
      actions={
        <>
          <Link href="/settings" className={`${ghostLink} text-stop-text border-[#4a2424] max-lg:hidden`}>
            Delete my account
          </Link>
          <Link href="/" className={primaryLink}>
            Done
          </Link>
        </>
      }
    />
  );
}

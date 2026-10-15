import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, ghostLink, LegalPage, primaryLink } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms of Use — randomCall' };

export default function TermsPage() {
  return (
    <LegalPage
      current="terms"
      title={
        <>
          Terms of <span className="text-lime">Use</span>
        </>
      }
      phoneTitle="Terms & Guidelines"
      subtitle="By using randomCall you agree to these terms. If you do not agree, do not use the service."
      aside={
        <Link href="/guidelines" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#6b5d84] px-4 text-sm font-semibold text-[#e6e8ec]">
          Community Guidelines →
        </Link>
      }
      sections={[
        {
          title: '1. Eligibility',
          highlight: true,
          body: <p>You must be at least 18 years old. By starting a chat or creating an account you confirm that you are.</p>,
        },
        {
          title: '2. The service',
          body: (
            <p>
              randomCall connects you with random strangers for live video or text chat. Video and audio travel directly between the two
              browsers (or through a relay when a direct connection is not possible); we do not record calls. The service is provided “as
              is” and may change or be unavailable at any time.
            </p>
          ),
        },
        {
          title: '3. Your conduct',
          highlight: true,
          body: (
            <p>
              You are responsible for what you say and show. You must follow the <Link href="/guidelines">Community Guidelines</Link>. You
              must not use randomCall for anything illegal, to harm minors, or to harass, record or exploit other people.
            </p>
          ),
        },
        {
          title: '4. Safety and moderation',
          body: (
            <p>
              To keep the service safe, your browser checks the video you receive for nudity, and reports you file include a still image of
              the reported video. We may suspend or permanently ban any device or account that breaks these terms, with or without notice,
              and we may share information with authorities when the law requires it.
            </p>
          ),
        },
        {
          title: '5. Accounts',
          body: <p>Accounts are optional. Keep your password secret. You can delete your account at any time in Settings.</p>,
        },
        {
          title: '5a. Plus, coins and gifts',
          body: (
            <ul>
              <li>Plus is a subscription that renews until you cancel it in Settings → Manage subscription.</li>
              <li>
                Coins are a virtual item for use on randomCall only (gifts, Boost, extra matches). They have no cash value, can&apos;t be
                exchanged for money and aren&apos;t refundable except where the law requires. Coins received as gifts can only be used on
                randomCall.
              </li>
              <li>We may remove coins obtained through fraud, chargebacks or rule-breaking.</li>
            </ul>
          ),
        },
        {
          title: '6. Liability',
          body: (
            <p>
              Other users are strangers and we do not control what they do. To the extent allowed by law, randomCall is not liable for other
              users’ conduct or for any indirect or consequential loss arising from use of the service.
            </p>
          ),
        },
        {
          title: '7. Changes and contact',
          body: <p>We may update these terms; continued use means you accept the new version. Contact: {CONTACT_EMAIL}.</p>,
        },
      ]}
      footer={
        <>
          Also read: <Link href="/guidelines">Community Guidelines</Link> · <Link href="/privacy">Privacy Policy</Link> · Questions:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </>
      }
      actions={
        <>
          <Link href="/help" className={`${ghostLink} max-lg:hidden`}>
            Help
          </Link>
          <Link href="/" className={primaryLink}>
            Done
          </Link>
        </>
      }
    />
  );
}

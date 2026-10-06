import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms of Use — randomCall' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>By using randomCall you agree to these terms. If you do not agree, do not use the service.</p>
      <h2>1. Eligibility</h2>
      <p>You must be at least 18 years old. By starting a chat or creating an account you confirm that you are.</p>
      <h2>2. The service</h2>
      <p>
        randomCall connects you with random strangers for live video or text chat. Video and audio travel directly between the two
        browsers (or through a relay when a direct connection is not possible); we do not record calls. The service is provided “as
        is” and may change or be unavailable at any time.
      </p>
      <h2>3. Your conduct</h2>
      <p>
        You are responsible for what you say and show. You must follow the{' '}
        <Link href="/guidelines" className="text-brand underline">
          Community Guidelines
        </Link>
        . You must not use randomCall for anything illegal, to harm minors, or to harass, record or exploit other people.
      </p>
      <h2>4. Safety and moderation</h2>
      <p>
        To keep the service safe, your browser checks the video you receive for nudity, and reports you file include a still image
        of the reported video. We may suspend or permanently ban any device or account that breaks these terms, with or without
        notice, and we may share information with authorities when the law requires it.
      </p>
      <h2>5. Accounts</h2>
      <p>Accounts are optional. Keep your password secret. You can delete your account at any time in Settings.</p>
      <h2>5a. Plus, coins and gifts</h2>
      <ul>
        <li>Plus is a subscription that renews until you cancel it in Settings → Manage subscription.</li>
        <li>
          Coins are a virtual item for use on randomCall only (gifts, Boost, extra matches). They have no cash value, can&apos;t be
          exchanged for money and aren&apos;t refundable except where the law requires. Coins received as gifts can only be used on
          randomCall.
        </li>
        <li>We may remove coins obtained through fraud, chargebacks or rule-breaking.</li>
      </ul>
      <h2>6. Liability</h2>
      <p>
        Other users are strangers and we do not control what they do. To the extent allowed by law, randomCall is not liable for
        other users’ conduct or for any indirect or consequential loss arising from use of the service.
      </p>
      <h2>7. Changes and contact</h2>
      <p>We may update these terms; continued use means you accept the new version. Contact: {CONTACT_EMAIL}.</p>
    </LegalPage>
  );
}

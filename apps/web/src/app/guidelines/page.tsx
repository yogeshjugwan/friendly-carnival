import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Community Guidelines — randomCall' };

export default function GuidelinesPage() {
  return (
    <LegalPage title="Community Guidelines">
      <p>randomCall is for meeting new people respectfully. Breaking these rules gets you banned — automatically or by a moderator.</p>
      <h2>Who can use randomCall</h2>
      <ul>
        <li>You must be 18 or older. Users who appear to be under 18 are banned and reported where the law requires.</li>
      </ul>
      <h2>Not allowed</h2>
      <ul>
        <li>Nudity, sexual acts or sexual content of any kind.</li>
        <li>Harassment, threats, hate speech, or targeting people for who they are.</li>
        <li>Anything involving minors, violence, self-harm, drugs or other illegal activity.</li>
        <li>Scams, spam, advertising, or asking people to move to paid services.</li>
        <li>Recording or sharing others without their consent; impersonating others.</li>
        <li>Getting around a ban with a new device, account or network.</li>
      </ul>
      <h2>Staying safe</h2>
      <ul>
        <li>Never share your full name, address, phone number, passwords or money.</li>
        <li>Treat every chat as if it could be recorded by the other person.</li>
        <li>Use the 🛡 Safety button to hide video, block, or report. Press Next any time.</li>
      </ul>
      <h2>How we enforce</h2>
      <p>
        Reports are reviewed by moderators, usually within 24 hours. Repeated reports from different people, or nudity detected by
        on-device screening, can trigger an automatic temporary ban. Bans can be appealed from the ban screen. Questions:{' '}
        {CONTACT_EMAIL}.
      </p>
    </LegalPage>
  );
}

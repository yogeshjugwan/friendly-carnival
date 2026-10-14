import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, LegalFrame, primaryLink, TermsTabs, UPDATED } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Community Guidelines — randomCall' };

const col = 'flex flex-col gap-3 rounded-[18px] border border-line bg-card p-4 lg:rounded-[20px] lg:p-5';
const colTitle = 'm-0 font-display text-lg font-bold lg:text-xl';
const item = 'flex items-start gap-2.5 text-sm leading-normal text-[#e6e8ec]';

const NOT_ALLOWED = [
  'Nudity, sexual acts or sexual content of any kind.',
  'Harassment, threats, hate speech, or targeting people for who they are.',
  'Anything involving minors, violence, self-harm, drugs or other illegal activity.',
  'Scams, spam, advertising, or asking people to move to paid services.',
  'Recording or sharing others without their consent; impersonating others.',
  'Getting around a ban with a new device, account or network.',
];

const SAFE = [
  'Never share your full name, address, phone number, passwords or money.',
  'Treat every chat as if it could be recorded by the other person.',
  'Use the 🛡 Safety button to hide video, block, or report. Press Next any time.',
];

const No = () => (
  <span aria-hidden className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[#2a1616]">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF8A80" strokeWidth={3}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  </span>
);
const Ok = () => (
  <span aria-hidden className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-pick">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6FAE" strokeWidth={3}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  </span>
);

export default function GuidelinesPage() {
  return (
    <LegalFrame current="guidelines" phoneTitle="Terms & Guidelines" phoneSub={`Updated ${UPDATED}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-display text-[26px] font-bold leading-[1.05] tracking-[-0.5px] lg:text-[40px] lg:tracking-[-1px]">
            Community <span className="text-lime">Guidelines</span>
          </h1>
          <p className="m-0 mt-1.5 text-sm text-mute lg:text-[15px]">
            randomCall is for meeting new people respectfully. Breaking these rules gets you banned — automatically or by a moderator.
          </p>
        </div>
        <div className="max-lg:w-full">
          <TermsTabs current="guidelines" />
        </div>
      </div>

      <div className="grid flex-1 content-start gap-3.5 lg:grid-cols-3">
        <section aria-labelledby="g-no" className={col}>
          <h2 id="g-no" className={`${colTitle} text-stop-text`}>
            Not allowed
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {NOT_ALLOWED.map((t) => (
              <li key={t} className={item}>
                <No />
                {t}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-3.5">
          <section aria-labelledby="g-who" className={`${col} border-[#5a2550] bg-[#22111f]`}>
            <h2 id="g-who" className={`${colTitle} text-lime`}>
              Who can use randomCall
            </h2>
            <p className={item}>
              <Ok />
              You must be 18 or older. Users who appear to be under 18 are banned and reported where the law requires.
            </p>
          </section>
          <section aria-labelledby="g-safe" className={col}>
            <h2 id="g-safe" className={`${colTitle} text-lime`}>
              Staying safe
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {SAFE.map((t) => (
                <li key={t} className={item}>
                  <Ok />
                  {t}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section aria-labelledby="g-enforce" className={col}>
          <h2 id="g-enforce" className={colTitle}>
            How we enforce
          </h2>
          <p className="m-0 rounded-xl border border-[#4a2424] bg-[#2a1616] p-3 text-[13px] leading-[1.45] text-[#ffd3ce]">
            Reports are reviewed by moderators, usually within 24 hours. Repeated reports from different people, or nudity detected by
            on-device screening, can trigger an automatic temporary ban. Bans can be appealed from the ban screen.
          </p>
          <p className="m-0 text-[13px] text-mute">
            Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="text-lime">{CONTACT_EMAIL}</a>
          </p>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 max-lg:flex-col max-lg:items-stretch">
        <p className="m-0 text-[13px] text-mute max-lg:text-center max-lg:text-[11px]">
          Also read our{' '}
          <Link href="/terms" className="text-lime">
            Terms
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" className="text-lime">
            Privacy Policy
          </Link>
        </p>
        <Link href="/" className={primaryLink}>
          Got it, let’s chat
        </Link>
      </footer>
    </LegalFrame>
  );
}

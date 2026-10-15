/** Search landing pages (/omegle-alternative, …): server-rendered, unique copy. */
export interface LandingSection {
  h2: string;
  paras: string[];
}

export interface LandingPage {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: LandingSection[];
  faq: { q: string; a: string }[];
}

export const LANDING_PAGES: LandingPage[] = [
  {
    slug: 'omegle-alternative',
    title: 'Omegle Alternative — Free Random Video Chat',
    description:
      'Looking for an Omegle alternative? randomCall is a free random video, voice and text chat that runs in your browser, with report, block and blur tools and an 18+ rule.',
    h1: 'A free Omegle alternative that runs in your browser',
    intro:
      'Omegle closed in November 2023, and with it went the simplest way to meet a stranger online: press a button, see a face, say hello. randomCall keeps that one-click idea and adds the safety tools people asked for. It is free, it works in any modern browser on a phone or a computer, and you can start as a guest.',
    sections: [
      {
        h2: 'How it compares to the old Omegle',
        paras: [
          'The basics are the same. Press Start and you are paired with a random person for a video chat. Press Next and you meet someone else. If you would rather not be on camera, switch to a voice-only call or plain text chat.',
          'What is different is the safety layer. Every call has a report button, a block button and a blur button that hides the other person’s video while you decide whether to stay. Video is screened automatically for nudity, people can earn a ✓ Verified badge, and reports go to human moderators. You must be 18 or older to use randomCall.',
        ],
      },
      {
        h2: 'What you can do on randomCall',
        paras: [
          'Add interests so you are more likely to meet people who like the same things, or join a topic room. If a chat goes well, add the person as a friend and call them again later. You can send a reaction, play a short game together, or translate a message with one tap when you do not share a language.',
          'Gender and country filters are part of Plus, a paid upgrade that also removes ads. Everything else on this page is free.',
        ],
      },
      {
        h2: 'Honest limits',
        paras: [
          'randomCall is a small, independent project, not a relaunch of Omegle and not affiliated with it. Free accounts have a fair-use limit on matches in a short window, and at quiet hours it can take longer to find someone, especially with filters on. Automatic screening helps but is not perfect, so use the report and block tools whenever something feels wrong.',
        ],
      },
    ],
    faq: [
      { q: 'Is randomCall the new Omegle?', a: 'No. It is an independent site with a similar one-click idea. It is not affiliated with Omegle.' },
      { q: 'Is it free?', a: 'Yes. Video, voice and text chat are free. Plus is optional and adds gender and country filters and removes ads.' },
      { q: 'Do I need an account?', a: 'No, you can start as a guest. A free account keeps your friends, coins and settings across devices.' },
      { q: 'Who can use it?', a: 'Only adults. You must be 18 or older, and the community guidelines apply to every chat.' },
    ],
  },
  {
    slug: 'chatroulette-alternative',
    title: 'Chatroulette Alternative — Random Video Chat, Free',
    description:
      'A Chatroulette alternative with video, voice and text chat, interests, topic rooms and built-in report, block and blur tools. Free in your browser, no download.',
    h1: 'A Chatroulette alternative with more ways to talk',
    intro:
      'Chatroulette made random video chat famous: a webcam, a stranger and a Next button. randomCall works the same way at heart, but gives you more control over who you meet and how you talk. It runs in the browser on desktop and mobile, so there is nothing to install.',
    sections: [
      {
        h2: 'Video, voice or text, your choice',
        paras: [
          'Not everyone wants to be on camera every time. On randomCall you choose the mode before you start: a face-to-face video chat, a voice-only call, or a text chat. You can switch whenever you like, and the Next button works the same in every mode.',
          'When a direct connection between browsers is blocked by a strict network, randomCall can route the call through its own servers instead, so more calls connect on office, school and mobile networks.',
        ],
      },
      {
        h2: 'Meet people who share your interests',
        paras: [
          'Instead of pure chance, add a few interests such as music, gaming or language exchange. randomCall tries to pair you with someone who picked the same ones, and tells you what you have in common when the call starts. Topic rooms group people around one subject.',
          'If you want to choose by gender or country, Plus adds those filters. Matching itself stays free for everyone.',
        ],
      },
      {
        h2: 'Safety tools on every call',
        paras: [
          'Each call starts with the other person’s video briefly blurred, and you can blur or hide it at any time. Report and block are one tap away, video is screened automatically for nudity, and reports are reviewed by people. randomCall is for adults only (18+).',
          'randomCall is independent and not affiliated with Chatroulette.',
        ],
      },
    ],
    faq: [
      { q: 'Is randomCall connected to Chatroulette?', a: 'No. randomCall is an independent site and is not affiliated with Chatroulette.' },
      { q: 'Does it work on my phone?', a: 'Yes. It runs in mobile browsers like Chrome and Safari. No app download is needed.' },
      { q: 'Can I chat without a camera?', a: 'Yes. Pick voice or text chat before you start, or turn your camera off during a call.' },
      { q: 'What does Plus add?', a: 'Gender and country filters, an ad-free experience and a few extras. Basic matching is free.' },
    ],
  },
  {
    slug: 'talk-to-strangers',
    title: 'Talk to Strangers Online — Free Video & Text Chat',
    description:
      'Talk to strangers online for free with random video, voice or text chat. No download, guest mode, interests, and report and block tools on every chat. 18+ only.',
    h1: 'Talk to strangers online, safely and for free',
    intro:
      'Sometimes you just want a fresh conversation: someone new to practise a language with, swap music recommendations, or hear what life is like in another country. randomCall pairs you with a random person in a few seconds, in your browser, without asking for your name or phone number.',
    sections: [
      {
        h2: 'How to start a conversation',
        paras: [
          'Open randomCall, confirm you are 18 or older, and allow your camera and microphone if you want video. Press Start. When you are matched, say hello. If the conversation is not for you, press Next and you will meet someone else. That is the whole flow.',
          'Not sure what to say? An icebreaker question can appear at the start of a chat, and a short game gives you something to do together. If you do not share a language, tap a message to translate it.',
        ],
      },
      {
        h2: 'Keep it comfortable',
        paras: [
          'You decide how much to share. Start with text or voice if you are not ready for video, hide your location, and blur the other person’s video until you are sure. If someone is rude or breaks the rules, report or block them with one tap; reports go to human moderators, and video is screened automatically for nudity.',
          'Never share passwords, money or personal details with someone you have just met. The community guidelines explain what is and is not allowed.',
        ],
      },
      {
        h2: 'Turn a good chat into a friendship',
        paras: [
          'If you click with someone, add them as a friend. With a free account you can see your friends again, message them and call them later from any device. You can also earn coins and send small gifts during a call.',
        ],
      },
    ],
    faq: [
      { q: 'Is it really free to talk to strangers here?', a: 'Yes. Random video, voice and text chat are free. Plus is an optional upgrade for filters and no ads.' },
      { q: 'Is it anonymous?', a: 'You can chat as a guest without giving your name, and you can hide your location. Remember the other person can still see and hear you in a video call.' },
      { q: 'How old do I need to be?', a: 'You must be 18 or older to use randomCall.' },
      { q: 'What if someone is inappropriate?', a: 'Press report or block. The chat ends, and the report is reviewed by a moderator.' },
    ],
  },
];

export function landingPage(slug: string): LandingPage {
  const p = LANDING_PAGES.find((x) => x.slug === slug);
  if (!p) throw new Error(`Unknown landing page ${slug}`);
  return p;
}

/** Short labels for footer links. */
export const LANDING_LINKS: [string, string][] = [
  ['/omegle-alternative', 'Omegle alternative'],
  ['/chatroulette-alternative', 'Chatroulette alternative'],
  ['/talk-to-strangers', 'Talk to strangers'],
];

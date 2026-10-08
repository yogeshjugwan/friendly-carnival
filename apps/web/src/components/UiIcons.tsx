/** Stroke icons for the 2026 look (24×24, currentColor unless a colour is given). */
type P = { className?: string; color?: string; strokeWidth?: number };

const svg = (paths: React.ReactNode) =>
  function Icon({ className = 'h-[18px] w-[18px]', color = 'currentColor', strokeWidth = 2 }: P) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {paths}
      </svg>
    );
  };

export const CameraIcon = svg(
  <>
    <path d="M15 10l5-3v10l-5-3z" />
    <rect x="3" y="6" width="12" height="12" rx="2" />
  </>,
);
export const ClockIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const BubbleIcon = svg(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />);
export const BubbleLinesIcon = svg(
  <>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    <path d="M8 11h8M8 14h5" />
  </>,
);
export const GiftIcon = svg(
  <>
    <rect x="3" y="8" width="18" height="13" rx="2" />
    <path d="M12 8v13M3 12h18M7.5 8a2.5 2.5 0 1 1 4.5-1.5V8M16.5 8A2.5 2.5 0 1 0 12 6.5" />
  </>,
);
export const CoinIcon = svg(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3" />
  </>,
);
export const ChevronDownIcon2 = svg(<path d="M6 9l6 6 6-6" />);
export const ChevronRightIcon = svg(<path d="M9 6l6 6-6 6" />);
export const GlobeIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
);
export const BoltIcon = svg(<path d="M13 2L4 14h7l-1 8 9-12h-7z" />);
export const ShieldIcon = svg(
  <>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </>,
);
export const EyeOffIcon = svg(
  <path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3.3M6.6 6.6A16 16 0 0 0 3 12s4 6 9 6a9 9 0 0 0 4.4-1.2" />,
);
export const FlameIcon = svg(<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6.5-4-10-2.5 2-3 4.5-3 6-1.2-.8-2-2.2-2-4C7.5 9 5 12 5 15c0 4.3 3 7 7 7z" />);
export const MicIcon2 = svg(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </>,
);
export const UsersIcon = svg(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14a5 5 0 0 1 4.5 5" />
  </>,
);
export const HeartIcon = svg(<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />);
export const CrownIcon = svg(<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />);
export const DownloadIcon = svg(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);

import type { Gender } from '@rc/shared';

export function flagEmoji(country: string | null): string {
  if (!country) return '🌐';
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function countryName(country: string | null): string {
  if (!country) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(country) ?? country;
  } catch {
    return country;
  }
}

export const GENDER_LABEL: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  couple: 'Couple',
};

export const GENDER_ICON: Record<Gender, string> = {
  male: '♂',
  female: '♀',
  couple: '⚤',
};

import { describe, expect, it } from 'vitest';
import { ageLabel } from '@rc/shared';
import { COUNTRY_PAGES, countryPage } from '../lib/countryPages';
import { flagEmoji } from '../lib/format';

describe('ageLabel', () => {
  it('formats an age', () => {
    expect(ageLabel(18)).toBe('18');
    expect(ageLabel(42)).toBe('42');
  });
});

describe('country pages', () => {
  it('has unique slugs and two-letter codes', () => {
    expect(new Set(COUNTRY_PAGES.map((c) => c.slug)).size).toBe(COUNTRY_PAGES.length);
    for (const c of COUNTRY_PAGES) expect(c.code).toMatch(/^[A-Z]{2}$/);
  });
  it('finds pages by slug', () => {
    expect(countryPage('india')?.code).toBe('IN');
    expect(countryPage('nowhere')).toBeUndefined();
  });
});

describe('flagEmoji', () => {
  it('turns a country code into a flag', () => {
    expect(flagEmoji('IN')).toBe('🇮🇳');
  });
});

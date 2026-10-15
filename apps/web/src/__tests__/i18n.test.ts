import { describe, expect, it } from 'vitest';
import { DICT, EN, LANGS, type TKey } from '../lib/i18n';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const enKeys = Object.keys(EN) as TKey[];

describe('i18n', () => {
  it('has a dictionary for every non-English language', () => {
    for (const l of LANGS) if (l.code !== 'en') expect(DICT[l.code], l.code).toBeDefined();
  });

  for (const [lang, dict] of Object.entries(DICT)) {
    it(`${lang}: translates every English key`, () => {
      const missing = enKeys.filter((k) => !dict[k]);
      expect(missing, `${lang} missing keys`).toEqual([]);
    });
    it(`${lang}: has no unknown keys`, () => {
      expect(Object.keys(dict).filter((k) => !(k in EN))).toEqual([]);
    });
    it(`${lang}: keeps the same {placeholders}`, () => {
      for (const k of enKeys) {
        const v = dict[k];
        if (v) expect(vars(v), `${lang}.${k}`).toEqual(vars(EN[k]));
      }
    });
  }
});

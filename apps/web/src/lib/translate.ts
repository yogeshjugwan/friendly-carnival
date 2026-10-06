'use client';

/**
 * Chat translation with the browser's built-in, on-device Translator and
 * LanguageDetector APIs (Chrome 138+). No server, no API key, nothing sent
 * anywhere. Returns null when the browser can't translate.
 */

interface Detector {
  detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
}
interface TranslatorInstance {
  translate(text: string): Promise<string>;
}
interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorInstance>;
}
interface DetectorStatic {
  create(): Promise<Detector>;
}

const api = () => {
  const g = globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic };
  return g.Translator && g.LanguageDetector ? { Translator: g.Translator, LanguageDetector: g.LanguageDetector } : null;
};

export const translationSupported = () => typeof window !== 'undefined' && !!api();

/** The reader's language, e.g. "en" from "en-IN". */
export const myLanguage = () => (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en');

let detector: Promise<Detector> | null = null;
const translators = new Map<string, Promise<TranslatorInstance>>();

export type Translation = { text: string; from: string } | { same: true } | null;

/** Translates `text` into the reader's language; `{ same: true }` when it's already in it. */
export async function translate(text: string, target = myLanguage()): Promise<Translation> {
  const a = api();
  if (!a) return null;
  try {
    detector ??= a.LanguageDetector.create();
    const [best] = await (await detector).detect(text);
    const from = best?.detectedLanguage;
    if (!from || from === 'und') return null;
    if (from === target) return { same: true };
    const key = `${from}>${target}`;
    if (!translators.has(key)) {
      const availability = await a.Translator.availability({ sourceLanguage: from, targetLanguage: target });
      if (availability === 'unavailable') return null;
      translators.set(key, a.Translator.create({ sourceLanguage: from, targetLanguage: target }));
    }
    const t = await translators.get(key)!;
    return { text: await t.translate(text), from };
  } catch {
    return null;
  }
}

/** "es" → "Spanish", in the reader's language. */
export const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

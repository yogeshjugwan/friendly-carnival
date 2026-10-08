'use client';

/**
 * Chat translation. First the browser's built-in, on-device Translator and
 * LanguageDetector APIs (Chrome 138+: nothing leaves the device); otherwise
 * our server's translation fallback. Returns null when neither can translate.
 */
import { API_URL } from './auth';

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

/** On-device translation (Chrome); everyone else uses the server fallback. */
export const onDeviceTranslation = () => typeof window !== 'undefined' && !!api();
/** Translation works everywhere now (on the device, or through the server). */
export const translationSupported = () => typeof window !== 'undefined';

/** The reader's language, e.g. "en" from "en-IN". */
export const myLanguage = () => (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en');

let detector: Promise<Detector> | null = null;
const translators = new Map<string, Promise<TranslatorInstance>>();

export type Translation = { text: string; from: string } | { same: true } | null;

/** Translates `text` into the reader's language; `{ same: true }` when it's already in it. */
export async function translate(text: string, target = myLanguage()): Promise<Translation> {
  return (await translateOnDevice(text, target)) ?? (await translateOnServer(text, target));
}

/** Fallback for browsers without the built-in Translator: our server's translation provider. */
async function translateOnServer(text: string, target: string): Promise<Translation> {
  try {
    const res = await fetch(`${API_URL}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 500), to: target }),
    });
    return res.ok ? ((await res.json()) as Translation) : null;
  } catch {
    return null;
  }
}

async function translateOnDevice(text: string, target: string): Promise<Translation> {
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

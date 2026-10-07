/**
 * Chat translation for browsers without the built-in Translator API (most
 * phones, Safari, Firefox). Uses Google Cloud Translation when
 * GOOGLE_TRANSLATE_KEY is set, otherwise the free MyMemory API (set
 * MYMEMORY_EMAIL to raise its daily limit). Results are cached in memory.
 */
type Fetch = typeof fetch;

export type TranslateResult = { text: string; from: string } | { same: true } | null;

export interface TranslateConfig {
  googleKey?: string | null;
  myMemoryEmail?: string | null;
}

const CACHE_MAX = 5_000;
const base = (lang: string) => lang.toLowerCase().split('-')[0]!;

export class Translator {
  private cache = new Map<string, TranslateResult>();

  constructor(
    private readonly cfg: TranslateConfig = {},
    private readonly doFetch: Fetch = fetch,
  ) {}

  async translate(text: string, to: string): Promise<TranslateResult> {
    const key = `${base(to)}\u0000${text}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const result = this.cfg.googleKey ? await this.google(text, to) : await this.myMemory(text, to);
    if (result) {
      this.cache.set(key, result);
      if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    }
    return result;
  }

  private async google(text: string, to: string): Promise<TranslateResult> {
    const res = await this.doFetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(this.cfg.googleKey!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: text, target: base(to), format: 'text' }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] } };
    const t = body.data?.translations?.[0];
    if (!t) return null;
    const from = base(t.detectedSourceLanguage ?? '');
    if (from === base(to)) return { same: true };
    return { text: t.translatedText, from };
  }

  private async myMemory(text: string, to: string): Promise<TranslateResult> {
    const params = new URLSearchParams({ q: text, langpair: `Autodetect|${base(to)}` });
    if (this.cfg.myMemoryEmail) params.set('de', this.cfg.myMemoryEmail);
    const res = await this.doFetch(`https://api.mymemory.translated.net/get?${params}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { responseStatus?: number; responseData?: { translatedText?: string; detectedLanguage?: string } };
    if (body.responseStatus !== 200 || !body.responseData?.translatedText) return null;
    const from = base(body.responseData.detectedLanguage ?? '');
    if (from === base(to)) return { same: true };
    const out = body.responseData.translatedText;
    // MyMemory echoes the input when it can't translate.
    if (out.trim().toLowerCase() === text.trim().toLowerCase()) return { same: true };
    return { text: out, from };
  }
}

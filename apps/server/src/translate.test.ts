import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';
import { Translator } from './translate.ts';

test('translation fallback: MyMemory by default, Google with a key, cached, rate-limited', async () => {
  const calls: string[] = [];
  const myMemory = (async (url: string) => {
    calls.push(url);
    const q = new URL(url).searchParams.get('q');
    if (q === 'hello') return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'hello', detectedLanguage: 'en' } }));
    return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'आप कहाँ से हैं?', detectedLanguage: 'es' } }));
  }) as typeof fetch;
  const t = new Translator({}, myMemory);
  assert.deepEqual(await t.translate('¿De dónde eres?', 'hi-IN'), { text: 'आप कहाँ से हैं?', from: 'es' });
  assert.deepEqual(await t.translate('¿De dónde eres?', 'hi'), { text: 'आप कहाँ से हैं?', from: 'es' });
  assert.equal(calls.length, 1, 'cached');
  assert.match(calls[0]!, /langpair=Autodetect%7Chi/);

  const google = new Translator({ googleKey: 'k' }, (async (url: string, init?: RequestInit) => {
    assert.match(url, /translation\.googleapis\.com/);
    assert.equal(JSON.parse(String(init!.body)).target, 'en');
    return new Response(JSON.stringify({ data: { translations: [{ translatedText: 'Where are you from?', detectedSourceLanguage: 'es' }] } }));
  }) as typeof fetch);
  assert.deepEqual(await google.translate('¿De dónde eres?', 'en'), { text: 'Where are you from?', from: 'es' });

  const app = createApp({ store: new MemoryStore(), statsIntervalMs: 60_000, limits: null, translator: t });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}/translate`;
  const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.deepEqual(await (await post({ text: 'hello', to: 'en' })).json(), { same: true });
    assert.equal((await post({ text: 'x'.repeat(501), to: 'en' })).status, 400);
    assert.equal((await post({ text: 'hi', to: 'english!' })).status, 400);
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) codes.push((await post({ text: '¿De dónde eres?', to: 'hi' })).status);
    assert.equal(codes.at(-1), 429);
  } finally {
    await app.close();
  }
});

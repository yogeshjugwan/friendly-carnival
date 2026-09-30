import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrigins } from './config.ts';

test('parseOrigins keeps exact origins and expands wildcard subdomains', () => {
  const [wild, exact] = parseOrigins('https://*.vercel.app, http://localhost:3000');
  assert.ok(wild instanceof RegExp);
  assert.ok(wild.test('https://random-call.vercel.app'));
  assert.ok(wild.test('https://random-call-git-main-yogesh.vercel.app'));
  assert.ok(!wild.test('https://evil.com'));
  assert.ok(!wild.test('https://vercel.app.evil.com'));
  assert.ok(!wild.test('http://random-call.vercel.app'));
  assert.equal(exact, 'http://localhost:3000');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableGifts } from '@rc/shared';

const at = (iso: string) => Date.parse(iso);
const ids = (now: number) => availableGifts(now).map((g) => g.id);

test('festival gifts appear only in season (IST), including windows across New Year', () => {
  assert.ok(!ids(at('2026-10-01T12:00:00Z')).includes('diya'));
  assert.ok(ids(at('2026-11-01T12:00:00Z')).includes('diya'));
  assert.ok(ids(at('2026-12-31T12:00:00Z')).includes('newyear'));
  assert.ok(ids(at('2027-01-05T12:00:00Z')).includes('newyear'), 'window wraps the new year');
  assert.ok(!ids(at('2027-01-10T12:00:00Z')).includes('newyear'));
  assert.ok(ids(at('2027-01-10T12:00:00Z')).includes('kite'));
  // 20 Nov 20:00 UTC is already 21 Nov in India.
  assert.ok(ids(at('2026-11-20T20:00:00Z')).every((id) => id !== 'diya'), 'IST: 21 Nov is out of season');
  // Regular gifts are always there.
  for (const id of ['chai', 'rose', 'diamond', 'car']) assert.ok(ids(at('2026-06-01T00:00:00Z')).includes(id));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from './matchmaker.ts';

const setup = (...ids: string[]) => {
  const mm = new Matchmaker(5);
  ids.forEach((id) => mm.connect(id, null));
  return mm;
};

test('first user waits, second user pairs with them', () => {
  const mm = setup('a', 'b');
  assert.equal(mm.join('a', 'male', []), null);
  const pairing = mm.join('b', 'female', []);
  assert.ok(pairing);
  assert.equal(pairing.a.id, 'a');
  assert.equal(pairing.b.id, 'b');
  assert.equal(mm.partnerOf('a')?.id, 'b');
  assert.equal(mm.waitingCount, 0);
});

test('prefers the waiting user with the most shared interests', () => {
  const mm = setup('a', 'b', 'c');
  // Pair a and b once so they become recent partners and both wait in the queue.
  mm.join('a', 'male', []);
  mm.join('b', 'male', []);
  mm.endMatch('a');
  mm.join('a', 'male', ['music']);
  mm.join('b', 'male', ['music', 'chess']);
  assert.equal(mm.waitingCount, 2);
  const pairing = mm.join('c', 'female', ['chess', 'music']);
  assert.equal(pairing?.a.id, 'b');
  assert.deepEqual(pairing?.sharedInterests, ['music', 'chess']);
});

test('falls back to the longest waiter on a tie', () => {
  const mm = setup('a', 'b', 'c');
  mm.join('a', 'male', []);
  mm.join('b', 'male', []);
  // a and b paired with each other; queue is empty now
  assert.equal(mm.partnerOf('a')?.id, 'b');
  mm.connect('d', null);
  mm.join('c', 'male', []);
  assert.equal(mm.join('d', 'male', [])?.a.id, 'c');
});

test('does not re-match recent partners', () => {
  const mm = setup('a', 'b');
  mm.join('a', 'male', []);
  mm.join('b', 'male', []);
  mm.endMatch('a');
  assert.equal(mm.join('a', 'male', []), null);
  assert.equal(mm.join('b', 'male', []), null);
  assert.equal(mm.waitingCount, 2);
});

test('disconnect frees the partner and removes the session', () => {
  const mm = setup('a', 'b');
  mm.join('a', 'male', []);
  mm.join('b', 'male', []);
  assert.equal(mm.disconnect('a')?.id, 'b');
  assert.equal(mm.get('b')?.partnerId, null);
  assert.equal(mm.onlineCount, 1);
});

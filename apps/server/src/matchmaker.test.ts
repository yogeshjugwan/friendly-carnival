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
  assert.equal(mm.join('a', 'male', [], 'video'), null);
  const pairing = mm.join('b', 'female', [], 'video');
  assert.ok(pairing);
  assert.equal(pairing.a.id, 'a');
  assert.equal(pairing.b.id, 'b');
  assert.equal(mm.partnerOf('a')?.id, 'b');
  assert.equal(mm.waitingCount, 0);
});

test('prefers the waiting user with the most shared interests', () => {
  const mm = setup('a', 'b', 'c');
  // Pair a and b once so they become recent partners and both wait in the queue.
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  mm.endMatch('a');
  mm.join('a', 'male', ['music'], 'video');
  mm.join('b', 'male', ['music', 'chess'], 'video');
  assert.equal(mm.waitingCount, 2);
  const pairing = mm.join('c', 'female', ['chess', 'music'], 'video');
  assert.equal(pairing?.a.id, 'b');
  assert.deepEqual(pairing?.sharedInterests, ['music', 'chess']);
});

test('falls back to the longest waiter on a tie', () => {
  const mm = setup('a', 'b', 'c');
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  // a and b paired with each other; queue is empty now
  assert.equal(mm.partnerOf('a')?.id, 'b');
  mm.connect('d', null);
  mm.join('c', 'male', [], 'video');
  assert.equal(mm.join('d', 'male', [], 'video')?.a.id, 'c');
});

test('does not re-match recent partners', () => {
  const mm = setup('a', 'b');
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  mm.endMatch('a');
  assert.equal(mm.join('a', 'male', [], 'video'), null);
  assert.equal(mm.join('b', 'male', [], 'video'), null);
  assert.equal(mm.waitingCount, 2);
});

test('disconnect frees the partner and removes the session', () => {
  const mm = setup('a', 'b');
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  assert.equal(mm.disconnect('a')?.id, 'b');
  assert.equal(mm.get('b')?.partnerId, null);
  assert.equal(mm.onlineCount, 1);
});

test('video and text users are never matched together', () => {
  const mm = setup('v', 't', 't2');
  assert.equal(mm.join('v', 'male', [], 'video'), null);
  assert.equal(mm.join('t', 'male', [], 'text'), null);
  assert.equal(mm.waitingCount, 2);
  assert.equal(mm.join('t2', 'female', [], 'text')?.a.id, 't');
});

test('Back reconnects with the partner you just skipped while they search', () => {
  const mm = setup('a', 'b');
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  mm.endMatch('a'); // a pressed Next
  mm.rejoin('a');
  mm.rejoin('b');
  const back = mm.reconnect('a');
  assert.ok(typeof back !== 'string');
  assert.equal(back.reconnected, true);
  assert.equal(mm.partnerOf('a')?.id, 'b');
  assert.equal(mm.waitingCount, 0);
});

test('Back during a live call targets the previous partner, not the current one', () => {
  const mm = setup('a', 'b', 'c');
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  mm.endMatch('a');
  mm.rejoin('a'); // a waits; b is a recent partner
  mm.join('c', 'male', [], 'video'); // c meets a
  assert.equal(mm.partnerOf('a')?.id, 'c');
  mm.rejoin('b'); // b keeps searching
  const back = mm.reconnect('a');
  assert.ok(typeof back !== 'string');
  assert.equal(mm.partnerOf('a')?.id, 'b');
  assert.equal(mm.get('c')?.partnerId, null);
});

test('Back is refused when the partner opted out, left, or is busy', () => {
  const mm = setup('a', 'b', 'c', 'd');
  assert.equal(mm.reconnect('a'), 'no-previous');
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  mm.endMatch('a');
  mm.setAllowReconnect('b', false);
  mm.rejoin('b');
  assert.equal(mm.reconnect('a'), 'declined');
  mm.setAllowReconnect('b', true);
  mm.leaveQueue('b'); // b pressed Stop
  assert.equal(mm.reconnect('a'), 'busy');
  mm.disconnect('b');
  assert.equal(mm.reconnect('a'), 'gone');
});

test('sweep re-matches recent partners only after both waited long enough', () => {
  const mm = new Matchmaker(5, 8_000);
  mm.connect('a', null);
  mm.connect('b', null);
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  mm.endMatch('a'); // the call failed / someone pressed Next
  mm.rejoin('a');
  mm.rejoin('b');
  assert.equal(mm.waitingCount, 2, 'recent partners are not matched straight away');
  assert.deepEqual(mm.sweep(Date.now() + 3_000), [], 'not yet: only 3 s waited');
  const pairings = mm.sweep(Date.now() + 9_000);
  assert.equal(pairings.length, 1, 'after 8 s they can meet again');
  assert.equal(mm.partnerOf('a')?.id, 'b');
  assert.equal(mm.waitingCount, 0);
});

test('sweep never re-matches blocked users or different modes', () => {
  const mm = new Matchmaker(5, 8_000);
  mm.connect('a', null, { deviceId: 'dev-a' });
  mm.connect('b', null, { deviceId: 'dev-b' });
  mm.join('a', 'male', [], 'video');
  mm.join('b', 'male', [], 'video');
  mm.endMatch('a');
  mm.block('dev-a', 'dev-b');
  mm.rejoin('a');
  mm.rejoin('b');
  assert.deepEqual(mm.sweep(Date.now() + 60_000), []);

  mm.connect('t', null);
  mm.join('t', 'male', [], 'text');
  assert.deepEqual(mm.sweep(Date.now() + 60_000), [], 'text and video never meet');
});

test('a Plus man with "Girls only" never meets a man; free users meet anyone', () => {
  const mm = new Matchmaker(5);
  mm.connect('plusMan', null, { plus: true });
  ['freeMan', 'woman', 'freeMan2'].forEach((id) => mm.connect(id, null));
  assert.equal(mm.join('plusMan', 'male', [], 'video', false, { gender: 'female', country: 'any' }), null);
  // Another man arrives: not paired with the Plus man.
  assert.equal(mm.join('freeMan', 'male', [], 'video'), null);
  assert.equal(mm.waitingCount, 2);
  // A woman arrives and meets the Plus man (the longest waiter who accepts her).
  const pairing = mm.join('woman', 'female', [], 'video');
  assert.deepEqual([pairing?.a.id, pairing?.b.id].sort(), ['plusMan', 'woman']);
  // Free men still meet anyone, including other men.
  const next = mm.join('freeMan2', 'male', [], 'video');
  assert.deepEqual([next?.a.id, next?.b.id].sort(), ['freeMan', 'freeMan2']);
});

test('topic rooms: same topic first; other topics only after both waited', () => {
  const mm = new Matchmaker(5, 8_000);
  ['music1', 'gaming', 'music2'].forEach((id) => mm.connect(id, null));
  assert.equal(mm.join('music1', 'male', [], 'video', false, undefined, false, 'music'), null);
  // A gamer doesn't meet the music room straight away…
  assert.equal(mm.join('gaming', 'female', [], 'video', false, undefined, false, 'gaming'), null);
  // …but another music fan does.
  const p = mm.join('music2', 'female', [], 'video', false, undefined, false, 'music');
  assert.deepEqual([p?.a.id, p?.b.id].sort(), ['music1', 'music2']);
  assert.equal(p?.a.topic, 'music');

  // Alone in a room for a while: the sweep lets different topics meet.
  mm.connect('music3', null);
  mm.join('music3', 'male', [], 'video', false, undefined, false, 'music');
  assert.equal(mm.sweep(Date.now()).length, 0, 'not yet');
  assert.equal(mm.sweep(Date.now() + 10_000).length, 1, 'after both waited');
});

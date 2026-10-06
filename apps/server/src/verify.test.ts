import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, PendingVerification, PublicUser, ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, NO_PLUS } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg').toString('base64');

test('verification: selfie with a server-picked gesture, admin approval, Verified-only filter', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, adminToken: 'adm', statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const call = async (path: string, token: string, body?: unknown) => {
    const res = await fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const open: Client[] = [];
  const sock = async (deviceId: string, token?: string): Promise<Client> => {
    const s: Client = connect(url, { auth: token ? { deviceId, token } : { deviceId }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  try {
    const u = (await accounts.createUser('me@example.com', 'h')) as { id: string };
    const token = await accounts.createToken(u.id, 'session');

    assert.equal((await call('/auth/verification', token, { photo: PHOTO })).status, 400, 'needs a challenge first');
    const ch = await call('/auth/verification/challenge', token, {});
    assert.equal(ch.status, 200);
    assert.equal(typeof ch.body.gesture, 'string');
    assert.equal((await call('/auth/verification', token, { photo: 'data:image/png;base64,AAAA' })).status, 400, 'JPEG only');
    const sent = await call('/auth/verification', token, { photo: PHOTO });
    assert.equal(sent.status, 200);
    assert.equal((sent.body as unknown as PublicUser).verification, 'pending');
    assert.equal((await call('/auth/verification', token, { photo: PHOTO })).status, 400, 'a challenge works once');

    assert.equal((await call('/admin/verifications', 'wrong')).status, 401);
    const list = (await call('/admin/verifications', 'adm')).body as unknown as PendingVerification[];
    assert.equal(list.length, 1);
    assert.equal(list[0].gesture, ch.body.gesture);
    assert.equal(list[0].email, 'me@example.com');

    assert.equal((await call(`/admin/verifications/${u.id}/resolve`, 'adm', { approve: true })).status, 200);
    assert.equal(((await call('/auth/me', token)).body as unknown as PublicUser).verification, 'verified');
    assert.equal(((await call('/admin/verifications', 'adm')).body as unknown as unknown[]).length, 0, 'photo is deleted');

    // Plus user filtering for Verified only: a guest is skipped, the verified user matches.
    const p = (await accounts.createUser('plus@example.com', 'h')) as { id: string };
    await accounts.setPlus(p.id, { ...NO_PLUS, status: 'admin', until: Date.now() + 86_400_000 });
    const plus = await sock('11111111-1111-4111-8111-111111111111', await accounts.createToken(p.id, 'session'));
    plus.emit('queue:join', { gender: 'male', interests: [], mode: 'text', filters: { gender: 'any', country: 'any', verifiedOnly: true } });
    await once(plus, 'queue:waiting');

    const guest = await sock('22222222-2222-4222-8222-222222222222');
    guest.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await once(guest, 'queue:waiting');

    const verified = await sock('33333333-3333-4333-8333-333333333333', token);
    const m = once(plus, 'match:found');
    verified.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    assert.equal((await m).partner.verified, true);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('verification storage works the same in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { PostgresAccountStore } = await import('./accounts.ts');
  const { Pool } = newDb().adapters.createPg();
  for (const accounts of [new MemoryAccountStore(), new PostgresAccountStore(new Pool())]) {
    await accounts.init();
    const u = (await accounts.createUser('v@example.com', 'h')) as { id: string };
    await accounts.submitVerification(u.id, 'peace', PHOTO);
    await accounts.submitVerification(u.id, 'ok', PHOTO);
    const list = await accounts.listPendingVerifications();
    assert.deepEqual(list.map((v) => [v.email, v.gesture]), [['v@example.com', 'ok']], 'resubmitting replaces');
    assert.equal((await accounts.userById(u.id))!.verifyStatus, 'pending');

    assert.equal(await accounts.resolveVerification(u.id, false), true);
    assert.equal((await accounts.userById(u.id))!.verifyStatus, 'rejected');
    assert.equal(await accounts.resolveVerification(u.id, true), false, 'nothing pending any more');

    await accounts.submitVerification(u.id, 'palm', PHOTO);
    assert.equal(await accounts.resolveVerification(u.id, true), true);
    const v = (await accounts.userById(u.id))!;
    assert.ok(v.verifiedAt && v.verifyStatus === null);
    await accounts.revokeVerification(u.id);
    assert.equal((await accounts.userById(u.id))!.verifiedAt, null);
    await accounts.deleteUser(u.id);
  }
});

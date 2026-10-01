import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { MemoryStore, type SafetyStore } from './store.ts';
import { PostgresStore } from './store-postgres.ts';

const report = (reporter: string, target: string, extra: Partial<Parameters<SafetyStore['addReport']>[0]> = {}) => ({
  reporterDevice: reporter,
  targetDevice: target,
  targetIpHash: 'ip-' + target,
  targetUserId: null,
  reason: 'harassment' as const,
  source: 'user' as const,
  note: null,
  snapshot: null,
  aiScore: null,
  ...extra,
});

const stores: [string, () => Promise<SafetyStore>][] = [
  ['MemoryStore', async () => new MemoryStore()],
  [
    'PostgresStore (pg-mem)',
    async () => {
      const { Pool } = newDb().adapters.createPg();
      const store = new PostgresStore(new Pool());
      await store.init();
      return store;
    },
  ],
];

for (const [name, make] of stores) {
  describe(name, () => {
    test('reports: add, list open oldest first, count distinct reporters, resolve', async () => {
      const s = await make();
      const r1 = await s.addReport(report('a', 'x'));
      await s.addReport(report('a', 'x'));
      await s.addReport(report('b', 'x', { source: 'ai', reason: 'nudity', aiScore: 0.97 }));
      assert.equal((await s.listReports('open')).length, 3);
      assert.equal((await s.listReports('open'))[0]!.id, r1.id);
      assert.equal(await s.distinctReporters('x', 0), 2);
      assert.equal(await s.distinctReporters('x', 0, 'user'), 1);
      assert.equal(await s.distinctReporters('x', 0, 'ai'), 1);
      assert.ok((await s.oldestOpenReportAt())! <= Date.now());
      const resolved = await s.resolveReport(r1.id, 'dismissed', 'test');
      assert.equal(resolved?.status, 'dismissed');
      assert.equal(await s.resolveOpenReportsFor('x', 'banned'), 2);
      assert.equal((await s.listReports('open')).length, 0);
      assert.equal(await s.oldestOpenReportAt(), null);
    });

    test('bans: match by device or IP, longest wins, expiry and lifting', async () => {
      const s = await make();
      const now = Date.now();
      await s.addBan({ deviceId: 'd1', ipHash: 'ip1', userId: null, reason: 'short', source: 'auto', expiresAt: now + 1_000 });
      const perm = await s.addBan({ deviceId: 'd1', ipHash: null, userId: null, reason: 'perm', source: 'admin', expiresAt: null });
      await s.addBan({ deviceId: 'd2', ipHash: 'ip2', userId: null, reason: 'old', source: 'auto', expiresAt: now - 1 });

      assert.equal((await s.activeBan('d1', null))?.id, perm.id);
      assert.equal((await s.activeBan('other', 'ip1'))?.reason, 'short');
      assert.equal(await s.activeBan('d2', 'ip2'), null, 'expired bans are ignored');
      assert.equal(await s.activeBan('nobody', null), null, 'a null ip hash never matches');
      assert.equal((await s.listBans(true)).length, 2);
      assert.equal((await s.listBans(false)).length, 3);

      await s.liftBan(perm.id);
      assert.equal((await s.activeBan('d1', null))?.reason, 'short');

      await s.addBan({ deviceId: 'd9', ipHash: null, userId: 'user-1', reason: 'account', source: 'admin', expiresAt: null });
      assert.equal((await s.activeBan('new-device', null, 'user-1'))?.reason, 'account', 'bans follow the account');
      assert.equal(await s.activeBan('new-device', null, 'user-2'), null);
    });

    test('blocks are symmetric and idempotent', async () => {
      const s = await make();
      await s.addBlock('a', 'b');
      await s.addBlock('a', 'b');
      await s.addBlock('c', 'a');
      assert.deepEqual([...(await s.blocksFor('a'))].sort(), ['b', 'c']);
      assert.deepEqual([...(await s.blocksFor('b'))], ['a']);
    });

    test('appeals: one open per ban, resolve', async () => {
      const s = await make();
      const ban = await s.addBan({ deviceId: 'd', ipHash: null, userId: null, reason: 'r', source: 'admin', expiresAt: null });
      assert.equal(await s.hasOpenAppeal(ban.id), false);
      const appeal = await s.addAppeal(ban.id, 'd', 'It was a mistake');
      assert.equal(await s.hasOpenAppeal(ban.id), true);
      assert.equal((await s.listAppeals('open')).length, 1);
      assert.equal((await s.resolveAppeal(appeal.id, 'approved'))?.status, 'approved');
      assert.equal(await s.hasOpenAppeal(ban.id), false);
    });

    test('purges snapshots past retention', async () => {
      const s = await make();
      await s.addReport(report('a', 'x', { snapshot: 'data:image/jpeg;base64,AAAA' }));
      assert.equal(await s.purgeSnapshots(Date.now() + 1), 1);
      assert.equal((await s.listReports('open'))[0]!.snapshot, null);
    });
  });
}

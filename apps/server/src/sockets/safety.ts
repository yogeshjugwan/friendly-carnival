import { log } from '../log.ts';
import { createHash } from 'node:crypto';
import { MAX_APPEAL_LENGTH, type BlockedUser } from '@rc/shared';
import { parseReport } from '../safety.ts';
import { parseReportTarget } from '../validate.ts';
import { REPORT_BURST, REPORT_WINDOW_MS, type AppContext, type SocketScope } from './context.ts';

export function registerSafety(ctx: AppContext, scope: SocketScope) {
  const { io, matchmaker, store, accounts, safety, analytics, notifyLeft, announce, refreshTrust, setAgeHold } = ctx;
  const { socket, deviceId, ipHash, userId } = scope;
  const targetSocketId = (target: 'current' | 'previous') =>
    target === 'current' ? matchmaker.get(socket.id)?.partnerId ?? undefined : matchmaker.previousPartnerId(socket.id);

  socket.on('report:submit', async (payload) => {
    const report = parseReport(payload);
    if (!report) return void socket.emit('report:rejected', 'invalid');
    const now = Date.now();
    const times = socket.data.reportsAt;
    while (times.length && now - times[0]! > REPORT_WINDOW_MS) times.shift();
    if (times.length >= REPORT_BURST) return void socket.emit('report:rejected', 'rate-limited');

    const targetId = targetSocketId(report.target);
    const target = targetId ? matchmaker.identityOf(targetId) : undefined;
    if (!target) return void socket.emit('report:rejected', 'no-target');
    times.push(now);

    try {
      await safety.report({ deviceId, ipHash, userId }, target, report);
      analytics.count('reports');
      if (targetId) void refreshTrust(targetId).catch(() => undefined);
      // Reported as underage: pause their account until they pass ✓ verification.
      if (report.reason === 'underage' && target.userId) {
        const t = await accounts.userById(target.userId);
        if (t && !t.verifiedAt) {
          await accounts.setAgeReview(t.id, true);
          setAgeHold(t.id, 'review');
        }
      }
      // People you report are never matched with you again.
      if (report.source === 'user') {
        await store.addBlock(deviceId, target.deviceId);
        matchmaker.block(deviceId, target.deviceId);
      }
      socket.emit('report:received');
    } catch (e) {
      log.error('report', e);
      socket.emit('report:rejected', 'invalid');
    }
  });

  socket.on('user:block', async (which) => {
    const target0 = parseReportTarget(which);
    if (!target0) return;
    const targetId = targetSocketId(target0);
    const target = targetId ? matchmaker.identityOf(targetId) : undefined;
    if (!target) return;
    // Remember what the blocker saw, for their Blocked list.
    const seen = targetId ? matchmaker.get(targetId) : undefined;
    const info = { gender: seen?.gender ?? null, country: seen && !seen.hideCountry ? seen.country : null };
    await store.addBlock(deviceId, target.deviceId, info).catch((e) => log.error('block', e));
    // Blocking a friend also ends the friendship.
    if (socket.data.userId && target.userId) await accounts.removeFriendship(socket.data.userId, target.userId).catch(() => undefined);
    matchmaker.block(deviceId, target.deviceId);
    socket.emit('user:blocked');
    if (target0 === 'current' && matchmaker.get(socket.id)?.partnerId === targetId) {
      notifyLeft(matchmaker.endMatch(socket.id)?.id, 'next');
      const pairing = matchmaker.rejoin(socket.id);
      if (pairing) announce(pairing);
      else socket.emit('queue:waiting');
    }
  });

  /** Opaque handle for a block, so the other device's id never reaches the browser. */
  const blockHandle = (blocked: string) => createHash('sha256').update(`${deviceId}:${blocked}`).digest('base64url').slice(0, 16);

  socket.on('blocks:list', async (ack) => {
    if (typeof ack !== 'function') return;
    const list = await store.listBlocks(deviceId).catch(() => []);
    ack(
      list.map((b) => ({
        id: blockHandle(b.blocked),
        gender: (b.gender as BlockedUser['gender']) ?? null,
        country: b.country,
        createdAt: b.createdAt,
      })),
    );
  });

  socket.on('blocks:remove', async (id, ack) => {
    const done = typeof ack === 'function' ? ack : () => undefined;
    if (typeof id !== 'string') return done(false);
    try {
      const match = (await store.listBlocks(deviceId)).find((b) => blockHandle(b.blocked) === id);
      if (!match || !(await store.removeBlock(deviceId, match.blocked))) return done(false);
      // Refresh both sides' live block lists (they may still block each other the other way).
      for (const dev of [deviceId, match.blocked]) {
        const set = await store.blocksFor(dev);
        matchmaker.setBlocked(dev, set);
        for (const s of io.sockets.sockets.values()) if (s.data.deviceId === dev) s.data.blocked = set;
      }
      done(true);
    } catch (e) {
      log.error('unblock', e);
      done(false);
    }
  });

  socket.on('ban:appeal', async (message) => {
    const ban = socket.data.ban;
    if (!ban || ban.appealPending || typeof message !== 'string') return;
    const text = message.trim().slice(0, MAX_APPEAL_LENGTH);
    if (!text) return;
    if (await store.hasOpenAppeal(ban.banId)) return;
    await store.addAppeal(ban.banId, deviceId, text);
    socket.data.ban = { ...ban, appealPending: true };
    socket.emit('ban:appealed');
    socket.emit('banned', socket.data.ban);
  });
}

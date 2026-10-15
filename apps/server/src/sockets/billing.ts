import { log } from '../log.ts';
import { BOOST, GIFT_SHARE, MATCHES_FOR_COINS, PRIORITY_MATCH, availableGifts, type SpendResult } from '@rc/shared';
import type { AppContext, SocketScope } from './context.ts';

export function registerBilling(ctx: AppContext, scope: SocketScope) {
  const { io, opts, matchmaker, accounts, analytics, limits, limitKey, announce, pushWallet, priorityTimers } = ctx;
  const { socket, stillBanned } = scope;
  // ---- Coins: gifts, Boost, matches ----
  /** Spends coins from my account; replies with the new wallet or why not. */
  const spend = async (coins: number, reason: string): Promise<SpendResult> => {
    const me = socket.data.userId;
    if (!me) return { ok: false, reason: 'login' };
    const balance = await accounts.changeCoins(me, -coins, reason);
    if (balance === null) return { ok: false, reason: 'coins' };
    const w = (await pushWallet(me)) ?? { coins: balance, boostUntil: null };
    return { ok: true, wallet: w };
  };

  socket.on('gift:send', async (giftId, ack) => {
    const done = typeof ack === 'function' ? ack : () => undefined;
    const gift = availableGifts().find((g) => g.id === giftId);
    if (!gift) return done({ ok: false, reason: 'invalid' });
    const partner = matchmaker.partnerOf(socket.id);
    if (!partner) return done({ ok: false, reason: 'no-partner' });
    try {
      const me = socket.data.userId;
      if (!me) return done({ ok: false, reason: 'login' });
      // The receiver earns a share if they have an account; both legs move in one transaction.
      const theirId = io.sockets.sockets.get(partner.id)?.data.userId ?? null;
      const earned = theirId ? Math.floor(gift.coins * GIFT_SHARE) : 0;
      const balance = await accounts.transferCoins(me, theirId, gift.coins, earned, `gift:${gift.id}`, `gift-received:${gift.id}`);
      if (balance === null) return done({ ok: false, reason: 'coins' });
      const r: SpendResult = { ok: true, wallet: (await pushWallet(me)) ?? { coins: balance, boostUntil: null } };
      if (theirId && earned) void pushWallet(theirId);
      socket.emit('gift', { giftId: gift.id, from: 'me', earned });
      io.to(partner.id).emit('gift', { giftId: gift.id, from: 'them', earned });
      analytics.count('gifts');
      done(r);
    } catch (e) {
      log.error('gift', e);
      done({ ok: false, reason: 'invalid' });
    }
  });

  socket.on('boost:buy', async (ack) => {
    const done = typeof ack === 'function' ? ack : () => undefined;
    try {
      const me = socket.data.userId;
      const r = await spend(BOOST.coins, 'boost');
      if (!r.ok) return done(r);
      if (!me) return done({ ok: false, reason: 'login' });
      // Extends an active Boost.
      const current = (await accounts.userById(me))?.boostUntil ?? 0;
      const until = Math.max(Date.now(), current) + BOOST.minutes * 60_000;
      await accounts.setBoost(me, until);
      analytics.count('boosts');
      matchmaker.setBoost(me, until);
      const w = await pushWallet(me);
      done(w ? { ok: true, wallet: w } : r);
    } catch (e) {
      log.error('boost', e);
      done({ ok: false, reason: 'invalid' });
    }
  });

  socket.on('match:priority', async (ack) => {
    const done = typeof ack === 'function' ? ack : () => undefined;
    const session = matchmaker.get(socket.id);
    if (!session || session.partnerId || session.priority || priorityTimers.has(socket.id) || stillBanned()) {
      return done({ ok: false, reason: 'invalid' });
    }
    try {
      const me = socket.data.userId;
      const r = await spend(PRIORITY_MATCH.coins, 'priority');
      if (!r.ok) return done(r);
      if (!me) return done({ ok: false, reason: 'login' });
      analytics.count('priorityMatches');
      // No verified person in time: give the coins back.
      priorityTimers.set(
        socket.id,
        setTimeout(() => {
          priorityTimers.delete(socket.id);
          matchmaker.setPriority(socket.id, false);
          void accounts
            .changeCoins(me, PRIORITY_MATCH.coins, 'priority-refund')
            .then(() => pushWallet(me))
            .catch((e) => log.error('priority', e));
          socket.emit('priority:expired');
        }, opts.priorityWaitMs ?? PRIORITY_MATCH.waitMinutes * 60_000),
      );
      done(r);
      const pairing = matchmaker.setPriority(socket.id, true);
      if (pairing) announce(pairing);
    } catch (e) {
      log.error('priority', e);
      done({ ok: false, reason: 'invalid' });
    }
  });

  socket.on('limit:buy', async (ack) => {
    const done = typeof ack === 'function' ? ack : () => undefined;
    if (!limits) return done({ ok: false, reason: 'invalid' });
    try {
      const r = await spend(MATCHES_FOR_COINS.coins, 'matches');
      if (!r.ok) return done(r);
      const key = limitKey(socket.data);
      limits.addBonus(key, MATCHES_FOR_COINS.matches);
      socket.emit('limit:granted', limits.status(key, socket.data.plus));
      done(r);
    } catch (e) {
      log.error('limit:buy', e);
      done({ ok: false, reason: 'invalid' });
    }
  });

  socket.on('limit:ad-start', () => {
    if (!limits) return;
    const result = limits.startAd(limitKey(socket.data));
    if (result !== 'ok') socket.emit('limit:ad-rejected', result);
  });

  socket.on('limit:ad-done', () => {
    if (!limits) return;
    const key = limitKey(socket.data);
    const result = limits.finishAd(key);
    if (result === 'ok') {
      socket.emit('limit:granted', limits.status(key, socket.data.plus));
      analytics.count('adsWatched');
    } else socket.emit('limit:ad-rejected', result);
  });
}

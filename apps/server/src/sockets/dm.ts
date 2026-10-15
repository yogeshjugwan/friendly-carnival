import { log } from '../log.ts';
import { createHash } from 'node:crypto';
import { DM_REQUEST_LIMIT, MAX_FRIEND_NICKNAME, type ChatMode, type DirectMessage, type Friend, type HistoryPerson } from '@rc/shared';
import { MAX_FRIENDS, type HistoryRow, type StoredMessage } from '../accounts.ts';
import type { Session } from '../matchmaker.ts';
import { parseChatText } from '../validate.ts';
import type { AppContext, SocketScope } from './context.ts';

export function registerDm(ctx: AppContext, scope: SocketScope) {
  const { io, matchmaker, accounts, push, friendWants, friendHandleFor } = ctx;
  const { socket, startRequest } = scope;
  // ---- Friends (accounts only) ----
  const myUser = () => socket.data.userId;
  /** Opaque per-user handle for a friend, so account ids never reach the browser. */
  const friendHandle = (friendId: string) => createHash('sha256').update(`f:${myUser()}:${friendId}`).digest('base64url').slice(0, 16);
  const resolveFriend = async (handle: unknown) => {
    const me = myUser();
    if (!me || typeof handle !== 'string') return null;
    return (await accounts.listFriends(me)).find((f) => friendHandle(f.friendId) === handle) ?? null;
  };
  /**
   * Someone you may message: a friend, a person from your History with an
   * account, or someone who messaged you.
   */
  const resolveContact = async (handle: unknown): Promise<{ userId: string; friend: boolean; label: string } | null> => {
    const me = myUser();
    if (!me || typeof handle !== 'string') return null;
    const friend = (await accounts.listFriends(me)).find((f) => friendHandle(f.friendId) === handle);
    if (friend) return { userId: friend.friendId, friend: true, label: friend.nickname ?? '' };
    const met = (await accounts.historyOf(me, 1000)).find((h) => h.partnerUserId && friendHandle(h.partnerUserId) === handle);
    if (met?.partnerUserId) return { userId: met.partnerUserId, friend: false, label: met.name };
    const thread = (await accounts.threadsOf(me)).find((t) => friendHandle(t.other) === handle);
    return thread ? { userId: thread.other, friend: false, label: '' } : null;
  };
  /** The best socket of a user: a free one in the call screen first. */
  const socketsOfUser = (userId: string) => [...io.sockets.sockets.values()].filter((x) => x.data.userId === userId);

  socket.on('friend:add', async () => {
    const partner = matchmaker.partnerOf(socket.id);
    const me = matchmaker.get(socket.id);
    if (!partner || !me?.matchId) return;
    const myId = myUser();
    const partnerSocket = io.sockets.sockets.get(partner.id);
    const theirId = partnerSocket?.data.userId ?? null;
    if (!myId) return void socket.emit('friend:state', 'login-required');
    if (!theirId) return void socket.emit('friend:state', 'partner-guest');
    try {
      if (await accounts.isFriend(myId, theirId)) {
        socket.emit('friend:state', 'friends');
        return;
      }
      if ((await accounts.listFriends(myId)).length >= MAX_FRIENDS) return void socket.emit('friend:state', 'full');
      const wants = friendWants.get(me.matchId) ?? new Set<string>();
      wants.add(myId);
      friendWants.set(me.matchId, wants);
      if (!wants.has(theirId)) {
        socket.emit('friend:state', 'requested');
        io.to(partner.id).emit('friend:state', 'they-requested');
        return;
      }
      friendWants.delete(me.matchId);
      const seen = (s: Session) => ({ gender: s.gender, country: s.hideCountry ? null : s.country });
      await accounts.addFriend(myId, theirId, seen(partner));
      await accounts.addFriend(theirId, myId, seen(me));
      socket.emit('friend:state', 'friends');
      io.to(partner.id).emit('friend:state', 'friends');
    } catch (e) {
      log.error('friend:add', e);
    }
  });

  socket.on('friends:list', async (ack) => {
    if (typeof ack !== 'function') return;
    const me = myUser();
    if (!me) return ack(null);
    try {
      const [list, unread] = await Promise.all([accounts.listFriends(me), accounts.unreadCounts(me)]);
      ack(
        list.map((f) => {
          const socks = socketsOfUser(f.friendId);
          const sessions = socks.map((x) => matchmaker.get(x.id)).filter((x): x is Session => !!x);
          const status: Friend['status'] = sessions.some((x) => x.joined && !x.partnerId)
            ? 'available'
            : sessions.some((x) => x.partnerId)
              ? 'in-call'
              : socks.length
                ? 'online'
                : 'offline';
          return {
            id: friendHandle(f.friendId),
            nickname: f.nickname,
            gender: (f.gender as Friend['gender']) ?? null,
            country: f.country,
            since: f.createdAt,
            status,
            unread: unread.get(f.friendId) ?? 0,
          };
        }),
      );
    } catch (e) {
      log.error('friends:list', e);
      ack([]);
    }
  });

  // ---- Messages between friends (kept until read, pushed when they're away) ----
  const dmView = (m: StoredMessage, me: string): DirectMessage => ({
    id: m.id,
    fromMe: m.from === me,
    text: m.text,
    at: m.at,
    ...(m.from === me ? { read: !!m.readAt } : {}),
  });

  socket.on('dm:threads', async (ack) => {
    if (typeof ack !== 'function') return;
    const me = myUser();
    if (!me) return ack(null);
    try {
      const [threads, friends, history] = await Promise.all([accounts.threadsOf(me), accounts.listFriends(me), accounts.historyOf(me, 1000)]);
      const friendOf = new Map(friends.map((f) => [f.friendId, f]));
      ack(
        threads.map((t) => {
          const f = friendOf.get(t.other);
          const met = history.find((h) => h.partnerUserId === t.other);
          const live = socketsOfUser(t.other);
          return {
            id: friendHandle(t.other),
            name: f?.nickname || met?.name || live[0]?.data.profile?.name || (f ? 'Friend' : 'Someone'),
            avatar: met?.avatar ?? live[0]?.data.profile?.avatar ?? null,
            lastText: t.last.text,
            lastAt: t.last.at,
            lastFromMe: t.last.from === me,
            unread: t.unread,
            friend: !!f,
            online: live.length > 0,
            request: !f && t.mine === 0 && t.theirs > 0,
          };
        }),
      );
    } catch (e) {
      log.error('dm:threads', e);
      ack(null);
    }
  });

  // ---- History & follows ----
  const historyId = (h: HistoryRow) =>
    h.partnerUserId ? friendHandle(h.partnerUserId) : `g${createHash('sha256').update(`${myUser()}:${h.partnerKey}`).digest('base64url').slice(0, 15)}`;
  socket.on('history:list', async (ack) => {
    if (typeof ack !== 'function') return;
    const me = myUser();
    if (!me) return ack(null);
    try {
      const [rows, following, friends] = await Promise.all([accounts.historyOf(me, 1000), accounts.following(me), accounts.listFriends(me)]);
      const friendIds = new Set(friends.map((f) => f.friendId));
      const people = new Map<string, HistoryPerson>();
      for (const h of rows) {
        const p = people.get(h.partnerKey);
        if (p) {
          p.count++;
          continue;
        }
        people.set(h.partnerKey, {
          id: historyId(h),
          name: h.name,
          avatar: h.avatar,
          gender: (h.gender as HistoryPerson['gender']) ?? null,
          country: h.country,
          count: 1,
          lastAt: h.at,
          lastMode: h.mode as ChatMode,
          hasAccount: !!h.partnerUserId,
          following: !!h.partnerUserId && following.has(h.partnerUserId),
          friend: !!h.partnerUserId && friendIds.has(h.partnerUserId),
          online: !!h.partnerUserId && socketsOfUser(h.partnerUserId).length > 0,
        });
      }
      const weekAgo = Date.now() - 7 * 86_400_000;
      ack({ people: [...people.values()], total: rows.length, recent: rows.filter((h) => h.at >= weekAgo).length });
    } catch (e) {
      log.error('history:list', e);
      ack(null);
    }
  });
  socket.on('history:remove', async (id, ack) => {
    if (typeof ack !== 'function') return;
    const me = myUser();
    if (!me) return ack(false);
    const row = (await accounts.historyOf(me, 1000)).find((h) => historyId(h) === id);
    if (!row) return ack(false);
    await accounts.removeHistory(me, row.partnerKey);
    ack(true);
  });
  socket.on('follow:set', async (id, on, ack) => {
    if (typeof ack !== 'function') return;
    const me = myUser();
    if (!me || typeof on !== 'boolean') return ack(false);
    // You can follow people you've actually met.
    const row = (await accounts.historyOf(me, 1000)).find((h) => h.partnerUserId && historyId(h) === id);
    if (!row?.partnerUserId) return ack(false);
    if (on && (await accounts.following(me)).size >= 500) return ack(false);
    await accounts.follow(me, row.partnerUserId, on);
    ack(true);
  });

  socket.on('dm:send', async (handle, text, ack) => {
    if (typeof ack !== 'function') return;
    const me = myUser();
    if (!me) return ack({ ok: false, reason: 'login-required' });
    const clean = parseChatText(text);
    if (!clean) return ack({ ok: false, reason: 'invalid' });
    try {
      const c = await resolveContact(handle);
      if (!c) return ack({ ok: false, reason: 'not-friends' });
      const f = { friendId: c.userId };
      // Not friends: a message request, a few messages until they reply.
      if (!c.friend) {
        const t = (await accounts.threadsOf(me)).find((x) => x.other === c.userId);
        if (t && t.theirs === 0 && t.mine >= DM_REQUEST_LIMIT) return ack({ ok: false, reason: 'wait-reply' });
      }
      const stored = await accounts.addMessage(me, f.friendId, clean);
      ack({ ok: true, message: dmView(stored, me) });
      const theirSockets = socketsOfUser(f.friendId);
      for (const x of theirSockets) x.emit('dm:new', { friendId: friendHandleFor(f.friendId, me), message: dmView(stored, f.friendId) });
      // Your other tabs see it too.
      for (const x of socketsOfUser(me)) if (x.id !== socket.id) x.emit('dm:new', { friendId: handle as string, message: dmView(stored, me) });
      if (!theirSockets.length) {
        const theirs = (await accounts.listFriends(f.friendId)).find((x) => x.friendId === me);
        void push.send(f.friendId, {
          title: `💬 ${theirs?.nickname || socket.data.profile?.name || (c.friend ? 'A friend' : 'New message')}`,
          body: clean.length > 120 ? `${clean.slice(0, 117)}…` : clean,
          url: `/messages?with=${encodeURIComponent(friendHandleFor(f.friendId, me))}`,
          tag: `dm-${friendHandleFor(f.friendId, me)}`,
        });
      }
    } catch (e) {
      log.error('dm:send', e);
      ack({ ok: false, reason: 'invalid' });
    }
  });
  socket.on('dm:history', async (handle, ack) => {
    if (typeof ack !== 'function') return;
    const me = myUser();
    if (!me) return ack(null);
    try {
      const c = await resolveContact(handle);
      if (!c) return ack(null);
      const messages = await accounts.messagesBetween(me, c.userId, 50);
      const hadUnread = messages.some((m) => m.to === me && !m.readAt);
      await accounts.markRead(me, c.userId);
      ack(messages.map((m) => dmView(m, me)));
      // Their ✓✓ turns blue.
      if (hadUnread) for (const x of socketsOfUser(c.userId)) x.emit('dm:read', friendHandleFor(c.userId, me));
    } catch (e) {
      log.error('dm:history', e);
      ack(null);
    }
  });

  socket.on('friends:call', async (handle, ack) => {
    if (typeof ack !== 'function') return;
    if (!myUser()) return ack({ ok: false, reason: 'login-required' });
    const f = await resolveFriend(handle).catch(() => null);
    if (!f) return ack({ ok: false, reason: 'gone' });
    const sessions = socketsOfUser(f.friendId)
      .map((x) => matchmaker.get(x.id))
      .filter((x): x is Session => !!x);
    const target = sessions.find((x) => x.joined && !x.partnerId);
    if (!target) return ack({ ok: false, reason: sessions.length ? (sessions.some((x) => x.partnerId) ? 'busy' : 'offline') : 'offline' });
    // Their nickname for me, so they see who is calling.
    const theirs = await accounts.listFriends(f.friendId).catch(() => []);
    ack(startRequest(target, true, theirs.find((x) => x.friendId === myUser())?.nickname ?? ''));
  });

  socket.on('friends:remove', async (handle, ack) => {
    const done = typeof ack === 'function' ? ack : () => undefined;
    const f = await resolveFriend(handle).catch(() => null);
    const me = myUser();
    if (!f || !me) return done(false);
    await accounts.removeFriendship(me, f.friendId).catch(() => undefined);
    done(true);
  });

  socket.on('friends:rename', async (handle, nickname, ack) => {
    const done = typeof ack === 'function' ? ack : () => undefined;
    const f = await resolveFriend(handle).catch(() => null);
    const me = myUser();
    if (!f || !me || typeof nickname !== 'string') return done(false);
    const clean = nickname.trim().slice(0, MAX_FRIEND_NICKNAME) || null;
    await accounts.renameFriend(me, f.friendId, clean).catch(() => undefined);
    done(true);
  });
}

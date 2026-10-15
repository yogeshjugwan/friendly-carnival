import { log } from '../log.ts';
import { CHAT_BURST, CHAT_WINDOW_MS, type RoomMember } from '@rc/shared';
import { looksLikeLink } from '../guard.ts';
import type { RoomSeat } from '../rooms.ts';
import { parseChatText, parseReportReason, parseRoomJoin, parseSignal } from '../validate.ts';
import { REPORT_BURST, REPORT_WINDOW_MS, type AppContext, type SocketScope } from './context.ts';

/** WebRTC signals (offers, answers, ICE candidates) per socket in rooms. */
export const ROOM_SIGNAL_BURST = 200;
export const ROOM_SIGNAL_WINDOW_MS = 10_000;

export function registerRooms(ctx: AppContext, scope: SocketScope) {
  const { io, matchmaker, store, safety, analytics, notifyLeft, refreshTrust, rooms, turn, socketsByDevice } = ctx;
  const { socket, stillBanned, underBurst } = scope;
  const roomChatAt: number[] = [];
  const roomSignalAt: number[] = [];
  // ---- Group rooms ----
  const roomPeers = (except?: string) => (rooms.roomOf(socket.id)?.seats ?? []).filter((x) => x.socketId !== except);
  const memberView = (x: RoomSeat): RoomMember => ({ id: x.id, name: x.name, gender: x.gender, avatar: x.avatar, country: x.country, verified: x.verified });
  const leaveRoom = () => {
    const left = rooms.leave(socket.id);
    if (left) for (const x of left.room.seats) io.to(x.socketId).emit('room:member-left', left.seat.id);
  };
  socket.on('rooms:list', (ack) => {
    if (typeof ack === 'function') ack(rooms.counts());
  });
  socket.on('room:join', (topic, mode, gender, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.userId) return ack({ ok: false, reason: 'login-required' });
    if (stillBanned()) return ack({ ok: false, reason: 'banned' });
    const join = parseRoomJoin(topic, mode, gender);
    if (!join) return ack({ ok: false, reason: 'invalid' });
    // A room replaces any one-to-one chat.
    matchmaker.leaveQueue(socket.id);
    notifyLeft(matchmaker.endMatch(socket.id)?.id, 'stop');
    const me = matchmaker.get(socket.id);
    const myDevice = socket.data.deviceId;
    const blockedPair = (a: string, b: string) => {
      const other = a === myDevice ? b : a;
      if (socket.data.blocked.has(other)) return true;
      for (const id of socketsByDevice.get(other) ?? []) if (io.sockets.sockets.get(id)?.data.blocked.has(myDevice)) return true;
      return false;
    };
    const { room, seat } = rooms.join(
      {
        socketId: socket.id,
        deviceId: myDevice,
        gender: join.gender,
        name: socket.data.profile?.name ?? '',
        avatar: socket.data.profile?.avatar ?? null,
        country: me && !me.hideCountry ? me.country : null,
        verified: !!socket.data.verified,
      },
      join.topic,
      join.mode,
      blockedPair,
    );
    analytics.count('roomJoins');
    ack({ ok: true, roomId: room.id, you: seat.id, members: roomPeers(socket.id).map(memberView), iceServers: turn.current(), mode: join.mode });
    for (const x of roomPeers(socket.id)) io.to(x.socketId).emit('room:member-joined', memberView(seat));
  });
  socket.on('room:leave', leaveRoom);
  socket.on('disconnect', leaveRoom);
  socket.on('room:signal', (to, payload) => {
    const me = rooms.seatOf(socket.id);
    const target = roomPeers(socket.id).find((x) => x.id === to);
    const msg = parseSignal(payload);
    if (!me || !target || !msg) return;
    if (!underBurst(roomSignalAt, ROOM_SIGNAL_BURST, ROOM_SIGNAL_WINDOW_MS)) return;
    io.to(target.socketId).emit('room:signal', { from: me.id, msg });
  });
  socket.on('room:chat', (payload) => {
    const me = rooms.seatOf(socket.id);
    const text = parseChatText(payload);
    if (!me || !text) return;
    if (!underBurst(roomChatAt, CHAT_BURST, CHAT_WINDOW_MS)) return void socket.emit('chat:rejected', 'rate-limited');
    if (looksLikeLink(text)) return void socket.emit('chat:rejected', 'link');
    const chat = { from: me.id, text, at: Date.now() };
    for (const x of rooms.roomOf(socket.id)?.seats ?? []) io.to(x.socketId).emit('room:chat', chat);
  });
  socket.on('room:report', async (memberId, reason) => {
    const target = roomPeers(socket.id).find((x) => x.id === memberId);
    const why = parseReportReason(reason);
    if (!target || !why) return;
    const now = Date.now();
    const times = socket.data.reportsAt;
    while (times.length && now - times[0]! > REPORT_WINDOW_MS) times.shift();
    if (times.length >= REPORT_BURST) return;
    times.push(now);
    const t = io.sockets.sockets.get(target.socketId)?.data;
    if (!t) return;
    try {
      await safety.report(
        { deviceId: socket.data.deviceId, ipHash: socket.data.ipHash, userId: socket.data.userId },
        { deviceId: t.deviceId, ipHash: t.ipHash, userId: t.userId },
        { target: 'current', reason: why, source: 'user', note: 'Reported in a group room' },
      );
      analytics.count('reports');
      void refreshTrust(target.socketId).catch(() => undefined);
      // Block them so you're never put in a room (or chat) together again.
      await store.addBlock(socket.data.deviceId, t.deviceId).catch(() => undefined);
      matchmaker.block(socket.data.deviceId, t.deviceId);
      socket.data.blocked.add(t.deviceId);
    } catch (e) {
      log.error('room:report', e);
    }
  });
}

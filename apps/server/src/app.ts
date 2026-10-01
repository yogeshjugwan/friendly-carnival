import { createServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  CHAT_BURST,
  CHAT_WINDOW_MS,
  type ClientToServerEvents,
  type PartnerLeftReason,
  type ServerToClientEvents,
} from '@rc/shared';
import { config } from './config.ts';
import { Matchmaker, type Pairing } from './matchmaker.ts';
import { parseCallResult, parseChatText, parseJoin, parseSignal } from './validate.ts';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export interface CallMetrics {
  reports: number;
  connected: number;
  /** Sum of time-to-connect for connected reports, ms. */
  connectMsTotal: number;
}

export interface App {
  http: HttpServer;
  io: IO;
  matchmaker: Matchmaker;
  metrics: CallMetrics;
  close: () => Promise<void>;
}

export function createApp(opts: { webOrigins?: (string | RegExp)[]; statsIntervalMs?: number } = {}): App {
  const matchmaker = new Matchmaker(config.recentPartnerMemory);
  const metrics: CallMetrics = { reports: 0, connected: 0, connectMsTotal: 0 };

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          online: matchmaker.onlineCount,
          waiting: matchmaker.waitingCount,
          calls: {
            reports: metrics.reports,
            connectRate: metrics.reports ? +(metrics.connected / metrics.reports).toFixed(3) : null,
            avgConnectMs: metrics.connected ? Math.round(metrics.connectMsTotal / metrics.connected) : null,
          },
          turnConfigured: config.iceServers.some((s) => s.username),
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  const io: IO = new Server(http, {
    cors: { origin: opts.webOrigins ?? config.webOrigins },
    maxHttpBufferSize: 64 * 1024,
  });

  const announce = (pairing: Pairing) => {
    const { a, b, matchId, sharedInterests, reconnected } = pairing;
    const base = { matchId, mode: b.mode, reconnected, iceServers: config.iceServers };
    // b just joined (or pressed Back) and initiates, so a is ready to answer.
    io.to(a.id).emit('match:found', {
      ...base,
      initiator: false,
      partner: { gender: b.gender, country: b.country, sharedInterests },
    });
    io.to(b.id).emit('match:found', {
      ...base,
      initiator: true,
      partner: { gender: a.gender, country: a.country, sharedInterests },
    });
  };

  const notifyLeft = (partnerId: string | undefined, reason: PartnerLeftReason) => {
    if (partnerId) io.to(partnerId).emit('partner:left', reason);
  };

  io.on('connection', (socket) => {
    matchmaker.connect(socket.id, countryFromHeaders(socket.handshake.headers));
    socket.emit('stats', { online: matchmaker.onlineCount });
    const sentAt: number[] = [];

    socket.on('queue:join', (payload) => {
      const join = parseJoin(payload);
      if (!join) return void socket.emit('error:message', 'Invalid join request');
      if (matchmaker.get(socket.id)?.partnerId) return;
      const pairing = matchmaker.join(socket.id, join.gender, join.interests, join.mode);
      if (pairing) announce(pairing);
      else socket.emit('queue:waiting');
    });

    socket.on('queue:leave', () => {
      matchmaker.leaveQueue(socket.id);
      notifyLeft(matchmaker.endMatch(socket.id)?.id, 'stop');
    });

    socket.on('call:next', () => {
      if (!matchmaker.get(socket.id)) return;
      notifyLeft(matchmaker.endMatch(socket.id)?.id, 'next');
      const pairing = matchmaker.rejoin(socket.id);
      if (pairing) announce(pairing);
      else socket.emit('queue:waiting');
    });

    socket.on('call:back', () => {
      const current = matchmaker.partnerOf(socket.id);
      const result = matchmaker.reconnect(socket.id);
      if (typeof result === 'string') return void socket.emit('back:unavailable', result);
      // Leaving a live match to go back: the person being left sees a normal "next".
      if (current && current.id !== result.a.id) notifyLeft(current.id, 'next');
      announce(result);
    });

    socket.on('settings:reconnect', (allow) => {
      if (typeof allow === 'boolean') matchmaker.setAllowReconnect(socket.id, allow);
    });

    socket.on('chat:message', (payload) => {
      const partner = matchmaker.partnerOf(socket.id);
      if (!partner) return;
      const text = parseChatText(payload);
      if (!text) return void socket.emit('chat:rejected', 'invalid');
      const now = Date.now();
      while (sentAt.length && now - sentAt[0]! > CHAT_WINDOW_MS) sentAt.shift();
      if (sentAt.length >= CHAT_BURST) return void socket.emit('chat:rejected', 'rate-limited');
      sentAt.push(now);
      io.to(partner.id).emit('chat:message', { text, at: now });
    });

    socket.on('chat:typing', (typing) => {
      const partner = matchmaker.partnerOf(socket.id);
      if (partner && typeof typing === 'boolean') io.to(partner.id).emit('chat:typing', typing);
    });

    socket.on('call:result', (payload) => {
      const result = parseCallResult(payload);
      if (!result) return;
      metrics.reports += 1;
      if (result.connected) {
        metrics.connected += 1;
        metrics.connectMsTotal += result.ms;
      }
    });

    socket.on('signal', (payload) => {
      const msg = parseSignal(payload);
      const partner = matchmaker.partnerOf(socket.id);
      if (msg && partner) io.to(partner.id).emit('signal', msg);
    });

    socket.on('disconnect', () => {
      notifyLeft(matchmaker.disconnect(socket.id)?.id, 'disconnect');
    });
  });

  const statsTimer = setInterval(
    () => io.emit('stats', { online: matchmaker.onlineCount }),
    opts.statsIntervalMs ?? config.statsIntervalMs,
  );

  return {
    http,
    io,
    matchmaker,
    metrics,
    close: async () => {
      clearInterval(statsTimer);
      await io.close();
    },
  };
}

/** Country from a CDN/edge header when deployed behind one; null locally. */
function countryFromHeaders(headers: IncomingHttpHeaders): string | null {
  const raw = headers['cf-ipcountry'] ?? headers['x-vercel-ip-country'] ?? headers['x-country-code'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^[A-Z]{2}$/i.test(value) && value.toUpperCase() !== 'XX' ? value.toUpperCase() : null;
}

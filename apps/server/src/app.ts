import { createServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, PartnerLeftReason, ServerToClientEvents } from '@rc/shared';
import { config } from './config.ts';
import { Matchmaker, type Pairing } from './matchmaker.ts';
import { parseJoin, parseSignal } from './validate.ts';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export interface App {
  http: HttpServer;
  io: IO;
  matchmaker: Matchmaker;
  close: () => Promise<void>;
}

export function createApp(opts: { webOrigins?: (string | RegExp)[]; statsIntervalMs?: number } = {}): App {
  const matchmaker = new Matchmaker(config.recentPartnerMemory);

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, online: matchmaker.onlineCount, waiting: matchmaker.waitingCount }));
      return;
    }
    res.writeHead(404).end();
  });

  const io: IO = new Server(http, {
    cors: { origin: opts.webOrigins ?? config.webOrigins },
    maxHttpBufferSize: 64 * 1024,
  });

  const announce = (pairing: Pairing) => {
    const { a, b, matchId, sharedInterests } = pairing;
    // The user who just joined (b) initiates, so the waiting user is ready to answer.
    io.to(a.id).emit('match:found', {
      matchId,
      initiator: false,
      partner: { gender: b.gender, country: b.country, sharedInterests },
      iceServers: config.iceServers,
    });
    io.to(b.id).emit('match:found', {
      matchId,
      initiator: true,
      partner: { gender: a.gender, country: a.country, sharedInterests },
      iceServers: config.iceServers,
    });
  };

  const notifyLeft = (partnerId: string | undefined, reason: PartnerLeftReason) => {
    if (partnerId) io.to(partnerId).emit('partner:left', reason);
  };

  io.on('connection', (socket) => {
    matchmaker.connect(socket.id, countryFromHeaders(socket.handshake.headers));
    socket.emit('stats', { online: matchmaker.onlineCount });

    socket.on('queue:join', (payload) => {
      const join = parseJoin(payload);
      if (!join) return void socket.emit('error:message', 'Invalid join request');
      if (matchmaker.get(socket.id)?.partnerId) return;
      const pairing = matchmaker.join(socket.id, join.gender, join.interests);
      if (pairing) announce(pairing);
      else socket.emit('queue:waiting');
    });

    socket.on('queue:leave', () => {
      matchmaker.leaveQueue(socket.id);
      notifyLeft(matchmaker.endMatch(socket.id)?.id, 'stop');
    });

    socket.on('call:next', () => {
      const session = matchmaker.get(socket.id);
      if (!session) return;
      notifyLeft(matchmaker.endMatch(socket.id)?.id, 'next');
      const pairing = matchmaker.join(socket.id, session.gender, session.interests);
      if (pairing) announce(pairing);
      else socket.emit('queue:waiting');
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

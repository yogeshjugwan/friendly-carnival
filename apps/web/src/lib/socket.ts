'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HandshakeAuth, ServerToClientEvents } from '@rc/shared';
import { getDeviceId } from './deviceId';
import { solveChallenge } from './guard';

export type RcSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RcSocket | null = null;
let sessionToken: string | null = null;

/** Called by AuthProvider; reconnects so the server sees the new login state. */
export function setSessionToken(token: string | null) {
  if (token === sessionToken) return;
  sessionToken = token;
  if (socket) {
    socket.auth = { deviceId: getDeviceId(), token: token ?? undefined } satisfies HandshakeAuth;
    socket.disconnect().connect();
  }
}

export function getSocket(): RcSocket {
  if (!socket) {
    const auth: HandshakeAuth = { deviceId: getDeviceId(), token: sessionToken ?? undefined };
    socket = io(process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:4100', {
      transports: ['websocket'],
      autoConnect: true,
      auth,
    });
    // Prove we're a real browser before matching (the server waits for this).
    socket.on('guard:challenge', (c) => {
      void solveChallenge(c)
        .then((nonce) => socket?.emit('guard:proof', nonce))
        .catch((e) => console.warn('[guard]', e));
    });
  }
  return socket;
}

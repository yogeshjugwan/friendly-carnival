'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HandshakeAuth, ServerToClientEvents } from '@rc/shared';
import { getDeviceId } from './deviceId';

export type RcSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RcSocket | null = null;

export function getSocket(): RcSocket {
  if (!socket) {
    const auth: HandshakeAuth = { deviceId: getDeviceId() };
    socket = io(process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:4100', {
      transports: ['websocket'],
      autoConnect: true,
      auth,
    });
  }
  return socket;
}

'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@rc/shared';

export type RcSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RcSocket | null = null;

export function getSocket(): RcSocket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:4100', {
      transports: ['websocket'],
      autoConnect: true,
    });
  }
  return socket;
}

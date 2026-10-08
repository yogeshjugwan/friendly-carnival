import { randomUUID } from 'node:crypto';
import { ROOM_SIZE, type Gender } from '@rc/shared';

/** One person in a room; `id` is random per room, `socketId` never leaves the server. */
export interface RoomSeat {
  id: string;
  socketId: string;
  deviceId: string;
  name: string;
  gender: Gender;
  avatar: string | null;
  country: string | null;
  verified: boolean;
}

export interface Room {
  id: string;
  topic: string;
  mode: 'video' | 'voice';
  seats: RoomSeat[];
}

/** Small topic rooms: join the fullest open room of your topic and mode, or start one. */
export class Rooms {
  private rooms = new Map<string, Room>();
  private bySocket = new Map<string, string>();

  roomOf(socketId: string): Room | undefined {
    const id = this.bySocket.get(socketId);
    return id ? this.rooms.get(id) : undefined;
  }

  seatOf(socketId: string): RoomSeat | undefined {
    return this.roomOf(socketId)?.seats.find((s) => s.socketId === socketId);
  }

  /** People in rooms per topic. */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.rooms.values()) out[r.topic] = (out[r.topic] ?? 0) + r.seats.length;
    return out;
  }

  /** Seats a person; `blocked(a, b)` keeps people who blocked each other apart. */
  join(seat: Omit<RoomSeat, 'id'>, topic: string, mode: Room['mode'], blocked: (deviceA: string, deviceB: string) => boolean): { room: Room; seat: RoomSeat } {
    this.leave(seat.socketId);
    const open = [...this.rooms.values()]
      .filter((r) => r.topic === topic && r.mode === mode && r.seats.length < ROOM_SIZE)
      .filter((r) => r.seats.every((s) => !blocked(s.deviceId, seat.deviceId)))
      .sort((a, b) => b.seats.length - a.seats.length);
    const room = open[0] ?? { id: randomUUID(), topic, mode, seats: [] };
    this.rooms.set(room.id, room);
    const full: RoomSeat = { ...seat, id: randomUUID().slice(0, 8) };
    room.seats.push(full);
    this.bySocket.set(seat.socketId, room.id);
    return { room, seat: full };
  }

  /** Removes a person; returns the room they left and their seat. */
  leave(socketId: string): { room: Room; seat: RoomSeat } | null {
    const room = this.roomOf(socketId);
    if (!room) return null;
    const seat = room.seats.find((s) => s.socketId === socketId)!;
    room.seats = room.seats.filter((s) => s.socketId !== socketId);
    this.bySocket.delete(socketId);
    if (!room.seats.length) this.rooms.delete(room.id);
    return { room, seat };
  }
}

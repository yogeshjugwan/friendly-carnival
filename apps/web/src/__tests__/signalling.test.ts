import { describe, expect, it } from 'vitest';
import { candidateType, planSignal } from '../lib/call/signalling';
import { isCurrentPeer } from '../lib/call/peerConnection';
import { deviceOptions } from '../lib/call/useMediaDevices';
import { sameFilters } from '../lib/call/constants';

describe('candidateType', () => {
  it('reads the type from a candidate line', () => {
    expect(candidateType('candidate:1 1 udp 2122260223 192.168.1.2 54400 typ host generation 0')).toBe('host');
    expect(candidateType('candidate:2 1 udp 1686052607 1.2.3.4 54400 typ srflx raddr 0.0.0.0')).toBe('srflx');
    expect(candidateType('candidate:3 1 udp 41885439 5.6.7.8 3478 typ relay')).toBe('relay');
  });
  it('returns null for junk', () => {
    expect(candidateType('')).toBeNull();
    expect(candidateType('typ banana')).toBeNull();
  });
});

describe('planSignal', () => {
  it('answers offers and applies answers', () => {
    expect(planSignal({ kind: 'offer', sdp: 'o' }, false)).toEqual({ action: 'answer-offer', sdp: 'o' });
    expect(planSignal({ kind: 'answer', sdp: 'a' }, true)).toEqual({ action: 'set-answer', sdp: 'a' });
  });
  it('queues ICE until the remote description is set', () => {
    const candidate = { candidate: 'x typ host' };
    expect(planSignal({ kind: 'ice', candidate } as never, false)).toEqual({ action: 'queue-ice', candidate });
    expect(planSignal({ kind: 'ice', candidate } as never, true)).toEqual({ action: 'add-ice', candidate });
  });
});

describe('isCurrentPeer (stale callback guard)', () => {
  const pc = {} as RTCPeerConnection;
  it('is true only for the same connection and match', () => {
    expect(isCurrentPeer(pc, 'm1', pc, 'm1')).toBe(true);
    expect(isCurrentPeer(pc, 'm1', pc, 'm2')).toBe(false);
    expect(isCurrentPeer(pc, 'm1', null, 'm1')).toBe(false);
    expect(isCurrentPeer(pc, 'm1', {} as RTCPeerConnection, 'm1')).toBe(false);
    expect(isCurrentPeer(pc, 'm1', pc, undefined)).toBe(false);
  });
});

describe('deviceOptions', () => {
  it('filters by kind, drops empty ids and labels unnamed devices', () => {
    const devices = [
      { kind: 'videoinput', deviceId: 'a', label: 'FaceTime' },
      { kind: 'videoinput', deviceId: 'b', label: '' },
      { kind: 'videoinput', deviceId: '', label: 'hidden' },
      { kind: 'audioinput', deviceId: 'c', label: '' },
    ] as MediaDeviceInfo[];
    expect(deviceOptions(devices, 'videoinput', 'Camera')).toEqual([
      { deviceId: 'a', label: 'FaceTime' },
      { deviceId: 'b', label: 'Camera 2' },
    ]);
    expect(deviceOptions(devices, 'audioinput', 'Microphone')).toEqual([{ deviceId: 'c', label: 'Microphone 1' }]);
  });
});

describe('sameFilters', () => {
  it('treats missing filters as "any"', () => {
    expect(sameFilters(undefined, { gender: 'any', country: 'any', verifiedOnly: false } as never)).toBe(true);
    expect(sameFilters({ gender: 'female', country: 'any' } as never, undefined)).toBe(false);
  });
});

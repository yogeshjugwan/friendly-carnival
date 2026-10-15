import type { CandidateType, SignalMessage } from '@rc/shared';

/** 'host' | 'srflx' | 'prflx' | 'relay' from an ICE candidate line. */
export function candidateType(line: string): CandidateType | null {
  const m = line.match(/ typ (host|srflx|prflx|relay)/);
  return m ? (m[1] as CandidateType) : null;
}

/** Kinds of the candidate pair the browser selected, e.g. ['srflx', 'relay']. */
export async function selectedPath(pc: RTCPeerConnection): Promise<[CandidateType, CandidateType] | null> {
  try {
    const stats = await pc.getStats();
    let pair: RTCIceCandidatePairStats | undefined;
    stats.forEach((r) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
    });
    if (!pair) stats.forEach((r) => r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && (pair ??= r));
    if (!pair) return null;
    const local = stats.get(pair.localCandidateId)?.candidateType as CandidateType | undefined;
    const remote = stats.get(pair.remoteCandidateId)?.candidateType as CandidateType | undefined;
    return local && remote ? [local, remote] : null;
  } catch {
    return null;
  }
}

/** What to do with an incoming signal, decided without touching the peer connection. */
export type SignalPlan =
  | { action: 'answer-offer'; sdp: string }
  | { action: 'set-answer'; sdp: string }
  | { action: 'queue-ice'; candidate: RTCIceCandidateInit }
  | { action: 'add-ice'; candidate: RTCIceCandidateInit };

/** Pure: maps a signal + "has remote description" to the next step. */
export function planSignal(msg: SignalMessage, hasRemoteDescription: boolean): SignalPlan {
  if (msg.kind === 'offer') return { action: 'answer-offer', sdp: msg.sdp };
  if (msg.kind === 'answer') return { action: 'set-answer', sdp: msg.sdp };
  const candidate = msg.candidate as RTCIceCandidateInit;
  return { action: hasRemoteDescription ? 'add-ice' : 'queue-ice', candidate };
}

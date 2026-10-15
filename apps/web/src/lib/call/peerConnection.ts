/** Detach every handler from a peer connection and close it, so late events cannot fire. */
export function disposePeer(pc: RTCPeerConnection | null | undefined) {
  if (!pc) return;
  pc.onicecandidate = null;
  pc.ontrack = null;
  pc.onconnectionstatechange = null;
  pc.close();
}

/**
 * True while `pc` is still the live connection for `matchId`. Every async
 * RTCPeerConnection callback checks this, so events from a connection that was
 * replaced by Next (or a new match) are ignored.
 */
export function isCurrentPeer(
  pc: RTCPeerConnection,
  matchId: string,
  currentPc: RTCPeerConnection | null,
  currentMatchId: string | null | undefined,
) {
  return currentPc === pc && currentMatchId === matchId;
}

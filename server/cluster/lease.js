// Primary lease / election — pure functions, deterministic, unit-tested.
// Rules (MVP):
//  * The primary renews a lease every HEARTBEAT_MS; the lease is valid for LEASE_MS (30s).
//  * A standby may take over only when the lease has expired (no valid heartbeat for > LEASE_MS)
//    AND it is the best-ranked *alive* eligible standby (higher priority first, then lower id).
//  * Each takeover increments the term (fencing token). Nodes always follow the highest term they have seen;
//    a stale primary that comes back sees a higher term and demotes itself (prevents split-brain writes from
//    being accepted by clients that follow server.json, but see docs for the limits).
import { mayBePrimary, nodeOf } from './registry.js';
export const LEASE_MS = 30000, HEARTBEAT_MS = 5000;

export function rank(reg, ids) {
  return ids.filter(id => mayBePrimary(reg, id)).sort((a, b) => (nodeOf(reg, b).priority - nodeOf(reg, a).priority) || (a < b ? -1 : a > b ? 1 : 0));
}

/** state: {term, primary, leaseUntil}. Returns new state after observing a (verified) heartbeat. */
export function observeHeartbeat(state, hb, now = Date.now()) {
  if (hb.term < state.term) return state; // stale primary: ignore
  if (hb.term === state.term && state.primary && state.primary !== hb.node && now < state.leaseUntil) return state; // conflicting claim in same term: keep incumbent
  return { term: hb.term, primary: hb.node, leaseUntil: now + LEASE_MS };
}

/** Decide what node `self` should do. alive = ids of standbys seen recently (incl. self). */
export function decide(state, self, reg, alive, now = Date.now()) {
  if (state.primary === self && now < state.leaseUntil) return { action: 'renew', term: state.term };
  if (state.primary && now < state.leaseUntil) return { action: 'follow', primary: state.primary, term: state.term };
  if (!mayBePrimary(reg, self)) return { action: 'wait' };
  const best = rank(reg, [...new Set([...alive, self])])[0];
  if (best === self) return { action: 'promote', term: state.term + 1 };
  return { action: 'wait', candidate: best };
}

/** A node that believes it is primary must step down when it sees a higher term. */
export function shouldDemote(myTerm, seenTerm) { return seenTerm > myTerm; }

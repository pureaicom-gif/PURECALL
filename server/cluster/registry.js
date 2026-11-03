// Signed node registry. The OWNER key (kept offline by the owner) signs the list of nodes allowed to act.
// A node that is not in the registry, or claims a role it was not granted, is ignored → rogue nodes cannot become primary.
import { signObject, verifyObject } from './crypto.js';

export const ROLES = ['primary', 'standby', 'helper'];

/** nodes: [{id, publicKey, roles:['primary','standby'] | ['helper'], priority}] */
export function makeRegistry(nodes, ownerPrivateKey, { version = 1, issuedAt = new Date().toISOString() } = {}) {
  for (const n of nodes) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(n.id)) throw new Error('bad node id ' + n.id);
    if (!n.roles?.every(r => ROLES.includes(r))) throw new Error('bad roles for ' + n.id);
  }
  return signObject({ kind: 'pure-node-registry', version, issuedAt, nodes: nodes.map(n => ({ id: n.id, publicKey: n.publicKey, roles: [...n.roles], priority: Number(n.priority) || 0 })) }, ownerPrivateKey);
}
export function verifyRegistry(reg, ownerPublicKey) {
  return !!reg && reg.kind === 'pure-node-registry' && Array.isArray(reg.nodes) && verifyObject(reg, ownerPublicKey);
}
export const nodeOf = (reg, id) => reg.nodes.find(n => n.id === id) || null;
export const mayBePrimary = (reg, id) => { const n = nodeOf(reg, id); return !!n && (n.roles.includes('primary') || n.roles.includes('standby')); };

/** Signed announcement (heartbeat / server.json) from a node. */
export function announce(node, privateKey, fields, now = Date.now()) {
  return signObject({ kind: 'pure-node-announce', node, ts: now, ...fields }, privateKey);
}
/** Valid if signed by a registered node, fresh, and (for primary claims) that node may be primary. */
export function verifyAnnounce(a, reg, { now = Date.now(), maxSkewMs = 120000 } = {}) {
  if (!a || a.kind !== 'pure-node-announce') return false;
  const n = nodeOf(reg, a.node); if (!n) return false;
  if (Math.abs(now - Number(a.ts)) > maxSkewMs) return false;
  if (a.role === 'primary' && !mayBePrimary(reg, a.node)) return false;
  return verifyObject(a, n.publicKey);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { newKeyPair, signObject, verifyObject } from '../server/cluster/crypto.js';
import { makeRegistry, verifyRegistry, announce, verifyAnnounce } from '../server/cluster/registry.js';
import { observeHeartbeat, decide, shouldDemote, LEASE_MS } from '../server/cluster/lease.js';
import { snapshot, authHeaders } from '../server/cluster/replication.js';
import { PureNode } from '../server/cluster/node.js';
import { createPureServer } from '../server/index.js';

const owner = newKeyPair(), A = newKeyPair(), B = newKeyPair(), C = newKeyPair(), H = newKeyPair(), rogue = newKeyPair();
const reg = makeRegistry([
  { id: 'pc-main', publicKey: A.publicKey, roles: ['primary', 'standby'], priority: 10 },
  { id: 'pc-2', publicKey: B.publicKey, roles: ['standby'], priority: 5 },
  { id: 'pc-3', publicKey: C.publicKey, roles: ['standby'], priority: 5 },
  { id: 'phone-1', publicKey: H.publicKey, roles: ['helper'] },
], owner.privateKey);

test('signatures + registry', () => {
  assert.ok(verifyRegistry(reg, owner.publicKey));
  assert.equal(verifyRegistry(reg, rogue.publicKey), false);
  assert.equal(verifyRegistry({ ...reg, nodes: [...reg.nodes, { id: 'evil', publicKey: rogue.publicKey, roles: ['primary'], priority: 99 }] }, owner.publicKey), false);
  const o = signObject({ a: 1, b: [2, { c: 3 }] }, A.privateKey);
  assert.ok(verifyObject({ b: [2, { c: 3 }], a: 1, sig: o.sig }, A.publicKey)); // key order independent
  assert.equal(verifyObject({ ...o, a: 2 }, A.publicKey), false);
});

test('announcements: registered, fresh, role-checked', () => {
  const now = 1_000_000;
  assert.ok(verifyAnnounce(announce('pc-2', B.privateKey, { role: 'primary', term: 2 }, now), reg, { now }));
  assert.equal(verifyAnnounce(announce('pc-2', rogue.privateKey, { role: 'primary', term: 2 }, now), reg, { now }), false, 'wrong key');
  assert.equal(verifyAnnounce(announce('evil', rogue.privateKey, { role: 'primary', term: 9 }, now), reg, { now }), false, 'unregistered');
  assert.equal(verifyAnnounce(announce('phone-1', H.privateKey, { role: 'primary', term: 9 }, now), reg, { now }), false, 'helper cannot be primary');
  assert.ok(verifyAnnounce(announce('phone-1', H.privateKey, { role: 'helper' }, now), reg, { now }));
  assert.equal(verifyAnnounce(announce('pc-2', B.privateKey, { role: 'primary', term: 2 }, now - 600000), reg, { now }), false, 'stale');
});

test('lease election', () => {
  let s = { term: 0, primary: null, leaseUntil: 0 }; const t0 = 5_000_000;
  // no primary: highest priority alive promotes; others wait
  assert.deepEqual(decide(s, 'pc-main', reg, ['pc-2'], t0), { action: 'promote', term: 1 });
  assert.equal(decide(s, 'pc-2', reg, ['pc-main', 'pc-3'], t0).action, 'wait');
  // tie on priority → lower id wins
  assert.equal(decide(s, 'pc-2', reg, ['pc-3'], t0).action, 'promote');
  assert.equal(decide(s, 'pc-3', reg, ['pc-2'], t0).action, 'wait');
  assert.equal(decide(s, 'phone-1', reg, [], t0).action, 'wait', 'helper never promotes');
  // heartbeat establishes lease → follow
  s = observeHeartbeat(s, { node: 'pc-main', term: 1 }, t0);
  assert.deepEqual(decide(s, 'pc-2', reg, ['pc-2'], t0 + 1000), { action: 'follow', primary: 'pc-main', term: 1 });
  // primary silent > lease → takeover with higher term
  assert.deepEqual(decide(s, 'pc-2', reg, ['pc-3'], t0 + LEASE_MS + 1), { action: 'promote', term: 2 });
  // stale primary heartbeat (old term) ignored; conflicting same-term claim ignored while lease valid
  s = observeHeartbeat(s, { node: 'pc-2', term: 2 }, t0 + LEASE_MS + 2);
  assert.equal(observeHeartbeat(s, { node: 'pc-main', term: 1 }, t0 + LEASE_MS + 3).primary, 'pc-2');
  assert.equal(observeHeartbeat(s, { node: 'pc-3', term: 2 }, t0 + LEASE_MS + 3).primary, 'pc-2');
  assert.ok(shouldDemote(1, 2)); assert.equal(shouldDemote(2, 2), false);
});

test('snapshot of a live WAL database is consistent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-snap-'));
  try {
    const db = new DatabaseSync(join(dir, 'a.db')); db.exec('PRAGMA journal_mode=WAL; CREATE TABLE t(x)');
    const ins = db.prepare('INSERT INTO t VALUES (?)'); for (let i = 0; i < 500; i++) ins.run(i);
    const s = snapshot(db, join(dir, 'snap.db')); db.close();
    const copy = new DatabaseSync(s.file, { readOnly: true });
    assert.equal(copy.prepare('SELECT count(*) n FROM t').get().n, 500); copy.close();
    assert.match(s.sha256, /^[0-9a-f]{64}$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('primary + warm standby: replication, auth, automatic failover, demotion of stale primary', async () => {
  const dirA = mkdtempSync(join(tmpdir(), 'pure-na-')), dirB = mkdtempSync(join(tmpdir(), 'pure-nb-'));
  const portA = 39000 + Math.floor(Math.random() * 500), portB = portA + 1;
  let clock = Date.now(); const now = () => clock; const secret = 'test-cluster-secret';
  const published = [];
  const mk = (id, key, dataDir, port, peer) => new PureNode({ id, privateKey: key.privateKey, registry: reg, ownerPublicKey: owner.publicKey, secret, dataDir, port, host: '127.0.0.1',
    publicUrl: `http://127.0.0.1:${port}`, peers: [`http://127.0.0.1:${peer}`], snapshotMs: 0, createServer: createPureServer, now, log: { info() {}, warn() {} }, onPrimary: (url, term) => published.push({ url, term }) });
  const a = mk('pc-main', A, dirA, portA, portB), b = mk('pc-2', B, dirB, portB, portA);
  try {
    await a.listenStandby(); await b.listenStandby();
    assert.equal((await a.tick()).action, 'promote');
    assert.equal(a.role, 'primary');
    // write data + an upload on the primary
    const baseA = `http://127.0.0.1:${portA}`;
    const r = await fetch(baseA + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: 'alice_n', name: 'Alice', password: 'password123' }) });
    assert.ok(r.ok, 'register on primary');
    mkdirSync(join(dirA, 'uploads', 'x'), { recursive: true }); writeFileSync(join(dirA, 'uploads', 'x', 'pic.bin'), 'hello');
    // unauthenticated / wrong-secret snapshot refused
    assert.equal((await fetch(baseA + '/cluster/snapshot')).status, 401);
    assert.equal((await fetch(baseA + '/cluster/snapshot', { headers: authHeaders('wrong', 'pc-2', 'GET', '/cluster/snapshot') })).status, 401);
    // standby follows + replicates
    assert.equal((await b.tick()).action, 'follow');
    const rep = new DatabaseSync(join(dirB, 'pure.db'), { readOnly: true });
    assert.equal(rep.prepare("SELECT count(*) n FROM users WHERE handle='alice_n'").get().n, 1); rep.close();
    assert.equal(readFileSync(join(dirB, 'uploads', 'x', 'pic.bin'), 'utf8'), 'hello');
    // primary dies: stop it, advance past the lease
    await a.stop();
    clock += LEASE_MS + 1000;
    assert.equal((await b.tick()).action, 'promote');
    assert.equal(b.role, 'primary'); assert.equal(b.state.term, 2);
    assert.deepEqual(published.map(p => p.term), [1, 2]);
    const login = await fetch(`http://127.0.0.1:${portB}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: 'alice_n', password: 'password123' }) });
    assert.ok(login.ok, 'replicated account can log in on the promoted standby');
    // old primary restarts: it must follow term 2, not reclaim
    const a2 = mk('pc-main', A, dirA, portA, portB); await a2.listenStandby();
    const d = await a2.tick();
    assert.equal(d.action, 'follow'); assert.equal(a2.state.term, 2); assert.equal(a2.role, 'standby');
    await a2.stop();
  } finally { await a.stop().catch(() => {}); await b.stop().catch(() => {}); rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true }); }
});

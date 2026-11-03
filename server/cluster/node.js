// PURE Node — runs one cluster member (primary or warm standby) with lease-based automatic failover.
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { announce, verifyAnnounce, verifyRegistry, mayBePrimary } from './registry.js';
import { observeHeartbeat, decide, shouldDemote, HEARTBEAT_MS } from './lease.js';
import { installReplicationRoutes, pullSnapshot, syncUploads } from './replication.js';

/**
 * opts: { id, privateKey, registry, ownerPublicKey, secret, dataDir, port, host, publicUrl, peers:[url], snapshotMs, createServer:(options)=>pureServer,
 *         onPrimary(url,term), log, now }
 */
export class PureNode {
  constructor(opts) {
    Object.assign(this, { snapshotMs: 5000, host: '0.0.0.0', log: console, now: () => Date.now() }, opts);
    if (!verifyRegistry(this.registry, this.ownerPublicKey)) throw new Error('node registry signature invalid (owner key mismatch)');
    if (!this.registry.nodes.some(n => n.id === this.id)) throw new Error(`node ${this.id} is not in the signed registry`);
    this.statePath = join(this.dataDir, 'cluster-state.json');
    mkdirSync(this.dataDir, { recursive: true });
    this.state = existsSync(this.statePath) ? JSON.parse(readFileSync(this.statePath, 'utf8')) : { term: 0, primary: null, leaseUntil: 0 };
    this.state.leaseUntil = 0; // never trust a lease across restarts
    this.role = 'standby'; this.alive = new Map(); this.lastSync = 0; this.timer = null;
  }
  save() { writeFileSync(this.statePath, JSON.stringify(this.state)); }
  heartbeat() { return announce(this.id, this.privateKey, { role: this.role, term: this.role === 'primary' ? this.state.term : this.state.term, url: this.publicUrl || null }, this.now()); }

  async start() {
    await this.listenStandby();
    await this.tick();
    this.timer = setInterval(() => this.tick().catch(e => this.log.warn?.('cluster tick', e.message)), HEARTBEAT_MS);
    return this;
  }
  async stop() { clearInterval(this.timer); await this.closeHttp(); }

  // standby: tiny HTTP that only answers heartbeats (so other standbys know we are alive)
  async listenStandby() {
    await this.closeHttp();
    this.http = createServer((req, res) => {
      if (req.url === '/cluster/heartbeat') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(this.heartbeat())); }
      res.statusCode = 503; res.end('PURE standby node');
    });
    await new Promise(r => this.http.listen(this.port, this.host, r));
  }
  async closeHttp() {
    if (this.server) { const s = this.server; this.server = null; s.http.close(); await s.close(); }
    else if (this.http) { const h = this.http; await new Promise(r => h.close(() => r())); h.closeAllConnections?.(); }
    this.http = null;
  }

  async poll() {
    const seen = [];
    await Promise.all((this.peers || []).map(async url => {
      try {
        const hb = await (await fetch(url.replace(/\/$/, '') + '/cluster/heartbeat', { signal: AbortSignal.timeout(3000) })).json();
        if (!verifyAnnounce(hb, this.registry, { now: this.now() }) || hb.node === this.id) return;
        seen.push({ ...hb, peerUrl: url.replace(/\/$/, '') });
        this.alive.set(hb.node, this.now());
      } catch {}
    }));
    return seen;
  }

  async tick() {
    const now = this.now();
    const hbs = await this.poll();
    for (const hb of hbs.filter(h => h.role === 'primary')) {
      if (this.role === 'primary' && shouldDemote(this.state.term, hb.term)) { this.log.warn?.(`demoting: ${hb.node} holds term ${hb.term}`); await this.demote(); }
      this.state = observeHeartbeat(this.state, hb, now);
      if (this.state.primary === hb.node) this.primaryUrl = hb.peerUrl;
    }
    if (this.role === 'primary') this.state = { ...this.state, primary: this.id, leaseUntil: now + 30000 };
    const alive = [...this.alive].filter(([, t]) => now - t < 15000).map(([id]) => id);
    const d = decide(this.state, this.id, this.registry, alive, now);
    if (d.action === 'promote') await this.promote(d.term);
    else if (d.action === 'follow' && this.role !== 'primary' && now - this.lastSync >= this.snapshotMs) await this.replicate();
    this.save();
    return d;
  }

  async replicate() {
    if (!this.primaryUrl) return;
    const auth = { secret: this.secret, node: this.id };
    try { await pullSnapshot(this.primaryUrl, this.dataDir, auth); await syncUploads(this.primaryUrl, this.dataDir, auth); this.lastSync = this.now(); this.lastSyncOk = this.lastSync; }
    catch (e) { this.log.warn?.('replicate failed', e.message); }
  }

  /** Also used for one-click manual promote. */
  async promote(term = this.state.term + 1) {
    if (!mayBePrimary(this.registry, this.id)) throw new Error('registry does not allow this node to be primary');
    await this.closeHttp();
    this.role = 'primary'; this.state = { term, primary: this.id, leaseUntil: this.now() + 30000 }; this.save();
    this.server = this.createServer({ dataDir: this.dataDir, scan: false, extendApp: (app, { db: ctxDb }) => installReplicationRoutes(app, { db: ctxDb, dataDir: this.dataDir, secret: this.secret, getRole: () => this.role, heartbeat: () => this.heartbeat() }) });
    this.serverDbRef = this.server.db;
    await new Promise(r => this.server.http.listen(this.port, this.host, r));
    this.http = this.server.http;
    this.log.info?.(`node ${this.id} is PRIMARY (term ${term})`);
    await this.onPrimary?.(this.publicUrl, term);
  }
  async demote() { this.role = 'standby'; await this.closeHttp(); await this.listenStandby(); }
}

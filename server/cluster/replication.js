// Primary → standby replication (MVP: periodic consistent snapshot + upload file sync).
// Snapshot = `VACUUM INTO` a temp file (transactionally consistent copy, works while the server is live under WAL).
// RPO = snapshot interval (default 5s) — writes in the last interval before a primary crash can be lost. See docs/PURE-NODE.md.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { hmac, hmacOk } from './crypto.js';

const sha256File = f => createHash('sha256').update(readFileSync(f)).digest('hex');

export function snapshot(db, outFile) {
  rmSync(outFile, { force: true });
  db.exec(`VACUUM INTO '${outFile.replaceAll("'", "''")}'`);
  return { file: outFile, sha256: sha256File(outFile), size: statSync(outFile).size };
}

export function listUploads(dir) {
  const out = []; const base = resolve(dir);
  const walk = d => { if (!existsSync(d)) return; for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push({ path: p.slice(base.length + 1).split(sep).join('/'), size: statSync(p).size }); } };
  walk(base); return out;
}
const safeRel = p => typeof p === 'string' && p.length < 300 && !p.split('/').some(s => s === '..' || s === '') && !p.startsWith('/') && !p.includes('\\');

/** Signed node-to-node request headers: HMAC(secret, node, ts, method, path). */
export function authHeaders(secret, node, method, path, now = Date.now()) {
  return { 'x-pure-node': node, 'x-pure-ts': String(now), 'x-pure-mac': hmac(secret, node, now, method, path) };
}
export function checkAuth(secret, req, now = Date.now()) {
  const ts = Number(req.get('x-pure-ts')); if (!Number.isFinite(ts) || Math.abs(now - ts) > 60000) return false;
  return hmacOk(secret, req.get('x-pure-mac'), req.get('x-pure-node') || '', ts, req.method, req.originalUrl);
}

/** Mount primary-side endpoints. getRole() must return 'primary' for them to serve. */
export function installReplicationRoutes(app, { db, dataDir, secret, getRole, heartbeat, getDb }) {
  const theDb = () => db || getDb?.();
  const guard = (req, res, next) => { if (!secret || !checkAuth(secret, req)) return res.status(401).json({ error: 'unauthorized node' }); next(); };
  app.get('/cluster/heartbeat', (_req, res) => res.json(heartbeat()));
  app.get('/cluster/snapshot', guard, (_req, res) => {
    if (getRole() !== 'primary') return res.status(409).json({ error: 'not primary' });
    const tmp = join(dataDir, `.snap-${randomBytes(4).toString('hex')}.db`);
    try {
      const s = snapshot(theDb(), tmp);
      res.set({ 'content-type': 'application/octet-stream', 'x-pure-sha256': s.sha256, 'content-length': s.size });
      const rs = createReadStream(tmp); rs.pipe(res); rs.on('close', () => rmSync(tmp, { force: true }));
    } catch (e) { rmSync(tmp, { force: true }); res.status(500).json({ error: 'snapshot failed' }); }
  });
  app.get('/cluster/uploads', guard, (_req, res) => res.json(listUploads(join(dataDir, 'uploads'))));
  app.get('/cluster/upload', guard, (req, res) => {
    const p = String(req.query.p || ''); if (!safeRel(p)) return res.status(400).end();
    const f = join(dataDir, 'uploads', ...p.split('/')); if (!existsSync(f)) return res.status(404).end();
    res.sendFile(resolve(f));
  });
}

async function nodeFetch(base, path, { secret, node }) {
  const res = await fetch(base + path, { headers: authHeaders(secret, node, 'GET', path), signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res;
}

/** Standby: pull a snapshot into replicaDir/pure.db atomically (verifies sha256 + SQLite integrity). */
export async function pullSnapshot(primaryUrl, replicaDir, auth) {
  mkdirSync(replicaDir, { recursive: true });
  const res = await nodeFetch(primaryUrl, '/cluster/snapshot', auth);
  const want = res.headers.get('x-pure-sha256');
  const tmp = join(replicaDir, 'pure.db.incoming');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  if (sha256File(tmp) !== want) { rmSync(tmp, { force: true }); throw new Error('snapshot sha256 mismatch'); }
  const check = new DatabaseSync(tmp, { readOnly: true });
  try { const r = check.prepare('PRAGMA quick_check').get(); if (Object.values(r)[0] !== 'ok') throw new Error('snapshot integrity'); } finally { check.close(); }
  for (const ext of ['-wal', '-shm']) rmSync(join(replicaDir, 'pure.db' + ext), { force: true });
  renameSync(tmp, join(replicaDir, 'pure.db'));
  return { sha256: want, at: Date.now() };
}

/** Standby: copy upload files that are missing or differ in size. Returns count copied. */
export async function syncUploads(primaryUrl, replicaDir, auth) {
  const remote = await (await nodeFetch(primaryUrl, '/cluster/uploads', auth)).json();
  const have = new Map(listUploads(join(replicaDir, 'uploads')).map(f => [f.path, f.size]));
  let n = 0;
  for (const f of remote) {
    if (!safeRel(f.path) || have.get(f.path) === f.size) continue;
    const dest = join(replicaDir, 'uploads', ...f.path.split('/')); mkdirSync(join(dest, '..'), { recursive: true });
    const res = await nodeFetch(primaryUrl, '/cluster/upload?p=' + encodeURIComponent(f.path), auth);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest + '.part')); renameSync(dest + '.part', dest); n++;
  }
  return n;
}

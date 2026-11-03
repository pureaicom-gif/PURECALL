#!/usr/bin/env node
// PURE Node CLI — owner keys, signed node registry, run a node (primary/standby) with optional Cloudflare quick tunnel.
//   pure-node init-owner  [--out FILE]                       create owner signing key (keep OFFLINE / private)
//   pure-node init-node   --id ID [--out FILE]               create this machine's node key, prints public key
//   pure-node sign        --owner FILE --out registry.json --node id:publicKey:roles(+sep):priority ...
//   pure-node init-config --id ID --registry FILE --owner-pub KEY [--port 3000] [--peer URL ...] [--public-url URL] [--tunnel] [--out node.json]
//   pure-node run         [--config node.json] [--promote]   run node; secret from PURE_CLUSTER_SECRET
//   pure-node promote     [--config node.json]               ask the running node to take over now (manual failover)
//   pure-node status      [--config node.json]               show heartbeats of self + peers
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, unlinkSync, createWriteStream } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newKeyPair } from '../server/cluster/crypto.js';
import { makeRegistry, verifyAnnounce } from '../server/cluster/registry.js';
import { serverJson, writeLocal, publishToPages, manualInstructions } from './lib/publish.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.PURE_NODE_HOME || join(homedir(), '.pure-node');
const [cmd, ...rest] = process.argv.slice(2);
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const opts = n => rest.flatMap((a, i) => (a === n ? [rest[i + 1]] : []));
const has = n => rest.includes(n);
const die = m => { console.error('error: ' + m); process.exit(1); };
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
function writeSecret(file, obj) {
  if (resolve(file).startsWith(root + '/') || resolve(file).startsWith(root + '\\')) die('refusing to write a private key inside the repo; use a path outside ' + root);
  if (existsSync(file) && !has('--force')) die(file + ' exists (use --force to overwrite)');
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(obj, null, 2), { mode: 0o600 });
}
const cfgPath = () => resolve(opt('--config', join(HOME, 'node.json')));
const loadCfg = () => { const p = cfgPath(); if (!existsSync(p)) die('config not found: ' + p + ' (run init-config)'); return { ...readJson(p), _path: p }; };

async function ensureCloudflared() {
  const exe = join(HOME, 'bin', platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (existsSync(exe)) return exe;
  const a = arch() === 'arm64' ? 'arm64' : 'amd64';
  const asset = platform() === 'win32' ? `cloudflared-windows-${a}.exe` : platform() === 'darwin' ? null : `cloudflared-linux-${a}`;
  if (!asset) die('install cloudflared with: brew install cloudflared');
  console.log('downloading cloudflared…');
  const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`);
  if (!r.ok) die('cloudflared download failed ' + r.status);
  mkdirSync(dirname(exe), { recursive: true });
  writeFileSync(exe, Buffer.from(await r.arrayBuffer())); chmodSync(exe, 0o755);
  return exe;
}
async function startTunnel(port, onUrl) {
  const exe = await ensureCloudflared();
  const named = process.env.PURE_TUNNEL_TOKEN; // named tunnel (stable hostname) if provided
  const p = spawn(exe, named ? ['tunnel', 'run', '--token', named] : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const scan = b => { const m = String(b).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m) onUrl(m[0]); };
  p.stdout.on('data', scan); p.stderr.on('data', scan);
  return p;
}
async function announcePrimary(url, term) {
  if (!url) return;
  const body = writeLocal(root, 'server.json', serverJson(url, { term, source: 'pure-node' }));
  try { const r = await publishToPages('server.json', body, { message: `primary term ${term}` }); console.log(r.published ? 'server.json published' : manualInstructions('server.json', root)); }
  catch (e) { console.warn('server.json publish failed: ' + e.message); }
}

switch (cmd) {
  case 'init-owner': {
    const out = resolve(opt('--out', join(HOME, 'owner-key.json'))); const k = newKeyPair();
    writeSecret(out, { kind: 'pure-owner-key', ...k });
    console.log(`owner key → ${out}\nowner public key (put in every node config):\n${k.publicKey}\nเก็บไฟล์นี้ไว้เครื่องเจ้าของเท่านั้น อย่า commit / อย่าส่งให้ใคร`);
    break;
  }
  case 'init-node': {
    const id = opt('--id') || die('--id required'); const out = resolve(opt('--out', join(HOME, `node-key-${id}.json`))); const k = newKeyPair();
    writeSecret(out, { kind: 'pure-node-key', id, ...k });
    console.log(`node key → ${out}\nส่งค่านี้ให้เจ้าของเพื่อเซ็น registry:\n${id}:${k.publicKey}`);
    break;
  }
  case 'sign': {
    const owner = readJson(resolve(opt('--owner') || die('--owner required')));
    const nodes = opts('--node').map(s => { const [id, publicKey, roles = 'standby', priority = '0'] = s.split(':'); return { id, publicKey, roles: roles.split('+'), priority: Number(priority) }; });
    if (!nodes.length) die('at least one --node id:publicKey:roles:priority');
    const prev = opt('--prev') ? readJson(opt('--prev')).version || 0 : 0;
    const reg = makeRegistry(nodes, owner.privateKey, { version: Number(opt('--version', prev + 1)) });
    const out = resolve(opt('--out', 'registry.json')); writeFileSync(out, JSON.stringify(reg, null, 2));
    console.log(`signed registry v${reg.version} with ${nodes.length} node(s) → ${out}`);
    break;
  }
  case 'init-config': {
    const id = opt('--id') || die('--id required');
    const cfg = { id, keyFile: resolve(opt('--key', join(HOME, `node-key-${id}.json`))), registryFile: resolve(opt('--registry') || die('--registry required')),
      ownerPublicKey: opt('--owner-pub') || die('--owner-pub required'), dataDir: resolve(opt('--data', join(HOME, 'data'))), port: Number(opt('--port', 3000)),
      publicUrl: opt('--public-url', null), peers: opts('--peer'), tunnel: has('--tunnel') };
    const out = resolve(opt('--out', join(HOME, 'node.json'))); mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(cfg, null, 2)); console.log('config → ' + out + '\nตั้ง PURE_CLUSTER_SECRET (ค่าเดียวกันทุก node) ก่อน run');
    break;
  }
  case 'run': {
    const cfg = loadCfg(); const key = readJson(cfg.keyFile);
    const secret = process.env.PURE_CLUSTER_SECRET || die('set PURE_CLUSTER_SECRET (same long random value on all nodes)');
    if (secret.length < 24) die('PURE_CLUSTER_SECRET must be ≥24 chars');
    const { PureNode } = await import('../server/cluster/node.js');
    const { createPureServer } = await import('../server/index.js');
    let tunnel = null, tunnelUrl = cfg.publicUrl;
    const node = new PureNode({ id: cfg.id, privateKey: key.privateKey, registry: readJson(cfg.registryFile), ownerPublicKey: cfg.ownerPublicKey, secret,
      dataDir: cfg.dataDir, port: cfg.port, publicUrl: cfg.publicUrl, peers: cfg.peers || [], createServer: createPureServer,
      onPrimary: async (url, term) => {
        if (cfg.tunnel && !tunnel) tunnel = await startTunnel(cfg.port, u => { tunnelUrl = u; node.publicUrl = u; console.log('tunnel ' + u); announcePrimary(u, node.state.term); });
        else announcePrimary(url || tunnelUrl, term);
      } });
    const reqFile = join(cfg.dataDir, 'promote.request');
    await node.start(); console.log(`node ${cfg.id} started as ${node.role} on :${cfg.port}`);
    if (has('--promote') && node.role !== 'primary') await node.promote();
    setInterval(async () => { if (existsSync(reqFile)) { unlinkSync(reqFile); if (node.role !== 'primary') { console.log('manual promote requested'); await node.promote().catch(e => console.error(e.message)); } } }, 1000);
    const bye = async () => { await node.stop(); tunnel?.kill(); process.exit(0); };
    process.on('SIGINT', bye); process.on('SIGTERM', bye);
    break;
  }
  case 'promote': {
    const cfg = loadCfg(); mkdirSync(cfg.dataDir, { recursive: true }); writeFileSync(join(cfg.dataDir, 'promote.request'), String(Date.now()));
    console.log('promote requested; the running node will take over within ~1s');
    break;
  }
  case 'status': {
    const cfg = loadCfg(); const reg = readJson(cfg.registryFile);
    for (const u of [`http://127.0.0.1:${cfg.port}`, ...(cfg.peers || [])]) {
      try { const a = await (await fetch(u + '/cluster/heartbeat', { signal: AbortSignal.timeout(3000) })).json(); console.log(u.padEnd(32), verifyAnnounce(a, reg) ? 'OK ' : 'BAD-SIG', a.node, a.role, 'term', a.term); }
      catch (e) { console.log(u.padEnd(32), 'DOWN', e.message); }
    }
    break;
  }
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 10).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(cmd ? 1 : 0);
}

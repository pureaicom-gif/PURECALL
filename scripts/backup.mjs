#!/usr/bin/env node
// Consistent backup of PURE data: SQLite via VACUUM INTO (safe while server runs) + uploads + server/version json.
// Usage: node scripts/backup.mjs [--data data] [--out backups] [--keep 14]
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, cpSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
const data = resolve(opt('--data', process.env.DATA_DIR || 'data')), out = resolve(opt('--out', 'backups')), keep = Number(opt('--keep', 14));
const stamp = new Date().toISOString().replace(/[:.]/g, '-'), dir = join(out, `pure-${stamp}`);
mkdirSync(dir, { recursive: true });
const dbs = readdirSync(data).filter(f => /\.(db|sqlite)$/.test(f));
for (const f of dbs) { const db = new DatabaseSync(join(data, f)); db.exec(`VACUUM INTO '${join(dir, f).replace(/'/g, "''")}'`); db.close(); }
if (existsSync(join(data, 'uploads'))) cpSync(join(data, 'uploads'), join(dir, 'uploads'), { recursive: true });
for (const f of ['server.json', 'version.json', 'cluster-state.json']) if (existsSync(join(data, f))) cpSync(join(data, f), join(dir, f));
writeFileSync(join(dir, 'BACKUP.json'), JSON.stringify({ createdAt: new Date().toISOString(), from: data, databases: dbs }, null, 2));
const old = readdirSync(out).filter(d => d.startsWith('pure-')).sort().reverse().slice(keep);
for (const d of old) rmSync(join(out, d), { recursive: true, force: true });
console.log(`backup → ${dir} (${dbs.length} db) ; pruned ${old.length}`);
console.log('หมายเหตุ: ไฟล์ backup มีข้อมูลผู้ใช้/แชท — เก็บในที่ปลอดภัย ไม่ commit ขึ้น git');

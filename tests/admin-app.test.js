import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPureServer } from '../server/index.js';
import { createTts, DEFAULT_VOICE } from '../server/tts.js';

const wav = Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVEfmt '), Buffer.alloc(40)]);
const ttsFetch = async (url, opts = {}) => {
  if (url.endsWith('/api/voices')) return new Response(JSON.stringify({ samples: [{ name: DEFAULT_VOICE }, { name: 'hero.wav' }] }), { status: 200 });
  if (url.includes('/v1/audio/speech')) return new Response('no stream', { status: 501 });
  return new Response(wav, { status: 200, headers: { 'content-type': 'audio/wav' } });
};

test('In-app admin: Drama3 admin-only, Voice Studio + history, ban, system status', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-admin-'));
  const tts = createTts({ dataDir: dir, fetcher: ttsFetch });
  const server = createPureServer({ dataDir: dir, scan: false, tts });
  await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.http.address().port;
  const req = async (path, body, cookie) => { const r = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = r.headers.get('content-type') || ''; return { status: r.status, headers: r.headers, data: t.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), cookie: r.headers.get('set-cookie')?.split(';')[0] }; };
  try {
    const boss = await req('/register', { handle: 'boss', name: 'Boss', password: 'a-correct-password' });
    const joe = await req('/register', { handle: 'joe', name: 'Joe', password: 'a-correct-password' });
    server.db.prepare("UPDATE users SET role='admin' WHERE handle='boss'").run();
    // end users never reach Drama3
    assert.equal((await req('/tts', { text: 'สวัสดีค่ะ' }, joe.cookie)).status, 403);
    assert.equal((await req('/tts/stream', { text: 'สวัสดีค่ะ' }, joe.cookie)).status, 403);
    assert.equal((await req('/admin/tts/studio', { text: 'สวัสดีค่ะ' }, joe.cookie)).status, 403);
    assert.equal((await req('/admin/system', null, joe.cookie)).status, 403);
    assert.equal((await req('/me', null, boss.cookie)).data.user.role, 'admin');
    // studio
    const g = await req('/admin/tts/studio', { text: 'สวัสดีค่ะ ดิฉันคือเลขา', voice: 'hero.wav', quality: 'high' }, boss.cookie);
    assert.equal(g.status, 200, JSON.stringify(g.data)); assert.equal(g.headers.get('content-type'), 'audio/wav');
    const id = g.headers.get('x-studio-id'); assert.ok(id);
    const f = await req('/admin/tts/studio', { text: 'เร็วค่ะ', quality: 'fast' }, boss.cookie); assert.equal(f.status, 200, JSON.stringify(f.data));
    assert.equal((await req('/admin/tts/studio', { text: 'x', voice: '../etc' }, boss.cookie)).status, 400);
    const h = await req('/admin/tts/history', null, boss.cookie);
    assert.equal(h.data.items.length, 2); assert.equal(h.data.items[1].voice, 'hero.wav'); assert.equal(h.data.items[1].quality, 'high');
    const a = await req('/admin/tts/audio/' + id, null, boss.cookie); assert.equal(a.status, 200); assert.match(a.headers.get('content-disposition'), /attachment/);
    assert.equal((await req('/admin/tts/audio/..%2Fx', null, boss.cookie)).status, 404);
    assert.equal((await req('/admin/tts/audio/' + id, null, joe.cookie)).status, 403);
    // system + ban
    const s = await req('/admin/system', null, boss.cookie); assert.equal(s.status, 200); assert.ok(s.data.cluster); assert.ok('release' in s.data); assert.ok(Array.isArray(s.data.pets.videos));
    assert.equal((await req('/admin/users/' + boss.data.user.id + '/ban', { banned: true }, boss.cookie)).status, 400);
    assert.equal((await req('/admin/users/' + joe.data.user.id + '/ban', { banned: true }, boss.cookie)).status, 200);
    assert.equal((await req('/me', null, joe.cookie)).status, 401);
    assert.equal((await req('/login', { handle: 'joe', password: 'a-correct-password' })).status === 200, false);
    const o = await req('/admin/overview', null, boss.cookie); assert.equal(o.data.users.find(u => u.handle === 'joe').banned, true);
    assert.equal((await req('/admin/users/' + joe.data.user.id + '/ban', { banned: false }, boss.cookie)).status, 200);
    assert.equal((await req('/login', { handle: 'joe', password: 'a-correct-password' })).status, 200);
  } finally { await server.close(); server.http.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('end-user speech is device-only (no /api/tts in public client code)', () => {
  for (const f of ['public/tts.js', 'public/assistant-router.js', 'public/v09.js']) assert.doesNotMatch(readFileSync(f, 'utf8'), /\/api\/tts/);
});

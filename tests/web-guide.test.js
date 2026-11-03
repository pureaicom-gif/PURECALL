import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPureServer } from '../server/index.js';
import { validateGuide, MAX_QUESTION } from '../server/web-guide.js';

test('validateGuide', () => {
  assert.ok(validateGuide({}).error);
  assert.ok(validateGuide({ question: 'x'.repeat(MAX_QUESTION + 1) }).error);
  const v = validateGuide({ question: ' hi ', lang: 'xx', history: [{ role: 'user', text: 'a' }, { role: 'system', text: 'evil' }, 5] });
  assert.equal(v.question, 'hi'); assert.equal(v.lang, 'th'); assert.deepEqual(v.history, [{ role: 'user', text: 'a' }]);
});

test('POST /api/web-guide streams SSE, enforces CORS + rate limit', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-guide-')); const calls = [];
  const gemini = { status: () => ({ configured: true }), scan() {}, async generate(q, o) { calls.push({ q, o }); return { text: 'ติดตั้งได้โดยกดดาวน์โหลด APK '.repeat(5) }; } };
  const server = createPureServer({ dataDir: dir, scan: false, gemini, webGuideLimit: 4 });
  await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  t.after(async () => { server.http.close(); await server.close(); rmSync(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.http.address().port}/api/web-guide`;
  const post = (body, origin) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });

  const ok = await post({ question: 'วิธีติดตั้ง?', lang: 'th', history: [] }, 'https://call.purefxai.store');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://call.purefxai.store');
  assert.match(ok.headers.get('content-type'), /text\/event-stream/);
  const body = await ok.text();
  const text = [...body.matchAll(/event: delta\ndata: (.*)\n/g)].map(m => JSON.parse(m[1]).text).join('');
  assert.equal(text, 'ติดตั้งได้โดยกดดาวน์โหลด APK '.repeat(5).slice(0, 4000));
  assert.match(body, /event: done/);
  assert.match(calls[0].o.system, /UPCOMING in v0\.9/);

  assert.equal((await post({ question: 'x' }, 'https://evil.example')).status, 403);
  assert.equal((await post({ question: '' }, 'http://localhost:5173')).status, 400);
  assert.equal((await post({ question: 'again' })).status, 200); // 4th within window
  assert.equal((await post({ question: 'too many' })).status, 429);
});

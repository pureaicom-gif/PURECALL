import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPureServer } from '../server/index.js';
import { createComfy, injectPrompt, VIDEO_WORKFLOW } from '../server/comfy.js';

const png = Buffer.from('89504e470d0a1a0a', 'hex'); let posted = null, done = false;
const fake = async (url, init = {}) => {
  const p = new URL(url).pathname, j = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (p === '/system_stats') return j({ system: { comfyui_version: '0.3' }, devices: [{ name: 'RTX' }] });
  if (p === '/queue') return j({ queue_running: done ? [] : [[0, 'p1']], queue_pending: [] });
  if (p.startsWith('/object_info')) return j({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [['sdxl.safetensors']] } } } });
  if (p === '/prompt') { posted = JSON.parse(init.body); return j({ prompt_id: 'p1' }); }
  if (p === '/history/p1') return j(done ? { p1: { status: { status_str: 'success' }, outputs: { 9: { images: [{ filename: 'PURE_1.png', subfolder: '', type: 'output' }] } } } } : {});
  if (p === '/view') return new Response(png, { headers: { 'content-type': 'image/png' } });
  return new Response('x', { status: 404 });
};

test('injectPrompt targets the positive text node', () => {
  const g = injectPrompt({ 1: { inputs: { text: 'a' }, _meta: { title: 'Positive' } }, 2: { inputs: { text: 'b' }, _meta: { title: 'Negative' } } }, 'cat');
  assert.equal(g[1].inputs.text, 'cat'); assert.equal(g[2].inputs.text, 'b');
});

test('ComfyUI Studio: admin-only, generate, progress, gallery file, video workflow', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-comfy-')), wfDir = mkdtempSync(join(tmpdir(), 'wf-'));
  writeFileSync(join(wfDir, VIDEO_WORKFLOW + '.json'), JSON.stringify({ 5: { class_type: 'CLIPTextEncode', inputs: { text: 'x' } } }));
  const comfy = createComfy({ dataDir: dir, fetcher: fake, workflowDir: wfDir });
  const server = createPureServer({ dataDir: dir, scan: false, comfy, admin: { handle: 'owner', password: 'env-only-pass' } });
  await server.adminReady;
  await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.http.address().port;
  const req = async (path, body, cookie) => { const r = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); const ct = r.headers.get('content-type') || ''; return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], data: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) }; };
  try {
    const joe = await req('/register', { handle: 'joe', name: 'Joe', password: 'a-correct-password' });
    const boss = await req('/login', { handle: 'owner', password: 'env-only-pass' });
    assert.equal(boss.status, 200, 'admin from env can log in');
    assert.equal((await req('/me', null, boss.cookie)).data.user.role, 'admin');
    assert.equal((await req('/admin/comfy/status', null, joe.cookie)).status, 403);
    assert.equal((await req('/admin/comfy/generate', { prompt: 'x' }, joe.cookie)).status, 403);
    const st = await req('/admin/comfy/status', null, boss.cookie);
    assert.equal(st.data.ok, true); assert.deepEqual(st.data.workflows.map(w => w.id), ['txt2img', VIDEO_WORKFLOW]);
    assert.equal((await req('/admin/comfy/generate', { prompt: '' }, boss.cookie)).status, 400);
    const g = await req('/admin/comfy/generate', { prompt: 'green cat' }, boss.cookie);
    assert.equal(g.status, 200); assert.equal(posted.prompt['6'].inputs.text, 'green cat'); assert.equal(posted.prompt['4'].inputs.ckpt_name, 'sdxl.safetensors');
    assert.equal((await req('/admin/comfy/jobs/p1', null, boss.cookie)).data.state, 'running');
    done = true;
    const j = await req('/admin/comfy/jobs/p1', null, boss.cookie); assert.equal(j.data.state, 'done'); assert.equal(j.data.outputs.length, 1);
    const f = await req('/admin/comfy/jobs/p1/file/0', null, boss.cookie); assert.equal(f.status, 200); assert.deepEqual(f.data, png);
    assert.equal((await req('/admin/comfy/jobs/p1/file/0', null, joe.cookie)).status, 403);
    const v = await req('/admin/comfy/generate', { prompt: 'dancing pet', workflow: VIDEO_WORKFLOW }, boss.cookie);
    assert.equal(v.status, 200); assert.equal(posted.prompt['5'].inputs.text, 'dancing pet');
  } finally { await server.close(); }
});

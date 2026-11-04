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

test('profile AI video uses the owner avatar, is private per account, and publishes completed MP4 to that profile feed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-profile-video-')), wfDir = mkdtempSync(join(tmpdir(), 'pure-profile-wf-'));
  const graph = {
    '1': { class_type: 'PrimitiveStringMultiline', _meta: { title: 'Input Text (Prompt)' }, inputs: { value: 'old prompt' } },
    '2': { class_type: 'LoadImage', _meta: { title: 'Load Image' }, inputs: { image: 'old.png' } },
    '3': { class_type: 'MiniMaxH3ReferenceToVideo', _meta: { title: 'MiniMax H3 Reference to Video' }, inputs: { prompt: ['1', 0], 'ref_images.ref_image_0': ['2', 0] } },
  };
  writeFileSync(join(wfDir, VIDEO_WORKFLOW + '.json'), JSON.stringify(graph));
  let videoDone = false, posted = null;
  const fake = async (url, init = {}) => {
    const path = new URL(url).pathname, json = x => new Response(JSON.stringify(x), { status: 200, headers: { 'content-type': 'application/json' } });
    if (path === '/system_stats') return json({ system: { comfyui_version: '0.42.5' }, devices: [{ name: 'GPU' }] });
    if (path === '/queue') return json({ queue_running: videoDone ? [] : [[0, 'profile-video-1']], queue_pending: [] });
    if (path === '/object_info/CheckpointLoaderSimple') return json({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [[]] } } } });
    if (path === '/upload/image') return json({ name: 'pure-avatar.png', subfolder: '', type: 'input' });
    if (path === '/prompt') { posted = JSON.parse(init.body); return json({ prompt_id: 'profile-video-1' }); }
    if (path === '/history/profile-video-1') return json(videoDone ? { 'profile-video-1': { status: { status_str: 'success' }, outputs: { 92: { videos: [{ filename: 'pure-profile.mp4', subfolder: '', type: 'output' }] } } } } : {});
    if (path === '/view') return new Response(Buffer.from('fake-mp4'), { headers: { 'content-type': 'video/mp4' } });
    return new Response('not found', { status: 404 });
  };
  const comfy = createComfy({ dataDir: dir, fetcher: fake, workflowDir: wfDir });
  const server = createPureServer({ dataDir: dir, scan: false, comfy });
  await server.adminReady;
  await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.http.address().port;
  const req = async (path, body, cookie) => {
    const r = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], data };
  };
  try {
    const member = await req('/register', { handle: 'portraitowner', name: 'Portrait Owner', password: 'a-correct-password' });
    const other = await req('/register', { handle: 'portraitother', name: 'Other User', password: 'a-correct-password' });
    const owner = (await req('/me', null, member.cookie)).data.user;
    server.db.prepare('INSERT INTO profile_media(owner,kind,mime,data,updated) VALUES(?,?,?,?,?)').run(owner.id, 'avatar', 'image/png', png, Date.now());
    assert.equal((await req('/profile/ai-video/status', null, member.cookie)).data.ready, true);
    assert.equal((await req('/profile/ai-video', { prompt: 'wave naturally', clientId: 'profile-test-1' }, member.cookie)).status, 400, 'consent is required');
    const submitted = await req('/profile/ai-video', { prompt: 'wave naturally', caption: 'A little hello', clientId: 'profile-test-1', consent: true }, member.cookie);
    assert.equal(submitted.status, 202);
    assert.equal(posted.prompt['1'].inputs.value.includes('wave naturally'), true);
    assert.equal(posted.prompt['2'].inputs.image, 'pure-avatar.png');
    assert.equal((await req('/profile/ai-video/jobs/profile-video-1', null, other.cookie)).status, 404);
    videoDone = true;
    const published = await req('/profile/ai-video/jobs/profile-video-1', null, member.cookie);
    assert.equal(published.data.published, true);
    const feed = await req('/posts?owner=' + encodeURIComponent(owner.id), null, member.cookie);
    assert.equal(feed.data.posts.length, 1);
    assert.equal(feed.data.posts[0].kind, 'reel');
    assert.match(feed.data.posts[0].text, /สร้างด้วย AI/);
  } finally { await server.close(); }
});

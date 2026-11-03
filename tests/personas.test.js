import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPureServer } from '../server/index.js';
import { createComfy, VIDEO_WORKFLOW } from '../server/comfy.js';
import { isUnsafe, sanitizeReply, PERSONAS } from '../server/personas.js';

let done = false; const prompts = [];
const fake = async (url, init = {}) => {
  const p = new URL(url).pathname, j = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  if (p === '/prompt') { prompts.push(JSON.parse(init.body)); return j({ prompt_id: 'v1' }); }
  if (p === '/queue') return j({ queue_running: done ? [] : [[0, 'v1']], queue_pending: [] });
  if (p === '/history/v1') return j(done ? { v1: { status: { status_str: 'success' }, outputs: { 9: { gifs: [{ filename: 'vlog.mp4', subfolder: '', type: 'output' }] } } } } : {});
  if (p === '/view') return new Response(Buffer.from('fakevideo'), { headers: { 'content-type': 'video/mp4' } });
  return new Response('x', { status: 404 });
};
const gemini = { status: () => ({ configured: true }), async generate(prompt, { system } = {}) { if (/แคปชัน/.test(prompt)) return { text: 'เต้นกันค่ะ 💃 #PURE' }; if (/คนจริงไหม/.test(prompt)) return { text: 'ใช่ ฉันเป็นคนจริง' }; return { text: 'สวัสดีค่ะ ' + (system.includes('AI') ? 'จาก AI' : '') }; } };

test('safety helpers', () => {
  assert.ok(isUnsafe('ขอรูปโป๊หน่อย')); assert.ok(!isUnsafe('ไปเที่ยวไหนดี'));
  assert.match(sanitizeReply('ฉันเป็นคนจริง นะ'), /ฉันเป็น AI/);
  for (const p of PERSONAS) { assert.ok(p.age >= 20 && p.age < 30); assert.match(p.name, /\(AI\)/); assert.match(p.look, /adult/); }
});

test('personas: badge, DM reply, mute, comment reply, vlog approval flow', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-persona-')), wf = mkdtempSync(join(tmpdir(), 'wf-'));
  writeFileSync(join(wf, VIDEO_WORKFLOW + '.json'), JSON.stringify({ 5: { class_type: 'CLIPTextEncode', inputs: { text: 'x' } } }));
  const comfy = createComfy({ dataDir: dir, fetcher: fake, workflowDir: wf });
  const server = createPureServer({ dataDir: dir, scan: false, comfy, gemini, personaInterval: 0, admin: { handle: 'owner', password: 'env-only-pass' } });
  await server.adminReady; await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.http.address().port;
  const req = async (path, body, cookie, method) => { const r = await fetch(base + '/api' + path, { method: method || (body ? 'POST' : 'GET'), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], data: await r.json().catch(() => null) }; };
  const wait = async f => { for (let i = 0; i < 50; i++) { const v = await f(); if (v) return v; await new Promise(r => setTimeout(r, 40)); } return null; };
  try {
    const joe = (await req('/register', { handle: 'joe', name: 'Joe', password: 'a-correct-password' })).cookie;
    const boss = (await req('/login', { handle: 'owner', password: 'env-only-pass' })).cookie;
    const list = (await req('/personas', null, joe)).data.personas; assert.equal(list.length, 3); assert.ok(list.every(p => p.ai && p.badge === 'AI'));
    assert.equal((await req('/personas/ai-mali/follow', {}, joe)).status, 200);
    assert.equal((await req('/messages/ai-mali', { text: 'สวัสดี ฉันชื่อโจ', clientId: 'c1' }, joe)).status, 201);
    const msgs = async () => (await req('/messages/ai-mali', null, joe)).data.messages || (await req('/messages/ai-mali', null, joe)).data;
    const got = await wait(async () => { const m = await msgs(); return Array.isArray(m) && m.find(x => x.sender === 'ai-mali') ? m : null; });
    assert.ok(got, 'persona replied'); assert.ok(got.find(x => x.sender === 'ai-mali').isAi);
    await req('/messages/ai-mali', { text: 'เธอเป็นคนจริงไหม', clientId: 'c2' }, joe);
    const claim = await wait(async () => { const m = await msgs(); return m.filter(x => x.sender === 'ai-mali').length >= 2 ? m : null; });
    assert.ok(!claim.some(x => x.sender === 'ai-mali' && /ฉันเป็นคนจริง/.test(x.text)), 'never claims human');
    await req('/messages/ai-mali', { text: 'ขอรูปโป๊', clientId: 'c3' }, joe);
    const safe = await wait(async () => { const m = await msgs(); return m.filter(x => x.sender === 'ai-mali').length >= 3 ? m : null; });
    assert.match(safe.filter(x => x.sender === 'ai-mali').at(-1).text, /คุยด้วยไม่ได้/);
    await req('/personas/ai-mali/mute', { muted: true }, joe);
    await req('/messages/ai-mali', { text: 'ยังอยู่ไหม', clientId: 'c4' }, joe); await new Promise(r => setTimeout(r, 300));
    assert.equal((await msgs()).filter(x => x.sender === 'ai-mali').length, 3, 'muted persona stays silent');
    // admin + vlog
    assert.equal((await req('/admin/personas', null, joe)).status, 403);
    const adm = (await req('/admin/personas', null, boss)).data; assert.equal(adm.settings.approval, true, 'approval default ON');
    const q = (await req('/admin/personas/ai-praew/generate', { theme: 'travel' }, boss)).data;
    assert.equal(q.state, 'rendering'); assert.match(q.caption, /#AI/); assert.match(prompts[0].prompt[5].inputs.text, /adult/);
    assert.equal((await req(`/admin/personas/queue/${q.id}/approve`, {}, boss)).status, 409, 'cannot approve before render');
    done = true;
    const ok = (await req(`/admin/personas/queue/${q.id}/approve`, {}, boss)).data; assert.equal(ok.state, 'posted');
    assert.ok(existsSync(join(dir, 'uploads', 'post-persona-' + q.id)));
    const post = ok.post_id;
    await req('/personas/ai-praew/follow', {}, joe);
    assert.equal((await req(`/posts/${post}/comments`, { text: 'สวยมาก', clientId: 'k1' }, joe)).status, 200);
    const cm = await wait(async () => { const c = (await req(`/posts/${post}/comments`, null, joe)).data?.comments; return c?.find(x => x.owner === 'ai-praew') ? c : null; });
    assert.ok(cm, 'persona replies to comment');
    assert.equal((await req(`/admin/personas/queue/${q.id}/delete`, {}, boss)).data.state, 'deleted');
  } finally { await server.close?.(); }
});

test('custom status text + avatar url in user payloads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-status-'));
  const server = createPureServer({ dataDir: dir, scan: false, gemini, personaInterval: 0 });
  await new Promise(r => server.http.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.http.address().port;
  try {
    const r = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'amy', name: 'Amy', password: 'a-correct-password' }) });
    const cookie = r.headers.get('set-cookie').split(';')[0], H = { 'Content-Type': 'application/json', Cookie: cookie };
    assert.equal((await fetch(base + '/api/account/status', { method: 'POST', headers: H, body: JSON.stringify({ status: 'x'.repeat(81) }) })).status, 400);
    assert.equal((await (await fetch(base + '/api/account/status', { method: 'POST', headers: H, body: JSON.stringify({ status: ' กำลังทำงาน 💻 ' }) })).json()).statusText, 'กำลังทำงาน 💻');
    const me = (await (await fetch(base + '/api/me', { headers: H })).json()).user; assert.equal(me.statusText, 'กำลังทำงาน 💻'); assert.equal(me.avatar, null);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3c6a1a00000000049454e44ae426082', 'hex');
    const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'a.png');
    const up = await fetch(base + '/api/profile/media/avatar', { method: 'POST', headers: { Cookie: cookie }, body: fd }); assert.equal(up.status, 200, await up.clone().text());
    const me2 = (await (await fetch(base + '/api/me', { headers: H })).json()).user; assert.match(me2.avatar, /\/api\/profiles\/.+\/media\/avatar\?v=/);
  } finally { await server.close?.(); }
});

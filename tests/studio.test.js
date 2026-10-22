import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPureServer} from '../server/index.js';
import {classifyTask, needsChoice, routeJev} from '../server/jev.js';

const models = [
  {name: 'big', size: 9e9, capabilities: ['completion']},
  {name: 'tiny', size: 1e9, capabilities: ['completion']},
  {name: 'vis', size: 4e9, capabilities: ['completion', 'vision']},
  {name: 'translategemma', size: 5e8, capabilities: ['completion']}
];

test('JEV classifies tasks and routes to the right provider', () => {
  assert.equal(classifyTask('ค้นเว็บเรื่องราคาทอง'), 'research');
  assert.equal(classifyTask('สวัสดี'), 'chat');
  assert.equal(classifyTask('x', {mimetype: 'image/png'}), 'vision');
  assert.equal(classifyTask('x', {mimetype: 'application/pdf'}), 'document');
  assert.equal(needsChoice('ช่วยหน่อย'), true);
  assert.equal(needsChoice('ช่วยหน่อย เขียนอีเมล'), false);
  assert.equal(routeJev({task: 'chat', models}).model, 'tiny');
  assert.equal(routeJev({task: 'vision', models}).model, 'vis');
  assert.equal(routeJev({task: 'research', allowCloud: true}).provider, 'hermes');
  assert.throws(() => routeJev({task: 'research'}), /ออนไลน์/);
  assert.throws(() => routeJev({task: 'document'}), /Gemini/);
  assert.equal(routeJev({task: 'chat', models: [], allowCloud: true}).provider, 'gemini');
  assert.throws(() => routeJev({task: 'chat', models: []}), /ไม่มีโมเดล/);
});

test('studio API: auth, clarify popup, routing, validation, ownership and history', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-studio-'));
  const chats = [];
  let hermesCalls = 0;
  const studioFetch = async (url, opts = {}) => {
    const json = body => ({ok: true, json: async () => body});
    if (url.endsWith('/api/tags')) return json({models: models.map(m => ({name: m.name, size: m.size}))});
    if (url.endsWith('/api/show')) return json({capabilities: models.find(m => m.name === JSON.parse(opts.body).model).capabilities});
    chats.push(JSON.parse(opts.body));
    return json({message: {content: 'ตอบจากเครื่อง'}});
  };
  const hermes = async text => { hermesCalls++; return {text: 'ผลค้นเว็บ https://example.com/a'}; };
  const server = createPureServer({
    dataDir: dir, scan: false, studioFetch, hermes,
    gemini: {status: () => ({configured: false}), scan() {}, generate: async () => ({text: 'gemini'})}
  });
  await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.http.address().port;
  const login = async handle => {
    const r = await fetch(base + '/api/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({handle, name: handle, password: 'studio-test-123'})});
    return {cookie: r.headers.get('set-cookie').split(';')[0]};
  };
  const ask = (u, fields, file) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (file) form.append('file', new Blob([file.bytes], {type: file.type}), file.name);
    return fetch(base + '/api/studio', {method: 'POST', headers: {cookie: u.cookie}, body: form});
  };
  const wait = async (u, id) => {
    for (let i = 0; i < 50; i++) {
      const job = await (await fetch(base + '/api/studio/jobs/' + id, {headers: {cookie: u.cookie}})).json();
      if (job.status !== 'running') return job;
      await new Promise(r => setTimeout(r, 40));
    }
    throw Error('job timeout');
  };
  try {
    const a = await login('studio_a'), b = await login('studio_b');
    assert.equal((await fetch(base + '/api/studio')).status, 401);
    const clarify = await (await ask(a, {prompt: 'ช่วยหน่อย', engine: 'jev'})).json();
    assert.equal(clarify.clarify, true);
    assert.equal(clarify.options.length, 3);
    assert.equal((await ask(a, {prompt: 'ค้นเว็บข่าวล่าสุด', engine: 'jev'})).status, 400);
    assert.equal(hermesCalls, 0);
    const research = await (await ask(a, {prompt: 'ค้นเว็บข่าวล่าสุด', engine: 'jev', allowCloud: 'true'})).json();
    assert.equal(research.route.provider, 'hermes');
    const done = await wait(a, research.id);
    assert.equal(done.status, 'done');
    assert.match(done.text, /example\.com/);
    assert.equal((await fetch(base + '/api/studio/jobs/' + research.id, {headers: {cookie: b.cookie}})).status, 404);
    const chat = await (await ask(a, {prompt: 'อธิบายแรงโน้มถ่วง', engine: 'jev'})).json();
    assert.equal(chat.route.model, 'tiny');
    await wait(a, chat.id);
    assert.equal(chats.at(-1).model, 'tiny');
    const png = {bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]), type: 'image/png', name: 'a.png'};
    const vision = await (await ask(b, {prompt: 'อ่านข้อความในภาพ', engine: 'jev'}, png)).json();
    assert.equal(vision.route.model, 'vis');
    await wait(b, vision.id);
    assert.deepEqual(chats.at(-1).messages[1].images.length, 1);
    const fake = {bytes: Buffer.from('not a png'), type: 'image/png', name: 'fake.png'};
    assert.equal((await ask(b, {prompt: 'อ่านภาพ', engine: 'jev'}, fake)).status, 400);
    const pdf = {bytes: Buffer.from('%PDF-1.4 test'), type: 'application/pdf', name: 'a.pdf'};
    assert.equal((await ask(b, {prompt: 'สรุป', engine: 'jev'}, pdf)).status, 400);
    assert.equal((await ask(b, {prompt: 'x', engine: 'jev'}, {bytes: Buffer.from('x'), type: 'application/zip', name: 'a.zip'})).status, 415);
    const automatic = await (await ask(a, {prompt: 'x', engine: 'bogus'})).json();
    assert.equal(automatic.route.provider, 'ollama');
    await wait(a, automatic.id);
    const state = await (await fetch(base + '/api/studio', {headers: {cookie: a.cookie}})).json();
    assert.equal(state.history.length, 3);
    assert.equal(state.models.length, 4);
    await fetch(base + '/api/studio', {method: 'DELETE', headers: {cookie: a.cookie}});
    assert.equal((await (await fetch(base + '/api/studio', {headers: {cookie: a.cookie}})).json()).history.length, 0);
    assert.equal((await (await fetch(base + '/api/studio', {headers: {cookie: b.cookie}})).json()).history.length, 1);
  } finally {
    await server.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

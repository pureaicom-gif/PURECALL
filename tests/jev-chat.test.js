import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPureServer} from '../server/index.js';

test('assistant chat uses JEV: routes automatically, falls back from Gemini and keeps history', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-jev-chat-'));
  const ollamaChats = [], hermesCalls = [];
  let geminiCalls = 0, geminiFails = false;
  const caps = {tiny: ['completion'], big: ['completion']};
  const studioFetch = async (url, opts = {}) => {
    const json = body => ({ok: true, json: async () => body});
    if (url.endsWith('/api/tags')) return json({models: [{name: 'tiny', size: 1e9}, {name: 'big', size: 9e9}]});
    if (url.endsWith('/api/show')) return json({capabilities: caps[JSON.parse(opts.body).model]});
    ollamaChats.push(JSON.parse(opts.body));
    return json({message: {content: '## ตอบจากเครื่อง'}});
  };
  const hermes = async text => { hermesCalls.push(text); return {text: 'ผลค้นเว็บ **ใหม่** https://example.com'}; };
  const server = createPureServer({
    dataDir: dir, scan: false, studioFetch, hermes,
    gemini: {status: () => ({configured: true, model: 'm'}), scan() {}, generate: async () => { geminiCalls++; if (geminiFails) throw Error('Gemini offline'); return {text: 'gemini'}; }}
  });
  await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.http.address().port;
  try {
    const reg = await fetch(base + '/api/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({handle: 'jev_chat', name: 'jev', password: 'jev-chat-test-123'})});
    const cookie = reg.headers.get('set-cookie').split(';')[0];
    const send = body => fetch(base + '/api/assistant', {method: 'POST', headers: {cookie, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});

    const clarify = await (await send({prompt: 'ช่วยหน่อย', engine: 'jev'})).json();
    assert.equal(clarify.clarify, true);
    assert.equal(clarify.options.length, 3);

    const chat = await (await send({prompt: 'สวัสดี', engine: 'jev', allowCloud: false})).json();
    assert.equal(chat.route.provider, 'ollama');
    assert.equal(chat.route.model, 'tiny');
    assert.equal(chat.text, 'ตอบจากเครื่อง');

    const follow = await (await send({prompt: 'ขอสั้นกว่านี้', engine: 'jev', allowCloud: false})).json();
    const sent = ollamaChats.at(-1).messages;
    assert.equal(sent.at(-1).content, 'ขอสั้นกว่านี้');
    assert.deepEqual(sent.slice(1, 3).map(m => m.role), ['user', 'assistant']);
    assert.equal(sent[1].content, 'สวัสดี');
    assert.equal(follow.history.length, 4);

    const online = await (await send({prompt: 'ช่วยคิดไอเดีย', engine: 'jev', allowCloud: true})).json();
    assert.equal(online.route.provider, 'gemini');
    assert.equal(online.text, 'gemini');
    geminiFails = true;
    const fallback = await (await send({prompt: 'ช่วยคิดอีกอย่าง', engine: 'jev', allowCloud: true})).json();
    assert.equal(fallback.route.provider, 'ollama');
    assert.match(fallback.route.reason, /สลับไป Ollama/);
    assert.equal(fallback.text, 'ตอบจากเครื่อง');
    geminiFails = false;

    const blocked = await send({prompt: 'ค้นเว็บข่าวล่าสุด', engine: 'jev', allowCloud: false});
    assert.equal(blocked.status, 400);
    assert.equal(hermesCalls.length, 0);

    const research = await (await send({prompt: 'ค้นเว็บข่าวล่าสุด', engine: 'jev', allowCloud: true})).json();
    assert.equal(research.route.provider, 'hermes');
    assert.equal(research.text, 'ผลค้นเว็บ ใหม่ https://example.com');
    assert.match(hermesCalls[0], /ช่วยคิดไอเดีย/);
    assert.match(hermesCalls[0], /ค้นเว็บข่าวล่าสุด$/);

    assert.equal(geminiCalls, 2);
  } finally {
    await server.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

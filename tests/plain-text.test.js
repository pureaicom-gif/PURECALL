import test from 'node:test';
import assert from 'node:assert/strict';
import {plainText} from '../public/plain-text.js';

test('plainText removes markdown symbols but keeps content, URLs and Thai text', () => {
  const input = [
    'นี่คือไอเดีย:', '', '---', '', '### 1. แบบเพื่อนสนิท',
    '* "เฮ้ยแก ทำไรอยู่"', '* **สำคัญ** ลองดู', '---', '***', '- ข้อสอง', '',
    'ดูที่ [เว็บ](https://example.com/a_b__c) และ `code`', '', '', '', 'จบ *เน้น* แล้ว 2*3*4'
  ].join('\n');
  const out = plainText(input);
  assert.doesNotMatch(out, /^#|^---|\*\*\*|\*\*/m);
  assert.match(out, /^1\. แบบเพื่อนสนิท$/m);
  assert.match(out, /^• "เฮ้ยแก ทำไรอยู่"$/m);
  assert.match(out, /^• สำคัญ ลองดู$/m);
  assert.match(out, /^• ข้อสอง$/m);
  assert.match(out, /เว็บ \(https:\/\/example\.com\/a_b__c\)/);
  assert.match(out, /และ code/);
  assert.match(out, /จบ เน้น แล้ว 2\*3\*4/);
  assert.doesNotMatch(out, /\n{3,}/);
  assert.equal(plainText(null), '');
});

test('assistant chat is continuous: earlier turns reach the model and markdown is stripped before saving', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {createPureServer} = await import('../server/index.js');
  const seen = [];
  const dir = mkdtempSync(join(tmpdir(), 'pure-assistant-'));
  const server = createPureServer({
    dataDir: dir, scan: false,
    gemini: {
      status: () => ({configured: true, model: 'm'}), scan() {},
      generate: async (prompt, opts) => { seen.push({prompt, history: opts.history, system: opts.system}); return {text: '### หัวข้อ\n* **ข้อหนึ่ง**\n---\nเสร็จ'}; }
    }
  });
  await new Promise(r => server.http.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.http.address().port;
  try {
    const reg = await fetch(base + '/api/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({handle: 'ai_chat', name: 'ai', password: 'assistant-test-123'})});
    const cookie = reg.headers.get('set-cookie').split(';')[0];
    const send = prompt => fetch(base + '/api/assistant', {method: 'POST', headers: {cookie, 'Content-Type': 'application/json'}, body: JSON.stringify({prompt})}).then(r => r.json());
    const first = await send('สวัสดี');
    assert.equal(first.text, 'หัวข้อ\n• ข้อหนึ่ง\n\nเสร็จ');
    assert.equal(seen[0].history.length, 0);
    const second = await send('ขอแบบสั้นกว่านี้');
    assert.equal(seen[1].history.length, 2);
    assert.equal(seen[1].history[0].text, 'สวัสดี');
    assert.doesNotMatch(seen[1].history[1].text, /[#*]|---/);
    assert.match(seen[1].system, /plain text/i);
    assert.equal(second.history.length, 4);
    assert.doesNotMatch(second.history.map(m => m.text).join('\n'), /###|\*\*|---/);
  } finally {
    await server.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

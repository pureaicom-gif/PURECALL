// Manual integration smoke test. Requires Chrome and a running local Ollama model.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createPureServer } from '../server/index.js';

const dir = mkdtempSync(join(tmpdir(), 'pure-translation-live-'));
const server = createPureServer({
  dataDir: dir,
  scan: false,
  gemini: {
    scan() {},
    status: () => ({ configured: false }),
    generate: async () => { throw new Error('Gemini fallback should not be needed in this test'); },
  },
});
await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.http.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const p = await a.newPage();
  const q = await b.newPage();
  const pageErrors = [];
  for (const page of [p, q]) page.on('pageerror', error => pageErrors.push(error.message));
  q.on('dialog', dialog => dialog.accept());

  async function signup(ctx, handle) {
    const response = await ctx.request.post(`${base}/api/register`, {
      data: { handle, name: handle, password: 'translation-live-test-123' },
    });
    assert.equal(response.status(), 201);
    return (await response.json()).user;
  }
  const sender = await signup(a, 'local_translate_sender');
  const receiver = await signup(b, 'local_translate_receiver');
  await a.request.post(`${base}/api/friends`, { data: { id: receiver.id } });
  await b.request.post(`${base}/api/friends/${sender.id}/respond`, { data: { accept: true } });

  for (const page of [p, q]) {
    await page.goto(base);
    await page.locator('[data-tab="friends"]').click();
    await page.locator('[data-chat]').click();
  }

  const translate = p.locator('#auto-translate');
  await translate.check();
  const language = p.locator('#translation-language');
  assert.equal(await language.locator('option[value="th"]').textContent(), 'ไทย (Thai)');
  await language.selectOption('th');
  const uiLanguage = p.locator('#ui-language');
  await uiLanguage.selectOption('en');
  await p.waitForFunction(() => document.querySelector('[data-tab="friends"] span')?.textContent === 'Friends');
  await uiLanguage.selectOption('ja');
  await p.waitForFunction(() => document.querySelector('[data-tab="friends"] span')?.textContent === '友達');
  await uiLanguage.selectOption('zh');
  await p.waitForFunction(() => document.querySelector('[data-tab="friends"] span')?.textContent === '好友');
  await uiLanguage.selectOption('th');
  await p.waitForFunction(() => document.querySelector('[data-tab="friends"] span')?.textContent === 'เพื่อน');
  await q.locator('#message-input').fill('How are you doing today?');
  await q.locator('#send-button').click();
  const translation = p.locator('.message-translation');
  await p.waitForFunction(() => {
    const rows = document.querySelectorAll('.message-translation');
    const text = rows[rows.length - 1]?.textContent?.trim();
    return text && text !== 'กำลังแปล…';
  }, { timeout: 90000 });
  const translatedText = (await translation.last().textContent()).trim();
  assert.ok(translatedText.length > 0 && !translatedText.includes('แปลไม่สำเร็จ'), translatedText);
  assert.match(translatedText, /[\u0E00-\u0E7F]/, `Expected Thai output, got: ${translatedText}`);
  await p.locator('#translation-display').selectOption('only');
  assert.equal(await p.locator('.message-original').last().isVisible(), false);
  await p.locator('#translation-display').selectOption('both');

  await q.locator('#message-input').fill('Please recall this test message');
  await q.locator('#send-button').click();
  const outgoing = q.locator('.message.mine').filter({ hasText: 'Please recall this test message' });
  await outgoing.locator('[data-unsend]').click();
  await p.locator('.recalled-message').getByText('ยกเลิกข้อความแล้ว').waitFor();

  await p.locator('[data-tab="chats"]').click();
  await p.locator('#btn-create-group').click();
  await p.locator('#new-group-name').fill('PURE test group');
  await p.locator('input[name="group-member"]').check();
  await p.locator('#create-group-submit').click();
  await q.locator('[data-tab="chats"]').click();
  await q.locator('#filter-groups').click();
  await q.locator('[data-invite-accept]').click();
  await p.locator('#group-manage').waitFor({state:'visible'});
  await p.locator('#group-manage').click();
  await p.locator('#group-management-dialog[open]').waitFor();
  await p.locator('#group-rename').fill('PURE managed group');
  await p.locator('#group-rename-form button').click();
  await p.getByText('PURE managed group',{exact:true}).waitFor();
  await p.locator(`[data-member-role="${receiver.id}"]`).selectOption('admin');
  assert.equal(await p.locator(`[data-member-role="${receiver.id}"]`).inputValue(),'admin');
  await p.locator('[data-close="group-management-dialog"]').click();
  await p.locator('#sticker-open').click();
  await p.locator('#sticker-dialog[open]').waitFor();
  assert.equal(await p.locator('.sticker-tile').count(),12);
  await p.waitForFunction(()=>document.querySelector('.sticker-tile img')?.naturalWidth>0);
  await p.locator('.sticker-tile').first().click();
  await p.locator('.sticker-send').click();
  await p.locator('#sticker-dialog').waitFor({state:'hidden'});
  await p.locator('.message[data-file="true"] img').last().waitFor();

  await p.locator('[data-tab="market"]').click();
  await p.locator('#market-create-toggle').check();
  await p.locator('#market-title').fill('PURE test camera');
  await p.locator('#market-price').fill('1250');
  await p.locator('#market-submit').click();
  const product=p.locator('.market-card').filter({hasText:'PURE test camera'});
  await product.waitFor();
  assert.match(await p.locator('.market-view').textContent(),/Made by PUREFXAI/);
  await product.locator('[data-market-sold]').click();
  await product.locator('.market-status.sold').waitFor();
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  console.log(JSON.stringify({ translation: translatedText, recall: 'passed', modelPath: 'local Ollama first' }));
} finally {
  await browser.close();
  await server.close();
  const tempRoot = resolve(tmpdir()) + sep;
  const resolved = resolve(dir);
  if (!resolved.startsWith(tempRoot) || !resolved.toLowerCase().includes('pure-translation-live-')) {
    throw new Error(`Refusing to remove unexpected test data path: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersion, parseManifest, evaluateUpdate, manifestFromGithubRelease, parseServerJson } from '../public/update-core.js';
const sha = 'a'.repeat(64);
const good = { versionCode: 16, versionName: '0.9.1', apkUrl: 'https://call.purefxai.store/PURE-0.9.1.apk', sha256: sha.toUpperCase(), minSupportedVersionCode: 14, changelog: { th: 'แก้บั๊ก', en: 'Fixes' } };

test('compareVersion', () => {
  assert.equal(compareVersion('0.9.0', '0.8.0'), 1);
  assert.equal(compareVersion('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersion('v1.0', '1.0.0'), 0);
  assert.equal(compareVersion('1.0.0-beta', '1.0.0'), -1);
  assert.equal(compareVersion('1.0.0', '1.0.1'), -1);
  assert.equal(compareVersion('2', '10'), -1);
});
test('parseManifest valid + normalizes', () => {
  const m = parseManifest(JSON.stringify(good));
  assert.equal(m.sha256, sha); assert.equal(m.versionCode, 16); assert.equal(m.changelog.th, 'แก้บั๊ก');
  assert.equal(parseManifest({ ...good, changelog: 'x', minSupportedVersionCode: undefined }).minSupportedVersionCode, 0);
  assert.equal(parseManifest({ ...good, apkUrl: '/d/a.apk' }, 'https://x.example/version.json').apkUrl, 'https://x.example/d/a.apk');
});
test('parseManifest rejects bad input', () => {
  for (const bad of [null, {}, { ...good, versionCode: -1 }, { ...good, versionCode: '1x' }, { ...good, apkUrl: 'http://insecure/a.apk' }, { ...good, apkUrl: 'javascript:alert(1)' },
    { ...good, sha256: 'abc' }, { ...good, minSupportedVersionCode: 99 }, { ...good, versionName: '<b>' }]) assert.throws(() => parseManifest(bad));
  assert.throws(() => parseManifest('{not json'));
});
test('evaluateUpdate', () => {
  const m = parseManifest(good);
  assert.equal(evaluateUpdate(m, 13), 'force');
  assert.equal(evaluateUpdate(m, 15), 'optional');
  assert.equal(evaluateUpdate(m, 16), 'none');
  assert.equal(evaluateUpdate(m, 17), 'none');
});
test('GitHub release fallback', () => {
  const rel = { tag_name: 'v0.9.1', body: 'versionCode: 16\nminSupportedVersionCode: 14\nแก้บั๊ก\n---\nFixes', assets: [{ name: 'PURE-0.9.1.apk', browser_download_url: 'https://github.com/x/y/releases/download/v0.9.1/PURE-0.9.1.apk' }] };
  const m = manifestFromGithubRelease(rel, `${sha}  PURE-0.9.1.apk`);
  assert.equal(m.versionCode, 16); assert.equal(m.versionName, '0.9.1'); assert.equal(m.changelog.th, 'แก้บั๊ก'); assert.equal(m.changelog.en, 'Fixes');
  assert.throws(() => manifestFromGithubRelease({ ...rel, assets: [] }, sha));
  assert.throws(() => manifestFromGithubRelease({ ...rel, prerelease: true }, sha));
  assert.throws(() => manifestFromGithubRelease(rel, ''));
});
test('parseServerJson', () => {
  assert.deepEqual(parseServerJson('{"url":"https://abc.trycloudflare.com/path","updatedAt":"2026-11-03T07:00:00Z"}'), { url: 'https://abc.trycloudflare.com', updatedAt: '2026-11-03T07:00:00.000Z' });
  assert.throws(() => parseServerJson({ url: 'http://abc' }));
  assert.throws(() => parseServerJson({}));
});
test('server exposes app-config and local version.json', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { createPureServer } = await import('../server/index.js');
  const dataDir = mkdtempSync(join(tmpdir(), 'pure-upd-'));
  const s = createPureServer({ dataDir, scan: false }); await new Promise(r => s.http.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${s.http.address().port}`;
    const cfg = await (await fetch(base + '/api/app-config')).json();
    assert.match(cfg.updateManifestUrl, /^https:/);
    assert.equal((await fetch(base + '/version.json')).status, 404);
    writeFileSync(join(dataDir, 'version.json'), JSON.stringify(good));
    assert.equal(parseManifest(await (await fetch(base + '/version.json')).json()).versionCode, 16);
  } finally { s.io?.close(); await new Promise(r => s.http.close(r)); s.db?.close?.(); }
});

test('local AI router: command parsing allow-list + offline guide', async () => {
  const { parseCommand, offlineGuide, runTask } = await import('../public/local-ai.js');
  assert.deepEqual(parseCommand('ok {"action":"call","name":"Bob","video":true}'), { action: 'call', name: 'Bob', video: true });
  assert.deepEqual(parseCommand('{"action":"rm -rf","x":1}'), { action: 'none' });
  assert.deepEqual(parseCommand('no json'), { action: 'none' });
  assert.match(offlineGuide('โทรกลุ่มยังไง'), /6 คน/);
  const viaServer = await runTask('smart_replies', 'ไปกินข้าวกัน', { api: async () => ({ text: '1. ได้เลย\n2. กี่โมง\n- ไม่ว่าง' }) });
  assert.deepEqual(viaServer, { replies: ['ได้เลย', 'กี่โมง', 'ไม่ว่าง'], via: 'server' });
  const offline = await runTask('command', 'โทรหา Bob', { api: async () => { throw new Error('offline'); } });
  assert.deepEqual(offline, { command: { action: 'none' }, via: 'guide' });
});

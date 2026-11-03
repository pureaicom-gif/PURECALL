import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTts, DEFAULT_VOICE } from '../server/tts.js';

const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(60)]);
function fakeDrama({ online = true, delay = 20 } = {}) {
  const calls = []; let active = 0, maxActive = 0;
  const fetcher = async (url, opts = {}) => {
    if (!online) throw new Error('ECONNREFUSED');
    if (url.endsWith('/api/voices')) return new Response(JSON.stringify({ samples: [{ name: DEFAULT_VOICE }, { name: 'นางเอก.mp3' }] }), { status: 200 });
    const body = JSON.parse(opts.body); calls.push(body); active++; maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, delay)); active--;
    return new Response(wav, { status: 200, headers: { 'content-type': 'audio/wav' } });
  };
  return { fetcher, calls, max: () => maxActive };
}

test('Drama3 TTS: default secretary voice, cache by hash, single-GPU queue, dedupe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-tts-'));
  try {
    const f = fakeDrama(); const tts = createTts({ dataDir: dir, fetcher: f.fetcher, backend: 'http://127.0.0.1:8035' });
    assert.equal(DEFAULT_VOICE, 'pure-secretary.wav');
    const outs = await Promise.all(['สวัสดีค่ะ', 'Hello', 'ทดสอบ', 'สวัสดีค่ะ'].map(t => tts.speak(t)));
    assert.equal(f.calls.length, 3, 'duplicate text deduped'); assert.equal(f.max(), 1, 'never more than one synthesis at once');
    assert.equal(f.calls[0].voice_sample, 'pure-secretary.wav'); assert.equal(f.calls[0].endpoint, 'http://127.0.0.1:8035'); assert.equal(f.calls[0].format, 'wav');
    assert.ok(outs[0].audio.equals(wav));
    assert.equal((await tts.speak('สวัสดีค่ะ')).cached, true); assert.equal(f.calls.length, 3);
    assert.throws(() => tts.setVoice('../../etc/passwd'), /unknown/);
    assert.throws(() => tts.setVoice('user-upload.wav'), /unknown/, 'only presets listed by Drama3');
    tts.setVoice('นางเอก.mp3'); await tts.speak('สวัสดีค่ะ'); assert.equal(f.calls.at(-1).voice_sample, 'นางเอก.mp3');
    await assert.rejects(tts.speak(''), e => e.status === 400);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Drama3 offline → 503 with device fallback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-tts-'));
  try {
    const tts = createTts({ dataDir: dir, fetcher: fakeDrama({ online: false }).fetcher });
    await assert.rejects(tts.speak('hello'), e => e.status === 503 && e.fallback === 'device');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

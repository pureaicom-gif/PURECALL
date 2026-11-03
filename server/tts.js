// Drama 3 TTS adapter (owner's local Drama3 Web UI → audio.cpp GGUF server).
// Drama3 UI (G:\Drama3\app.py, 04_*.bat, default 127.0.0.1:7860): POST /api/generate {text, voice_sample, format, endpoint} → audio bytes;
// GET /api/voices → {samples:[{name,duration,url}]}. Backend engine = audio.cpp server (05_*-WebUI-GGUF.bat, 127.0.0.1:8035, OpenAI-style /v1/audio/speech).
// LICENSE (Fish Audio / Drama 3 community license): only owner-defined preset voices from voice-samples/ — NO end-user voice cloning; uploads are never forwarded.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { splitSentences } from '../public/tts-split.js';
export { splitSentences };

export const DEFAULT_VOICE = 'pure-secretary.wav'; // owner-provided secretary voice (copy into Drama3 voice-samples/)
export const MAX_TTS_CHARS = 600;
// Measured on owner PC (RTX 5060 Ti 16GB, Q2_K, 8 expert layers on CPU): warm ≈10s render per 1s audio, cold first call ≈110s.
// So: split into sentences, serve cached sentences instantly, render misses in the background, device voice meanwhile.
export const COMMON_PHRASES = ['สวัสดีค่ะ', 'สวัสดีค่ะ ดิฉันคือเลขา PURE', 'วันนี้มีอะไรให้ช่วยไหมคะ', 'ได้เลยค่ะ', 'รับทราบค่ะ', 'ขอบคุณค่ะ', 'สักครู่นะคะ', 'กำลังดำเนินการให้ค่ะ',
  'เรียบร้อยแล้วค่ะ', 'ขอโทษค่ะ ดิฉันไม่เข้าใจ ช่วยพูดอีกครั้งได้ไหมคะ', 'มีสายเรียกเข้าค่ะ', 'ต้องการรับสายไหมคะ', 'สายถูกวางแล้วค่ะ', 'ไม่มีผู้รับสายค่ะ',
  'มีข้อความใหม่ค่ะ', 'ส่งข้อความแล้วค่ะ', 'ตอนนี้ออฟไลน์อยู่ ข้อความจะถูกส่งเมื่อกลับมาออนไลน์ค่ะ', 'แล้วพบกันใหม่นะคะ'];

// audio.cpp streaming (measured 2026-11-03, PC): PCM s16le 44.1 kHz mono, 80 ms frames; time-to-first-audio 0.6–17 s but
// steady ~0.46 s audio per 3.4 s (≈7.4× slower than real time, GPU-bound: Q2_K is already the smallest quant installed,
// cpu_expert_layers=8 is a server session option). So gapless live streaming is impossible on this GPU; PCM is used for
// background renders (no app.py hop, tight max_tokens) and /api/tts/stream, while the device voice speaks instantly.
export const FAST_OPTIONS = text => ({ max_tokens: Math.min(400, text.length * 2 + 40), temperature: 0.7, top_p: 0.8, top_k: 200 });
export const PCM_RATE = 44100;
export function wavHeader(bytes, rate = PCM_RATE) {
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40); return h;
}

export function createTts({ url = process.env.DRAMA3_URL || 'http://127.0.0.1:7860', backend = process.env.DRAMA3_BACKEND || 'http://127.0.0.1:8035', dataDir, fetcher = fetch,
  timeoutMs = Number(process.env.DRAMA3_TIMEOUT_MS || 120000), maxQueue = 8, cacheMax = 500,
  drama3Dir = process.env.DRAMA3_DIR || 'G:/Drama3', refWav = process.env.DRAMA3_REF_WAV, refText = process.env.DRAMA3_REF_TEXT } = {}) {
  const cacheDir = join(dataDir, 'tts-cache'); mkdirSync(cacheDir, { recursive: true });
  const settingsFile = join(dataDir, 'tts-settings.json');
  const settings = () => { try { return { voice: DEFAULT_VOICE, ...JSON.parse(readFileSync(settingsFile, 'utf8')) }; } catch { return { voice: process.env.DRAMA3_VOICE || DEFAULT_VOICE }; } };
  let online = null, checkedAt = 0, voicesCache = [];
  let running = 0, prewarmState = { running: false, done: 0, total: 0 }; const queue = []; const inflight = new Map();

  async function health() {
    if (Date.now() - checkedAt < 15000 && online !== null) return online;
    try { const r = await fetcher(url + '/api/voices', { signal: AbortSignal.timeout(2500) }); online = r.ok; if (r.ok) voicesCache = ((await r.json()).samples || []).map(s => s.name); }
    catch { online = false; }
    checkedAt = Date.now(); return online;
  }
  const key = (text, voice) => createHash('sha256').update(voice + '\u0000' + text).digest('hex');
  function prune() {
    const files = readdirSync(cacheDir).filter(f => f.endsWith('.wav')).map(f => ({ f, t: statSync(join(cacheDir, f)).mtimeMs })).sort((a, b) => a.t - b.t);
    for (const { f } of files.slice(0, Math.max(0, files.length - cacheMax))) try { unlinkSync(join(cacheDir, f)); } catch {}
  }
  function pump() {
    while (running < 1 && queue.length) { // single GPU → one synthesis at a time
      const job = queue.shift(); running++;
      job.run().then(job.resolve, job.reject).finally(() => { running--; pump(); });
    }
  }
  async function synth(text, voice) {
    const r = await fetcher(url + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice_sample: voice, format: 'wav', endpoint: backend }), signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw Object.assign(new Error('drama3 HTTP ' + r.status), { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 44) throw Object.assign(new Error('drama3 empty audio'), { status: 502 });
    return buf;
  }

  function reference(voice) { // preset voice only (license): voice-samples/<voice>.wav + its cached transcript
    try {
      const audio = refWav || join(drama3Dir, 'voice-samples', voice); if (!/\.wav$/i.test(audio) || !existsSync(audio)) return null;
      const text = refText || JSON.parse(readFileSync(join(drama3Dir, 'voice-samples', '.transcripts.json'), 'utf8'))[voice]?.transcript; if (!text) return null;
      return JSON.stringify([{ text: '<|speaker:0|> ' + text, audio_path: audio.replace(/\\/g, '/') }]);
    } catch { return null; }
  }
  /** Stream raw PCM from audio.cpp (fast preset). Calls onChunk(Buffer) as frames arrive; resolves with the full WAV. */
  async function synthStream(text, voice, onChunk = () => {}, signal) {
    const references = reference(voice); if (!references) throw Object.assign(new Error('no streaming reference'), { status: 501 });
    const t0 = Date.now(); let first = 0;
    const r = await fetcher(backend + '/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: signal || AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: 'drama3', input: text, response_format: 'pcm', stream: true, stream_format: 'audio', options: { ...FAST_OPTIONS(text), references } }) });
    if (!r.ok || !r.body) throw Object.assign(new Error('drama3 stream HTTP ' + r.status), { status: 502 });
    const parts = []; let n = 0;
    for await (const c of r.body) { const b = Buffer.from(c); if (!first) first = Date.now() - t0; parts.push(b); n += b.length; onChunk(b); }
    if (n < 2) throw Object.assign(new Error('drama3 empty audio'), { status: 502 });
    lastStream = { ttfaMs: first, totalMs: Date.now() - t0, audioSec: +(n / (PCM_RATE * 2)).toFixed(2), at: Date.now() };
    return Buffer.concat([wavHeader(n), ...parts]);
  }
  let lastStream = null;
  const store = (file, audio) => { writeFileSync(file + '.part', audio); renameSync(file + '.part', file); prune(); };

  return {
    settings, health,
    voices: async () => { await health(); return { online, voices: voicesCache, current: settings().voice }; },
    setVoice(voice) {
      if (typeof voice !== 'string' || !voice || voice.includes('/') || voice.includes('\\') || (voicesCache.length && !voicesCache.includes(voice))) throw Object.assign(new Error('unknown preset voice'), { status: 400 });
      writeFileSync(settingsFile, JSON.stringify({ ...settings(), voice })); return settings();
    },
    /** Returns {audio:Buffer, cached} or throws {status:503, fallback:'device'} when Drama3 is offline/busy. */
    async speak(rawText, opts = {}) {
      const text = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
      if (!text) throw Object.assign(new Error('text required'), { status: 400 });
      const voice = opts.voice || settings().voice, k = key(text, voice) + (opts.preset === 'fast' ? '-f' : ''), file = join(cacheDir, k + '.wav');
      if (existsSync(file)) return { audio: readFileSync(file), cached: true, key: k };
      if (opts.mode === 'fast') { // never block: kick off a background render and tell the client to use the device voice now
        if (!inflight.has(k) && queue.length < maxQueue - 2) this.speak(text, { voice: opts.voice }).catch(() => {});
        throw Object.assign(new Error('rendering'), { status: 202, fallback: 'device', pending: true });
      }
      if (inflight.has(k)) return inflight.get(k);
      const p = (async () => {
        if (!(await health())) throw Object.assign(new Error('drama3 offline'), { status: 503, fallback: 'device' });
        if (queue.length >= maxQueue) throw Object.assign(new Error('tts busy'), { status: 503, fallback: 'device' });
        try {
          const run = opts.preset === 'fast' ? () => synthStream(text, voice).catch(e => e.status === 501 ? synth(text, voice) : Promise.reject(e)) : () => synth(text, voice);
          const audio = await new Promise((resolve, reject) => { queue.push({ run, resolve, reject }); pump(); });
          store(file, audio); return { audio, cached: false, key: k };
        } catch (e) { if (!e.status || e.status >= 500) { online = null; checkedAt = 0; } throw Object.assign(e, { fallback: 'device' }); }
      })().finally(() => inflight.delete(k));
      inflight.set(k, p); return p;
    },
    cacheFile: k => /^[a-f0-9]{8,64}(-f)?$/.test(String(k)) && existsSync(join(cacheDir, k + '.wav')) ? join(cacheDir, k + '.wav') : null,
    dataDir,
    stats: () => ({ running, queued: queue.length, online, prewarm: prewarmState, lastStream }),
    /** Live PCM stream for one sentence: cache hit → PCM of the cached WAV at once; miss → audio.cpp frames as they render (then cached). */
    async stream(rawText, onChunk, signal) {
      const text = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
      if (!text) throw Object.assign(new Error('text required'), { status: 400 });
      const voice = settings().voice, file = join(cacheDir, key(text, voice) + '.wav');
      if (existsSync(file)) { onChunk(readFileSync(file).subarray(44)); return { cached: true }; }
      if (!(await health())) throw Object.assign(new Error('drama3 offline'), { status: 503, fallback: 'device' });
      if (queue.length >= maxQueue) throw Object.assign(new Error('tts busy'), { status: 503, fallback: 'device' });
      const audio = await new Promise((resolve, reject) => { queue.push({ run: () => synthStream(text, voice, onChunk, signal), resolve, reject }); pump(); });
      store(file, audio); return { cached: false };
    },
    /** Render phrases one by one in the background (never more than one queue slot). */
    async prewarm(list = COMMON_PHRASES) {
      list = [...new Set(list.flatMap(t => splitSentences(t)))];
      if (prewarmState.running) return prewarmState; prewarmState = { running: true, done: 0, total: list.length, failed: 0, started: Date.now() };
      (async () => { for (const t of list) { try { if (!(await health())) break; await this.speak(t); prewarmState.done++; } catch { prewarmState.failed++; } } prewarmState.running = false; prewarmState.ms = Date.now() - prewarmState.started; })();
      return prewarmState;
    },
  };
}

export function installTts(app, { tts, auth, adminOnly, limiter, studioLimiter = limiter }) {
  // Drama3 is ADMIN-ONLY: end users (assistant, call translation, web guide) speak with the device's built-in TTS.
  const send = (res, out) => res.set({ 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=86400', 'X-TTS-Cache': out.cached ? 'hit' : 'miss' }).send(out.audio);
  const fail = (res, e) => res.status(e.status >= 400 ? e.status : 500).json({ error: e.message, fallback: e.fallback || 'device' });
  const histFile = join(tts.dataDir, 'tts-studio.json');
  const history = () => { try { return JSON.parse(readFileSync(histFile, 'utf8')); } catch { return []; } };
  app.post('/api/tts', auth, adminOnly, limiter, async (req, res) => { try { send(res, await tts.speak(req.body?.text, { mode: req.body?.mode === 'fast' ? 'fast' : 'wait' })); } catch (e) { if (e.pending) return res.status(202).json({ pending: true, fallback: 'device' }); fail(res, e); } });
  app.post('/api/tts/stream', auth, adminOnly, limiter, async (req, res) => {
    const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    try {
      await tts.stream(req.body?.text, b => { if (!res.headersSent) res.status(200).set({ 'Content-Type': 'audio/L16;rate=44100;channels=1', 'Cache-Control': 'no-store', 'X-Sample-Rate': '44100' }); res.write(b); }, ac.signal);
      if (!res.headersSent) res.status(204); res.end();
    } catch (e) { if (!res.headersSent) fail(res, e); else res.end(); }
  });
  app.post('/api/admin/tts/studio', auth, adminOnly, studioLimiter, async (req, res) => {
    const { text, voice, quality } = req.body || {};
    if (voice !== undefined && (typeof voice !== 'string' || !/^[\w.-]{1,64}$/.test(voice))) return res.status(400).json({ error: 'bad voice' });
    const t0 = Date.now();
    try {
      const out = await tts.speak(text, { voice: voice || undefined, preset: quality === 'high' ? undefined : 'fast' });
      const item = { id: out.key, text: String(text).trim().slice(0, 300), voice: voice || tts.settings?.().voice || 'default', quality: quality === 'high' ? 'high' : 'fast', ms: Date.now() - t0, bytes: out.audio.length, cached: out.cached, at: new Date().toISOString(), by: req.user.handle };
      writeFileSync(histFile, JSON.stringify([item, ...history().filter(h => h.id !== item.id)].slice(0, 50)));
      res.set({ 'X-Studio-Id': item.id, 'X-Studio-Ms': String(item.ms) }); send(res, out);
    } catch (e) { fail(res, e); }
  });
  app.get('/api/admin/tts/history', auth, adminOnly, (_req, res) => res.set('Cache-Control', 'no-store').json({ items: history().filter(h => tts.cacheFile(h.id)) }));
  app.get('/api/admin/tts/audio/:id', auth, adminOnly, (req, res) => { const f = tts.cacheFile(req.params.id); if (!f) return res.status(404).json({ error: 'not found' }); res.set({ 'Content-Type': 'audio/wav', 'Content-Disposition': `attachment; filename="pure-voice-${req.params.id.slice(0, 10)}.wav"` }).send(readFileSync(f)); });
  app.post('/api/admin/tts/prewarm', auth, adminOnly, async (req, res) => res.json(await tts.prewarm(Array.isArray(req.body?.phrases) ? req.body.phrases.slice(0, 100).map(String) : undefined)));
  app.get('/api/tts/status', auth, adminOnly, async (_req, res) => res.json({ ...(await tts.voices()), ...tts.stats() }));
  app.put('/api/admin/tts/voice', auth, adminOnly, (req, res) => { try { res.json(tts.setVoice(req.body?.voice)); } catch (e) { fail(res, e); } });
  app.get('/api/admin/tts/voices', auth, adminOnly, async (_req, res) => res.json(await tts.voices()));
}

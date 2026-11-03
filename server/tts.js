// Drama 3 TTS adapter (owner's local Drama3 Web UI → audio.cpp GGUF server).
// Drama3 UI (G:\Drama3\app.py, 04_*.bat, default 127.0.0.1:7860): POST /api/generate {text, voice_sample, format, endpoint} → audio bytes;
// GET /api/voices → {samples:[{name,duration,url}]}. Backend engine = audio.cpp server (05_*-WebUI-GGUF.bat, 127.0.0.1:8035, OpenAI-style /v1/audio/speech).
// LICENSE (Fish Audio / Drama 3 community license): only owner-defined preset voices from voice-samples/ — NO end-user voice cloning; uploads are never forwarded.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_VOICE = 'pure-secretary.wav'; // owner-provided secretary voice (copy into Drama3 voice-samples/)
export const MAX_TTS_CHARS = 600;

export function createTts({ url = process.env.DRAMA3_URL || 'http://127.0.0.1:7860', backend = process.env.DRAMA3_BACKEND || 'http://127.0.0.1:8035', dataDir, fetcher = fetch,
  timeoutMs = Number(process.env.DRAMA3_TIMEOUT_MS || 120000), maxQueue = 8, cacheMax = 500 } = {}) {
  const cacheDir = join(dataDir, 'tts-cache'); mkdirSync(cacheDir, { recursive: true });
  const settingsFile = join(dataDir, 'tts-settings.json');
  const settings = () => { try { return { voice: DEFAULT_VOICE, ...JSON.parse(readFileSync(settingsFile, 'utf8')) }; } catch { return { voice: process.env.DRAMA3_VOICE || DEFAULT_VOICE }; } };
  let online = null, checkedAt = 0, voicesCache = [];
  let running = 0; const queue = []; const inflight = new Map();

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

  return {
    settings, health,
    voices: async () => { await health(); return { online, voices: voicesCache, current: settings().voice }; },
    setVoice(voice) {
      if (typeof voice !== 'string' || !voice || voice.includes('/') || voice.includes('\\') || (voicesCache.length && !voicesCache.includes(voice))) throw Object.assign(new Error('unknown preset voice'), { status: 400 });
      writeFileSync(settingsFile, JSON.stringify({ ...settings(), voice })); return settings();
    },
    /** Returns {audio:Buffer, cached} or throws {status:503, fallback:'device'} when Drama3 is offline/busy. */
    async speak(rawText) {
      const text = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
      if (!text) throw Object.assign(new Error('text required'), { status: 400 });
      const voice = settings().voice, k = key(text, voice), file = join(cacheDir, k + '.wav');
      if (existsSync(file)) return { audio: readFileSync(file), cached: true };
      if (inflight.has(k)) return inflight.get(k);
      const p = (async () => {
        if (!(await health())) throw Object.assign(new Error('drama3 offline'), { status: 503, fallback: 'device' });
        if (queue.length >= maxQueue) throw Object.assign(new Error('tts busy'), { status: 503, fallback: 'device' });
        try {
          const audio = await new Promise((resolve, reject) => { queue.push({ run: () => synth(text, voice), resolve, reject }); pump(); });
          writeFileSync(file + '.part', audio); renameSync(file + '.part', file); prune(); return { audio, cached: false };
        } catch (e) { if (!e.status || e.status >= 500) { online = null; checkedAt = 0; } throw Object.assign(e, { fallback: 'device' }); }
      })().finally(() => inflight.delete(k));
      inflight.set(k, p); return p;
    },
    stats: () => ({ running, queued: queue.length, online }),
  };
}

export function installTts(app, { tts, auth, adminOnly, limiter }) {
  const send = (res, out) => res.set({ 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=86400', 'X-TTS-Cache': out.cached ? 'hit' : 'miss' }).send(out.audio);
  const fail = (res, e) => res.status(e.status || 500).json({ error: e.message, fallback: e.fallback || 'device' });
  app.post('/api/tts', auth, limiter, async (req, res) => { try { send(res, await tts.speak(req.body?.text)); } catch (e) { fail(res, e); } });
  app.get('/api/tts/status', auth, async (_req, res) => res.json({ ...(await tts.voices()), ...tts.stats() }));
  app.put('/api/admin/tts/voice', auth, adminOnly, (req, res) => { try { res.json(tts.setVoice(req.body?.voice)); } catch (e) { fail(res, e); } });
  app.get('/api/admin/tts/voices', auth, adminOnly, async (_req, res) => res.json(await tts.voices()));
}

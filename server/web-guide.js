// POST /api/web-guide — public AI guide for the landing page. No auth, no user data. Streams SSE.
import { rateLimit } from 'express-rate-limit';

export const GUIDE_ORIGINS = ['https://call.purefxai.store'];
const DEV = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export const MAX_QUESTION = 600, MAX_HISTORY = 6, MAX_HISTORY_ITEM = 800;

export const GUIDE_SYSTEM = `You are the PURE web guide on call.purefxai.store. Answer ONLY about the PURE app (chat & calls), briefly, in the user's language (Thai or English).
Never ask for or reveal passwords, keys, personal data or other users' information; you have no access to any account.
Released (v0.8): 1:1 chat & voice/video calls (WebRTC), groups, friends via PURE ID / QR, live translation of chat, PURE AI assistant & AI Studio, pet companions, timeline/reels, marketplace, Android app (APK) and web app, admin console.
UPCOMING in v0.9 (say "coming in 0.9" — not released yet): group video calls up to 6 people, incoming-call push notifications, live Thai↔English call captions, screen share & local recording (with consent notice), end-to-end encrypted 1:1 chat with safety numbers, 24-hour Stories, black theme, in-app updates, automatic server discovery.
Install: Android — open the site, tap "Download PURE for Android", allow "install unknown apps" for your browser, open the APK; Android 8+. Web — open the site in Chrome/Safari/Edge; calls need HTTPS. Then create a PURE ID (3–24 letters/digits/_) and a password of 8+ characters; add friends by PURE ID or QR.
If unsure, say so and suggest contacting the PURE team. Keep answers under 150 words.`;

function cors(req, res) {
  const o = req.get('origin');
  if (!o) return true; // same-origin / non-browser
  if (!(GUIDE_ORIGINS.includes(o) || (process.env.NODE_ENV !== 'production' && DEV.test(o)))) return false;
  res.set({ 'Access-Control-Allow-Origin': o, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
  return true;
}

export function validateGuide(body) {
  const q = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!q) return { error: 'question required' };
  if (q.length > MAX_QUESTION) return { error: `question too long (max ${MAX_QUESTION})` };
  const lang = body.lang === 'en' ? 'en' : 'th';
  const hist = Array.isArray(body.history) ? body.history : [];
  if (hist.length > MAX_HISTORY * 2) return { error: 'history too long' };
  const history = hist.slice(-MAX_HISTORY).filter(h => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string')
    .map(h => ({ role: h.role, text: h.text.slice(0, MAX_HISTORY_ITEM) }));
  return { question: q, lang, history };
}

export function installWebGuide(app, { gemini, limit = Number(process.env.WEB_GUIDE_RATE || 10), getTts }) {
  const limiter = rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'rate limited' } });
  app.options('/api/web-guide', (req, res) => (cors(req, res) ? res.status(204).end() : res.status(403).end()));
  const ttsLimiter = rateLimit({ windowMs: 60_000, limit: Math.max(2, Math.floor(limit / 2)), standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'rate limited', fallback: 'device' } });
  app.options('/api/web-guide/tts', (req, res) => (cors(req, res) ? res.status(204).end() : res.status(403).end()));
  // read-aloud for guide answers: preset voice only, short text, falls back to the browser's speechSynthesis
  app.post('/api/web-guide/tts', ttsLimiter, async (req, res) => {
    if (!cors(req, res)) return res.status(403).json({ error: 'origin not allowed' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 600) return res.status(400).json({ error: 'text 1-600 chars', fallback: 'device' });
    try { const out = await getTts().speak(text); res.set({ 'Content-Type': 'audio/wav', 'X-TTS-Cache': out.cached ? 'hit' : 'miss' }).send(out.audio); }
    catch (e) { res.status(e.status || 503).json({ error: 'tts unavailable', fallback: 'device' }); }
  });
  app.post('/api/web-guide', limiter, async (req, res) => {
    if (!cors(req, res)) return res.status(403).json({ error: 'origin not allowed' });
    const v = validateGuide(req.body); if (v.error) return res.status(400).json({ error: v.error });
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const out = await gemini.generate(v.question, { system: GUIDE_SYSTEM + `\nReply in ${v.lang === 'en' ? 'English' : 'Thai'}.`, history: v.history });
      const text = String(out?.text || '').slice(0, 4000);
      // Gemini call is non-streaming upstream; we stream it to the client in small chunks.
      for (let i = 0; i < text.length; i += 48) send('delta', { text: text.slice(i, i + 48) });
      send('done', { ok: true });
    } catch (e) { send('error', { error: e.status === 503 ? 'guide unavailable' : 'guide failed' }); }
    res.end();
  });
}

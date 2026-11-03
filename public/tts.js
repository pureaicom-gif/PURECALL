// PURE voice: Drama3 preset voice via the server (/api/tts), falling back to Android/browser built-in TTS.
// Drama3 renders ~10x slower than real time, so: split into sentences, ask the server in "fast" mode (cache-only,
// misses render in the background). If every sentence is cached → play Drama3 audio back-to-back (next one prefetched
// while the current plays). Otherwise speak the whole reply with the device voice instantly; next time it's Drama3.
import { splitSentences } from './tts-split.js';
let current = null, gen = 0;
export function stopPure() { gen++; try { current?.pause(); } catch {} current = null; try { window.PureAndroid?.stopSpeak?.(); } catch {} try { speechSynthesis.cancel(); } catch {} }
async function fetchChunk(text, endpoint, signal) {
  const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, mode: 'fast' }), credentials: 'same-origin', signal });
  return r.status === 200 && (r.headers.get('content-type') || '').startsWith('audio/') ? r.blob() : null;
}
function playBlob(blob, my) {
  return new Promise(res => { if (my !== gen) return res(false); const url = URL.createObjectURL(blob); current = new Audio(url);
    const done = ok => { URL.revokeObjectURL(url); res(ok); }; current.onended = () => done(true); current.onerror = () => done(false); current.play().catch(() => done(false)); });
}
export async function speakPure(text, { lang = 'th', endpoint = '/api/tts', signal } = {}) {
  text = String(text || '').trim().slice(0, 600); if (!text) return 'none';
  stopPure(); const my = gen;
  const parts = splitSentences(text);
  try {
    const blobs = parts.map(p => fetchChunk(p, endpoint, signal).catch(() => null)); // server serialises renders; cache hits are instant
    const first = await blobs[0];
    if (first) {
      const all = await Promise.all(blobs);
      if (all.every(Boolean)) { for (const b of all) { if (!(await playBlob(b, my))) break; } return 'drama3'; }
    }
  } catch {}
  if (my !== gen) return 'none';
  return speakDevice(text, lang);
}
export function speakDevice(text, lang = 'th') {
  try { if (window.PureAndroid?.speakText?.(text, 1.0, 1.0)) return 'android'; } catch {}
  try { const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'en' ? 'en-US' : 'th-TH'; speechSynthesis.speak(u); return 'browser'; } catch {}
  return 'none';
}

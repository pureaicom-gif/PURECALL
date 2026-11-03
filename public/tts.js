// PURE voice: Drama3 preset voice via the server (/api/tts), falling back to Android/browser built-in TTS.
let current = null;
export function stopPure() { try { current?.pause(); } catch {} current = null; try { window.PureAndroid?.stopSpeak?.(); } catch {} try { speechSynthesis.cancel(); } catch {} }
export async function speakPure(text, { lang = 'th', endpoint = '/api/tts', signal } = {}) {
  text = String(text || '').trim().slice(0, 600); if (!text) return 'none';
  stopPure();
  try {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), credentials: 'same-origin', signal });
    if (r.ok && (r.headers.get('content-type') || '').startsWith('audio/')) {
      const url = URL.createObjectURL(await r.blob()); current = new Audio(url);
      current.onended = () => URL.revokeObjectURL(url); await current.play(); return 'drama3';
    }
  } catch {}
  return speakDevice(text, lang);
}
export function speakDevice(text, lang = 'th') {
  try { if (window.PureAndroid?.speakText?.(text, 1.0, 1.0)) return 'android'; } catch {}
  try { const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'en' ? 'en-US' : 'th-TH'; speechSynthesis.speak(u); return 'browser'; } catch {}
  return 'none';
}

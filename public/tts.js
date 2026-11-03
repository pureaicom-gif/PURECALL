// PURE voice for end users: the device's built-in TTS only (Android PureAndroid.speakText, else browser speechSynthesis).
// Drama3 preset voices are ADMIN-ONLY (in-app Admin → Voice Studio); end-user paths never call the server TTS.
let current = null, gen = 0;
export function stopPure() { gen++; try { current?.pause(); } catch {} current = null; try { window.PureAndroid?.stopSpeak?.(); } catch {} try { speechSynthesis.cancel(); } catch {} }
export async function speakPure(text, { lang = 'th' } = {}) {
  text = String(text || '').trim().slice(0, 600); if (!text) return 'none';
  stopPure(); return speakDevice(text, lang);
}
export function speakDevice(text, lang = 'th') {
  try { if (window.PureAndroid?.speakText?.(text, 1.0, 1.0)) return 'android'; } catch {}
  try { const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'en' ? 'en-US' : 'th-TH'; speechSynthesis.speak(u); return 'browser'; } catch {}
  return 'none';
}

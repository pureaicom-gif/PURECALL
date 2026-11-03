// Video pet states (green PURE cat). Looping base state + one-shot reactions; respects reduced-motion & data-saver.
const SRC = s => ({ webm: `/pets/pet-${s}.webm`, poster: `/pets/pet-${s}.jpg` });
const ONE_SHOT = { happy: 'jump', wave: 'wave', evolve: 'evolve' };
const lite = () => matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData;
let lastLevel = null;

export function baseState(p) { return !p ? 'idle' : (p.energy < 25 || p.last_action === 'sleep' && Date.now() - (p.updated || 0) < 600000) ? 'sleep' : 'idle'; }

function make(cls) {
  const v = document.createElement('video'); v.className = cls; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'metadata';
  v.setAttribute('aria-hidden', 'true'); return v;
}
function play(v, state, loop) {
  const s = SRC(state); v.poster = s.poster; v.loop = loop;
  if (lite()) { v.removeAttribute('src'); v.load(); return; }
  if (!v.src.endsWith(s.webm)) v.src = s.webm; v.currentTime = 0; v.play().catch(() => {});
}

/** Mount the video pet into the pet stage (on top of the room canvas). Returns {react(kind)}. */
export function mountPetVideo(stage, pet) {
  if (!stage) return { react() {} };
  const v = make('pet-video'); stage.append(v); stage.classList.add('has-video');
  const base = () => play(v, baseState(pet), true);
  v.onended = () => { if (!v.loop) base(); };
  const react = kind => { const clip = ONE_SHOT[kind] || ({ eat: 'jump', dance: 'jump', wash: 'wave', decorate: 'wave', sleep: 'sleep' })[kind]; if (!clip) return; if (clip === 'sleep') return play(v, 'sleep', true); play(v, clip, false); };
  if (lastLevel !== null && pet && pet.level > lastLevel) react('evolve'); else base();
  if (pet) lastLevel = pet.level;
  return { react };
}

/** Small pet in the call dialog while ringing. */
export function showCallPet(host, on) {
  if (!host) return; let v = host.querySelector('.pet-call-video');
  if (!on) { v?.remove(); return; }
  if (!v) { v = make('pet-call-video'); host.prepend(v); }
  play(v, 'call', true);
}
export function xpProgress(p) { const need = 100; const xp = Number(p?.xp || 0) % need; return { pct: Math.round(xp * 100 / need), xp, need }; }

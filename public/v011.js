// 0.11: profile photo + status text, avatars everywhere, AI persona sheet with AI badge, hands-free voice chat.
import { askAssistant } from './assistant-router.js';
import { localStatus } from './local-ai.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, body, method) {
  const fd = body instanceof FormData;
  const r = await fetch('/api' + path, { method: method || (body ? 'POST' : 'GET'), headers: fd || !body ? {} : { 'Content-Type': 'application/json' }, body: fd ? body : body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || 'เชื่อมต่อไม่สำเร็จ'), { status: r.status }); return d;
}
const toast = m => { const t = document.createElement('div'); t.className = 'v11-toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); };

// ---------- avatars + AI badge in lists ----------
let people = new Map(), lastFetch = 0;
async function refreshPeople() { if (Date.now() - lastFetch < 15000) return; lastFetch = Date.now(); try { const d = await api('/friends'); people = new Map(d.friends.map(f => [f.id, f])); decorate(); } catch {} }
function decorate() {
  for (const row of document.querySelectorAll('[data-peer]')) {
    const u = people.get(row.dataset.peer); const av = row.querySelector('.avatar'); if (!u || !av) continue;
    if (u.avatar && av.dataset.src !== u.avatar) { av.dataset.src = u.avatar; av.classList.add('has-img'); av.innerHTML = `<img src="${esc(u.avatar)}" alt="" loading="lazy" onerror="this.remove()">`; }
    const name = row.querySelector('strong, .row-name'); if (u.ai && name && !name.querySelector('.ai-badge')) name.insertAdjacentHTML('beforeend', ' <span class="ai-badge" title="บัญชีนี้เป็น AI">AI</span>');
    if (u.statusText && !row.querySelector('.v11-status')) { const sub = row.querySelector('small, .row-sub'); sub?.insertAdjacentHTML('beforebegin', `<span class="v11-status">${esc(u.statusText)}</span>`); }
  }
}

// ---------- profile photo + status in the settings sheet ----------
async function squareJpeg(file, size = 512) {
  const img = await createImageBitmap(file); const s = Math.min(img.width, img.height);
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
}
function mountProfileCard() {
  const body = $('#prefs-dialog .prefs-body'); if (!body || $('#v11-profile')) return;
  const box = document.createElement('section'); box.id = 'v11-profile'; box.className = 'v11-card';
  box.innerHTML = `<div class="v11-me"><button type="button" class="v11-avatar" id="v11-avatar" aria-label="เปลี่ยนรูปโปรไฟล์"><span id="v11-avatar-img"></span><i>📷</i></button>
    <div class="v11-me-text"><strong id="v11-name"></strong><input id="v11-status" maxlength="80" placeholder="ตั้งสถานะ เช่น กำลังทำงาน 💻" aria-label="ข้อความสถานะ"></div></div>
    <div class="v11-actions"><label class="v11-btn">เลือกจากคลัง<input type="file" accept="image/*" id="v11-pick" hidden></label><label class="v11-btn">ถ่ายรูป<input type="file" accept="image/*" capture="user" id="v11-cam" hidden></label><button type="button" class="v11-btn primary" id="v11-save">บันทึกสถานะ</button></div>
    <div id="v11-crop" hidden><canvas width="256" height="256"></canvas><p>ตัดเป็นสี่เหลี่ยมจัตุรัสตรงกลางอัตโนมัติ</p><div class="v11-actions"><button type="button" class="v11-btn" id="v11-crop-cancel">ยกเลิก</button><button type="button" class="v11-btn primary" id="v11-crop-ok">ใช้รูปนี้</button></div></div>`;
  body.prepend(box);
  api('/me').then(({ user }) => { $('#v11-name').textContent = user.name; $('#v11-status').value = user.statusText || ''; if (user.avatar) $('#v11-avatar-img').innerHTML = `<img src="${esc(user.avatar)}" alt="">`; else $('#v11-avatar-img').textContent = (user.name || '?')[0]; }).catch(() => {});
  let pending = null;
  const onFile = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; pending = await squareJpeg(f); const bmp = await createImageBitmap(pending); const cv = $('#v11-crop canvas'); cv.getContext('2d').drawImage(bmp, 0, 0, 256, 256); $('#v11-crop').hidden = false; };
  $('#v11-pick').onchange = onFile; $('#v11-cam').onchange = onFile; $('#v11-avatar').onclick = () => $('#v11-pick').click();
  $('#v11-crop-cancel').onclick = () => { pending = null; $('#v11-crop').hidden = true; };
  $('#v11-crop-ok').onclick = async () => { if (!pending) return; const fd = new FormData(); fd.append('image', pending, 'avatar.jpg'); try { await api('/profile/media/avatar', fd); $('#v11-avatar-img').innerHTML = `<img src="${URL.createObjectURL(pending)}" alt="">`; $('#v11-crop').hidden = true; lastFetch = 0; toast('อัปเดตรูปโปรไฟล์แล้ว'); } catch (e) { toast(e.message); } };
  $('#v11-save').onclick = async () => { try { await api('/account/status', { status: $('#v11-status').value }); toast('บันทึกสถานะแล้ว'); } catch (e) { toast(e.message); } };
}

// ---------- AI personas sheet ----------
function dialog(id, title) {
  let d = document.getElementById(id); if (d) return d;
  d = document.createElement('dialog'); d.id = id; d.className = 'prefs-dialog v11-dialog';
  d.innerHTML = `<div class="prefs-head"><h2>${title}</h2><button type="button" class="icon-button light" data-close aria-label="ปิด">✕</button></div><div class="prefs-body"></div>`;
  d.querySelector('[data-close]').onclick = () => d.close(); d.addEventListener('click', e => { if (e.target === d) d.close(); }); document.body.append(d); return d;
}
async function openPersonas() {
  const d = dialog('v11-personas', 'เพื่อน AI'), body = d.querySelector('.prefs-body'); if (!d.open) d.showModal();
  body.innerHTML = '<p class="v11-note">ทุกบัญชีในหน้านี้เป็น <span class="ai-badge">AI</span> ไม่ใช่คนจริง ปิดเสียงหรือบล็อกได้ทุกเมื่อ</p><div class="v11-list">กำลังโหลด…</div>';
  try {
    const { personas } = await api('/personas'); const list = body.querySelector('.v11-list');
    list.innerHTML = personas.map(p => `<div class="v11-persona" data-id="${esc(p.id)}"><span class="avatar">${esc(p.name[0])}</span><div><strong>${esc(p.name)} <span class="ai-badge">AI</span></strong><small>${esc(p.bio)}</small></div>
      <div class="v11-persona-actions"><button type="button" class="v11-btn primary" data-act="chat">${p.followed ? 'แชต' : 'เพิ่มเพื่อน'}</button><button type="button" class="v11-btn" data-act="voice">🎙</button><button type="button" class="v11-btn" data-act="mute">${p.muted ? 'เลิกปิดเสียง' : 'ปิดเสียง'}</button><button type="button" class="v11-btn danger" data-act="block">${p.blocked ? 'บล็อกแล้ว' : 'บล็อก'}</button></div></div>`).join('') || 'ยังไม่มีเพื่อน AI';
    list.onclick = async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const id = b.closest('[data-id]').dataset.id, p = personas.find(x => x.id === id);
      try {
        if (b.dataset.act === 'chat') { if (!p.followed) await api(`/personas/${id}/follow`, {}); d.close(); location.href = '/?chat=' + encodeURIComponent(id); }
        if (b.dataset.act === 'voice') { if (!p.followed) await api(`/personas/${id}/follow`, {}); d.close(); openVoice(p); }
        if (b.dataset.act === 'mute') { await api(`/personas/${id}/mute`, { muted: !p.muted }); openPersonas(); }
        if (b.dataset.act === 'block' && !p.blocked && confirm('บล็อก ' + p.name + '?')) { await api(`/block/${id}`, {}); openPersonas(); }
      } catch (err) { toast(err.message); }
    };
  } catch (e) { body.querySelector('.v11-list').textContent = e.message; }
}

// ---------- hands-free voice chat ----------
const native = () => window.PureVoice;
let voice = null;
function speak(text, onDone) {
  if (native()) { native().speak(text); voice.speakingDone = onDone; return; }
  const u = new SpeechSynthesisUtterance(text); u.lang = 'th-TH'; const v = speechSynthesis.getVoices().find(x => /th/i.test(x.lang)); if (v) u.voice = v;
  u.onend = onDone; speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function stopSpeaking() { if (native()) native().stopSpeaking(); else speechSynthesis?.cancel(); }
let webRec = null;
function listen() {
  if (!voice) return; setState('listening');
  if (native()) return native().listen('th-TH');
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) { setState('error', 'อุปกรณ์นี้ไม่รองรับการฟังเสียง — ใช้แอป Android'); return; }
  webRec = new R(); webRec.lang = 'th-TH'; webRec.interimResults = true;
  webRec.onresult = e => { const r = e.results[e.results.length - 1]; onVoiceEvent(JSON.stringify({ type: r.isFinal ? 'final' : 'partial', text: r[0].transcript })); };
  webRec.onerror = e => onVoiceEvent(JSON.stringify({ type: 'error', error: e.error })); webRec.onend = () => voice?.state === 'listening' && onVoiceEvent(JSON.stringify({ type: 'end' }));
  webRec.start();
}
function setState(s, msg) {
  if (!voice) return; voice.state = s; const d = $('#v11-voice'); d.dataset.state = s;
  d.querySelector('.v11-voice-state').textContent = msg || { listening: 'กำลังฟัง… พูดได้เลย', thinking: 'กำลังคิด…', speaking: 'กำลังพูด — พูดแทรกหรือแตะเพื่อขัดจังหวะ', idle: 'แตะไมค์เพื่อเริ่ม', error: 'เกิดข้อผิดพลาด' }[s];
}
async function think(text) {
  setState('thinking'); const d = $('#v11-voice'); d.querySelector('.v11-voice-you').textContent = text;
  let reply = '';
  try {
    if (voice.persona) {
      const before = Date.now(); await api('/messages/' + voice.persona.id, { text, clientId: 'v-' + crypto.randomUUID() });
      for (let i = 0; i < 40 && !reply; i++) { await new Promise(r => setTimeout(r, 500)); const m = await api('/messages/' + voice.persona.id); const arr = m.messages || m; reply = (arr.filter(x => x.sender === voice.persona.id && x.created >= before - 1000).at(-1) || {}).text || ''; if (!voice) return; }
      reply ||= 'ขอโทษค่ะ ตอนนี้ตอบไม่ได้';
    } else { const r = await askAssistant(text, { api }); reply = r.text; voice.route = r.route; }
  } catch (e) { reply = e.message; }
  if (!voice) return; d.querySelector('.v11-voice-ai').textContent = reply; d.querySelector('.v11-voice-route').textContent = voice.persona ? 'AI persona · Gemini (เซิร์ฟเวอร์)' : voice.route === 'local' ? 'โมเดลในเครื่อง' : 'Gemini (เซิร์ฟเวอร์)';
  setState('speaking'); if (native()) native().listenDuringSpeech?.('th-TH');
  speak(reply.replace(/[*_#`>]/g, '').slice(0, 600), () => voice && voice.state === 'speaking' && listen());
}
window.onPureVoiceEvent = onVoiceEvent;
function onVoiceEvent(raw) {
  const e = typeof raw === 'string' ? JSON.parse(raw) : raw; if (!voice) return; const d = $('#v11-voice');
  if (e.type === 'level') d.style.setProperty('--lvl', Math.max(0, Math.min(1, (e.rms + 2) / 12)).toFixed(2));
  if (e.type === 'speech_start' && voice.state === 'speaking') { stopSpeaking(); setState('listening'); }   // barge-in
  if (e.type === 'partial') d.querySelector('.v11-voice-you').textContent = e.text;
  if (e.type === 'final' && e.text.trim()) { if (voice.state === 'speaking') stopSpeaking(); think(e.text.trim()); }
  if (e.type === 'tts_done') voice.speakingDone?.();
  if (e.type === 'end' && voice.state === 'listening') setTimeout(() => voice?.state === 'listening' && listen(), 250);
  if (e.type === 'error') { if (/no.?match|speech.?timeout|7|6/.test(String(e.error))) setTimeout(listen, 300); else setState('error', 'ไมค์ใช้ไม่ได้: ' + e.error); }
}
export function openVoice(persona = null) {
  const d = dialog('v11-voice', persona ? 'คุยด้วยเสียงกับ ' + esc(persona.name) + ' <span class="ai-badge">AI</span>' : 'คุยด้วยเสียงกับ PURE AI');
  if (d.querySelector('h2')) d.querySelector('h2').innerHTML = persona ? 'คุยด้วยเสียงกับ ' + esc(persona.name) + ' <span class="ai-badge">AI</span>' : 'คุยด้วยเสียงกับ PURE AI';
  const ls = localStatus();
  d.querySelector('.prefs-body').innerHTML = `<button type="button" class="v11-orb" aria-label="ไมค์"><svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/></svg></button>
    <p class="v11-voice-state"></p><p class="v11-voice-you"></p><p class="v11-voice-ai"></p><p class="v11-voice-route"></p>
    <p class="v11-note">${native() ? 'ฟังเสียงด้วย Android SpeechRecognizer (th-TH) · พูดด้วยเสียงไทยของเครื่อง' : 'ฟังเสียงด้วยเบราว์เซอร์ · พูดด้วยเสียงของเครื่อง'}${!persona ? (ls.ready ? ' · ตอบด้วยโมเดลในเครื่อง' : ' · ยังไม่ได้ดาวน์โหลดโมเดลในเครื่อง ใช้ Gemini แทน') : ''}</p>`;
  voice = { persona, state: 'idle' }; if (!d.open) d.showModal();
  d.onclose = () => { stopSpeaking(); native()?.stopListening(); try { webRec?.abort(); } catch {} voice = null; };
  d.querySelector('.v11-orb').onclick = () => { if (voice.state === 'speaking') { stopSpeaking(); listen(); } else if (voice.state === 'listening') { native()?.stopListening(); try { webRec?.stop(); } catch {} setState('idle'); } else listen(); };
  listen();
}
window.PureOpenVoice = openVoice;

// ---------- quick-row chips ----------
function mountChips() {
  const row = $('#quick-row'); if (!row || $('#v11-chip-personas')) return;
  const chip = (id, label, icon, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'quick-chip assistant-shortcut v11-chip'; b.innerHTML = `<span aria-hidden="true">${icon}</span><strong>${label}</strong>`; b.onclick = fn; row.append(b); };
  chip('v11-chip-voice', 'คุยด้วยเสียง', '🎙', () => openVoice());
  chip('v11-chip-personas', 'เพื่อน AI', '✨', openPersonas);
}
function tick() { mountChips(); mountProfileCard(); decorate(); refreshPeople(); }
let q = 0; new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; tick(); }); }).observe(document.body, { childList: true, subtree: true });
tick();
{ const qp = new URLSearchParams(location.search); if (qp.has('voice')) setTimeout(() => openVoice(), 800); if (qp.has('personas')) setTimeout(openPersonas, 800); }

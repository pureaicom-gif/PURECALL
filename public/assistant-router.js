// Routes PURE AI assistant turns: on-device model → server (/api/assistant, Gemini) → built-in offline guide,
// then reads the reply aloud with the PURE secretary voice (Drama3) or the device voice.
import {localReady, localGenerate, localStatus, localDownload, localCancel, localDelete, onLocalAiEvent, offlineGuide, SYSTEM_TH} from './local-ai.js';
import {speakPure, stopPure} from './tts.js';
import {plainText} from './plain-text.js';

const P = 'pure_ai_route';
export const prefs = Object.assign({local: true, voice: true}, (() => { try { return JSON.parse(localStorage.getItem(P) || '{}'); } catch { return {}; } })());
const save = () => { try { localStorage.setItem(P, JSON.stringify(prefs)); } catch {} };
let hist = [];
export const rememberHistory = h => { if (Array.isArray(h)) hist = h.slice(-40); };

export async function askAssistant(text, {api, onToken} = {}) {
  let d;
  if (prefs.local && localReady()) {
    const messages = [{role: 'system', content: SYSTEM_TH}, ...hist.slice(-8).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: m.text})), {role: 'user', content: text}];
    const reply = (await localGenerate(messages, {onToken})).trim();
    const now = Date.now(); hist = [...hist, {role: 'user', text, created: now}, {role: 'model', text: reply, created: now}];
    d = {history: hist, text: reply, route: 'local'};
  } else {
    try { d = await api('/assistant', {prompt: text, engine: 'jev', allowCloud: true}); if (d.history) hist = d.history; }
    catch (e) {
      const offline = navigator.onLine === false || e.status >= 500 || e.status === 0 || /fetch|network|failed/i.test(e.message || '');
      if (!offline) throw e;
      const reply = offlineGuide(text), now = Date.now(); hist = [...hist, {role: 'user', text, created: now}, {role: 'model', text: reply, created: now}];
      d = {history: hist, text: reply, route: 'guide'};
    }
  }
  if (d.text && !d.clarify && prefs.voice) speakPure(plainText(d.text).slice(0, 600), {lang: /[\u0E00-\u0E7F]/.test(d.text) ? 'th' : 'en'});
  return d;
}

/** Settings block for the assistant dialog: voice toggle + on-device model download/delete. */
export function mountAssistantSettings(container) {
  if (!container || container.querySelector('.ai-route-settings')) return;
  const box = document.createElement('details'); box.className = 'ai-route-settings';
  box.innerHTML = `<summary>ตั้งค่าเสียงและ AI ในเครื่อง</summary>
    <label class="aic-check"><input type="checkbox" data-k="voice"> อ่านคำตอบออกเสียง (เสียงเลขา PURE)</label>
    <div data-local hidden>
      <label class="aic-check"><input type="checkbox" data-k="local"> ใช้โมเดล AI ในเครื่อง (ออฟไลน์ได้ ข้อความไม่ออกจากเครื่อง)</label>
      <p class="muted" data-info aria-live="polite"></p><progress max="100" value="0" hidden></progress>
      <div class="aic-actions"><button type="button" class="secondary" data-dl>ดาวน์โหลดโมเดล</button><button type="button" class="secondary" data-cancel hidden>หยุด</button><button type="button" class="secondary" data-del hidden>ลบโมเดล</button></div>
    </div>`;
  container.append(box);
  for (const c of box.querySelectorAll('[data-k]')) { c.checked = !!prefs[c.dataset.k]; c.onchange = () => { prefs[c.dataset.k] = c.checked; if (c.dataset.k === 'voice' && !c.checked) stopPure(); save(); }; }
  box.querySelector('[data-dl]').onclick = () => localDownload();
  box.querySelector('[data-cancel]').onclick = () => localCancel();
  box.querySelector('[data-del]').onclick = () => { if (confirm('ลบโมเดล AI ในเครื่อง? (ดาวน์โหลดใหม่ได้ภายหลัง)')) localDelete(); };
  const mb = n => Math.round((n || 0) / 1048576);
  const sync = ev => {
    const st = localStatus(), wrap = box.querySelector('[data-local]'); wrap.hidden = !st.engine; if (!st.engine) return;
    const info = box.querySelector('[data-info]'), prog = box.querySelector('progress'), m = (st.models || []).find(x => x.id === st.model) || {};
    const dl = ev?.type === 'progress' || (st.downloading && ev?.type !== 'downloaded' && ev?.type !== 'error');
    prog.hidden = !dl; box.querySelector('[data-cancel]').hidden = !dl; box.querySelector('[data-dl]').hidden = st.downloaded || dl; box.querySelector('[data-del]').hidden = !st.downloaded;
    if (dl) { const done = ev?.done ?? st.done, total = ev?.total ?? st.total; prog.value = total ? Math.floor(done * 100 / total) : 0; info.textContent = `กำลังดาวน์โหลด ${mb(done)} / ${mb(total)} MB${st.wifi ? '' : ' · แนะนำให้ใช้ Wi‑Fi'}`; }
    else if (ev?.type === 'verifying') info.textContent = 'กำลังตรวจสอบไฟล์ (sha256)…';
    else if (st.downloaded) info.textContent = `${m.name} พร้อมใช้` + (st.eligible ? '' : ` · RAM เครื่องนี้ ${st.ramGb} GB น้อยกว่าที่แนะนำ (${m.minRamGb} GB) จะใช้ AI บนเซิร์ฟเวอร์แทน`);
    else info.textContent = `${m.name || 'โมเดล'} ~${mb(m.size)} MB · สัญญาอนุญาต ${m.license || ''} · ดาวน์โหลดครั้งเดียว หลุดแล้วต่อจากเดิมได้` + (ev?.type === 'error' ? ` · ผิดพลาด: ${ev.error}` : '');
  };
  onLocalAiEvent(sync); box.addEventListener('toggle', () => sync()); sync();
}

/** App commands: text -> validated action JSON -> 'pure-ai-command' event (the app decides what to do). */
import {runTask} from './local-ai.js';
export async function aiCommand(text, {api} = {}) {
  const r = await runTask('command', String(text || '').slice(0, 500), {api});
  if (r.command.action !== 'none') window.dispatchEvent(new CustomEvent('pure-ai-command', {detail: r.command}));
  if (r.command.action === 'add_friend' && r.command.handle) window.dispatchEvent(new CustomEvent('pure-add-friend', {detail: {handle: r.command.handle}}));
  return r;
}
if (typeof window !== 'undefined') window.PureAI = Object.assign(window.PureAI || {}, {runTask: (t, i) => runTask(t, i, {api: (p, b) => fetch('/api' + p, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)}).then(r => r.ok ? r.json() : Promise.reject(Object.assign(new Error('http'), {status: r.status})))}), command: t => aiCommand(t)});

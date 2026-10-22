import {plainText} from './plain-text.js';

const ENGINES = {jev: {label: 'PURE AI', hint: 'พร้อมช่วยตอบคำถามและค้นคว้า'}};
const IDEAS = [
  ['ช่วยร่างคำทักทายเพื่อนแบบเป็นกันเอง', 'ร่างคำทักทายเพื่อน'],
  ['ช่วยวางแผนวันหยุดแบบประหยัด', 'วางแผนวันหยุด'],
  ['ช่วยอธิบายเรื่องที่ฉันสงสัยให้ง่ายขึ้น', 'อธิบายให้เข้าใจง่าย']
];
const ICONS = {
  send: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  tune: '<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  mark: '<svg><use href="#pure-p"/></svg>'
};

let api, toast, state, dlg, els = {}, msgs = [], choices = null, route = null, busy = false, ready = false;
let prefs = {engine: 'jev', cloud: true};

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const clock = t => new Date(t || Date.now()).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'});

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('pure_ai_prefs') || '{}');
    if (ENGINES[saved.engine]) prefs.engine = saved.engine;
    if (typeof saved.cloud === 'boolean') prefs.cloud = saved.cloud;
  } catch { /* ใช้ค่าเริ่มต้น */ }
}
const savePrefs = () => { try { localStorage.setItem('pure_ai_prefs', JSON.stringify(prefs)); } catch { /* ไม่เป็นไร */ } };

function routeLabel(r) {
  return 'PURE AI';
}
const setSub = text => { els.sub.textContent = text; };
function syncChip() {
  els.chip.textContent = 'การตั้งค่า';
  els.cloud.checked = prefs.cloud;
}
function autosize() { els.input.style.height = 'auto'; els.input.style.height = Math.min(els.input.scrollHeight, 140) + 'px'; }
const toBottom = () => requestAnimationFrame(() => { els.body.scrollTop = els.body.scrollHeight; });

function avatar() { const a = el('div', 'aic-mini'); a.innerHTML = ICONS.mark; return a; }

function emptyState() {
  const box = el('div', 'aic-empty');
  const logo = el('div', 'aic-logo'); logo.innerHTML = ICONS.mark;
  box.append(logo, el('h3', '', 'สวัสดี ฉันคือ PURE AI'), el('p', 'muted', 'ถามได้ทุกเรื่อง ให้ช่วยคิด ร่างข้อความ หรือค้นเว็บให้'));
  const chips = el('div', 'aic-chips');
  for (const [text, title] of IDEAS) {
    const b = el('button', 'aic-suggest', title); b.type = 'button'; b.onclick = () => send(text); chips.append(b);
  }
  const search = el('button', 'aic-suggest', 'ค้นข้อมูลจากเว็บ'); search.type = 'button';
  search.onclick = () => { els.input.value = 'ค้นเว็บเกี่ยวกับ '; autosize(); els.input.focus(); };
  chips.append(search);
  box.append(chips);
  return box;
}

function actionsFor(text) {
  const bar = el('div', 'aic-actions');

  const copy = el('button', 'aic-pill', 'คัดลอก'); copy.type = 'button';
  copy.onclick = async () => { try { await navigator.clipboard.writeText(text); toast('คัดลอกแล้ว'); } catch { toast('คัดลอกไม่ได้ ลองเลือกข้อความเอง'); } };
  bar.append(copy);
  if (state.peer || state.group) {
    const use = el('button', 'aic-pill', 'นำไปใส่ในแชต'); use.type = 'button';
    use.onclick = () => { const box = document.querySelector('#message-input'); if (box) box.value = text; dlg.close(); box?.focus(); };
    bar.append(use);
  }
  return bar;
}

function render() {
  els.body.replaceChildren();
  if (!msgs.length && !busy) { els.body.append(emptyState()); return; }
  const lastModel = msgs.map(m => m.role !== 'user' && !m.error).lastIndexOf(true);
  msgs.forEach((m, i) => {
    const mine = m.role === 'user', text = mine || m.error ? m.text : plainText(m.text);
    const row = el('div', 'aic-row' + (mine ? ' mine' : ''));
    if (!mine) row.append(avatar());
    const col = el('div', 'aic-col');
    col.append(el('div', 'aic-bubble' + (m.error ? ' error' : ''), text));
    const next = msgs[i + 1];
    if (!next || (next.role === 'user') !== mine) col.append(el('div', 'aic-meta', clock(m.created)));
    if (i === lastModel && i === msgs.length - 1 && !busy && !choices) col.append(actionsFor(text));
    row.append(col);
    els.body.append(row);
  });
  if (choices) {
    const row = el('div', 'aic-row'), col = el('div', 'aic-col');
    row.append(avatar());
    col.append(el('div', 'aic-bubble', 'อยากให้ PURE ช่วยเรื่องไหนต่อ?'));
    const bar = el('div', 'aic-actions');
    for (const o of choices) {
      const b = el('button', 'aic-suggest', o.title); b.type = 'button';
      b.onclick = () => { choices = null; els.input.value = o.starter; autosize(); render(); els.input.focus(); };
      bar.append(b);
    }
    col.append(bar); row.append(col); els.body.append(row);
  }
  if (busy) {
    const row = el('div', 'aic-row'), col = el('div', 'aic-col'), dots = el('div', 'aic-bubble aic-typing');
    dots.setAttribute('aria-label', 'PURE AI กำลังพิมพ์');
    dots.innerHTML = '<span></span><span></span><span></span>';
    row.append(avatar()); col.append(dots); row.append(col); els.body.append(row);
  }
  toBottom();
}

async function send(raw) {
  const text = String(raw ?? '').trim();
  if (!text || busy) return;
  busy = true; choices = null; route = null; setSub('กำลังพิมพ์…');
  msgs.push({role: 'user', text, created: Date.now()});
  els.input.value = ''; autosize(); render();
  try {
    const d = await api('/assistant', {prompt: text, engine: prefs.engine, allowCloud: prefs.cloud});
    if (d.clarify) { msgs = [...d.history, {role: 'user', text, created: Date.now()}]; choices = d.options; setSub('ขอรายละเอียดเพิ่มอีกนิด'); }
    else { msgs = d.history; route = d.route; setSub(routeLabel(d.route)); }
  } catch (e) {
    msgs.pop();
    msgs.push({role: 'model', text: e.message || 'ส่งไม่สำเร็จ', error: true, created: Date.now()});
    els.input.value = text; autosize(); setSub('ส่งไม่สำเร็จ ลองอีกครั้งได้เลย');
  } finally {
    busy = false; render(); els.input.focus();
  }
}

function build() {
  dlg.className = 'aic-dialog';
  dlg.innerHTML = `
    <header class="aic-head">
      <div class="aic-avatar">${ICONS.mark}<i class="aic-dot"></i></div>
      <div class="aic-title"><strong>PURE AI</strong><small id="aic-sub">พร้อมคุย</small></div>
      <button type="button" class="icon-button" id="aic-tune" aria-label="ตั้งค่าผู้ช่วย" aria-expanded="false">${ICONS.tune}</button>
      <button type="button" class="icon-button" id="aic-close" aria-label="ปิด">${ICONS.close}</button>
    </header>
    <section class="aic-panel" id="aic-panel" hidden>
      <label class="aic-check"><input type="checkbox" id="aic-cloud"> อนุญาตให้ค้นข้อมูลจากเว็บ</label>
      <button type="button" class="text-button" id="aic-clear">ล้างประวัติแชตกับ PURE AI</button>
    </section>
    <div class="aic-body" id="aic-body" role="log" aria-live="polite"></div>
    <form class="aic-foot" id="aic-form">
      <button type="button" class="aic-chip" id="aic-chip"></button>
      <div class="aic-composer">
        <textarea class="aic-input" id="aic-input" rows="1" maxlength="8000" placeholder="พิมพ์ข้อความถึง PURE AI…" aria-label="ข้อความถึง PURE AI"></textarea>
        <button class="send-button" id="aic-send" aria-label="ส่งข้อความ">${ICONS.send}</button>
      </div>
    </form>`;
  const q = s => dlg.querySelector(s);
  els = {sub: q('#aic-sub'), panel: q('#aic-panel'), body: q('#aic-body'), form: q('#aic-form'), chip: q('#aic-chip'), input: q('#aic-input'), cloud: q('#aic-cloud'), tune: q('#aic-tune')};
  const togglePanel = () => { els.panel.hidden = !els.panel.hidden; els.tune.setAttribute('aria-expanded', String(!els.panel.hidden)); };
  els.tune.onclick = togglePanel; els.chip.onclick = togglePanel;
  q('#aic-close').onclick = () => dlg.close();
  els.cloud.onchange = () => { prefs.cloud = els.cloud.checked; savePrefs(); syncChip(); };
  q('#aic-clear').onclick = async () => {
    if (busy) return toast('รอคำตอบก่อนล้างประวัติ');
    if (!confirm('ลบประวัติแชตกับ PURE AI ทั้งหมด?')) return;
    try { await api('/assistant', null, 'DELETE'); msgs = []; choices = null; route = null; setSub('พร้อมคุย'); render(); }
    catch (e) { toast(e.message); }
  };
  els.form.onsubmit = e => { e.preventDefault(); send(els.input.value); };
  els.input.oninput = autosize;
  els.input.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(els.input.value); }
  };
}

export function setupAiChat(context) {
  ({api, toast, state} = context);
  dlg = document.querySelector('#ai-dialog');
  loadPrefs(); build(); syncChip(); render(); ready = true;
}

export async function openAssistant() {
  if (!ready) return;
  if (!dlg.open) dlg.showModal();
  els.panel.hidden = true; els.tune.setAttribute('aria-expanded', 'false');
  try {
    const d = await api('/assistant');
    if (!busy) { msgs = d.history; if (!msgs.length) setSub('พร้อมคุย'); render(); }
  } catch (e) { toast(e.message); }
  els.input.focus();
}

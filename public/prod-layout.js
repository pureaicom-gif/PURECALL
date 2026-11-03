// 0.10.1: production layout — compact quick-actions row, settings sheet (language, status, helper), no floating FAB.
const $ = s => document.querySelector(s);
function sheet() {
  let d = $('#prefs-dialog'); if (d) return d;
  d = document.createElement('dialog'); d.id = 'prefs-dialog'; d.className = 'prefs-dialog';
  d.innerHTML = '<div class="prefs-head"><h2>ตั้งค่า</h2><button type="button" class="icon-button light" data-close aria-label="ปิด">✕</button></div><div class="prefs-body"></div><p class="prefs-made">Made by PUREFXAI</p>';
  d.querySelector('[data-close]').onclick = () => d.close();
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  document.body.append(d); return d;
}
export function openPrefs() { const d = sheet(); if (!d.open) d.showModal(); }
window.PureOpenPrefs = openPrefs;
function relocate() {
  const list = $('#chat-list'), conv = $('#conversations'); if (!list || !conv) return false;
  const body = sheet().querySelector('.prefs-body');
  const foot = list.querySelector('.list-footer');
  if (foot) { foot.querySelectorAll('span').forEach(s => { if (/Made by/.test(s.textContent)) s.remove(); }); foot.classList.add('prefs-row'); body.prepend(foot); }
  for (const h of document.querySelectorAll('#chat-list .helper-settings')) body.append(h);
  const push = $('#chat-list #push-enable'); if (push) body.prepend(push);
  const pb = $('#push-enable'), gear = $('#open-prefs'); if (gear) gear.classList.toggle('has-dot', !!pb && !pb.hidden);
  let row = $('#quick-row');
  if (!row) { row = document.createElement('div'); row.id = 'quick-row'; row.className = 'quick-row'; row.setAttribute('role', 'toolbar'); row.setAttribute('aria-label', 'ทางลัด'); conv.before(row); }
  for (const b of list.querySelectorAll(':scope > .assistant-shortcut, :scope > .pet-shortcut')) {
    b.classList.add('quick-chip'); const st = b.querySelector('strong');
    if (b.id === 'pet-shortcut' && st) st.textContent = 'สัตว์เลี้ยง';
    row.append(b);
  }
  const hdr = list.querySelector('header > div[style]');
  if (hdr && !$('#open-prefs')) {
    const g = document.createElement('button'); g.id = 'open-prefs'; g.type = 'button'; g.className = 'icon-button light'; g.setAttribute('aria-label', 'ตั้งค่า'); g.title = 'ตั้งค่า';
    g.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
    g.onclick = openPrefs; hdr.prepend(g);
    const pb = $('#push-enable'); if (pb) new MutationObserver(() => g.classList.toggle('has-dot', !pb.hidden)).observe(pb, { attributes: true, attributeFilter: ['hidden'] });
  }
  return true;
}
relocate();
let q = 0; new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; relocate(); }); }).observe(document.body, { childList: true, subtree: true });

// Helper mode (Android only, window.PureHelper) + sealing E2E outbox messages for store-and-forward relay.
const H = () => window.PureHelper;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const keyName = uid => 'pure.relay.' + uid;

export async function refreshRelayKey(api, uid) {
  if (!H() || !uid) return;
  try { const d = await api('/relay/key'); if (d?.key) localStorage.setItem(keyName(uid), d.key); } catch {}
}
export async function sealEnvelope(key, e) {
  const k = await crypto.subtle.importKey('raw', unb64u(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const base = ['pure-relay-v1', e.from, e.to, e.clientId, String(e.ts), e.text].join('\n');
  return { ...e, mac: b64u(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(base))) };
}
/** Hand an already-encrypted 1:1 message to this phone's helper queue. Returns true if queued. */
export async function handoff({ from, to, clientId, text }) {
  if (!H() || !from || !to || !String(text).startsWith('e2e1:')) return false;
  const key = localStorage.getItem(keyName(from)); if (!key) return false;
  const env = await sealEnvelope(key, { from, to, clientId, ts: Date.now(), text });
  return H().enqueue(JSON.stringify([env])) > 0;
}

const REASONS = { not_charging: 'รอเสียบชาร์จ', battery_low: 'แบตต่ำ', not_wifi: 'รอ Wi-Fi', null: '' };
const STATES = { active: 'กำลังช่วยเครือข่าย', waiting_server: 'ต่อเซิร์ฟเวอร์ไม่ได้ — เก็บข้อความไว้ส่งต่อ', off: 'ปิดอยู่' };
export function mountHelperSettings(host) {
  if (!H() || !host || host.querySelector('.helper-settings')) return;
  const box = document.createElement('details'); box.className = 'helper-settings';
  box.innerHTML = `<summary>🛰️ โหมด Helper (มือถือช่วยเครือข่าย)</summary>
    <p class="muted">ช่วยส่งต่อข้อความเข้ารหัสเมื่อเซิร์ฟเวอร์ล่ม และบอกเครื่องอื่นใน Wi-Fi เดียวกันว่าเซิร์ฟเวอร์อยู่ที่ไหน — อ่านข้อความไม่ได้ (เข้ารหัสปลายทาง)</p>
    <label class="aic-check"><input type="checkbox" data-on> เปิดโหมด Helper</label>
    <label class="aic-check"><input type="checkbox" data-o="chargingOnly"> เฉพาะตอนเสียบชาร์จ</label>
    <label class="aic-check"><input type="checkbox" data-o="wifiOnly"> เฉพาะ Wi-Fi</label>
    <p class="muted" data-st aria-live="polite"></p>`;
  host.append(box);
  const read = () => { try { return JSON.parse(H().status()); } catch { return {}; } };
  const sync = () => {
    const s = read(); box.querySelector('[data-on]').checked = !!s.enabled;
    for (const c of box.querySelectorAll('[data-o]')) c.checked = s[c.dataset.o] !== false;
    const why = s.blocked && s.blocked !== 'null' ? REASONS[s.blocked] || s.blocked : '';
    box.querySelector('[data-st]').textContent = !s.enabled ? 'ปิดอยู่' : (why ? `พักไว้: ${why}` : STATES[s.state] || s.state || '') + (s.queued ? ` · รอส่งต่อ ${s.queued} ข้อความ` : '');
  };
  box.querySelector('[data-on]').onchange = e => { H().setEnabled(e.target.checked); setTimeout(sync, 500); };
  for (const c of box.querySelectorAll('[data-o]')) c.onchange = () => { const o = {}; box.querySelectorAll('[data-o]').forEach(x => o[x.dataset.o] = x.checked); H().setOptions(JSON.stringify(o)); sync(); };
  box.addEventListener('toggle', sync); sync(); setInterval(() => box.open && sync(), 5000);
}

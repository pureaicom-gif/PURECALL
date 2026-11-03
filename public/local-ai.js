// PURE AI router: on-device model (Android, PureLocalAI) → server Gemini → built-in offline guide.
const bridge = () => (typeof window !== 'undefined' ? window.PureLocalAI : null);
const pending = new Map(); let seq = 0;
const listeners = new Set();
if (typeof window !== 'undefined') window.addEventListener('pure-local-ai', e => {
  const d = e.detail || {}; listeners.forEach(f => { try { f(d); } catch {} });
  const p = d.id && pending.get(d.id); if (!p) return;
  if (d.type === 'token') p.onToken?.(d.text);
  else if (d.type === 'done') { pending.delete(d.id); p.resolve(d.text); }
  else if (d.type === 'error') { pending.delete(d.id); p.reject(new Error(d.error || 'local model failed')); }
});
export const onLocalAiEvent = f => (listeners.add(f), () => listeners.delete(f));

export function localStatus() { try { const b = bridge(); return b ? JSON.parse(b.status()) : { engine: false }; } catch { return { engine: false }; } }
export const localReady = () => !!localStatus().ready;
export function localDownload(id) { bridge()?.download(id || ''); }
export function localCancel() { bridge()?.cancelDownload(); }
export function localDelete(id) { bridge()?.deleteModel(id || ''); }
export function localStop() { bridge()?.stop(); }

export function localGenerate(messages, { maxTokens = 384, temperature = 0.6, onToken } = {}) {
  const b = bridge(); if (!b) return Promise.reject(new Error('no local model'));
  const id = 'r' + (++seq) + '-' + Date.now();
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onToken }); b.generate(id, JSON.stringify({ messages, maxTokens, temperature })); });
}

export const SYSTEM_TH = 'คุณคือ PURE AI ผู้ช่วยในแอปแชต PURE ตอบสั้น กระชับ สุภาพ เป็นภาษาเดียวกับผู้ใช้ (ไทยหรืออังกฤษ) ห้ามแต่งข้อมูลที่ไม่รู้';

// Built-in offline guide: no model, no network.
const GUIDE = [
  [/โทร|call|วิดีโอ|video/i, 'โทรได้จากหน้าแชต: กดไอคอนโทรศัพท์หรือกล้องที่หัวแชต โทรกลุ่มได้สูงสุด 6 คน'],
  [/เพื่อน|friend|qr/i, 'เพิ่มเพื่อนได้ที่แท็บ "เพื่อน" ค้นหาด้วยชื่อผู้ใช้ หรือสแกน QR ของเพื่อน'],
  [/สตอรี่|story/i, 'ลงสตอรี่ได้จากแถบวงกลมด้านบนรายการแชต สตอรี่จะหายไปใน 24 ชั่วโมง'],
  [/เข้ารหัส|e2e|encrypt|ปลอดภัย/i, 'แชต 1:1 แบบเข้ารหัสปลายทาง (E2E) เปิดได้ในหน้าแชต ตรวจรหัสยืนยันกับเพื่อนเพื่อความปลอดภัย'],
  [/อัปเดต|update|เวอร์ชัน/i, 'แอปจะเช็กอัปเดตเองทุก 6 ชั่วโมง หรือเปิดหน้าโปรไฟล์เพื่อดูเวอร์ชัน'],
];
export function offlineGuide(q) {
  for (const [re, a] of GUIDE) if (re.test(q)) return a;
  return 'ตอนนี้ออฟไลน์และยังไม่มีโมเดล AI ในเครื่อง ลองเชื่อมต่ออินเทอร์เน็ต หรือดาวน์โหลดโมเดล AI ในเครื่องจากเมนูตั้งค่าผู้ช่วย';
}

// App commands: natural language -> {action, args}. Validated against an allow-list.
export const ACTIONS = { open_chat: ['name'], call: ['name', 'video'], add_friend: ['handle'], post_story: [], open_settings: [], translate: ['text', 'to'], none: [] };
export function parseCommand(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/); if (!m) return { action: 'none' };
  try { const o = JSON.parse(m[0]); if (!ACTIONS[o.action]) return { action: 'none' }; const out = { action: o.action };
    for (const k of ACTIONS[o.action]) if (o[k] != null) out[k] = typeof o[k] === 'boolean' ? o[k] : String(o[k]).slice(0, 200); return out; } catch { return { action: 'none' }; }
}
const CMD_PROMPT = 'Convert the user request into ONE JSON object only. Allowed actions: open_chat{name}, call{name,video:boolean}, add_friend{handle}, post_story{}, open_settings{}, translate{text,to:"th"|"en"}, none{}. No explanation.';

/** High-level tasks. Each returns {text|replies|command, via:'local'|'server'|'guide'}. */
export async function runTask(task, input, { api, onToken } = {}) {
  const tasks = {
    summarize: [{ role: 'system', content: 'สรุปข้อความต่อไปนี้เป็นภาษาไทยแบบหัวข้อสั้นๆ ไม่เกิน 5 ข้อ' }, { role: 'user', content: input }],
    translate_th_en: [{ role: 'system', content: 'Translate the user text from Thai to natural English. Output only the translation.' }, { role: 'user', content: input }],
    translate_en_th: [{ role: 'system', content: 'แปลข้อความต่อไปนี้จากภาษาอังกฤษเป็นภาษาไทยที่เป็นธรรมชาติ ตอบเฉพาะคำแปล' }, { role: 'user', content: input }],
    smart_replies: [{ role: 'system', content: 'เสนอคำตอบสั้นๆ 3 แบบ สำหรับข้อความล่าสุดในแชต ภาษาเดียวกับข้อความ หนึ่งบรรทัดต่อหนึ่งคำตอบ ไม่ต้องใส่เลขข้อ' }, { role: 'user', content: input }],
    command: [{ role: 'system', content: CMD_PROMPT }, { role: 'user', content: input }],
  };
  const msgs = tasks[task]; if (!msgs) throw new Error('unknown task');
  const shape = (text, via) => task === 'smart_replies' ? { replies: text.split('\n').map(s => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 3), via }
    : task === 'command' ? { command: parseCommand(text), via } : { text: text.trim(), via };
  if (localReady()) { try { return shape(await localGenerate(msgs, { temperature: task === 'command' ? 0 : 0.4, onToken }), 'local'); } catch {} }
  if (api) { try { const r = await api('/ai', { prompt: msgs.map(m => m.content).join('\n\n') }); const t = r.text || r.reply || r.output || ''; if (t) return shape(t, 'server'); } catch {} }
  return task === 'command' ? { command: { action: 'none' }, via: 'guide' } : { text: offlineGuide(input), replies: [], via: 'guide' };
}

// Smart replies + offline translate for the open chat, powered by the AI router (local model first).
import {runTask, localReady} from './local-ai.js';
export function setupSmartReplies({api, toast}) {
  const composer = document.querySelector('#composer'); if (!composer || composer.querySelector('#smart-reply')) return;
  const bar = document.createElement('div'); bar.className = 'smart-replies'; bar.hidden = true; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'คำตอบแนะนำ');
  composer.before(bar);
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'smart-reply'; btn.className = 'icon-button'; btn.title = 'คำตอบแนะนำ / แปล'; btn.setAttribute('aria-label', 'คำตอบแนะนำจาก AI');
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8z"/></svg>';
  composer.querySelector('#ai-open')?.before(btn);
  const lastIncoming = () => [...document.querySelectorAll('.message:not(.mine) .bubble')].pop()?.innerText?.trim() || '';
  const input = () => document.querySelector('#message-input');
  btn.onclick = async () => {
    const text = lastIncoming(); if (!text) return toast('ยังไม่มีข้อความจากเพื่อน');
    bar.hidden = false; bar.textContent = localReady() ? 'AI ในเครื่องกำลังคิด…' : 'กำลังคิดคำตอบ…';
    const thai = /[\u0E00-\u0E7F]/.test(text);
    const [r, tr] = await Promise.all([runTask('smart_replies', text.slice(0, 1500), {api}), runTask(thai ? 'translate_th_en' : 'translate_en_th', text.slice(0, 1500), {api})]);
    bar.replaceChildren();
    if (tr.via !== 'guide' && tr.text) { const p = document.createElement('p'); p.className = 'smart-translation'; p.textContent = (thai ? 'EN: ' : 'แปล: ') + tr.text; bar.append(p); }
    for (const s of r.replies || []) { const b = document.createElement('button'); b.type = 'button'; b.className = 'aic-suggest'; b.textContent = s; b.onclick = () => { const i = input(); i.value = s; i.focus(); bar.hidden = true; }; bar.append(b); }
    if (!bar.children.length) bar.textContent = 'ตอนนี้ยังเสนอคำตอบไม่ได้ (ไม่มีโมเดลในเครื่องและเชื่อมต่อ AI ไม่ได้)';
    const x = document.createElement('button'); x.type = 'button'; x.className = 'text-button'; x.textContent = 'ปิด'; x.onclick = () => { bar.hidden = true; }; bar.append(x);
  };
}

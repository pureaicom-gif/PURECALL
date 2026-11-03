// v0.11 admin: AI personas (approval-first). All personas are labelled AI and never claim to be human.
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (u, m = 'GET', b) => fetch(u, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j; });
  const box = document.createElement('section'); box.id = 'admin-personas'; box.className = 'panel'; box.style.cssText = 'margin:16px;padding:16px;border:1px solid #1f3b2a;border-radius:16px;background:#0b120e;color:#e8fff1';
  async function render() {
    let d; try { d = await api('/api/admin/personas'); } catch (e) { box.hidden = true; return; } box.hidden = false;
    box.innerHTML = `<h2 style="margin:0 0 8px">เพื่อน AI (Personas)</h2>
      <label><input type="checkbox" data-s="approval" ${d.settings.approval ? 'checked' : ''}> ต้องอนุมัติก่อนโพสต์ (แนะนำ)</label><br>
      <label><input type="checkbox" data-s="autopilot" ${d.settings.autopilot ? 'checked' : ''}> Autopilot: สร้างคลิปอัตโนมัติผ่าน ComfyUI</label>
      <div style="display:grid;gap:8px;margin:12px 0">${d.personas.map(p => `<div style="padding:10px;border:1px solid #1f3b2a;border-radius:12px">
        <b>${esc(p.name)}</b> <small>${esc(p.handle || p.id)}</small><br>
        ${['enabled', 'chat', 'autopost'].map(k => `<label><input type="checkbox" data-p="${esc(p.id)}" data-k="${k}" ${p[k] ? 'checked' : ''}> ${k}</label>`).join(' ')}
        <select data-theme="${esc(p.id)}"><option value="">ธีมสุ่ม</option>${d.themes.map(t => `<option>${esc(t)}</option>`).join('')}</select>
        <button data-gen="${esc(p.id)}">สร้างคลิป</button></div>`).join('')}</div>
      <h3>คิวคลิป</h3>${d.queue.length ? d.queue.map(q => `<div style="padding:8px;border-top:1px solid #1f3b2a">
        <small>${esc(q.persona)} · ${esc(q.theme)} · <b>${esc(q.state)}</b> ${q.error ? '· ' + esc(q.error) : ''}</small><br>${esc(q.caption)}<br>
        ${q.state === 'awaiting_approval' ? `<button data-q="${esc(q.id)}" data-a="approve">อนุมัติโพสต์</button> <button data-q="${esc(q.id)}" data-a="reject">ปฏิเสธ</button>` : ''}
        ${q.state !== 'deleted' ? `<button data-q="${esc(q.id)}" data-a="delete">ลบ</button>` : ''}</div>`).join('') : '<p>ยังไม่มีคลิป</p>'}`;
  }
  box.addEventListener('change', async e => { const t = e.target; try {
    if (t.dataset.s) await api('/api/admin/personas/settings', 'POST', { [t.dataset.s]: t.checked });
    if (t.dataset.p) await api('/api/admin/personas/' + encodeURIComponent(t.dataset.p), 'PATCH', { [t.dataset.k]: t.checked });
  } catch (err) { alert(err.message); } render(); });
  box.addEventListener('click', async e => { const t = e.target.closest('button'); if (!t) return; try {
    if (t.dataset.gen) { const th = box.querySelector(`[data-theme="${CSS.escape(t.dataset.gen)}"]`).value; await api(`/api/admin/personas/${encodeURIComponent(t.dataset.gen)}/generate`, 'POST', th ? { theme: th } : {}); }
    if (t.dataset.q) { if (t.dataset.a === 'delete' && !confirm('ลบคลิปนี้?')) return; await api(`/api/admin/personas/queue/${encodeURIComponent(t.dataset.q)}/${t.dataset.a}`, 'POST', {}); }
  } catch (err) { alert(err.message); } render(); });
  addEventListener('DOMContentLoaded', () => { (document.querySelector('main') || document.body).appendChild(box); render(); setInterval(render, 15000); });
})();

// Admin-only ComfyUI Studio (images + videos rendered on the owner's PC). Server re-checks admin on every call.
let timer = null;
export function stopComfy() { clearTimeout(timer); timer = null; }
const isVid = n => /\.(mp4|webm|mov)$/i.test(n);
export async function mountComfy(box, { api, esc, toast }) {
  stopComfy();
  const st = await api('/admin/comfy/status');
  box.innerHTML = `<div class="adm-card"><h3>ComfyUI Studio · รูป/วิดีโอ</h3>
    <p class="adm-note">${st.ok ? `เชื่อมต่อ ${esc(st.url)} · ${esc(st.devices?.[0] || '')} · คิว ${st.queue.running} กำลังทำ / ${st.queue.pending} รอ` : `<span class="adm-tag red">offline</span> ${esc(st.error || '')} — เปิด ComfyUI บนคอมก่อน`}</p>
    <label>พรอมต์<textarea id="cf-prompt" maxlength="2000" rows="4" placeholder="เช่น cute green cat mascot, black background, neon glow"></textarea></label>
    <div class="adm-row"><label>Workflow<select id="cf-wf">${st.workflows.map(w => `<option value="${esc(w.id)}">${esc(w.label)}</option>`).join('')}</select></label>
    <label>Checkpoint<select id="cf-ckpt">${(st.checkpoints || []).map(c => `<option>${esc(c)}</option>`).join('') || '<option value="">(อัตโนมัติ)</option>'}</select></label></div>
    <button id="cf-go" class="adm-btn" ${st.ok ? '' : 'disabled'}>สร้าง</button><p id="cf-state" class="adm-note"></p></div>
    <div class="adm-card"><h3>แกลเลอรี</h3><div id="cf-gal" class="cf-gal"><small>กำลังโหลด…</small></div></div>`;
  const $ = s => box.querySelector(s);
  const url = (j, i, dl) => `/api/admin/comfy/jobs/${encodeURIComponent(j.id)}/file/${i}${dl ? '?dl=1' : ''}`;
  async function gallery() {
    const { items } = await api('/admin/comfy/jobs');
    $('#cf-gal').innerHTML = items.map(j => (j.outputs || []).map((o, i) => `<figure class="cf-item">${isVid(o.filename) ? `<video src="${url(j, i)}" controls playsinline loop muted preload="metadata"></video>` : `<img src="${url(j, i)}" loading="lazy" alt="">`}<figcaption>${esc(j.prompt.slice(0, 60))}</figcaption><div class="adm-row"><a class="adm-btn ghost sm" href="${url(j, i, 1)}" download>ดาวน์โหลด</a><button class="adm-btn ghost sm" data-cf-share="${esc(j.id)}" data-i="${i}" data-name="${esc(o.filename)}">แชร์</button></div></figure>`).join('') || (j.state === 'done' ? '' : `<div class="cf-item cf-wait"><small>${esc(j.state)} · ${esc(j.prompt.slice(0, 40))}</small></div>`)).join('') || '<small>ยังไม่มีผลงาน</small>';
  }
  async function watch(id, t0) {
    try { const j = await api('/admin/comfy/jobs/' + encodeURIComponent(id)); const s = Math.round((Date.now() - t0) / 1000);
      if (j.state === 'done') { $('#cf-state').textContent = `เสร็จใน ${s} วิ`; toast('สร้างเสร็จ'); return gallery(); }
      if (j.state === 'error') { $('#cf-state').textContent = 'ComfyUI แจ้งข้อผิดพลาด'; return gallery(); }
      $('#cf-state').textContent = j.state === 'running' ? `กำลังเรนเดอร์… ${s} วิ` : `รอคิว ${j.position || ''} · ${s} วิ`;
    } catch (e) { $('#cf-state').textContent = e.message; }
    if (box.isConnected) timer = setTimeout(() => watch(id, t0), 2000);
  }
  box.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'cf-go') { const prompt = $('#cf-prompt').value.trim(); if (!prompt) return toast('ใส่พรอมต์ก่อน'); b.disabled = true;
      try { const j = await api('/admin/comfy/generate', { prompt, workflow: $('#cf-wf').value, ckpt: $('#cf-ckpt').value || undefined }); watch(j.id, Date.now()); await gallery(); } catch (err) { toast('ส่งงานไม่สำเร็จ: ' + err.message); } finally { b.disabled = false; } }
    if (b.dataset.cfShare) { try { const r = await fetch(`/api/admin/comfy/jobs/${encodeURIComponent(b.dataset.cfShare)}/file/${b.dataset.i}`, { credentials: 'same-origin' }); const blob = await r.blob(); const file = new File([blob], b.dataset.name, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'PURE Studio' }); else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = b.dataset.name; a.click(); } } catch (err) { if (err.name !== 'AbortError') toast(err.message); } }
  };
  await gallery();
}

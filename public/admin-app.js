// In-app Admin (Android WebView + web). Visible only to admins; every endpoint re-checks role server-side (adminOnly).
const fmtB = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
const fmtT = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} ชม. ${m} นาที` : `${m} นาที`; };
let audioUrl = null;
const freeAudio = () => { if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; } };
export function stopAdmin() { const p = document.querySelector('#page'); if (p) p.onclick = null; freeAudio(); }
export async function mountAdmin({ api, esc, state, toast }) {
  const page = document.querySelector('#page');
  if (state.user?.role !== 'admin') { page.innerHTML = '<div class="card">สำหรับผู้ดูแลระบบเท่านั้น</div>'; return; }
  page.innerHTML = `<div class="adm"><header class="page-header"><div><p class="eyebrow">PURE ADMIN · ADMIN ONLY</p><h1>แผงผู้ดูแล<span class="tiny-dot">.</span></h1></div></header>
  <nav class="adm-tabs" role="tablist">${[['voice', 'Voice Studio'], ['users', 'ผู้ใช้'], ['server', 'เซิร์ฟเวอร์'], ['release', 'รีลีส'], ['content', 'โฆษณา/สัตว์เลี้ยง']].map(([k, l], i) => `<button data-adm="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</nav>
  <section id="adm-voice" class="adm-sec"><div class="adm-card"><h3>Voice Studio · Drama3</h3>
    <label>ข้อความ<textarea id="adm-text" maxlength="300" rows="4" placeholder="พิมพ์ข้อความที่ต้องการให้เสียงพูด">สวัสดีค่ะ ดิฉันคือเลขา PURE ยินดีช่วยเหลือค่ะ</textarea></label>
    <div class="adm-row"><label>เสียง<select id="adm-voice-sel"><option>pure-secretary.wav</option></select></label>
    <label>คุณภาพ<select id="adm-q"><option value="fast">เร็ว (fast)</option><option value="high">สูง (high)</option></select></label></div>
    <button id="adm-gen" class="adm-btn">สร้างเสียง</button><p id="adm-gen-note" class="adm-note">Drama3 ใช้ GPU ~7× ช้ากว่าเวลาจริง · ประโยคสั้นใช้ ~10–40 วินาที</p>
    <div id="adm-player" hidden><audio id="adm-audio" controls></audio><div class="adm-row"><a id="adm-dl" class="adm-btn ghost" download>ดาวน์โหลด WAV</a><button id="adm-share" class="adm-btn ghost">แชร์</button></div></div></div>
    <div class="adm-card"><h3>ประวัติ</h3><div id="adm-hist" class="adm-list"><small>กำลังโหลด…</small></div></div></section>
  <section id="adm-users" class="adm-sec" hidden><div class="adm-card"><h3>ผู้ใช้ล่าสุด</h3><div id="adm-user-list" class="adm-list"><small>กำลังโหลด…</small></div></div></section>
  <section id="adm-server" class="adm-sec" hidden><div id="adm-server-body" class="adm-grid"><small>กำลังโหลด…</small></div></section>
  <section id="adm-release" class="adm-sec" hidden><div id="adm-release-body" class="adm-card"><small>กำลังโหลด…</small></div></section>
  <section id="adm-content" class="adm-sec" hidden><div id="adm-content-body"><small>กำลังโหลด…</small></div></section></div>`;
  const $ = s => page.querySelector(s);
  let sys = null, ov = null, current = null;
  const loadSys = async () => (sys = await api('/admin/system'));
  const loadOv = async () => (ov = await api('/admin/overview'));
  const play = (blob, name) => { freeAudio(); audioUrl = URL.createObjectURL(blob); current = { blob, name }; $('#adm-audio').src = audioUrl; $('#adm-dl').href = audioUrl; $('#adm-dl').download = name; $('#adm-player').hidden = false; $('#adm-audio').play().catch(() => {}); };
  const fetchWav = async (url, init) => { const r = await fetch('/api' + url, { credentials: 'same-origin', ...init }); if (!r.ok) { let m = 'HTTP ' + r.status; try { m = (await r.json()).error || m; } catch {} throw new Error(m); } return r; };
  async function history() {
    const { items } = await api('/admin/tts/history');
    $('#adm-hist').innerHTML = items.map(h => `<div class="adm-item"><div><b>${esc(h.text)}</b><small>${esc(h.voice)} · ${h.quality} · ${(h.ms / 1000).toFixed(1)} วิ · ${fmtB(h.bytes)} · ${new Date(h.at).toLocaleString('th-TH')}</small></div><button class="adm-btn ghost sm" data-play="${esc(h.id)}">เล่น</button></div>`).join('') || '<small>ยังไม่มีประวัติ</small>';
  }
  const sections = {
    async voice() {
      try { const v = await api('/admin/tts/voices'); const list = v.voices || v.samples || []; if (list.length) $('#adm-voice-sel').innerHTML = list.map(n => `<option ${n === (v.voice || 'pure-secretary.wav') ? 'selected' : ''}>${esc(n)}</option>`).join(''); } catch { $('#adm-gen-note').textContent = 'Drama3 ออฟไลน์ — เปิด Drama3 บนเครื่อง GPU ก่อน'; }
      await history().catch(() => { $('#adm-hist').innerHTML = '<small>โหลดประวัติไม่สำเร็จ</small>'; });
    },
    async users() {
      await loadOv();
      $('#adm-user-list').innerHTML = ov.users.map(u => `<div class="adm-item"><div><b>${esc(u.name)} ${u.role === 'admin' ? '<span class="adm-tag">admin</span>' : ''}${u.banned ? '<span class="adm-tag red">banned</span>' : ''}</b><small>@${esc(u.handle)} · ${new Date(u.created).toLocaleDateString('th-TH')}</small></div>${u.id === state.user.id || u.id === 'pure-ai' ? '' : `<button class="adm-btn sm ${u.banned ? '' : 'danger'}" data-ban="${esc(u.id)}" data-banned="${u.banned ? 0 : 1}">${u.banned ? 'ปลดแบน' : 'แบน'}</button>`}</div>`).join('');
    },
    async server() {
      await Promise.all([loadSys(), ov || loadOv()]);
      const c = sys.cluster || {}, t = sys.tts || {};
      const tile = (k, v) => `<div class="adm-tile"><small>${k}</small><b>${esc(String(v))}</b></div>`;
      $('#adm-server-body').innerHTML = tile('ออนไลน์', ov.stats.online) + tile('ผู้ใช้', ov.stats.users) + tile('ข้อความ', ov.stats.messages) + tile('ถูกแบน', sys.banned) + tile('Uptime', fmtT(sys.uptime)) + tile('RAM', sys.memoryMb + ' MB') +
        `<div class="adm-card wide"><h3>Cluster / Node</h3><p>โหนด <b>${esc(c.node || c.id || 'single')}</b> · บทบาท <b>${esc(c.role || 'primary')}</b> · ${c.enabled ? 'เปิด cluster' : 'โหมดเครื่องเดียว'}</p>${(c.peers || []).map(p => `<small>${esc(p.id)} · ${esc(p.role || '')} · ${p.alive ? '🟢' : '⚪'}</small>`).join('<br>')}<p>Node.js ${esc(sys.node)} · AI ${esc(ov.server.model)}</p>${sys.server ? `<small>server.json: ${esc(JSON.stringify(sys.server).slice(0, 160))}</small>` : ''}</div>
        <div class="adm-card wide"><h3>Drama3 TTS</h3><p>${t.online === false ? '🔴 ออฟไลน์' : t.online ? '🟢 ออนไลน์' : '⚪ ยังไม่ตรวจ'} · คิว ${t.queued || 0} · กำลังเรนเดอร์ ${t.running || 0}</p></div>`;
    },
    async release() {
      await loadSys(); let live = null; try { live = await (await fetch('/version.json', { cache: 'no-store' })).json(); } catch {}
      const r = sys.release || live || {};
      $('#adm-release-body').innerHTML = `<h3>อัปเดตแอป</h3><p>เวอร์ชันเซิร์ฟเวอร์ <b>${esc(sys.version)}</b></p><p>ประกาศอัปเดต: <b>${esc(r.versionName || '-')}</b> (versionCode ${esc(String(r.versionCode ?? '-'))})</p>${r.apkUrl ? `<p class="adm-break"><a href="${esc(r.apkUrl)}" target="_blank" rel="noopener">${esc(r.apkUrl)}</a></p>` : ''}${r.sha256 ? `<small class="adm-break">sha256 ${esc(r.sha256)}</small>` : ''}<p>${live && r.versionCode === live.versionCode ? '🟢 /version.json ตรงกับที่เผยแพร่' : '🟡 ตรวจ /version.json'}</p>`;
    },
    async content() {
      await Promise.all([loadSys(), ov || loadOv()]);
      $('#adm-content-body').innerHTML = `<div class="adm-card"><h3>สัตว์เลี้ยง</h3><p>สัตว์เลี้ยงทั้งหมด <b>${ov.stats.pets}</b> · วิดีโอห้องสัตว์เลี้ยง ${sys.pets.videos.length} ไฟล์</p><div class="adm-chips">${sys.pets.videos.map(v => `<span>${esc(v)}</span>`).join('')}</div></div>
        <div class="adm-card"><h3>โฆษณา / ข่าวสาร</h3><p class="adm-note">แบนเนอร์โฆษณาบนเว็บจัดการที่ ${esc(sys.ads.managedIn)}</p><label>ประกาศถึงผู้ใช้ทุกคนที่ออนไลน์<textarea id="adm-bc" maxlength="500" rows="3"></textarea></label><button id="adm-bc-send" class="adm-btn">ส่งประกาศ</button></div>`;
      $('#adm-bc-send').onclick = async () => { const text = $('#adm-bc').value.trim(); if (!text || !confirm('ส่งประกาศนี้ถึงผู้ใช้ทุกคน?')) return; await api('/admin/broadcast', { text }); toast('ส่งประกาศแล้ว'); $('#adm-bc').value = ''; };
    },
  };
  const show = async k => { page.querySelectorAll('[data-adm]').forEach(b => b.classList.toggle('on', b.dataset.adm === k)); page.querySelectorAll('.adm-sec').forEach(s => s.hidden = s.id !== 'adm-' + k); try { await sections[k](); } catch (e) { toast(e.message); } };
  page.querySelector('.adm-tabs').onclick = e => { const b = e.target.closest('[data-adm]'); if (b) show(b.dataset.adm); };
  page.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'adm-gen') {
      const text = $('#adm-text').value.trim(); if (!text) return; b.disabled = true; const t0 = Date.now(); const tick = setInterval(() => { b.textContent = `กำลังสร้าง… ${Math.round((Date.now() - t0) / 1000)} วิ`; }, 500);
      try { const r = await fetchWav('/admin/tts/studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: $('#adm-voice-sel').value, quality: $('#adm-q').value }) }); play(await r.blob(), `pure-voice-${r.headers.get('x-studio-id')?.slice(0, 10) || Date.now()}.wav`); toast('สร้างเสียงเสร็จ'); await history(); }
      catch (err) { toast('สร้างเสียงไม่สำเร็จ: ' + err.message); } finally { clearInterval(tick); b.disabled = false; b.textContent = 'สร้างเสียง'; }
    }
    if (b.dataset.play) { try { const r = await fetchWav('/admin/tts/audio/' + encodeURIComponent(b.dataset.play)); play(await r.blob(), `pure-voice-${b.dataset.play.slice(0, 10)}.wav`); } catch (err) { toast(err.message); } }
    if (b.id === 'adm-share' && current) {
      const file = new File([current.blob], current.name, { type: 'audio/wav' });
      try { if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'PURE Voice' }); else { $('#adm-dl').click(); toast('อุปกรณ์นี้แชร์ไฟล์ไม่ได้ — ดาวน์โหลดแทน'); } } catch {}
    }
    if (b.dataset.ban) { const ban = b.dataset.banned === '1'; if (ban && !confirm('แบนผู้ใช้นี้? จะออกจากระบบทันที')) return; await api('/admin/users/' + b.dataset.ban + '/ban', { banned: ban }).then(() => toast(ban ? 'แบนแล้ว' : 'ปลดแบนแล้ว'), e2 => toast(e2.message)); ov = null; await sections.users(); }
  };
  await show('voice');
}

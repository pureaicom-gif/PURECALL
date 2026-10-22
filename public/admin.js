
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('toast-visible');
    setTimeout(() => { t.classList.remove('toast-visible'); }, 3500);
  }

  let currentUser = null;
  let allUsers = [];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  async function checkAuth() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user && (data.user.role === 'admin' || data.user.isAdmin)) {
          currentUser = data.user;
          document.getElementById('auth-screen').classList.add('is-hidden');
          document.getElementById('admin-main').classList.remove('is-hidden');
          document.getElementById('user-actions').classList.remove('is-hidden');
          document.getElementById('current-admin-name').textContent = ' ' + data.user.name + ' (@' + data.user.handle + ')';
          loadDashboard();
          return;
        }
      }
    } catch(e) {}
    document.getElementById('auth-screen').classList.remove('is-hidden');
    document.getElementById('admin-main').classList.add('is-hidden');
    document.getElementById('user-actions').classList.add('is-hidden');
  }

  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const handle = document.getElementById('login-handle').value.trim();
    const password = document.getElementById('login-password').value;
    const err = document.getElementById('login-err');
    const btn = document.getElementById('login-btn');
    err.classList.add('is-hidden');
    btn.disabled = true;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
      if (data.user.role !== 'admin' && !data.user.isAdmin) {
        throw new Error('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ (Admin)');
      }
      showToast('เข้าสู่ระบบสำเร็จ ยินดีต้อนรับแอดมิน!');
      checkAuth();
    } catch(e) {
      err.textContent = e.message;
      err.classList.remove('is-hidden');
    } finally {
      btn.disabled = false;
    }
  });

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    location.reload();
  }

  async function loadDashboard() {
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
      const data = await res.json();
      
      // Stats
      document.getElementById('stat-users').textContent = data.stats.users;
      document.getElementById('stat-online').textContent = data.stats.online;
      document.getElementById('stat-messages').textContent = data.stats.messages;
      document.getElementById('stat-files').textContent = data.stats.files;
      document.getElementById('stat-pets').textContent = data.stats.pets;
      document.getElementById('user-count-badge').textContent = data.stats.users;

      // Diagnostics
      const mins = Math.floor(data.server.uptime / 60);
      const hrs = Math.floor(mins / 60);
      document.getElementById('diag-uptime').textContent = hrs > 0 ? `${hrs} ชั่วโมง ${mins%60} นาที` : `${mins} นาที`;
      document.getElementById('diag-ram').textContent = data.server.memory + ' MB';
      document.getElementById('diag-node').textContent = data.server.node + ' (' + data.server.platform + ')';
      document.getElementById('diag-model').textContent = data.server.model;

      // AI status
      if (data.ai) {
        document.getElementById('ai-key-status').textContent = data.ai.configured ? ' ตั้งค่าคีย์แล้ว' : ' ยังไม่ตั้งค่า';
        document.getElementById('ai-active-model').textContent = data.ai.model || 'ยังไม่กำหนด';
        document.getElementById('ai-fallback-model').textContent = data.ai.fallback || '-';
        document.getElementById('ai-last-scan').textContent = data.ai.lastScan ? new Date(data.ai.lastScan).toLocaleString('th-TH') : 'ยังไม่ได้สแกน';
        const catalog = data.ai.catalog || [];
        document.getElementById('ai-catalog-list').innerHTML = catalog.length > 0 
          ? catalog.map(m => `<div>• <strong>${escapeHtml(m.name)}</strong></div>`).join('')
          : '<div class="muted">ยังไม่มีรายการโมเดล</div>';
      }

      // Network Connections
      if (data.network) {
        const tunnelEl = document.getElementById('net-tunnel-url');
        const badgeEl = document.getElementById('tunnel-badge');
        if (data.network.tunnelUrl) {
          tunnelEl.value = data.network.tunnelUrl;
          badgeEl.textContent = '● ออนไลน์พร้อมใช้งาน';
          badgeEl.classList.add('tunnel-ready');
          badgeEl.classList.remove('tunnel-offline');
        } else {
          tunnelEl.value = 'ยังไม่ได้เปิด START-ONLINE.cmd บนคอม';
          badgeEl.textContent = '○ ยังไม่เปิดออนไลน์';
          badgeEl.classList.add('tunnel-offline');
          badgeEl.classList.remove('tunnel-ready');
        }
        document.getElementById('net-lan-url').value = data.network.lanUrl || '-';
      }

      // Users
      allUsers = data.users || [];
      renderUsers(allUsers);
      const status=document.getElementById('dashboard-status');if(status)status.textContent='อัปเดตล่าสุด '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
    } catch(e) {
      const status=document.getElementById('dashboard-status');if(status)status.textContent='โหลดไม่สำเร็จ · '+(e.message||'ตรวจสอบการเชื่อมต่อ');
      showToast(e.message||'โหลดข้อมูลแผงควบคุมไม่สำเร็จ');
    }
  }

  function copyNetUrl(id) {
    const val = document.getElementById(id).value;
    if (!val || val.includes('ยังไม่ได้เปิด') || val.includes('กำลังโหลด')) return;
    navigator.clipboard.writeText(val);
    showToast('คัดลอกลิงก์แล้ว: ' + val);
  }

  function renderUsers(users) {
    const tbody = document.getElementById('user-tbody');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted user-empty text-center">ไม่พบผู้ใช้ ลองค้นหาด้วย PURE ID หรือชื่ออื่น</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>@${escapeHtml(u.handle)}</strong></td>
        <td>${escapeHtml(u.name)}</td>
        <td>${u.online ? '<span class="badge-online"><span class="status-dot"></span> ออนไลน์</span>' : '<span class="muted"> ออฟไลน์</span>'}</td>
        <td>${u.role === 'admin' ? '<span class="badge-admin"> แอดมิน</span>' : '<span class="badge-user">ผู้ใช้ทั่วไป</span>'}</td>
        <td><small class="muted">${new Date(u.created).toLocaleDateString('th-TH')}</small></td>
        <td>
          <div class="user-actions">
            <button class="btn-secondary btn-sm" data-admin-action="role" data-id="${escapeHtml(u.id)}" data-role="${escapeHtml(u.role)}">
              ${u.role === 'admin' ? 'ปลดแอดมิน' : 'ตั้งเป็นแอดมิน'}
            </button>
            <button class="btn-secondary btn-sm" data-admin-action="password" data-id="${escapeHtml(u.id)}" data-handle="${escapeHtml(u.handle)}">
               ตั้งรหัสผ่านใหม่
            </button>
            ${u.id !== currentUser.id ? `<button class="btn-danger btn-sm" data-admin-action="delete" data-id="${escapeHtml(u.id)}" data-handle="${escapeHtml(u.handle)}">ลบบัญชี</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
    tbody.onclick = async event => {
      const button=event.target.closest('[data-admin-action]');if(!button)return;
      const {adminAction,id,role,handle}=button.dataset;
      button.disabled=true;
      try{if(adminAction==='role')await toggleRole(id,role);else if(adminAction==='password')await resetUserPassword(id,handle);else if(adminAction==='delete')await deleteUser(id,handle);}
      finally{button.disabled=false;}
    };
  }

  document.getElementById('search-user').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = allUsers.filter(u => u.handle.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
    renderUsers(filtered);
  });

  async function toggleRole(id, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`ต้องการเปลี่ยนสิทธิ์ของบัญชีนี้เป็น ${newRole === 'admin' ? 'แอดมิน' : 'ผู้ใช้ทั่วไป'} หรือไม่?`)) return;
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    if (res.ok) {
      showToast('เปลี่ยนสิทธิ์สำเร็จ');
      loadDashboard();
    } else {
      const d = await res.json();
      alert(d.error || 'เกิดข้อผิดพลาด');
    }
  }

  async function resetUserPassword(id, handle) {
    const newPassword = prompt(`ตั้งรหัสผ่านใหม่สำหรับ @${handle} (อย่างน้อย 8 ตัวอักษร):`);
    if (!newPassword) return;
    if (newPassword.length < 8) {
      alert('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    const res = await fetch(`/api/admin/users/${id}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    if (res.ok) {
      showToast(`รีเซ็ตรหัสผ่านของ @${handle} สำเร็จแล้ว`);
    } else {
      const d = await res.json();
      alert(d.error || 'เกิดข้อผิดพลาด');
    }
  }

  async function deleteUser(id, handle) {
    if (!confirm(`ยืนยันการลบบัญชี @${handle}? ข้อมูลทั้งหมดจะถูกลบถาวร`)) return;
    const res = await fetch(`/api/admin/users/${id}/delete`, { method: 'POST' });
    if (res.ok) {
      showToast(`ลบบัญชี @${handle} แล้ว`);
      loadDashboard();
    } else {
      const d = await res.json();
      alert(d.error || 'เกิดข้อผิดพลาด');
    }
  }

  async function scanAI() {
    const btn = document.getElementById('btn-scan-ai');
    btn.disabled = true;
    try {
      const res = await fetch('/api/admin/ai/scan', { method: 'POST' });
      if (res.ok) {
        showToast('สแกนโมเดล PURE AI สำเร็จแล้ว');
        loadDashboard();
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function sendBroadcast() {
    const text = document.getElementById('broadcast-msg').value.trim();
    if (!text) return alert('กรุณาพิมพ์ข้อความประกาศ');
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (res.ok) {
      showToast('ส่งประกาศไปยังทุกคนสำเร็จแล้ว!');
      document.getElementById('broadcast-msg').value = '';
    } else {
      const d = await res.json();
      alert(d.error || 'เกิดข้อผิดพลาด');
    }
  }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.addEventListener('click', event => {
    const button=event.target.closest('[data-admin-command]');if(!button)return;
    const command=button.dataset.adminCommand;
    if(command==='home')location.href='/';
    else if(command==='logout')logout();
    else if(command==='refresh')loadDashboard();
    else if(command==='copy-tunnel')copyNetUrl('net-tunnel-url');
    else if(command==='copy-lan')copyNetUrl('net-lan-url');
    else if(command==='scan-ai')scanAI();
    else if(command==='send-broadcast')sendBroadcast();
  });

  checkAuth();

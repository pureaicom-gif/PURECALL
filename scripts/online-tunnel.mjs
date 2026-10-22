import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = join(root, 'tools');
const dataDir = join(root, 'data');
const distDir = join(root, 'dist');
const cloudflaredPath = join(toolsDir, 'cloudflared.exe');

if (!existsSync(cloudflaredPath)) {
  console.error(`[ERROR] cloudflared.exe not found at: ${cloudflaredPath}`);
  process.exit(1);
}

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

console.log('================================================================');
console.log('           PURE 0.5 - ONLINE SERVER (CLOUDFLARE TUNNEL)         ');
console.log('================================================================\n');

async function isServerRunning() {
  try {
    const res = await fetch('http://localhost:3000/api/health', { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      return data.ok === true;
    }
  } catch {}
  return false;
}

let serverChild = null;

async function ensureServer() {
  console.log('[1/3] ตรวจสอบเซิร์ฟเวอร์ PURE ภายในเครื่อง (Port 3000)...');
  let running = await isServerRunning();
  if (running) {
    console.log('[OK] เซิร์ฟเวอร์ PURE ทำงานอยู่แล้ว!\n');
    return;
  }

  console.log('[INFO] กำลังเปิดเซิร์ฟเวอร์ PURE...');
  serverChild = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverChild.on('error', err => {
    console.error('[ERROR] Failed to start server:', err);
  });

  // Wait for server to be ready
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 800));
    if (await isServerRunning()) {
      console.log('[OK] เซิร์ฟเวอร์ PURE พร้อมทำงานแล้ว!\n');
      return;
    }
  }
  console.log('[WARN] เซิร์ฟเวอร์อาจยังเริ่มต้นไม่เสร็จ กำลังเริ่ม Cloudflare ต่อ...');
}

let tunnelUrl = null;

function onTunnelReady(url) {
  tunnelUrl = url;

  // 1. Write to data/tunnel-url.txt
  writeFileSync(join(dataDir, 'tunnel-url.txt'), url.trim(), 'utf8');

  // 2. Write to SERVER-URL.txt in root and dist
  const summaryText = [
    '================================================================',
    '       PURE 0.5 - ลิงก์เชื่อมต่อผ่านอินเทอร์เน็ต (ONLINE URL)',
    '================================================================',
    '',
    '📱 ลิงก์สำหรับเข้าใช้งานบนมือถือ (ใช้ได้ทั้งเน็ต 4G/5G และ Wi-Fi):',
    `   ${url}`,
    '',
    '👑 แอดมินคอนโซล (Admin Console):',
    `   ${url}/admin`,
    '   PURE ID : purefxai',
    '   Password: use your configured admin password',
    '',
    '================================================================',
    `อัปเดตล่าสุด: ${new Date().toLocaleString('th-TH')}`,
    'หมายเหตุ: หากปิดหน้าต่างนี้ ลิงก์ออนไลน์จะหยุดทำงานทันที'
  ].join('\r\n');

  writeFileSync(join(root, 'SERVER-URL.txt'), summaryText, 'utf8');
  writeFileSync(join(distDir, 'SERVER-URL.txt'), summaryText, 'utf8');

  // 3. Create SERVER-URL.html with QR code
  const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>PURE Online - ลิงก์สำหรับมือถือ</title>
  <style>
    body { background: #0b0d11; color: #f0f3f8; font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px 20px; }
    .card { max-width: 520px; margin: 0 auto; background: #13161c; border: 1px solid #2c3340; border-radius: 16px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; color: #ffd166; font-size: 24px; }
    .url-box { background: #1a1e26; border: 1px solid #3b4252; padding: 14px; border-radius: 10px; font-size: 16px; font-weight: bold; color: #4ade80; word-break: break-all; margin: 20px 0; }
    .btn { display: inline-block; background: #f0f3f8; color: #11141a; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold; margin: 6px; cursor: pointer; border: none; }
    .btn:hover { background: #dce0e8; }
    .btn-gold { background: #322814; color: #ffd166; border: 1px solid #6d5420; }
    .qr { margin: 20px 0; padding: 10px; background: white; display: inline-block; border-radius: 12px; }
    .badge { display: inline-block; background: #1b382b; color: #4ade80; border: 1px solid #2e684a; padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● เชื่อมต่อออนไลน์สำเร็จ</div>
    <h1>PURE® ออนไลน์ผ่านอินเทอร์เน็ต</h1>
    <p style="color:#8e98a8;">สแกน QR Code หรือคัดลอกลิงก์นี้ไปใส่ในแอป PURE บนมือถือ</p>
    
    <div class="qr">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}" alt="QR Code" width="220" height="220">
    </div>

    <div class="url-box" id="url-text">${url}</div>
    <button class="btn" onclick="navigator.clipboard.writeText('${url}'); alert('คัดลอกลิงก์แล้ว!');">📋 คัดลอกลิงก์</button>
    <a href="${url}" target="_blank" class="btn">🚀 เปิดหน้าเว็บ</a>
    <a href="${url}/admin" target="_blank" class="btn btn-gold">👑 แอดมิน</a>

    <div style="margin-top:24px; font-size:12px; color:#8e98a8; text-align:left; background:#181b22; padding:14px; border-radius:10px;">
      <strong>วิธีใช้บนมือถือ:</strong><br>
      1. คัดลอกลิงก์ด้านบน หรือใช้มือถือสแกน QR Code<br>
      2. เปิดแอป <strong>PURE</strong> บนมือถือ แล้วกดปุ่ม <code>[📋 วางลิงก์จากคลิปบอร์ด]</code><br>
      3. กด <code>เชื่อมต่อเซิร์ฟเวอร์</code> เข้าใช้งานได้ทันทีทั้งแชต โทร และแอดมิน!
    </div>
  </div>
</body>
</html>`;

  writeFileSync(join(root, 'SERVER-URL.html'), htmlContent, 'utf8');
  writeFileSync(join(distDir, 'SERVER-URL.html'), htmlContent, 'utf8');

  // Try opening SERVER-URL.html automatically in browser
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', join(root, 'SERVER-URL.html')], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {}

  // Print clean banner in console
  console.clear();
  console.log('\n================================================================');
  console.log('       🚀 PURE 0.5 - เชื่อมต่อผ่านอินเทอร์เน็ตสำเร็จ!             ');
  console.log('================================================================\n');
  console.log('📱 ลิงก์สำหรับเข้าใช้งานบนมือถือ (ใช้ได้ทั้ง 4G/5G และ Wi-Fi):');
  console.log(`   👉 ${url} 👈\n`);
  console.log('👑 แอดมินคอนโซล (Admin Console):');
  console.log(`   👉 ${url}/admin`);
  console.log('   PURE ID : purefxai');
  console.log('   Password: use your configured admin password\n');
  console.log('================================================================');
  console.log('💡 เคล็ดลับ:');
  console.log('  1. ก๊อปปี้ลิงก์ https://... ด้านบน แล้วกดส่งเข้ามือถือ (ผ่าน LINE หรือแชต)');
  console.log('  2. เปิดแอป PURE บนมือถือ แล้วแตะปุ่ม [📋 วางลิงก์จากคลิปบอร์ด]');
  console.log('  3. หรือเปิดไฟล์ "SERVER-URL.html" บนหน้าจอเพื่อสแกน QR Code');
  console.log('  4. เปิดหน้าต่างนี้ค้างไว้ตลอดเวลาที่ต้องการให้ออนไลน์');
  console.log('================================================================\n');
}

async function start() {
  await ensureServer();

  console.log('[2/3] กำลังเชื่อมต่อ Cloudflare Tunnel (สร้างลิงก์อินเทอร์เน็ต HTTPS ฟรี)...');
  const cfChild = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:3000'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  function processChunk(chunk) {
    const text = chunk.toString();
    if (!tunnelUrl) {
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        onTunnelReady(match[0]);
      }
    }
  }

  cfChild.stdout.on('data', processChunk);
  cfChild.stderr.on('data', processChunk);

  cfChild.on('error', err => {
    console.error('[ERROR] Failed to start cloudflared:', err);
  });

  cfChild.on('close', code => {
    console.log(`\n[INFO] Cloudflare tunnel closed (code: ${code})`);
    try {
      writeFileSync(join(dataDir, 'tunnel-url.txt'), '', 'utf8');
    } catch {}
  });

  function cleanup() {
    try { cfChild.kill(); } catch {}
    try { if (serverChild) serverChild.kill(); } catch {}
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

start().catch(console.error);

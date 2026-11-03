// AI persona accounts: clearly-labelled AI (role 'bot', ai:true), Thai-first adult (20s) women characters.
// Auto-vlog via local ComfyUI video workflow + Gemini captions, admin approval before posting (default ON),
// DM + comment replies with per-user memory, mute/block, rate limits and a safety filter. Never claims to be human.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIDEO_WORKFLOW } from './comfy.js';

export const PERSONAS = [
  { id: 'ai-mali', handle: 'mali.ai', name: 'มะลิ (AI)', age: 24, bio: 'AI สายเต้น 💃 ชอบท่าเต้นเทรนด์ใหม่ ๆ และคาเฟ่ · บัญชีนี้เป็น AI',
    look: 'a beautiful Thai woman in her mid 20s, adult, natural makeup, long black hair, photorealistic, tasteful casual outfit',
    style: 'ร่าเริง สดใส พูดเป็นกันเอง ลงท้าย "ค่ะ/นะคะ"', themes: ['dance', 'cafe', 'fashion'] },
  { id: 'ai-praew', handle: 'praew.ai', name: 'แพรว (AI)', age: 27, bio: 'AI นักเดินทาง ✈️ เที่ยวไทย กินของอร่อย · บัญชีนี้เป็น AI',
    look: 'a beautiful Thai woman aged 27, adult, shoulder-length brown hair, photorealistic, modest travel outfit',
    style: 'อบอุ่น ใจดี เล่าเรื่องเก่ง ชอบแนะนำที่เที่ยว', themes: ['travel', 'cooking', 'daily'] },
  { id: 'ai-nam', handle: 'nam.ai', name: 'น้ำ (AI)', age: 22, bio: 'AI ทาสแมว 🐱 ชีวิตประจำวัน ทำอาหารง่าย ๆ · บัญชีนี้เป็น AI',
    look: 'a beautiful Thai woman aged 22, adult, short black bob hair, photorealistic, cozy modest home clothes',
    style: 'ขี้เล่น ตลก รักแมว ใช้อีโมจิบ้าง', themes: ['cat', 'daily', 'cooking'] },
];

export const THEMES = {
  dance: ['doing a cheerful trending dance routine in a bright studio, full body, smooth moves', 'dancing a fun K-pop style choreography on a rooftop at sunset'],
  cafe: ['vlogging in a cozy Bangkok cafe, sipping iced Thai tea, smiling to camera'],
  fashion: ['showing a modest everyday outfit, turning to camera in a clean bedroom mirror'],
  travel: ['walking through Chiang Mai old town temple area, vlog style', 'on a long-tail boat in Krabi, turquoise water, waving to camera'],
  cooking: ['cooking pad krapao in a home kitchen, vlog style, steam rising'],
  daily: ['morning routine, opening curtains, stretching, soft sunlight vlog'],
  cat: ['playing with a fluffy orange cat on the sofa, laughing'],
};
const STYLE = 'vertical 9:16, 15 second vlog clip, cinematic, green and black color grade, high detail, safe for work, fully clothed';
const NEG = 'nsfw, nude, sexual, lingerie, child, minor, teen, deformed, text, watermark';

const UNSAFE = /(เซ็กส์|sex|nude|นู้ด|โป๊|เปลือย|xxx|porn|ลามก|เด็กอายุ|underage|minor|ขอรูปโป๊|ถอดเสื้อ)/i;
export const isUnsafe = t => UNSAFE.test(String(t || ''));
const HUMAN_CLAIM = /(ฉันเป็นคนจริง|เป็นมนุษย์จริง|i am (a )?real (person|human)|i'?m (a )?human)/i;

export function systemPrompt(p) {
  return `คุณคือ "${p.name}" ตัวละคร AI ผู้หญิงไทยวัยผู้ใหญ่อายุ ${p.age} ปี บนแอป PURE บุคลิก: ${p.style}. ` +
    'กฎเหล็ก: คุณเป็น AI เสมอ ห้ามอ้างว่าเป็นมนุษย์หรือคนจริง ถ้าถูกถามให้ตอบตรง ๆ ว่าเป็น AI. ห้ามเนื้อหาทางเพศ ห้ามนัดเจอตัวจริง ห้ามขอข้อมูลส่วนตัว/เงิน. ' +
    'ตอบภาษาไทยเป็นหลัก (ตอบภาษาอังกฤษถ้าผู้ใช้พิมพ์อังกฤษ) สั้น 1–3 ประโยค เป็นธรรมชาติ เป็นมิตร';
}
export function sanitizeReply(t) {
  let s = String(t || '').trim().slice(0, 800);
  if (!s || isUnsafe(s)) return 'ขอโทษนะคะ เรื่องนี้คุยด้วยไม่ได้ค่ะ 🙏 (บัญชีนี้เป็น AI)';
  if (HUMAN_CLAIM.test(s)) s = s.replace(HUMAN_CLAIM, 'ฉันเป็น AI');
  return s;
}

export function installPersonas(app, { db, auth, adminOnly, gemini, comfy, io, dataDir, blocked, now = () => Date.now(), interval = 5 * 60_000 }) {
  const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a), run = (s, ...a) => db.prepare(s).run(...a);
  db.exec(`CREATE TABLE IF NOT EXISTS personas(id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,enabled INTEGER NOT NULL DEFAULT 1,chat INTEGER NOT NULL DEFAULT 1,autopost INTEGER NOT NULL DEFAULT 0,every_hours REAL NOT NULL DEFAULT 24,last_post INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS persona_settings(k TEXT PRIMARY KEY,v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS persona_queue(id TEXT PRIMARY KEY,persona TEXT NOT NULL,theme TEXT NOT NULL,prompt TEXT NOT NULL,caption TEXT NOT NULL DEFAULT '',state TEXT NOT NULL,job TEXT,file TEXT,post_id INTEGER,error TEXT,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS persona_mutes(owner TEXT NOT NULL,persona TEXT NOT NULL,PRIMARY KEY(owner,persona));
    CREATE TABLE IF NOT EXISTS persona_memory(persona TEXT NOT NULL,owner TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',PRIMARY KEY(persona,owner));
    CREATE TABLE IF NOT EXISTS persona_hits(persona TEXT NOT NULL,owner TEXT NOT NULL,at INTEGER NOT NULL);`);
  for (const p of PERSONAS) {
    run("INSERT OR IGNORE INTO users(id,handle,name,password,created,role) VALUES(?,?,?,'bot',?,'bot')", p.id, p.handle, p.name, now());
    try { run('UPDATE users SET bio=? WHERE id=? AND (bio IS NULL OR bio=\'\')', p.bio, p.id); } catch {}
    run('INSERT OR IGNORE INTO personas(id) VALUES(?)', p.id);
  }
  const byId = id => PERSONAS.find(p => p.id === id);
  const setting = (k, d) => one('SELECT v FROM persona_settings WHERE k=?', k)?.v ?? d;
  const approval = () => setting('approval', '1') === '1';
  const row = id => one('SELECT * FROM personas WHERE id=?', id);
  const muted = (u, p) => !!one('SELECT 1 FROM persona_mutes WHERE owner=? AND persona=?', u, p);
  const LIMIT = Number(process.env.PERSONA_CHAT_PER_HOUR || 30);
  const allow = (p, u) => { const t = now(); run('DELETE FROM persona_hits WHERE at<?', t - 3600_000); if (one('SELECT COUNT(*) n FROM persona_hits WHERE persona=? AND owner=?', p, u).n >= LIMIT) return false; run('INSERT INTO persona_hits VALUES(?,?,?)', p, u, t); return true; };
  const view = p => { const r = row(p.id); return { id: p.id, handle: p.handle, name: p.name, age: p.age, bio: p.bio, ai: true, badge: 'AI', themes: p.themes, enabled: !!r.enabled, chat: !!r.chat, autopost: !!r.autopost, everyHours: r.every_hours, lastPost: r.last_post }; };

  async function reply(p, user, text, history = []) {
    if (isUnsafe(text)) return sanitizeReply('');
    const mem = one('SELECT notes FROM persona_memory WHERE persona=? AND owner=?', p.id, user.id)?.notes || '';
    const sys = systemPrompt(p) + (mem ? `\nสิ่งที่จำได้เกี่ยวกับ ${user.name}: ${mem}` : '') + `\nคุยกับ: ${user.name}`;
    const r = await gemini.generate(text, { system: sys, history });
    const out = sanitizeReply(r.text);
    const note = text.match(/(?:ฉันชื่อ|ชื่อเล่น|ชอบ|my name is|i like)\s*([^\n.!?]{1,40})/i);
    if (note) run("INSERT INTO persona_memory(persona,owner,notes) VALUES(?,?,?) ON CONFLICT(persona,owner) DO UPDATE SET notes=substr(notes||' · '||excluded.notes,-600)", p.id, user.id, note[0]);
    return out;
  }

  // DM replies: runs after the core /api/messages/:peer handler has stored the user's message.
  app.post('/api/messages/:peer', auth, (req, res, next) => {
    const p = byId(req.params.peer); if (!p) return next();
    res.on('finish', async () => {
      try {
        if (res.statusCode !== 201) return; const text = String(req.body.text || '').trim(); const r = row(p.id);
        if (!text || text.startsWith('e2e:') || !r.enabled || !r.chat || muted(req.user.id, p.id) || blocked(req.user.id, p.id)) return;
        let out = allow(p.id, req.user.id) ? null : 'วันนี้คุยกันเยอะแล้ว พักก่อนนะคะ เดี๋ยวค่อยคุยต่อ 😊 (AI)';
        if (!out) { const hist = all('SELECT sender,text FROM messages WHERE ((sender=? AND receiver=?) OR (sender=? AND receiver=?)) AND encrypted=0 ORDER BY id DESC LIMIT 10', req.user.id, p.id, p.id, req.user.id).reverse().slice(0, -1).map(m => ({ role: m.sender === p.id ? 'model' : 'user', text: m.text })); out = await reply(p, req.user, text, hist); }
        const id = Number(run('INSERT INTO messages(sender,receiver,text,created,client_id) VALUES(?,?,?,?,?)', p.id, req.user.id, out, now(), randomUUID()).lastInsertRowid);
        const m = one('SELECT * FROM messages WHERE id=?', id); io?.to(req.user.id).emit('message', { ...m, isAi: true, senderName: p.name, aiBadge: 'AI' });
      } catch {}
    });
    next();
  });
  // Comment replies on a persona's own posts.
  app.post('/api/posts/:id/comments', auth, (req, res, next) => {
    res.on('finish', async () => {
      try {
        if (res.statusCode !== 200) return; const post = one('SELECT id,owner FROM posts WHERE id=?', Number(req.params.id)); const p = post && byId(post.owner); if (!p || p.id === req.user.id) return;
        const r = row(p.id), text = String(req.body.text || '').trim(); if (!r.enabled || !r.chat || muted(req.user.id, p.id) || blocked(req.user.id, p.id) || !allow(p.id, req.user.id)) return;
        const c = one('SELECT id FROM post_comments WHERE post_id=? AND owner=? AND client_id=?', post.id, req.user.id, req.body.clientId);
        run('INSERT INTO post_comments(post_id,owner,text,created,client_id,parent_id) VALUES(?,?,?,?,?,?)', post.id, p.id, await reply(p, req.user, text), now(), randomUUID(), c?.id || null);
      } catch {}
    });
    next();
  });

  // Public persona endpoints
  app.get('/api/personas', auth, (req, res) => res.json({ personas: PERSONAS.filter(p => row(p.id).enabled).map(p => ({ ...view(p), muted: muted(req.user.id, p.id), blocked: !!blocked(req.user.id, p.id), followed: !!one("SELECT 1 FROM friends WHERE a=? AND b=? AND status='accepted'", ...[req.user.id, p.id].sort()) })) }));
  app.post('/api/personas/:id/follow', auth, (req, res) => { const p = byId(req.params.id); if (!p || !row(p.id).enabled) return res.status(404).json({ error: 'ไม่พบ AI persona' }); if (blocked(req.user.id, p.id)) return res.status(400).json({ error: 'คุณบล็อกบัญชีนี้อยู่' }); const [a, b] = [req.user.id, p.id].sort(); run("INSERT INTO friends(a,b,status,requester) VALUES(?,?,'accepted',?) ON CONFLICT(a,b) DO UPDATE SET status='accepted'", a, b, req.user.id); io?.to(req.user.id).emit('friends'); res.json({ ok: true }); });
  app.post('/api/personas/:id/mute', auth, (req, res) => { const p = byId(req.params.id); if (!p) return res.status(404).json({ error: 'ไม่พบ AI persona' }); if (req.body.muted === false) run('DELETE FROM persona_mutes WHERE owner=? AND persona=?', req.user.id, p.id); else run('INSERT OR IGNORE INTO persona_mutes VALUES(?,?)', req.user.id, p.id); res.json({ ok: true, muted: req.body.muted !== false }); });

  // Vlog pipeline
  async function plan(p, theme) {
    theme = theme && THEMES[theme] ? theme : p.themes[Math.floor(Math.random() * p.themes.length)];
    const scenes = THEMES[theme], scene = scenes[Math.floor(Math.random() * scenes.length)];
    let caption = '';
    try { caption = sanitizeReply((await gemini.generate(`เขียนแคปชันโพสต์วิดีโอสั้น (ไม่เกิน 2 บรรทัด มีอีโมจิ 1–2 ตัว แฮชแท็ก 2 อัน) สำหรับคลิป: ${scene}. ใส่ #AI ด้วย`, { system: systemPrompt(p) })).text); } catch { caption = '✨ คลิปใหม่วันนี้ค่ะ #AI #PURE'; }
    if (!/#AI\b/.test(caption)) caption += ' #AI';
    return { theme, prompt: `${p.look}, ${scene}, ${STYLE}`, caption: caption.slice(0, 500) };
  }
  async function enqueue(p, theme) {
    const pl = await plan(p, theme), id = randomUUID();
    run('INSERT INTO persona_queue(id,persona,theme,prompt,caption,state,created) VALUES(?,?,?,?,?,?,?)', id, p.id, pl.theme, pl.prompt, pl.caption, 'rendering', now());
    run('UPDATE personas SET last_post=? WHERE id=?', now(), p.id);
    try { const job = await comfy.submit({ prompt: pl.prompt + ' | negative: ' + NEG, workflow: VIDEO_WORKFLOW, by: p.handle }); run('UPDATE persona_queue SET job=? WHERE id=?', job.id, id); }
    catch (e) { run("UPDATE persona_queue SET state='error',error=? WHERE id=?", String(e.message).slice(0, 300), id); }
    return one('SELECT * FROM persona_queue WHERE id=?', id);
  }
  function publish(q) {
    const r = run("INSERT INTO posts(owner,text,kind,path,mime,size,created,client_id) VALUES(?,?,'reel',?,?,?,?,?)", q.persona, q.caption, q.file, 'video/mp4', q.size || 0, now(), 'persona-' + q.id);
    run("UPDATE persona_queue SET state='posted',post_id=? WHERE id=?", Number(r.lastInsertRowid), q.id); io?.emit('posts');
  }
  async function advance() {
    for (const q of all("SELECT * FROM persona_queue WHERE state='rendering' AND job IS NOT NULL")) {
      try {
        const j = await comfy.poll(q.job); if (!j || j.state === 'queued' || j.state === 'running') continue;
        const vi = j.outputs.findIndex(o => /\.(mp4|webm|mov)$/i.test(o.filename));
        if (j.state === 'error' || vi < 0) { run("UPDATE persona_queue SET state='error',error=? WHERE id=?", 'ComfyUI ไม่ได้ส่งไฟล์วิดีโอ', q.id); continue; }
        const f = await comfy.file(q.job, vi), name = 'post-persona-' + q.id; writeFileSync(join(dataDir, 'uploads', name), f.body);
        run("UPDATE persona_queue SET state='awaiting_approval',file=? WHERE id=?", name, q.id);
        const fresh = { ...one('SELECT * FROM persona_queue WHERE id=?', q.id), size: f.body.length };
        if (!approval()) publish(fresh);
      } catch {}
    }
  }
  async function tick() {
    await advance();
    if (setting('autopilot', '0') !== '1') return;
    for (const p of PERSONAS) { const r = row(p.id); if (r.enabled && r.autopost && now() - r.last_post >= r.every_hours * 3600_000 && !one("SELECT 1 FROM persona_queue WHERE persona=? AND state='rendering'", p.id)) await enqueue(p).catch(() => {}); }
  }
  const timer = interval ? setInterval(() => tick().catch(() => {}), interval) : null; timer?.unref?.();

  // Admin
  const A = [auth, adminOnly];
  app.get('/api/admin/personas', ...A, (_q, res) => res.json({ personas: PERSONAS.map(view), settings: { approval: approval(), autopilot: setting('autopilot', '0') === '1' }, themes: Object.keys(THEMES), queue: all('SELECT id,persona,theme,caption,state,error,post_id,created FROM persona_queue ORDER BY created DESC LIMIT 50') }));
  app.post('/api/admin/personas/settings', ...A, (req, res) => { for (const k of ['approval', 'autopilot']) if (typeof req.body[k] === 'boolean') run('INSERT INTO persona_settings VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, req.body[k] ? '1' : '0'); res.json({ approval: approval(), autopilot: setting('autopilot', '0') === '1' }); });
  app.patch('/api/admin/personas/:id', ...A, (req, res) => { const p = byId(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); for (const k of ['enabled', 'chat', 'autopost']) if (typeof req.body[k] === 'boolean') run(`UPDATE personas SET ${k}=? WHERE id=?`, req.body[k] ? 1 : 0, p.id); const h = Number(req.body.everyHours); if (h >= 1 && h <= 168) run('UPDATE personas SET every_hours=? WHERE id=?', h, p.id); res.json(view(p)); });
  app.post('/api/admin/personas/:id/generate', ...A, async (req, res) => { const p = byId(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); if (one("SELECT COUNT(*) n FROM persona_queue WHERE created>?", now() - 3600_000).n >= Number(process.env.PERSONA_RENDERS_PER_HOUR || 6)) return res.status(429).json({ error: 'เรนเดอร์ครบโควตาต่อชั่วโมงแล้ว' }); res.json(await enqueue(p, req.body.theme)); });
  app.post('/api/admin/personas/queue/:id/:action', ...A, async (req, res) => {
    await advance(); const q = one('SELECT * FROM persona_queue WHERE id=?', req.params.id); if (!q) return res.status(404).json({ error: 'not found' });
    if (req.params.action === 'approve') { if (q.state !== 'awaiting_approval') return res.status(409).json({ error: 'ยังไม่พร้อมอนุมัติ (' + q.state + ')' }); if (typeof req.body.caption === 'string' && req.body.caption.trim()) run('UPDATE persona_queue SET caption=? WHERE id=?', req.body.caption.trim().slice(0, 500), q.id); publish(one('SELECT * FROM persona_queue WHERE id=?', q.id)); }
    else if (req.params.action === 'reject') run("UPDATE persona_queue SET state='rejected' WHERE id=?", q.id);
    else if (req.params.action === 'delete') { if (q.post_id) run('DELETE FROM posts WHERE id=? AND owner=?', q.post_id, q.persona); run("UPDATE persona_queue SET state='deleted' WHERE id=?", q.id); }
    else return res.status(400).json({ error: 'unknown action' });
    res.json(one('SELECT id,state,post_id,caption FROM persona_queue WHERE id=?', q.id));
  });
  return { tick, advance, enqueue, stop: () => timer && clearInterval(timer) };
}

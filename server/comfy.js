// Admin-only ComfyUI Studio: images + videos rendered by the owner's local ComfyUI (HTTP API).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

export const VIDEO_WORKFLOW = 'video_fasth3_ominiref_r2v';
const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i;

export function txt2img({ prompt, negative = '', ckpt, width = 768, height = 768, steps = 20, seed }) {
  return {
    '3': { class_type: 'KSampler', inputs: { seed: seed ?? Math.floor(Math.random() * 2 ** 31), steps, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: negative || 'blurry, low quality, watermark, text', clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'PURE_studio', images: ['8', 0] } },
  };
}

// Put the prompt into an API-format workflow: the first text input of a positive-looking text-encode node.
export function injectPrompt(wf, prompt) {
  const g = structuredClone(wf); const nodes = Object.values(g).filter(n => n && typeof n.inputs?.text === 'string');
  const primitive = Object.values(g).find(n => n?.class_type === 'PrimitiveStringMultiline' && typeof n.inputs?.value === 'string' && !/neg/i.test(n._meta?.title || ''));
  const valueNode = primitive || Object.values(g).find(n => typeof n?.inputs?.value === 'string' && /prompt/i.test(n._meta?.title || '') && !/neg/i.test(n._meta?.title || ''));
  const pos = nodes.find(n => !/neg/i.test(n._meta?.title || '')) || nodes[0];
  if (valueNode) valueNode.inputs.value = prompt;
  else if (pos) pos.inputs.text = prompt;
  else throw Object.assign(new Error('workflow has no text prompt node'), { status: 422 });
  for (const n of Object.values(g)) if (n?.inputs && 'seed' in n.inputs && typeof n.inputs.seed === 'number') n.inputs.seed = Math.floor(Math.random() * 2 ** 31);
  return g;
}

export function createComfy({ url = process.env.COMFYUI_URL || 'http://127.0.0.1:8188', workflowDir = process.env.COMFYUI_WORKFLOW_DIR, dataDir, fetcher = fetch } = {}) {
  const base = url.replace(/\/+$/, ''), jobsFile = join(dataDir, 'comfy-studio.json'), clientId = randomUUID();
  const jobs = () => { try { return JSON.parse(readFileSync(jobsFile, 'utf8')); } catch { return []; } };
  const save = list => writeFileSync(jobsFile, JSON.stringify(list.slice(0, 60)));
  const call = async (path, init) => { let r; try { r = await fetcher(base + path, { ...init, signal: AbortSignal.timeout(15000) }); } catch { throw Object.assign(new Error('ComfyUI ไม่ตอบสนองที่ ' + base), { status: 503 }); } if (!r.ok) throw Object.assign(new Error('ComfyUI HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200)), { status: 502 }); return r; };
  const videoFile = () => {
    const configured = process.env.COMFYUI_VIDEO_WORKFLOW_FILE;
    if (configured && existsSync(configured)) return configured;
    if (!workflowDir || !existsSync(workflowDir)) return null;
    const f = readdirSync(workflowDir).find(x => x.startsWith(VIDEO_WORKFLOW) && x.endsWith('.json'));
    return f ? join(workflowDir, f) : null;
  };
  async function workflows() {
    const list = [{ id: 'txt2img', kind: 'image', label: 'รูปภาพ (txt2img)' }];
    if (videoFile()) list.push({ id: VIDEO_WORKFLOW, kind: 'video', label: 'วิดีโอ (' + VIDEO_WORKFLOW + ')' });
    return list;
  }
  async function status() {
    try { const s = await (await call('/system_stats')).json(); const q = await (await call('/queue')).json(); let ckpts = []; try { ckpts = (await (await call('/object_info/CheckpointLoaderSimple')).json()).CheckpointLoaderSimple.input.required.ckpt_name[0]; } catch {} return { ok: true, url: base, version: s.system?.comfyui_version, devices: (s.devices || []).map(d => d.name), queue: { running: q.queue_running?.length || 0, pending: q.queue_pending?.length || 0 }, checkpoints: ckpts, workflows: await workflows() }; }
    catch (e) { return { ok: false, url: base, error: e.message, workflows: await workflows() }; }
  }
  async function submit({ prompt, workflow = 'txt2img', ckpt, by }) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw Object.assign(new Error('prompt ต้องยาว 1–2,000 ตัว'), { status: 400 });
    let graph, kind;
    if (workflow === 'txt2img') { kind = 'image'; if (!ckpt) { const s = await status(); ckpt = s.checkpoints?.[0]; } if (!ckpt || !/^[\w .()\/\\-]{1,200}$/.test(ckpt)) throw Object.assign(new Error('ไม่พบ checkpoint ใน ComfyUI'), { status: 422 }); graph = txt2img({ prompt: prompt.trim(), ckpt }); }
    else if (workflow === VIDEO_WORKFLOW) { kind = 'video'; const f = videoFile(); if (!f) throw Object.assign(new Error('ไม่พบ workflow วิดีโอ (ตั้ง COMFYUI_WORKFLOW_DIR)'), { status: 404 }); graph = injectPrompt(JSON.parse(readFileSync(f, 'utf8')), prompt.trim()); }
    else throw Object.assign(new Error('unknown workflow'), { status: 400 });
    const { prompt_id } = await (await call('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: clientId }) })).json();
    const job = { id: prompt_id, prompt: prompt.trim().slice(0, 300), workflow, kind, by, at: new Date().toISOString(), state: 'queued', outputs: [] };
    save([job, ...jobs()]); return job;
  }
  async function submitProfileVideo({ prompt, reference, owner, by }) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1200) throw Object.assign(new Error('คำอธิบายวิดีโอต้องยาว 1–1,200 ตัว'), { status: 400 });
    if (!owner || !reference?.data || !['image/png', 'image/jpeg', 'image/webp'].includes(reference.mime)) throw Object.assign(new Error('ต้องมีรูปโปรไฟล์ PNG, JPG หรือ WebP'), { status: 400 });
    const f = videoFile();
    if (!f) throw Object.assign(new Error('ยังไม่ได้ตั้งค่า workflow วิดีโอส่วนตัว'), { status: 503 });
    let graph;
    try { graph = JSON.parse(readFileSync(f, 'utf8')); } catch { throw Object.assign(new Error('อ่าน workflow วิดีโอไม่สำเร็จ'), { status: 422 }); }
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw Object.assign(new Error('workflow วิดีโอไม่ใช่ API graph'), { status: 422 });
    const refNodes = Object.values(graph).filter(n => n?.class_type === 'LoadImage');
    if (!refNodes.length || !Object.values(graph).some(n => n?.class_type === 'MiniMaxH3ReferenceToVideo')) throw Object.assign(new Error('workflow นี้ต้องมี LoadImage และ MiniMax H3 Reference to Video'), { status: 422 });
    const form = new FormData();
    form.append('image', new Blob([reference.data], { type: reference.mime }), reference.name || 'PURE-profile-reference.png');
    const uploaded = await (await call('/upload/image', { method: 'POST', body: form })).json();
    if (typeof uploaded.name !== 'string' || !uploaded.name) throw Object.assign(new Error('ComfyUI รับรูปอ้างอิงไม่สำเร็จ'), { status: 502 });
    const refName = [uploaded.subfolder, uploaded.name].filter(Boolean).join('/');
    for (const n of refNodes) n.inputs.image = refName;
    graph = injectPrompt(graph, prompt.trim());
    const { prompt_id } = await (await call('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: clientId }) })).json();
    if (typeof prompt_id !== 'string' || !prompt_id) throw Object.assign(new Error('ComfyUI ไม่ได้คืนรหัสงาน'), { status: 502 });
    const job = { id: prompt_id, prompt: prompt.trim().slice(0, 300), workflow: VIDEO_WORKFLOW, kind: 'video', owner, by, at: new Date().toISOString(), state: 'queued', outputs: [], aiProfileVideo: true };
    save([job, ...jobs()]);
    return job;
  }
  async function poll(id) {
    const list = jobs(), job = list.find(j => j.id === id); if (!job) return null;
    if (job.state === 'done' || job.state === 'error') return job;
    const h = (await (await call('/history/' + encodeURIComponent(id))).json())[id];
    if (h) {
      const outs = []; for (const o of Object.values(h.outputs || {})) for (const f of [...(o.images || []), ...(o.gifs || []), ...(o.videos || [])]) if (MEDIA.test(f.filename)) outs.push({ filename: f.filename, subfolder: f.subfolder || '', type: f.type || 'output' });
      job.state = h.status?.status_str === 'error' ? 'error' : 'done'; job.outputs = outs;
    } else { const q = await (await call('/queue')).json(); const running = (q.queue_running || []).some(x => x[1] === id); const pos = (q.queue_pending || []).findIndex(x => x[1] === id); job.state = running ? 'running' : pos >= 0 ? 'queued' : job.state; job.position = pos >= 0 ? pos + 1 : 0; }
    save(list); return job;
  }
  async function file(id, i) {
    const job = jobs().find(j => j.id === id), o = job?.outputs?.[Number(i)]; if (!o) return null;
    const r = await call('/view?' + new URLSearchParams({ filename: o.filename, subfolder: o.subfolder, type: o.type }));
    return { name: basename(o.filename), type: r.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await r.arrayBuffer()) };
  }
  return { status, submit, submitProfileVideo, poll, file, jobs, workflows, base };
}

export function installComfy(app, { comfy, auth, adminOnly, limiter, db, dataDir }) {
  const fail = (res, e) => res.status(e.status >= 400 ? e.status : 500).json({ error: e.message });
  if (db && dataDir) {
    mkdirSync(join(dataDir, 'uploads'), { recursive: true });
    db.exec(`CREATE TABLE IF NOT EXISTS ai_video_jobs(job_id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,prompt TEXT NOT NULL,caption TEXT NOT NULL,client_id TEXT NOT NULL,created INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'queued',post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,UNIQUE(owner,client_id));
      CREATE INDEX IF NOT EXISTS ai_video_jobs_owner ON ai_video_jobs(owner,created DESC);`);
    const columns = db.prepare('PRAGMA table_info(ai_video_jobs)').all().map(c => c.name);
    if (!columns.includes('state')) db.exec("ALTER TABLE ai_video_jobs ADD COLUMN state TEXT NOT NULL DEFAULT 'queued'");
  }
  const one = db ? (s, ...a) => db.prepare(s).get(...a) : null;
  const all = db ? (s, ...a) => db.prepare(s).all(...a) : null;
  const run = db ? (s, ...a) => db.prepare(s).run(...a) : null;
  async function publishProfileVideo(jobId, owner) {
    const record = one('SELECT * FROM ai_video_jobs WHERE job_id=? AND owner=?', jobId, owner);
    if (!record) throw Object.assign(new Error('ไม่พบงานวิดีโอ'), { status: 404 });
    if (record.post_id) return { postId: record.post_id, published: true };
    const job = await comfy.poll(jobId);
    if (!job) throw Object.assign(new Error('ไม่พบงานใน ComfyUI'), { status: 404 });
    if (job.state !== 'done') {
      run('UPDATE ai_video_jobs SET state=? WHERE job_id=? AND owner=?', job.state, jobId, owner);
      return { published: false, job };
    }
    const index = (job.outputs || []).findIndex(o => /\.(mp4|webm)$/i.test(o.filename));
    if (index < 0) { run("UPDATE ai_video_jobs SET state='error' WHERE job_id=? AND owner=?", jobId, owner); throw Object.assign(new Error('workflow เสร็จแล้ว แต่ไม่พบไฟล์ MP4/WebM'), { status: 422 }); }
    const media = await comfy.file(jobId, index);
    const mime = media?.type?.split(';')[0];
    if (!media || !['video/mp4', 'video/webm'].includes(mime)) throw Object.assign(new Error('รูปแบบวิดีโอที่ได้ไม่รองรับ'), { status: 415 });
    if (media.body.length > 60 * 1024 * 1024) throw Object.assign(new Error('วิดีโอใหญ่เกิน 60 MB'), { status: 413 });
    const prior = one('SELECT id FROM posts WHERE owner=? AND client_id=?', owner, `ai-video-${jobId}`);
    if (prior) { run("UPDATE ai_video_jobs SET state='published',post_id=? WHERE job_id=? AND owner=?", prior.id, jobId, owner); return { postId: prior.id, published: true }; }
    const filename = `post-${randomUUID()}`;
    const path = join(dataDir, 'uploads', filename);
    writeFileSync(path, media.body, { flag: 'wx' });
    try {
      const text = `${record.caption || 'ช่วงเวลาเคลื่อนไหวของฉัน'}\n\nสร้างด้วย AI จากรูปโปรไฟล์`;
      const created = Date.now();
      const result = run("INSERT INTO posts(owner,text,kind,path,mime,size,created,client_id) VALUES(?,?,'reel',?,?,?,?,?)", owner, text, filename, mime, media.body.length, created, `ai-video-${jobId}`);
      const postId = Number(result.lastInsertRowid);
      run("UPDATE ai_video_jobs SET state='published',post_id=? WHERE job_id=? AND owner=?", postId, jobId, owner);
      return { postId, published: true };
    } catch (error) {
      try { const { unlinkSync } = await import('node:fs'); unlinkSync(path); } catch {}
      throw error;
    }
  }
  if (db && dataDir) {
    app.get('/api/profile/ai-video/status', auth, async (_req, res) => res.set('Cache-Control', 'no-store').json({
      ready: (await comfy.workflows()).some(w => w.id === VIDEO_WORKFLOW),
      avatar: !!one("SELECT 1 FROM profile_media WHERE owner=? AND kind='avatar'", _req.user.id),
      connected: (await comfy.status()).ok,
    }));
    app.post('/api/profile/ai-video', auth, limiter, async (req, res) => {
      try {
        const { prompt, caption = '', clientId, consent } = req.body || {};
        if (consent !== true) throw Object.assign(new Error('ยืนยันก่อนว่าคุณมีสิทธิ์ใช้รูปโปรไฟล์นี้สร้างวิดีโอ'), { status: 400 });
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1200 || typeof caption !== 'string' || caption.length > 1000 || typeof clientId !== 'string' || !/^[\w-]{8,80}$/.test(clientId)) throw Object.assign(new Error('กรอกคำอธิบาย 1–1,200 ตัว คำบรรยายไม่เกิน 1,000 ตัว และ clientId'), { status: 400 });
        const existing = one('SELECT job_id FROM ai_video_jobs WHERE owner=? AND client_id=?', req.user.id, clientId);
        if (existing) return res.json({ job: comfy.jobs().find(j => j.id === existing.job_id) || { id: existing.job_id }, duplicate: true });
        const active = all("SELECT job_id FROM ai_video_jobs WHERE owner=? AND state IN ('queued','running') AND created>? ORDER BY created DESC LIMIT 2", req.user.id, Date.now() - 24 * 60 * 60 * 1000);
        if (active.length >= 2) throw Object.assign(new Error('มีวิดีโอของคุณกำลังทำอยู่ 2 งาน รอให้เสร็จก่อน'), { status: 429 });
        const image = one("SELECT mime,data FROM profile_media WHERE owner=? AND kind='avatar'", req.user.id);
        if (!image) throw Object.assign(new Error('ตั้งรูปโปรไฟล์ก่อน แล้วจึงสร้างวิดีโอได้'), { status: 400 });
        const naturalPrompt = `Create a short, natural, lifelike portrait animation of the same consenting adult person in the reference image. Preserve their identity, facial features, age, clothing, and appearance. Use subtle breathing, natural blinking, a gentle head movement, and a relaxed expression. No speech, no dramatic transformation. Scene/action: ${prompt.trim()}`;
        const job = await comfy.submitProfileVideo({ prompt: naturalPrompt, reference: { mime: image.mime, data: Buffer.from(image.data), name: `PURE-${req.user.id}-avatar` }, owner: req.user.id, by: req.user.handle });
        run('INSERT INTO ai_video_jobs(job_id,owner,prompt,caption,client_id,created,state) VALUES(?,?,?,?,?,?,?)', job.id, req.user.id, prompt.trim(), caption.trim(), clientId, Date.now(), job.state);
        res.status(202).json({ job });
      } catch (e) { fail(res, e); }
    });
    app.get('/api/profile/ai-video/jobs', auth, (_req, res) => {
      const records = all('SELECT job_id,prompt,caption,created,post_id FROM ai_video_jobs WHERE owner=? ORDER BY created DESC LIMIT 20', _req.user.id);
      const mine = new Map(comfy.jobs().filter(j => j.owner === _req.user.id).map(j => [j.id, j]));
      res.set('Cache-Control', 'no-store').json({ items: records.map(r => ({ ...r, job: mine.get(r.job_id) || null })) });
    });
    app.get('/api/profile/ai-video/jobs/:id', auth, async (req, res) => {
      try {
        if (!one('SELECT 1 FROM ai_video_jobs WHERE job_id=? AND owner=?', req.params.id, req.user.id)) return res.sendStatus(404);
        const result = await publishProfileVideo(req.params.id, req.user.id);
        res.set('Cache-Control', 'no-store').json(result);
      } catch (e) { fail(res, e); }
    });
  }
  app.get('/api/admin/comfy/status', auth, adminOnly, async (_q, res) => res.set('Cache-Control', 'no-store').json(await comfy.status()));
  app.get('/api/admin/comfy/jobs', auth, adminOnly, (_q, res) => res.set('Cache-Control', 'no-store').json({ items: comfy.jobs() }));
  app.post('/api/admin/comfy/generate', auth, adminOnly, limiter, async (req, res) => { try { res.json(await comfy.submit({ ...req.body, by: req.user.handle })); } catch (e) { fail(res, e); } });
  app.get('/api/admin/comfy/jobs/:id', auth, adminOnly, async (req, res) => { try { const j = await comfy.poll(req.params.id); j ? res.set('Cache-Control', 'no-store').json(j) : res.status(404).json({ error: 'not found' }); } catch (e) { fail(res, e); } });
  app.get('/api/admin/comfy/jobs/:id/file/:i', auth, adminOnly, async (req, res) => { try { const f = await comfy.file(req.params.id, req.params.i); if (!f) return res.status(404).json({ error: 'not found' }); res.set({ 'Content-Type': f.type, 'Cache-Control': 'private, max-age=3600', ...(req.query.dl ? { 'Content-Disposition': `attachment; filename="${f.name.replace(/[^\w.-]/g, '_')}"` } : {}) }).send(f.body); } catch (e) { fail(res, e); } });
}

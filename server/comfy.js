// Admin-only ComfyUI Studio: images + videos rendered by the owner's local ComfyUI (HTTP API).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
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
  const pos = nodes.find(n => !/neg/i.test(n._meta?.title || '')) || nodes[0];
  if (!pos) throw Object.assign(new Error('workflow has no text prompt node'), { status: 422 });
  pos.inputs.text = prompt;
  for (const n of Object.values(g)) if (n?.inputs && 'seed' in n.inputs && typeof n.inputs.seed === 'number') n.inputs.seed = Math.floor(Math.random() * 2 ** 31);
  return g;
}

export function createComfy({ url = process.env.COMFYUI_URL || 'http://127.0.0.1:8188', workflowDir = process.env.COMFYUI_WORKFLOW_DIR, dataDir, fetcher = fetch } = {}) {
  const base = url.replace(/\/+$/, ''), jobsFile = join(dataDir, 'comfy-studio.json'), clientId = randomUUID();
  const jobs = () => { try { return JSON.parse(readFileSync(jobsFile, 'utf8')); } catch { return []; } };
  const save = list => writeFileSync(jobsFile, JSON.stringify(list.slice(0, 60)));
  const call = async (path, init) => { let r; try { r = await fetcher(base + path, { ...init, signal: AbortSignal.timeout(15000) }); } catch { throw Object.assign(new Error('ComfyUI ไม่ตอบสนองที่ ' + base), { status: 503 }); } if (!r.ok) throw Object.assign(new Error('ComfyUI HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200)), { status: 502 }); return r; };
  const videoFile = () => { if (!workflowDir || !existsSync(workflowDir)) return null; const f = readdirSync(workflowDir).find(x => x.startsWith(VIDEO_WORKFLOW) && x.endsWith('.json')); return f ? join(workflowDir, f) : null; };
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
  return { status, submit, poll, file, jobs, workflows, base };
}

export function installComfy(app, { comfy, auth, adminOnly, limiter }) {
  const fail = (res, e) => res.status(e.status >= 400 ? e.status : 500).json({ error: e.message });
  app.get('/api/admin/comfy/status', auth, adminOnly, async (_q, res) => res.set('Cache-Control', 'no-store').json(await comfy.status()));
  app.get('/api/admin/comfy/jobs', auth, adminOnly, (_q, res) => res.set('Cache-Control', 'no-store').json({ items: comfy.jobs() }));
  app.post('/api/admin/comfy/generate', auth, adminOnly, limiter, async (req, res) => { try { res.json(await comfy.submit({ ...req.body, by: req.user.handle })); } catch (e) { fail(res, e); } });
  app.get('/api/admin/comfy/jobs/:id', auth, adminOnly, async (req, res) => { try { const j = await comfy.poll(req.params.id); j ? res.set('Cache-Control', 'no-store').json(j) : res.status(404).json({ error: 'not found' }); } catch (e) { fail(res, e); } });
  app.get('/api/admin/comfy/jobs/:id/file/:i', auth, adminOnly, async (req, res) => { try { const f = await comfy.file(req.params.id, req.params.i); if (!f) return res.status(404).json({ error: 'not found' }); res.set({ 'Content-Type': f.type, 'Cache-Control': 'private, max-age=3600', ...(req.query.dl ? { 'Content-Disposition': `attachment; filename="${f.name.replace(/[^\w.-]/g, '_')}"` } : {}) }).send(f.body); } catch (e) { fail(res, e); } });
}

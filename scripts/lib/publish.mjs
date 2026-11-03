// Publish discovery/update JSON. Writes locally (data/ and public/) and, if PURE_PAGES_TOKEN is set,
// commits the file to the GitHub Pages repo (default purefxaidev/purecall-web) via the contents API.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const PAGES_REPO = process.env.PURE_PAGES_REPO || 'purefxaidev/purecall-web';
export const PAGES_BRANCH = process.env.PURE_PAGES_BRANCH || 'main';

export function serverJson(url, extra = {}) {
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(String(url).trim())) throw new Error('server url must be https://host');
  return { url: String(url).trim().replace(/\/$/, ''), updatedAt: new Date().toISOString(), ...extra };
}

export function writeLocal(root, name, obj) {
  const body = JSON.stringify(obj, null, 2) + '\n';
  for (const d of [join(root, 'data'), join(root, 'public')]) { mkdirSync(d, { recursive: true }); writeFileSync(join(d, name), body); }
  return body;
}

export async function publishToPages(path, body, { token = process.env.PURE_PAGES_TOKEN, repo = PAGES_REPO, branch = PAGES_BRANCH, fetcher = fetch, message } = {}) {
  if (!token) return { published: false, reason: 'PURE_PAGES_TOKEN not set' };
  const api = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'pure-publisher', 'x-github-api-version': '2022-11-28' };
  let sha;
  const cur = await fetcher(`${api}?ref=${branch}`, { headers });
  if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw new Error(`GitHub GET ${cur.status}`);
  const put = await fetcher(api, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ message: message || `update ${path}`, content: Buffer.from(body).toString('base64'), branch, ...(sha ? { sha } : {}) }) });
  if (!put.ok) throw new Error(`GitHub PUT ${put.status}: ${(await put.text()).slice(0, 200)}`);
  return { published: true, repo, path };
}

export function manualInstructions(name, root) {
  return `ยังไม่ได้ตั้ง PURE_PAGES_TOKEN จึงยังไม่ได้อัปโหลดอัตโนมัติ\n  ไฟล์อยู่ที่ ${join(root, 'data', name)}\n  อัปโหลดเองไปที่ repo ${PAGES_REPO} (branch ${PAGES_BRANCH}) ให้เปิดได้ที่ https://call.purefxai.store/${name}\n  หรือตั้งค่า: set PURE_PAGES_TOKEN=<fine-grained token: Contents read/write เฉพาะ repo นี้>`;
}

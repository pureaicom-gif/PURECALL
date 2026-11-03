// PURE v0.9 — shared update / server-discovery logic (browser + Node, no deps).
export const DEFAULT_MANIFEST_URL = 'https://call.purefxai.store/version.json';
export const PRIMARY_SERVER_ORIGIN = 'https://api.purefxai.store';
export const DEFAULT_SERVER_JSON_URL = 'https://call.purefxai.store/server.json';
export const GITHUB_RELEASE_API = 'https://api.github.com/repos/purefxaidev/purecall-web/releases/latest';
const HEX64 = /^[0-9a-f]{64}$/;

/** Compare dotted versions ("0.9.0" vs "0.10"). Returns -1, 0, 1. Non-numeric parts count as 0; "-beta" suffixes are lower than release. */
export function compareVersion(a, b) {
  const split = v => { const [core, pre] = String(v ?? '').trim().replace(/^v/i, '').split('-', 2); return { nums: core.split('.').map(n => Number.parseInt(n, 10) || 0), pre: pre || '' }; };
  const x = split(a), y = split(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0); if (d) return d > 0 ? 1 : -1;
  }
  if (x.pre === y.pre) return 0; if (!x.pre) return 1; if (!y.pre) return -1;
  return x.pre > y.pre ? 1 : -1;
}

const int = v => (Number.isSafeInteger(Number(v)) && Number(v) >= 0 && String(v).trim() !== '' ? Number(v) : null);
const httpsUrl = (v, base) => { try { const u = new URL(String(v), base); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };

/** Validate a version.json manifest. Throws on invalid input; returns a normalized object. */
export function parseManifest(input, base) {
  const m = typeof input === 'string' ? JSON.parse(input) : input;
  if (!m || typeof m !== 'object') throw new Error('manifest: not an object');
  const versionCode = int(m.versionCode); if (versionCode === null) throw new Error('manifest: versionCode');
  const versionName = String(m.versionName ?? '').trim(); if (!/^\d+(\.\d+){0,3}(-[\w.]+)?$/.test(versionName)) throw new Error('manifest: versionName');
  const apkUrl = httpsUrl(m.apkUrl, base); if (!apkUrl) throw new Error('manifest: apkUrl must be https');
  const sha256 = String(m.sha256 ?? '').trim().toLowerCase(); if (!HEX64.test(sha256)) throw new Error('manifest: sha256');
  const min = m.minSupportedVersionCode == null ? 0 : int(m.minSupportedVersionCode); if (min === null || min > versionCode) throw new Error('manifest: minSupportedVersionCode');
  const cl = m.changelog && typeof m.changelog === 'object' ? m.changelog : { th: m.changelog, en: m.changelog };
  const text = v => (Array.isArray(v) ? v.join('\n') : String(v ?? '')).slice(0, 4000);
  return { versionCode, versionName, apkUrl, sha256, minSupportedVersionCode: min, changelog: { th: text(cl.th || cl.en), en: text(cl.en || cl.th) }, publishedAt: m.publishedAt ? String(m.publishedAt) : null };
}

/** Decide what to do for the installed build. */
export function evaluateUpdate(manifest, currentVersionCode) {
  const cur = int(currentVersionCode) ?? 0;
  if (cur < manifest.minSupportedVersionCode) return 'force';
  if (manifest.versionCode > cur) return 'optional';
  return 'none';
}

/** GitHub Releases fallback: tag vX.Y.Z, an .apk asset, and either an "<apk>.sha256" asset value (passed in) or a "sha256: <hex>" / "versionCode: N" / "minSupportedVersionCode: N" line in the body. */
export function manifestFromGithubRelease(rel, shaText) {
  if (!rel || rel.draft || rel.prerelease) throw new Error('release: none');
  const body = String(rel.body || '');
  const field = k => (body.match(new RegExp(`^\\s*${k}\\s*[:=]\\s*(\\S+)`, 'im')) || [])[1];
  const apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name || ''));
  if (!apk) throw new Error('release: no apk asset');
  const sha = (String(shaText || '').match(/[0-9a-f]{64}/i) || [])[0] || field('sha256');
  const [th, en] = body.split(/^\s*-{3,}\s*$/m);
  return parseManifest({ versionCode: field('versionCode'), versionName: String(rel.tag_name || '').replace(/^v/i, ''), apkUrl: apk.browser_download_url, sha256: sha,
    minSupportedVersionCode: field('minSupportedVersionCode') ?? 0, changelog: { th: strip(th), en: strip(en ?? th) }, publishedAt: rel.published_at });
}
const strip = s => String(s || '').split('\n').filter(l => !/^\s*(sha256|versionCode|minSupportedVersionCode)\s*[:=]/i.test(l)).join('\n').trim();

/** server.json: {"url":"https://...","updatedAt":"ISO"} — url must be https origin. */
export function parseServerJson(input) {
  const j = typeof input === 'string' ? JSON.parse(input) : input;
  const u = httpsUrl(j?.url); if (!u) throw new Error('server.json: url must be https');
  const origin = new URL(u).origin;
  const t = j.updatedAt ? Date.parse(j.updatedAt) : NaN;
  return { url: origin, updatedAt: Number.isFinite(t) ? new Date(t).toISOString() : null };
}

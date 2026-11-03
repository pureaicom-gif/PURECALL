#!/usr/bin/env node
// Build the Android APK, compute sha256, write version.json (data/ + public/ + dist/) and optionally publish to Pages.
// Usage: node scripts/publish-release.mjs [--release] [--skip-build] [--apk-url URL] [--min CODE] [--th "..."] [--en "..."]
// Release signing: PURE_KEYSTORE, PURE_KEYSTORE_PASSWORD, PURE_KEY_ALIAS, PURE_KEY_PASSWORD (env/CI secrets only, never commit).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeLocal, publishToPages, manualInstructions } from './lib/publish.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = n => args.includes(n), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)[1]), versionName = gradle.match(/versionName\s+['"]([^'"]+)['"]/)[1];
const release = flag('--release');
if (release && !process.env.PURE_KEYSTORE) { console.error('--release needs PURE_KEYSTORE* env vars (see docs/UPDATE-0.9.md)'); process.exit(2); }
if (!flag('--skip-build')) {
  const win = process.platform === 'win32';
  execFileSync(win ? 'gradlew.bat' : 'sh', win ? [release ? 'assembleRelease' : 'assembleDebug'] : ['./gradlew', release ? 'assembleRelease' : 'assembleDebug'], { cwd: join(root, 'android'), stdio: 'inherit', shell: win });
}
const kind = release ? 'release' : 'debug';
const src = join(root, `android/app/build/outputs/apk/${kind}/app-${kind}.apk`);
if (!existsSync(src)) { console.error('APK not found: ' + src); process.exit(1); }
const name = `PURE-${versionName}-${kind}.apk`;
for (const d of ['dist', 'public/downloads']) { mkdirSync(join(root, d), { recursive: true }); copyFileSync(src, join(root, d, name)); }
const sha256 = createHash('sha256').update(readFileSync(src)).digest('hex');
const manifest = {
  versionCode, versionName, sha256,
  apkUrl: opt('--apk-url', `https://github.com/purefxaidev/purecall-web/releases/download/v${versionName}/${name}`),
  minSupportedVersionCode: Number(opt('--min', 1)),
  changelog: { th: opt('--th', `PURE ${versionName}`), en: opt('--en', `PURE ${versionName}`) },
  publishedAt: new Date().toISOString(),
};
const body = writeLocal(root, 'version.json', manifest);
console.log(`APK ${name}\nsha256 ${sha256}\nversion.json written to data/ and public/`);
console.log('Upload the APK to the apkUrl location (GitHub Release asset) BEFORE publishing version.json.');
if (flag('--publish')) {
  const r = await publishToPages('version.json', body, { message: `release ${versionName}` });
  console.log(r.published ? `published version.json to ${r.repo}` : manualInstructions('version.json', root));
}

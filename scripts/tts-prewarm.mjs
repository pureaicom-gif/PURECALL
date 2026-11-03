#!/usr/bin/env node
// Pre-render common PURE phrases with Drama3 into <DATA_DIR>/tts-cache (same keys the server uses). Prints per-phrase timings.
// Usage: DATA_DIR=./data node scripts/tts-prewarm.mjs ["extra phrase" ...]
import { resolve } from 'node:path';
import { createTts, COMMON_PHRASES, splitSentences } from '../server/tts.js';
const tts = createTts({ dataDir: resolve(process.env.DATA_DIR || 'data') });
if (!(await tts.health())) { console.error('Drama3 offline (' + (process.env.DRAMA3_URL || 'http://127.0.0.1:7860') + ')'); process.exit(1); }
const list = [...new Set([...COMMON_PHRASES, ...process.argv.slice(2)].flatMap(t => splitSentences(t)))];
let total = 0;
for (const t of list) { const t0 = Date.now(); try { const r = await tts.speak(t); const ms = Date.now() - t0; total += ms; console.log(JSON.stringify({ text: t, cached: r.cached, audioSec: +((r.audio.length - 44) / 88200).toFixed(2), ms })); } catch (e) { console.log(JSON.stringify({ text: t, error: e.message })); } }
console.log(`done ${list.length} phrases in ${Math.round(total / 1000)}s`);

// Shared (browser + server) sentence splitter so cache keys match per sentence.
export function splitSentences(text, max = 120) {
  const t = String(text || '').replace(/\s+/g, ' ').trim(); if (!t) return [];
  const parts = t.split(/(?<=[.!?。！？…]|(?:ค่ะ|คะ|ครับ|นะคะ|นะครับ|จ้ะ|จ้า)(?=\s))\s+/u).map(x => x.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) { if (p.length <= max) { out.push(p); continue; } let cur = ''; for (const w of p.split(' ')) { if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) out.push(cur.slice(0, max)); }
  return out;
}

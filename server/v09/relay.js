// Store-and-forward relay for E2E messages carried by PURE helper phones.
// Each user gets a per-user relay key K_u = HMAC(serverSecret, 'relay:v1:'+userId) (fetched while online).
// The sender seals {from,to,clientId,ts,text} with HMAC(K_u, ...). Helpers only hold opaque e2e1 ciphertext
// + MAC, so they can neither read nor forge/redirect messages. The server re-derives K_u to verify.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RELAY_MAX_AGE_MS = 7 * 86400000, RELAY_MAX_BATCH = 50;

export function loadRelaySecret(dataDir) {
  const f = join(dataDir, 'relay.key');
  if (existsSync(f)) return Buffer.from(readFileSync(f, 'utf8').trim(), 'hex');
  const s = randomBytes(32); writeFileSync(f, s.toString('hex'), { mode: 0o600 }); return s;
}
export const relayKey = (secret, userId) => createHmac('sha256', secret).update('relay:v1:' + userId).digest('base64url');
export const envelopeBase = e => ['pure-relay-v1', e.from, e.to, e.clientId, String(e.ts), e.text].join('\n');
export const sealEnvelope = (key, e) => ({ ...e, mac: createHmac('sha256', Buffer.from(key, 'base64url')).update(envelopeBase(e)).digest('base64url') });

/** Returns null if valid, otherwise an error code. */
export function checkEnvelope(secret, e, { now = Date.now(), e2eRe } = {}) {
  if (!e || typeof e !== 'object') return 'bad';
  for (const k of ['from', 'to', 'clientId', 'text', 'mac']) if (typeof e[k] !== 'string' || !e[k]) return 'bad';
  if (e.clientId.length > 80 || e.from.length > 80 || e.to.length > 80 || e.from === e.to) return 'bad';
  if (!Number.isSafeInteger(e.ts) || e.ts > now + 300000 || now - e.ts > RELAY_MAX_AGE_MS) return 'expired';
  if (e2eRe && !e2eRe.test(e.text)) return 'not-e2e';
  const want = Buffer.from(sealEnvelope(relayKey(secret, e.from), e).mac), got = Buffer.from(e.mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'bad-mac';
  return null;
}

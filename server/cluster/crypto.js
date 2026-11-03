// PURE Node cluster — signing primitives (Ed25519 via node:crypto) and HMAC for node-to-node requests.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, createHmac, timingSafeEqual } from 'node:crypto';

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export function newKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') };
}
const priv = b64 => createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
const pub = b64 => createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
/** Returns {...payload, sig} signed over canonical(payload). */
export function signObject(payload, privateKey) {
  const { sig: _drop, ...body } = payload;
  return { ...body, sig: sign(null, Buffer.from(canonical(body)), priv(privateKey)).toString('base64') };
}
export function verifyObject(obj, publicKey) {
  if (!obj || typeof obj.sig !== 'string') return false;
  const { sig, ...body } = obj;
  try { return verify(null, Buffer.from(canonical(body)), pub(publicKey), Buffer.from(sig, 'base64')); } catch { return false; }
}
export function hmac(secret, ...parts) { return createHmac('sha256', String(secret)).update(parts.join('\n')).digest('hex'); }
export function hmacOk(secret, mac, ...parts) {
  const want = Buffer.from(hmac(secret, ...parts), 'hex'); let got; try { got = Buffer.from(String(mac || ''), 'hex'); } catch { return false; }
  return got.length === want.length && timingSafeEqual(got, want);
}

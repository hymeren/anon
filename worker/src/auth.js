// Admin sessions and authenticator (TOTP) codes.
const enc = new TextEncoder();
export function same(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function mac(key, msg, algo = 'SHA-256') {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: algo }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof msg === 'string' ? enc.encode(msg) : msg));
}
const b64 = u => btoa(String.fromCharCode(...u)).replace(/[+/=]/g, '').slice(0, 22);
export async function adminSign(env, exp) { return exp + '.' + b64(await mac(env.TOKEN_SECRET, 'adm:' + exp)); }
export async function adminVerify(env, tok) {   // a session token is "expiry.signature" and lasts one hour
  if (typeof tok !== 'string' || tok.length > 60) return false;
  const exp = tok.split('.')[0];
  return /^\d{13}$/.test(exp) && +exp > Date.now() && same(tok, await adminSign(env, exp));
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function unb32(s) {
  let bits = ''; for (const c of s.toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(out);
}
export async function totp(secret, step) {
  const buf = new ArrayBuffer(8); new DataView(buf).setUint32(4, step);
  const h = await mac(unb32(secret), new Uint8Array(buf), 'SHA-1'), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
export async function totpOk(secret, code) {   // accepts the previous, current and next 30 second code
  const t = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) if (same(await totp(secret, t + d), String(code).trim())) return true;
  return false;
}

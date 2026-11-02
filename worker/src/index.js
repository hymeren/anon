import { Room } from './room.js';
import { Directory } from './directory.js';
import { same, adminSign, adminVerify, totpOk } from './auth.js';
export { Room, Directory };

const enc = new TextEncoder();
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

// Accept the socket just long enough to tell the page why it is being turned away.
function refuse(type, text, until) {
  const pair = new WebSocketPair();
  pair[1].accept(); pair[1].send(JSON.stringify({ type, text, until })); pair[1].close(4003, type);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), origin = req.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin);
    const dir = env.DIR.get(env.DIR.idFromName('dir'));

    // admin: sign in with the key plus an authenticator code, then use the one hour session token
    if (u.pathname === '/admin' || u.pathname === '/admin/login') {
      const cors = { 'Access-Control-Allow-Origin': allowed ? origin : 'null', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' };
      const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, 'Content-Type': 'application/json' } });
      if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
      if (!allowed || req.method !== 'POST') return json({ error: 'no' }, 401);
      let body = {}; try { body = await req.json(); } catch (e) {}
      if (u.pathname === '/admin/login') {
        if (!env.ADMIN_KEY) return json({ error: 'Admin is not set up.' }, 404);
        const ip = hex((await hmac(env.TOKEN_SECRET, 'ip:' + (req.headers.get('CF-Connecting-IP') || ''))).slice(0, 8));
        const note = o => dir.fetch('https://dir/auth', { method: 'POST', body: JSON.stringify(o) });
        if ((await (await note({ ip })).json()).locked) return json({ error: 'Too many wrong tries. Please wait 15 minutes.' }, 429);
        const good = same(body.key || '', env.ADMIN_KEY) && (!env.ADMIN_TOTP || await totpOk(env.ADMIN_TOTP, body.code || ''));
        await note({ ip, ok: good });
        if (!good) return json({ error: 'Wrong key or code.' }, 401);
        const exp = Date.now() + 36e5;
        return json({ token: await adminSign(env, exp), exp, twoFactor: !!env.ADMIN_TOTP });
      }
      if (!(await adminVerify(env, (req.headers.get('Authorization') || '').replace('Bearer ', '')))) return json({ error: 'Session expired. Please sign in again.' }, 401);
      const r = await dir.fetch('https://dir/admin', { method: 'POST', body: JSON.stringify(body) });
      return new Response(await r.text(), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (u.pathname !== '/ws') return new Response('OAC chat server');
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    if (!allowed) return new Response('Forbidden', { status: 403 });

    // bot check (skipped until the TURNSTILE_SECRET secret exists)
    const realIp = req.headers.get('CF-Connecting-IP') || '';
    if (env.TURNSTILE_SECRET) {
      let pass = false;
      try {
        const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: u.searchParams.get('t') || '', remoteip: realIp }) });
        pass = !!(await r.json()).success;
      } catch (e) {}
      if (!pass) return refuse('error', 'We could not check that you are human. Please refresh the page and try again.');
    }

    // we never keep the real address. A keyed hash is enough to remember repeat spammers.
    const ip = hex((await hmac(env.TOKEN_SECRET, 'ip:' + realIp)).slice(0, 8));
    let want = u.searchParams.get('room') || 'main';
    if (!/^[a-z0-9 ]{1,20}$/.test(want)) want = 'main';
    const a = await (await dir.fetch('https://dir/assign?room=' + encodeURIComponent(want) + '&ip=' + ip)).json();
    if (a.paused) return refuse('paused', a.text);
    if (a.banned) return refuse('banned', 'You were timed out for spamming.', a.until);

    const headers = new Headers(req.headers); headers.set('X-Room', a.room); headers.set('X-Ip', ip);
    return env.ROOM.get(env.ROOM.idFromName(a.room)).fetch(new Request(req, { headers }));
  },
};

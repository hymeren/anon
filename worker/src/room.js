import { DurableObject } from 'cloudflare:workers';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { adminVerify } from './auth.js';

const AD = 'lazy fuzzy quiet brave sleepy sunny wild tiny jolly misty cosmic happy grumpy silver mellow snappy cheeky dusty mighty gentle fluffy clever sneaky bouncy golden crimson frosty breezy rusty velvet lucky witty dizzy zesty cozy nimble plucky shiny stormy lunar amber ivory mossy swift merry bold calm eager fancy humble jazzy kind lively noble proud quirky rapid salty tender upbeat vivid wacky zippy sparkly twilight electric dreamy feisty gloomy hasty icy'.split(' ');
const AN = 'turtle fox dog sparrow panda otter owl moth newt llama heron badger gecko yak lynx finch crab koala bat hare wolf bison camel cobra crane dingo eagle ferret goat hawk ibis jackal kiwi lemur mole moose narwhal ocelot parrot quail raven seal tiger vole walrus wombat zebra robin puffin pika beaver cricket dolphin falcon gopher hedgehog jaguar koi lobster magpie orca penguin rabbit salmon toucan viper weasel yeti'.split(' ');
const TH = 'lantern waffle comet pickle teapot nebula drizzle marble biscuit button canyon compass cactus clover donut ember feather glacier harbor igloo jigsaw kettle lagoon meadow noodle orbit pebble quill rocket saucer thistle umbrella whistle yodel zephyr anchor balloon candle dumpling eclipse fiddle gadget hammock island jellybean kite lemonade mango nutmeg oasis pancake quartz ribbon sundial tulip unicorn vortex willow xylophone yarn zeppelin'.split(' ');
const pick = a => a[Math.floor(Math.random() * a.length)];
// several name shapes and lengths so names are easy to tell apart
function gen() {
  const p = Math.floor(Math.random() * 10), n = k => Math.floor(Math.random() * k);
  if (p < 4) return pick(AD) + pick(AN) + String(n(100)).padStart(2, '0');
  if (p < 6) return pick(AN) + pick(TH) + n(1000);
  if (p < 8) return pick(AD) + pick(TH) + n(10);
  if (p < 9) return pick(TH) + pick(AN) + n(100);
  return pick(AD) + pick(AN) + n(10000);
}
const HIST = 200, DAY = 864e5, IDLE = 30 * 60e3, LIM = 300, SAVE = 10000;
const EMO = 'hi lol cry love cool think confused angry sleep shock smug wink blush facepalm shrug please clap thumbsup coffee flower pizza music idea party gaming reading umbrella bye dance yes nope sock'.split(' ');
const rnd = n => Math.floor(Math.random() * n);
const enc = new TextEncoder();

// same cleaning as the page. The page can be bypassed, so the server repeats it.
const clean = t => t.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u0000-\u0008\u000B-\u001F]/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().split('\n').slice(0, 10).join('\n').slice(0, LIM);
const prof = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const ADMIN_COLOR = '#f6f1e7';   // a paper white nobody else can pick
const SOFT = ['ren', 'mod', 'bot', 'oac', 'you', 'me', 'all', 'anon', 'anonymous', 'null', 'undefined', 'everyone', 'here'];
const HARD = ['admin', 'moderator', 'siren', 'staff', 'system', 'owner', 'support', 'official', 'server', 'announce'];
const leet = n => n.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
function nameProblem(n) {   // '' means fine
  if (!/^[A-Za-z][A-Za-z0-9]{4,15}$/.test(n)) return 'Use 5 to 16 letters or numbers, starting with a letter.';   // 3 and 4 letter names belong to the admin
  const x = leet(n), bases = [n.toLowerCase().replace(/[0-9]+$/, ''), x.replace(/[0-9]+$/, '')];
  if (bases.some(b => SOFT.includes(b)) || HARD.some(w => x.includes(w))) return 'That name is reserved.';
  if (prof.hasMatch(n) || prof.hasMatch(x)) return 'Please pick a different name.';
  return '';
}
function fixColor(h) {   // keep custom colors readable on the dark background
  if (!/^#[0-9a-fA-F]{6}$/.test(h || '')) return '';
  const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255), mx = Math.max(...v), mn = Math.min(...v), d = mx - mn;
  let l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), hue = 0;
  if (d) hue = mx === v[0] ? ((v[1] - v[2]) / d + 6) % 6 : mx === v[1] ? (v[2] - v[0]) / d + 2 : (v[0] - v[1]) / d + 4;
  if (s < .12) return '';   // no whites or greys: white belongs to the admin
  l = Math.min(.78, Math.max(.6, l)); s = Math.min(s, .85);
  const f = n => { const k = (n + hue * 2) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}
const snip = t => { t = t.replace(/\|\|.+?\|\|/g, '[spoiler]').replace(/\s+/g, ' ').replace(/\*+|~~|__|\|\|/g, '').trim(); return t.length > 80 ? t.slice(0, 80) + '…' : t; };

async function mac(env, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(env.TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg))))).replace(/[+/=]/g, '').slice(0, 22);
}
const sign = async (env, name) => name + '.' + await mac(env, name);                                  // random names:  name.signature
const signCustom = async (env, name, oid) => name + '.' + oid + '.' + await mac(env, name + '.' + oid);   // chosen names:  name.owner.signature
async function verify(env, tok) {
  if (typeof tok !== 'string' || tok.length > 80) return null;
  const p = tok.split('.');
  if (p.length === 2) return /^[a-z]{3,24}\d{1,4}$/.test(p[0]) && (await sign(env, p[0])) === tok ? { name: p[0] } : null;
  if (p.length === 3 && /^[A-Za-z][A-Za-z0-9]{2,15}$/.test(p[0]) && /^[a-z0-9]{10,16}$/.test(p[1])) return (await signCustom(env, p[0], p[1])) === tok ? { name: p[0], oid: p[1] } : null;
  return null;
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.hist = []; this.room = 'main'; this.dirty = false; this.lastPut = 0;
    ctx.blockConcurrencyWhile(async () => { this.hist = (await ctx.storage.get('h')) || []; this.room = (await ctx.storage.get('r')) || 'main'; });
  }
  live(except) { return this.ctx.getWebSockets().filter(w => w !== except && w.readyState === 1); }
  cast(o) { const s = JSON.stringify(o); for (const w of this.ctx.getWebSockets()) { try { w.send(s); } catch (e) {} } }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/ping') {   // sent by the Directory: deliver a mention or reply to people who are in this channel
      const b = await req.json(), found = [], names = new Set((b.names || []).map(x => String(x).toLowerCase()));
      for (const w of this.live()) {
        const n = (w.deserializeAttachment() || {}).name || '';
        if (names.has(n.toLowerCase())) { found.push(n); try { w.send(JSON.stringify({ type: 'ping', room: String(b.room || '').slice(0, 20), from: String(b.from || '').slice(0, 24), text: String(b.text || '').slice(0, 100), id: String(b.id || '').slice(0, 20) })); } catch (e) {} }
      }
      return Response.json({ found });
    }
    if (u.pathname === '/clear') {   // admin: wipe saved messages and empty everyone's window
      this.hist = []; await this.ctx.storage.put('h', []); this.cast({ type: 'clear' }); return new Response('ok');
    }
    if (u.pathname === '/pause') {   // admin kill switch, sent by the Directory
      this.cast({ type: 'paused', text: await req.text() });
      for (const w of this.ctx.getWebSockets()) { try { w.close(4003, 'paused'); } catch (e) {} }
      return new Response('ok');
    }
    const room = req.headers.get('X-Room') || 'main', ip = req.headers.get('X-Ip') || '';
    if (ip && this.live().filter(w => (w.deserializeAttachment() || {}).ip === ip).length >= 5) return new Response('Too many connections', { status: 429 });
    if (room !== this.room) { this.room = room; await this.ctx.storage.put('r', room); }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ ip });
    this.ctx.waitUntil(this.report());
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async report(except) {
    const n = this.live(except).length;
    try {
      const x = await this.env.DIR.get(this.env.DIR.idFromName('dir')).fetch('https://dir/update', { method: 'POST', body: JSON.stringify({ room: this.room, n }) });
      this.lastList = (await x.json()).list;
    } catch (e) {}
    this.lastN = n; this.flush();
  }
  flush() {   // the channel list and head count go out at most once every 2 seconds, so a burst of joins is not a storm of broadcasts
    const now = Date.now(), send = () => {
      this.castAt = Date.now(); this.pend = false;
      if (this.lastList) this.cast({ type: 'rooms', list: this.lastList });
      this.cast({ type: 'online', count: this.lastN });
    };
    if (now - (this.castAt || 0) >= 2000) send();
    else if (!this.pend) { this.pend = true; setTimeout(send, 2000 - (now - this.castAt)); }
  }

  async notify(a, msg, ws) {   // mentions and replies for people who are in another channel
    const want = new Set(), re = /(^|[^A-Za-z0-9@])@([A-Za-z0-9]{3,24})(?![A-Za-z0-9])/g; let m, k = 0;
    while (k < 3 && (m = re.exec(msg.text))) { want.add(m[2].toLowerCase()); k++; }
    if (msg.reply && msg.reply.name) want.add(String(msg.reply.name).toLowerCase());
    want.delete(String(a.name).toLowerCase()); want.delete('siren');
    if (!want.size) return;
    const here = new Set(this.ctx.getWebSockets().map(w => ((w.deserializeAttachment() || {}).name || '').toLowerCase()));
    const away = [...want].filter(n => !here.has(n));
    if (!away.length) return;
    const cur = ws.deserializeAttachment() || {}, now = Date.now();
    if (now - (cur.rl || 0) < 2000) return;   // at most one cross-channel lookup every 2 seconds per person
    cur.rl = now; ws.serializeAttachment(cur);
    const res = await this.dir('/relay', { from: a.name, room: this.room, names: away, id: msg.id, text: snip(msg.text) });
    const found = new Set((res.found || []).map(x => String(x).toLowerCase())), gone = away.filter(n => !found.has(n));
    if (gone.length) { try { ws.send(JSON.stringify({ type: 'msg', id: 's' + now.toString(36), name: 'Siren', mod: true, ts: now,
      text: gone.map(n => '@' + n).join(', ') + (gone.length > 1 ? ' are' : ' is') + ' not online right now, so they will not see this.' })); } catch (e) {} }
  }
  async dir(path, body) {
    try { const x = await this.env.DIR.get(this.env.DIR.idFromName('dir')).fetch('https://dir' + path, { method: 'POST', body: JSON.stringify(body) }); return await x.json(); }
    catch (e) { return {}; }
  }
  async strike(ip) {
    try { const r = await this.env.DIR.get(this.env.DIR.idFromName('dir')).fetch('https://dir/strike', { method: 'POST', body: JSON.stringify({ ip }) }); return (await r.json()).until; }
    catch (e) { return Date.now() + 5 * 60e3; }
  }
  async punish(ip, text) {   // strike this address, then tell and disconnect all of its open sockets in this room
    const until = await this.strike(ip);
    for (const w of this.live()) if ((w.deserializeAttachment() || {}).ip === ip) { try { w.send(JSON.stringify({ type: 'banned', text, until })); w.close(4003, 'banned'); } catch (e) {} }
  }
  mod(name, last) {
    this.cast({ type: 'msg', id: 'm' + Date.now().toString(36) + rnd(1e4).toString(36), name: 'Siren', mod: true, ts: Date.now(),
      text: name + ', please stop spamming. Keep it up and you will be removed from the chat.',
      reply: last ? { id: last.id, name, snippet: snip(last.text) } : undefined });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 1500) return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const a = ws.deserializeAttachment() || {};

    if (m.type === 'join' && !a.name) {
      const taken = new Set(this.ctx.getWebSockets().map(w => ((w.deserializeAttachment() || {}).name || '').toLowerCase()));
      let name = '', oid = '', adm = false, note = '';
      if (m.admin) {   // joining as admin needs a valid one hour session. The admin is always "ren".
        if (await adminVerify(this.env, m.admin)) { name = 'ren'; adm = true; }
        else note = 'Admin session expired. Sign in again on the admin page.';
      }
      if (!name) {
        let v = await verify(this.env, m.token);
        if (v && v.oid && !(await this.dir('/touch', { name: v.name, oid: v.oid })).ok) v = null;
        if (v && !taken.has(v.name.toLowerCase())) { name = v.name; oid = v.oid || ''; }
        else do { name = gen(); } while (taken.has(name.toLowerCase()));
      }
      const c = adm ? ADMIN_COLOR : fixColor(m.color);
      ws.serializeAttachment({ name, oid, adm, c, ip: a.ip, t: 5, at: Date.now(), v: 0, mw: 0, lv: 0, rn: 0 });
      ws.send(JSON.stringify({ type: 'welcome', name, color: c || undefined, adm: adm || undefined, room: this.room,
        token: adm ? undefined : oid ? await signCustom(this.env, name, oid) : await sign(this.env, name),
        history: this.hist.filter(h => Date.now() - h.ts < DAY).map(({ _, ...m }) => m), online: this.live().length,
        names: this.ctx.getWebSockets().map(w => (w.deserializeAttachment() || {}).name).filter(Boolean) }));
      if (note) ws.send(JSON.stringify({ type: 'system', text: note }));
      const hi = JSON.stringify({ type: 'joined', name });
      for (const w of this.ctx.getWebSockets()) if (w !== ws) { try { w.send(hi); } catch (e) {} }
      return;
    }
    if (!a.name || (m.type !== 'msg' && m.type !== 'react' && m.type !== 'report' && m.type !== 'profile' && m.type !== 'adm' && m.type !== 'rooms')) return;

    // rate limit: burst of 5, then 1 per second
    const now = Date.now();
    a.t = Math.min(5, a.t + (now - a.at) / 1000); a.at = now;
    if (a.t < 1) {
      if (a.adm) { ws.serializeAttachment(a); return; }
      if (now - a.lv > 30000) a.v = 0;
      a.lv = now; a.v++;
      if (a.v >= 12) { ws.serializeAttachment(a); if (a.ip) await this.punish(a.ip, 'You were timed out for spamming.'); else ws.close(1008, 'spam'); return; }
      if (now - a.mw > 8000) { a.mw = now; this.mod(a.name, a.last); }
      ws.serializeAttachment(a); return;
    }
    a.t--;
    if (m.type === 'rooms') {   // the page asks for a fresh channel list when the side menu opens
      const x = await this.dir('/list', {}); ws.serializeAttachment(a);
      if (x.list) { try { ws.send(JSON.stringify({ type: 'rooms', list: x.list })); } catch (e) {} }
      return;
    }
    if (m.type === 'profile') {   // change name and/or color
      const say = o => ws.send(JSON.stringify({ type: 'profile', ...o })), nn = String(m.name || '').trim(), c = fixColor(m.color);
      if (a.adm) return say({ ok: false, text: 'The admin profile is fixed.' });
      if (m.color && !c) return say({ ok: false, text: 'Pick a color with some color in it, not white or grey.' });
      let name = a.name, oid = a.oid;
      if (nn && nn !== a.name) {
        if (now - a.rn < 15000) return say({ ok: false, text: 'Please wait a few seconds before changing your name again.' });
        const bad = a.adm ? (/^[A-Za-z][A-Za-z0-9]{2,15}$/.test(nn) && !prof.hasMatch(nn) ? '' : 'Please pick a different name.') : nameProblem(nn);
        if (bad) return say({ ok: false, text: bad });
        if (this.ctx.getWebSockets().some(w => w !== ws && ((w.deserializeAttachment() || {}).name || '').toLowerCase() === nn.toLowerCase())) return say({ ok: false, text: 'That name is being used right now.' });
        if (!a.adm) {
          const x = await this.dir('/claim', { name: nn, oid: a.oid || '', prev: a.oid ? a.name : '' });
          if (!x.ok) return say({ ok: false, text: 'That name is already taken.' });
          oid = x.oid;
        }
        name = nn;
      }
      const old = a.name; if (name !== a.name) a.rn = now;
      a.name = name; a.oid = oid; a.c = c; ws.serializeAttachment(a);
      if (name !== old) { this.cast({ type: 'left', name: old }); this.cast({ type: 'joined', name }); }
      return say({ ok: true, name, color: c || undefined, token: a.adm ? undefined : oid ? await signCustom(this.env, name, oid) : await sign(this.env, name) });
    }
    if (m.type === 'adm') {   // admin only: delete a message, or delete it and time out its author
      if (a.adm) {
        const x = this.hist.find(h => h.id === String(m.id));
        if (x && (m.action === 'delete' || m.action === 'timeout')) {
          this.hist = this.hist.filter(h => h !== x); this.cast({ type: 'hide', id: x.id }); this.persist(now);
          if (m.action === 'timeout' && x._ && x._.ip) this.ctx.waitUntil(this.punish(x._.ip, 'You were timed out by an admin.'));
        }
      }
      ws.serializeAttachment(a); return;
    }
    if (m.type === 'report') {   // three different people reporting a message hides it and gives its author a strike
      const x = this.hist.find(h => h.id === String(m.id));
      if (x && !x.mod && x.name !== a.name && a.ip) {
        x._ = x._ || {}; x._.r = x._.r || [];
        if (!x._.r.includes(a.ip) && x._.r.length < 10) x._.r.push(a.ip);
        if (x._.r.length >= 3) {
          this.hist = this.hist.filter(h => h !== x); this.cast({ type: 'hide', id: x.id });
          if (x._.ip) this.ctx.waitUntil(this.punish(x._.ip, 'Your message was reported by other people, so you were timed out.'));
        }
        this.persist(now);
      }
      ws.serializeAttachment(a); return;
    }
    if (m.type === 'react') {
      const e = String(m.e || ''), x = this.hist.find(h => h.id === String(m.id));
      if (!x || !EMO.includes(e)) { ws.serializeAttachment(a); return; }
      x.rx = x.rx || {}; const list = x.rx[e] || [], i = list.indexOf(a.name);
      if (i >= 0) list.splice(i, 1); else if (list.length < 150 && (list.length || Object.keys(x.rx).length < 8)) list.push(a.name);
      if (list.length) x.rx[e] = list; else delete x.rx[e];
      ws.serializeAttachment(a); this.cast({ type: 'reactions', id: x.id, rx: x.rx }); this.persist(now); return;
    }
    const text = clean(String(m.text || ''));
    if (!text) { ws.serializeAttachment(a); return; }
    let reply;
    if (m.replyTo) { const p = this.hist.find(h => h.id === String(m.replyTo)); if (p) reply = { id: p.id, name: p.name, snippet: snip(p.text) }; }
    const msg = { type: 'msg', id: now.toString(36) + rnd(1e6).toString(36), name: a.name, text, ts: now, reply, c: a.c || undefined, adm: a.adm || undefined };
    a.last = { id: msg.id, text: text.slice(0, 100) };
    ws.serializeAttachment(a);
    this.hist.push({ ...msg, _: { ip: a.ip } }); if (this.hist.length > HIST) this.hist.shift();
    this.cast(msg);
    this.persist(now);
    this.ctx.waitUntil(this.notify(a, msg, ws));
  }
  persist(now) {
    if (now - this.lastPut > SAVE) { this.lastPut = now; this.dirty = false; this.ctx.waitUntil(this.ctx.storage.put('h', this.hist)); }
    else if (!this.dirty) { this.dirty = true; this.ctx.waitUntil(this.ctx.storage.setAlarm(this.lastPut + SAVE)); }
  }

  async left(ws) {
    const gone = (ws.deserializeAttachment() || {}).name;
    if (gone) this.cast({ type: 'left', name: gone });
    await this.report(ws);
    if (this.live(ws).length === 0) {
      if (this.dirty) { this.dirty = false; this.lastPut = Date.now(); await this.ctx.storage.put('h', this.hist); }
      await this.ctx.storage.put('i', Date.now());
      await this.ctx.storage.setAlarm(Date.now() + IDLE);
    }
  }
  async webSocketClose(ws) { try { ws.close(1000, 'bye'); } catch (e) {} await this.left(ws); }
  async webSocketError(ws) { await this.left(ws); }

  // runs for two jobs: save recent messages, and delete a room that has been empty for a while
  async alarm() {
    if (this.dirty) { this.dirty = false; this.lastPut = Date.now(); await this.ctx.storage.put('h', this.hist); }
    if (this.room !== 'main' && this.live().length === 0) {
      const i = await this.ctx.storage.get('i');
      if (i && Date.now() - i >= IDLE - 1000) { await this.ctx.storage.deleteAll(); this.hist = []; }
    }
  }
}

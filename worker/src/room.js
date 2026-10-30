import { DurableObject } from 'cloudflare:workers';

const A = 'lazy fuzzy quiet brave sleepy sunny wild tiny jolly misty cosmic happy grumpy silver mellow snappy cheeky dusty mighty gentle fluffy clever sneaky bouncy golden crimson frosty breezy rusty velvet lucky witty dizzy zesty cozy nimble plucky shiny stormy lunar amber ivory mossy swift sly merry'.split(' ');
const B = 'turtle fox dog sparrow panda otter owl moth newt llama heron badger gecko yak lynx finch crab koala bat hare wolf bison camel cobra crane dingo eagle ferret goat hawk ibis jackal kiwi lemur mole moose narwhal ocelot parrot quail raven seal tiger vole walrus wombat zebra robin puffin pika'.split(' ');
const HIST = 200, DAY = 864e5, IDLE = 30 * 60e3, LIM = 300, SAVE = 5000;
const EMO = 'hi lol cry love cool think confused angry sleep shock smug wink blush facepalm shrug please clap thumbsup coffee flower pizza music idea party gaming reading umbrella bye dance yes nope sock'.split(' ');
const rnd = n => Math.floor(Math.random() * n);
const enc = new TextEncoder();

// same cleaning as the page. The page can be bypassed, so the server repeats it.
const clean = t => t.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u0000-\u0008\u000B-\u001F]/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().split('\n').slice(0, 10).join('\n').slice(0, LIM);
const snip = t => { t = t.replace(/\|\|.+?\|\|/g, '[spoiler]').replace(/\s+/g, ' ').replace(/\*+|~~|__|\|\|/g, '').trim(); return t.length > 80 ? t.slice(0, 80) + '…' : t; };

async function sign(env, name) {
  const k = await crypto.subtle.importKey('raw', enc.encode(env.TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(name)));
  return name + '.' + btoa(String.fromCharCode(...sig)).replace(/[+/=]/g, '').slice(0, 22);
}
async function verify(env, tok) {
  if (typeof tok !== 'string' || tok.length > 60) return null;
  const name = tok.split('.')[0];
  return /^[a-z]{3,24}\d\d$/.test(name) && (await sign(env, name)) === tok ? name : null;
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
      const r = await this.env.DIR.get(this.env.DIR.idFromName('dir')).fetch('https://dir/update', { method: 'POST', body: JSON.stringify({ room: this.room, n }) });
      this.cast({ type: 'rooms', list: (await r.json()).list });
    } catch (e) {}
    this.cast({ type: 'online', count: n });
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
    this.cast({ type: 'msg', id: 'm' + Date.now().toString(36) + rnd(1e4).toString(36), name: 'mod', mod: true, ts: Date.now(),
      text: name + ', please stop spamming. Keep it up and you will be removed from the chat.',
      reply: last ? { id: last.id, name, snippet: snip(last.text) } : undefined });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 1500) return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const a = ws.deserializeAttachment() || {};

    if (m.type === 'join' && !a.name) {
      const taken = new Set(this.ctx.getWebSockets().map(w => (w.deserializeAttachment() || {}).name));
      let name = await verify(this.env, m.token);
      if (!name || taken.has(name)) do { name = A[rnd(A.length)] + B[rnd(B.length)] + String(rnd(100)).padStart(2, '0'); } while (taken.has(name));
      ws.serializeAttachment({ name, ip: a.ip, t: 5, at: Date.now(), v: 0, mw: 0, lv: 0 });
      ws.send(JSON.stringify({ type: 'welcome', name, token: await sign(this.env, name), room: this.room,
        history: this.hist.filter(h => Date.now() - h.ts < DAY).map(({ _, ...m }) => m), online: this.live().length }));
      return;
    }
    if (!a.name || (m.type !== 'msg' && m.type !== 'react' && m.type !== 'report')) return;

    // rate limit: burst of 5, then 1 per second
    const now = Date.now();
    a.t = Math.min(5, a.t + (now - a.at) / 1000); a.at = now;
    if (a.t < 1) {
      if (now - a.lv > 30000) a.v = 0;
      a.lv = now; a.v++;
      if (a.v >= 12) { ws.serializeAttachment(a); if (a.ip) await this.punish(a.ip, 'You were timed out for spamming.'); else ws.close(1008, 'spam'); return; }
      if (now - a.mw > 8000) { a.mw = now; this.mod(a.name, a.last); }
      ws.serializeAttachment(a); return;
    }
    a.t--;
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
    const msg = { type: 'msg', id: now.toString(36) + rnd(1e6).toString(36), name: a.name, text, ts: now, reply };
    a.last = { id: msg.id, text: text.slice(0, 100) };
    ws.serializeAttachment(a);
    this.hist.push({ ...msg, _: { ip: a.ip } }); if (this.hist.length > HIST) this.hist.shift();
    this.cast(msg);
    this.persist(now);
  }
  persist(now) {
    if (now - this.lastPut > SAVE) { this.lastPut = now; this.dirty = false; this.ctx.waitUntil(this.ctx.storage.put('h', this.hist)); }
    else if (!this.dirty) { this.dirty = true; this.ctx.waitUntil(this.ctx.storage.setAlarm(this.lastPut + SAVE)); }
  }

  async left(ws) {
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

import { DurableObject } from 'cloudflare:workers';
const NAME_EXP = 60 * 864e5, IDLE = 30 * 60e3, DAY = 864e5, STEPS = [5 * 60e3, 30 * 60e3, DAY];
const DEFAULTS = ['main', 'africa', 'asia', 'europe', 'north america', 'south america', 'oceania'];   // main is global, the rest are continent lobbies
const TOPICS = {};   // channel topics are empty until the admin sets one
const family = n => String(n).replace(/ \d+$/, '');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Channels and how full they are, plus timeouts, custom names, admin lockouts, pause switch and channel topics.
// Only what changed is written to storage, to stay inside the free daily write allowance.
export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.lastSave = 0;
    ctx.blockConcurrencyWhile(async () => {
      const g = async (k, d) => (await ctx.storage.get(k)) || d;
      this.r = await g('r', {}); this.b = await g('b', {}); this.p = await g('p', { on: false, text: '' });
      this.nm = await g('nm', {}); this.au = await g('au', {}); this.ag = await g('ag', { n: 0, t: 0 }); this.tp = await g('tp', {});
      for (const k of Object.keys(this.r)) if (!DEFAULTS.includes(family(k)) && Date.now() - this.r[k].t > IDLE) delete this.r[k];   // old topic channels from earlier versions
      for (const d of DEFAULTS) if (!has(this.r, d)) this.r[d] = { n: 0, t: Date.now() };
    });
  }
  save(...keys) { const o = {}; for (const k of keys) o[k] = this[k]; return this.ctx.storage.put(o); }
  list() {   // default channels first, each followed by its overflow copies
    const cap = +this.env.ROOM_CAP || 150, names = Object.keys(this.r), out = [];
    const num = n => +(n.match(/ (\d+)$/) || [0, 1])[1];
    for (const d of DEFAULTS) names.filter(n => family(n) === d).sort((a, b) => num(a) - num(b)).forEach(n => out.push(n));
    names.filter(n => !DEFAULTS.includes(family(n))).forEach(n => out.push(n));
    return out.map(name => ({ name, n: this.r[name].n, cap, topic: this.tp[family(name)] || TOPICS[family(name)] || '' }));
  }
  async fetch(req) {
    const u = new URL(req.url), cap = +this.env.ROOM_CAP || 150, now = Date.now();
    let pruned = false;
    for (const k of Object.keys(this.r)) if (!DEFAULTS.includes(k) && this.r[k].n === 0 && now - this.r[k].t > IDLE) { delete this.r[k]; pruned = true; }
    if (pruned) await this.save('r');
    for (const k of Object.keys(this.b)) if (this.b[k].until < now && now - this.b[k].t > DAY) delete this.b[k];

    if (u.pathname === '/assign') {
      if (this.p.on) return Response.json({ paused: true, text: this.p.text });
      const ban = this.b[u.searchParams.get('ip')];
      if (ban && ban.until > now) return Response.json({ banned: true, until: ban.until });
      const want = u.searchParams.get('room') || 'main', base = DEFAULTS.includes(family(want)) ? family(want) : 'main';
      let pick = has(this.r, want) && this.r[want].n < cap ? want : '';
      if (!pick) {
        const fam = Object.keys(this.r).filter(n => family(n) === base).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
        pick = fam.find(n => this.r[n].n < cap) || '';
        if (!pick) { let k = 2; while (has(this.r, base + ' ' + k)) k++; pick = base + ' ' + k; this.r[pick] = { n: 0, t: now }; await this.save('r'); }
      }
      return Response.json({ room: pick });
    }
    if (u.pathname === '/update') {   // exact head count from a room. Saved at most every 20 seconds, because counts are re-sent on every join and leave anyway.
      const { room, n } = await req.json();
      this.r[room] = { n, t: now };
      if (now - this.lastSave > 20000) { this.lastSave = now; await this.save('r'); }
      return Response.json({ list: this.list() });
    }
    if (u.pathname === '/list') return Response.json({ list: this.list() });
    if (u.pathname === '/relay') {   // a mention or reply for someone who is in another channel: ask every other channel
      const b = await req.json(), rooms = Object.keys(this.r).filter(n => n !== b.room && this.r[n].n > 0).slice(0, 40);   // empty channels cannot contain the person, so do not wake them
      const body = JSON.stringify({ names: b.names, from: b.from, text: b.text, id: b.id, room: b.room });
      const res = await Promise.all(rooms.map(async n => { try { return await (await this.env.ROOM.get(this.env.ROOM.idFromName(n)).fetch('https://room/ping', { method: 'POST', body })).json(); } catch (e) { return {}; } }));
      return Response.json({ found: [].concat(...res.map(x => x.found || [])) });
    }
    if (u.pathname === '/strike') {   // 1st strike 5 minutes, 2nd 30 minutes, 3rd and later 24 hours. Strikes fade after a day.
      const { ip } = await req.json();
      const b = this.b[ip] || { n: 0, until: 0, t: now };
      if (now - b.t > DAY) b.n = 0;
      b.n++; b.t = now; b.until = now + STEPS[Math.min(b.n, 3) - 1];
      this.b[ip] = b; await this.save('b');
      return Response.json({ until: b.until, n: b.n });
    }
    if (u.pathname === '/claim' || u.pathname === '/touch') {   // custom names are reserved for 60 days since their owner was last seen
      for (const k of Object.keys(this.nm)) if (now - this.nm[k].t > NAME_EXP) delete this.nm[k];
      const { name, oid, prev } = await req.json(), key = String(name).toLowerCase(), e = has(this.nm, key) ? this.nm[key] : null;
      if (u.pathname === '/touch') {
        if (!e || e.o !== oid) return Response.json({ ok: false });
        if (now - e.t > DAY) { e.t = now; await this.save('nm'); }
        return Response.json({ ok: true });
      }
      if (e && e.o !== oid) return Response.json({ ok: false });
      const id = oid || Math.random().toString(36).slice(2, 14).padEnd(12, 'x'), pk = String(prev || '').toLowerCase();
      if (pk && has(this.nm, pk) && this.nm[pk].o === id) delete this.nm[pk];
      this.nm[key] = { n: name, o: id, t: now };
      const keys = Object.keys(this.nm);
      if (keys.length > 3000) { keys.sort((a, b) => this.nm[a].t - this.nm[b].t); for (const k of keys.slice(0, keys.length - 3000)) delete this.nm[k]; }
      await this.save('nm');
      return Response.json({ ok: true, oid: id });
    }
    if (u.pathname === '/auth') {   // wrong admin logins: 5 per address and 20 in total per 15 minutes
      const { ip, ok } = await req.json();
      let f = this.au[ip]; if (!f || now - f.t > 15 * 60e3) f = this.au[ip] = { n: 0, t: now };
      if (now - this.ag.t > 15 * 60e3) this.ag = { n: 0, t: now };
      if (ok === undefined) return Response.json({ locked: f.n >= 5 || this.ag.n >= 20 });
      if (ok) delete this.au[ip]; else { f.n++; this.ag.n++; }
      if (Object.keys(this.au).length > 500) this.au = {};
      await this.save('au', 'ag'); return Response.json({});
    }
    if (u.pathname === '/admin') {
      const body = await req.json(), a = body.action;
      if (a === 'pause') {
        this.p = { on: true, text: String(body.text || 'Chat is paused for a little while. Please check back soon.').slice(0, 200) }; await this.save('p');
        for (const name of Object.keys(this.r)) { try { await this.env.ROOM.get(this.env.ROOM.idFromName(name)).fetch('https://room/pause', { method: 'POST', body: this.p.text }); } catch (e) {} }
      } else if (a === 'resume') { this.p = { on: false, text: '' }; await this.save('p'); }
      else if (a === 'clear') {   // wipe saved messages and empty everyone's chat window (one channel, or all)
        for (const name of (body.room ? [String(body.room)] : Object.keys(this.r))) { try { await this.env.ROOM.get(this.env.ROOM.idFromName(name)).fetch('https://room/clear', { method: 'POST' }); } catch (e) {} }
      }
      else if (a === 'topic') {   // one line under the channel name
        const f = family(String(body.room || '')); if (DEFAULTS.includes(f)) { this.tp[f] = String(body.text || '').slice(0, 120); await this.save('tp'); }
      }
      else if (a === 'clearbans') { this.b = {}; await this.save('b'); }
      return Response.json({ paused: this.p.on, rooms: this.list(), timeouts: Object.keys(this.b).length });
    }
    return new Response('not found', { status: 404 });
  }
}

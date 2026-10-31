import { DurableObject } from 'cloudflare:workers';
const NAME_EXP = 60 * 864e5, IDLE = 30 * 60e3, DAY = 864e5, STEPS = [5 * 60e3, 30 * 60e3, DAY];

// Rooms and how full they are, plus timeouts for repeat spammers and the pause switch.
export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.r = (await ctx.storage.get('r')) || { main: { n: 0, t: Date.now() } };
      this.b = (await ctx.storage.get('b')) || {};
      this.p = (await ctx.storage.get('p')) || { on: false, text: '' };
      this.nm = (await ctx.storage.get('nm')) || {};
      this.au = (await ctx.storage.get('au')) || {};
      this.ag = (await ctx.storage.get('ag')) || { n: 0, t: 0 };
    });
  }
  list() { const cap = +this.env.ROOM_CAP || 150; return Object.entries(this.r).map(([name, v]) => ({ name, n: v.n, cap })); }
  save() { return this.ctx.storage.put({ r: this.r, b: this.b, p: this.p, nm: this.nm, au: this.au, ag: this.ag }); }
  async fetch(req) {
    const u = new URL(req.url), cap = +this.env.ROOM_CAP || 150, now = Date.now();
    for (const k of Object.keys(this.r)) if (k !== 'main' && this.r[k].n === 0 && now - this.r[k].t > IDLE) delete this.r[k];
    for (const k of Object.keys(this.b)) if (this.b[k].until < now && now - this.b[k].t > DAY) delete this.b[k];

    if (u.pathname === '/assign') {
      if (this.p.on) return Response.json({ paused: true, text: this.p.text });
      const ban = this.b[u.searchParams.get('ip')];
      if (ban && ban.until > now) return Response.json({ banned: true, until: ban.until });
      const want = u.searchParams.get('room');
      let pick = this.r[want] && this.r[want].n < cap ? want : Object.keys(this.r).find(k => this.r[k].n < cap);
      if (!pick) { let n = 2; while (this.r['room ' + n]) n++; pick = 'room ' + n; this.r[pick] = { n: 0, t: now }; await this.save(); }
      return Response.json({ room: pick });
    }
    if (u.pathname === '/update') {
      const { room, n } = await req.json();
      this.r[room] = { n, t: now }; await this.save();
      return Response.json({ list: this.list() });
    }
    if (u.pathname === '/strike') {   // 1st strike 5 minutes, 2nd 30 minutes, 3rd and later 24 hours. Strikes fade after a day.
      const { ip } = await req.json();
      const b = this.b[ip] || { n: 0, until: 0, t: now };
      if (now - b.t > DAY) b.n = 0;
      b.n++; b.t = now; b.until = now + STEPS[Math.min(b.n, 3) - 1];
      this.b[ip] = b; await this.save();
      return Response.json({ until: b.until, n: b.n });
    }
    if (u.pathname === '/claim' || u.pathname === '/touch') {   // custom names are reserved for 60 days since their owner was last seen
      for (const k of Object.keys(this.nm)) if (now - this.nm[k].t > NAME_EXP) delete this.nm[k];
      const { name, oid, prev } = await req.json(), key = String(name).toLowerCase(), e = this.nm[key];
      if (u.pathname === '/touch') {
        if (!e || e.o !== oid) return Response.json({ ok: false });
        if (now - e.t > DAY) { e.t = now; await this.save(); }
        return Response.json({ ok: true });
      }
      if (e && e.o !== oid) return Response.json({ ok: false });
      const id = oid || Math.random().toString(36).slice(2, 14).padEnd(12, 'x'), pk = String(prev || '').toLowerCase();
      if (pk && this.nm[pk] && this.nm[pk].o === id) delete this.nm[pk];
      this.nm[key] = { n: name, o: id, t: now };
      const keys = Object.keys(this.nm);
      if (keys.length > 3000) { keys.sort((a, b) => this.nm[a].t - this.nm[b].t); for (const k of keys.slice(0, keys.length - 3000)) delete this.nm[k]; }
      await this.save();
      return Response.json({ ok: true, oid: id });
    }
    if (u.pathname === '/auth') {   // wrong admin logins: 5 per address and 20 in total per 15 minutes
      const { ip, ok } = await req.json();
      let f = this.au[ip]; if (!f || now - f.t > 15 * 60e3) f = this.au[ip] = { n: 0, t: now };
      if (now - this.ag.t > 15 * 60e3) this.ag = { n: 0, t: now };
      if (ok === undefined) return Response.json({ locked: f.n >= 5 || this.ag.n >= 20 });
      if (ok) delete this.au[ip]; else { f.n++; this.ag.n++; }
      if (Object.keys(this.au).length > 500) this.au = {};
      await this.save(); return Response.json({});
    }
    if (u.pathname === '/admin') {
      const body = await req.json(), a = body.action;
      if (a === 'pause') {
        this.p = { on: true, text: String(body.text || 'Chat is paused for a little while. Please check back soon.').slice(0, 200) }; await this.save();
        for (const name of Object.keys(this.r)) { try { await this.env.ROOM.get(this.env.ROOM.idFromName(name)).fetch('https://room/pause', { method: 'POST', body: this.p.text }); } catch (e) {} }
      } else if (a === 'resume') { this.p = { on: false, text: '' }; await this.save(); }
      else if (a === 'clear') {   // wipe saved messages and empty everyone's chat window (one room, or all)
        for (const name of (body.room ? [String(body.room)] : Object.keys(this.r))) { try { await this.env.ROOM.get(this.env.ROOM.idFromName(name)).fetch('https://room/clear', { method: 'POST' }); } catch (e) {} }
      }
      else if (a === 'clearbans') { this.b = {}; await this.save(); }
      return Response.json({ paused: this.p.on, rooms: this.list(), timeouts: Object.keys(this.b).length });
    }
    return new Response('not found', { status: 404 });
  }
}

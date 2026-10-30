import { DurableObject } from 'cloudflare:workers';
const IDLE = 30 * 60e3, DAY = 864e5, STEPS = [5 * 60e3, 30 * 60e3, DAY];

// Rooms and how full they are, plus timeouts for repeat spammers and the pause switch.
export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.r = (await ctx.storage.get('r')) || { main: { n: 0, t: Date.now() } };
      this.b = (await ctx.storage.get('b')) || {};
      this.p = (await ctx.storage.get('p')) || { on: false, text: '' };
    });
  }
  list() { const cap = +this.env.ROOM_CAP || 150; return Object.entries(this.r).map(([name, v]) => ({ name, n: v.n, cap })); }
  save() { return this.ctx.storage.put({ r: this.r, b: this.b, p: this.p }); }
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
    if (u.pathname === '/admin') {
      const body = await req.json(), a = body.action;
      if (a === 'pause') {
        this.p = { on: true, text: String(body.text || 'Chat is paused for a little while. Please check back soon.').slice(0, 200) }; await this.save();
        for (const name of Object.keys(this.r)) { try { await this.env.ROOM.get(this.env.ROOM.idFromName(name)).fetch('https://room/pause', { method: 'POST', body: this.p.text }); } catch (e) {} }
      } else if (a === 'resume') { this.p = { on: false, text: '' }; await this.save(); }
      else if (a === 'clearbans') { this.b = {}; await this.save(); }
      return Response.json({ paused: this.p.on, rooms: this.list(), timeouts: Object.keys(this.b).length });
    }
    return new Response('not found', { status: 404 });
  }
}

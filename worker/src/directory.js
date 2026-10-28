import { DurableObject } from 'cloudflare:workers';
const IDLE = 30 * 60e3;

// Keeps a tiny list of rooms and how full they are. Opens "room 2", "room 3"... when the others are full.
export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.r = (await ctx.storage.get('r')) || { main: { n: 0, t: Date.now() } }; });
  }
  list() { const cap = +this.env.ROOM_CAP || 150; return Object.entries(this.r).map(([name, v]) => ({ name, n: v.n, cap })); }
  async fetch(req) {
    const u = new URL(req.url), cap = +this.env.ROOM_CAP || 150, now = Date.now();
    for (const k of Object.keys(this.r)) if (k !== 'main' && this.r[k].n === 0 && now - this.r[k].t > IDLE) delete this.r[k];
    if (u.pathname === '/assign') {
      const want = u.searchParams.get('room');
      let pick = this.r[want] && this.r[want].n < cap ? want : Object.keys(this.r).find(k => this.r[k].n < cap);
      if (!pick) { let n = 2; while (this.r['room ' + n]) n++; pick = 'room ' + n; this.r[pick] = { n: 0, t: now }; await this.ctx.storage.put('r', this.r); }
      return Response.json({ room: pick });
    }
    if (u.pathname === '/update') {
      const { room, n } = await req.json();
      this.r[room] = { n, t: now };
      await this.ctx.storage.put('r', this.r);
      return Response.json({ list: this.list() });
    }
    return new Response('not found', { status: 404 });
  }
}

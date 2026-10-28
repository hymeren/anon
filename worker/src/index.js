import { Room } from './room.js';
import { Directory } from './directory.js';
export { Room, Directory };

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname !== '/ws') return new Response('OAC chat server');
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    // only our own site may connect
    if (!env.ALLOWED_ORIGINS.split(',').includes(req.headers.get('Origin') || '')) return new Response('Forbidden', { status: 403 });
    let want = u.searchParams.get('room') || 'main';
    if (!/^[a-z0-9 ]{1,20}$/.test(want)) want = 'main';
    // the directory decides which room this person lands in
    const dir = env.DIR.get(env.DIR.idFromName('dir'));
    const a = await (await dir.fetch('https://dir/assign?room=' + encodeURIComponent(want))).json();
    const headers = new Headers(req.headers); headers.set('X-Room', a.room);
    return env.ROOM.get(env.ROOM.idFromName(a.room)).fetch(new Request(req, { headers }));
  },
};

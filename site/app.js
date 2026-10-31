'use strict';
const WS_URL = 'wss://oac-worker.hymeys.workers.dev/ws';                 // leave empty for the fake chat. For the real chat: 'wss://oac-worker.YOURNAME.workers.dev/ws'
const TS_KEY = '';                 // Cloudflare Turnstile SITE key (the public one). Leave empty until the widget exists.
if (TS_KEY) { const ts = document.createElement('script'); ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; ts.async = true; document.head.append(ts); }
const MAX = 500, LIM = 300;        // messages kept on the page, characters per message
const EMO = 'hi lol cry love cool think confused angry sleep shock smug wink blush facepalm shrug please clap thumbsup coffee flower pizza music idea party gaming reading umbrella bye dance yes nope sock'.split(' ');
const $ = s => document.querySelector(s), log = $('#log'), box = $('#box');
const r = n => Math.floor(Math.random() * n);
const store = new Map();
const SH = { circle: 'M-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0', drop: 'M0-6q5 7 0 11q-5-4 0-11z', star: 'M0-6l1.6 4.4L6 0l-4.4 1.6L0 6l-1.6-4.4L-6 0l4.4-1.6z', plus: 'M-1.5-5h3v3.5h3.5v3h-3.5v3.5h-3v-3.5h-3.5v-3h3.5z', tri: 'M0-5l5 9h-10z', dia: 'M0-6l5 6-5 6-5-6z', heart: 'M0 5C-8-1-4-7 0-3C4-7 8-1 0 5z', moon: 'M2-5A5.5 5.5 0 1 0 5 3 4 4 0 0 1 2-5z', ring: 'M-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0zM-2.5 0a2.5 2.5 0 1 1 5 0a2.5 2.5 0 1 1-5 0z', leaf: 'M-5 4Q-5-5 5-5Q5 4-5 4z', bolt: 'M1-6L-4 1h4l-1 5 5-7H0z', hex: 'M0-5l4.3 2.5v5L0 5l-4.3-2.5v-5z', bar: 'M-5-1.5h10v3h-10z', x: 'M-4-2l2-2 2 2 2-2 2 2-2 2 2 2-2 2-2-2-2 2-2-2 2-2z' }, SHK = Object.keys(SH);
const LAY = [[[9, 9, 1, 0], [27, 13, .8, 25], [13, 27, .9, -15], [29, 30, .7, 0]], [[18, 18, 1.9, 0]], [[7, 7, .6, 0], [18, 7, .6, 0], [29, 7, .6, 0], [7, 18, .6, 0], [18, 18, .6, 0], [29, 18, .6, 0], [7, 29, .6, 0], [18, 29, .6, 0], [29, 29, .6, 0]], [[8, 28, 1, 0], [18, 18, 1, 0], [28, 8, 1, 0]]];
const LINES = ['M0 10Q4.5 6 9 10T18 10T27 10T36 10M0 22Q4.5 18 9 22T18 22T27 22T36 22M0 34Q4.5 30 9 34T18 34T27 34T36 34', 'M0 12L12 0M0 24L24 0M0 36L36 0M12 36L36 12M24 36L36 24', 'M0 9h36M0 18h36M0 27h36', 'M9 0v36M18 0v36M27 0v36M0 9h36M0 18h36M0 27h36', 'M0 28l6-8 6 8 6-8 6 8 6-8 6 8', 'M0 6l8 8M16 6l8 8M0 22l8 8M16 22l8 8M32 6l4 4'];
const avCache = new Map(), NSH = SHK.length * LAY.length;
function patUrl(name) {
  const k = hash(name + 'p'), i = k % (NSH + LINES.length), dark = (k >>> 8) & 1, c = dark ? '#1f1e1d' : '#fff', o = dark ? .12 : .18;
  const inner = i < NSH
    ? '<g fill="' + c + '" fill-opacity="' + o + '" fill-rule="evenodd">' + LAY[i / SHK.length | 0].map(([x, y, z, a]) => '<path transform="translate(' + x + ' ' + y + ') rotate(' + a + ') scale(' + z + ')" d="' + SH[SHK[i % SHK.length]] + '"/>').join('') + '</g>'
    : '<path d="' + LINES[i - NSH] + '" fill="none" stroke="' + c + '" stroke-opacity="' + o + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' + inner + '</svg>') + '")';
}
function setAv(el, name, hex) {
  let u = avCache.get(name); if (!u) { if (avCache.size > 300) avCache.clear(); u = patUrl(name); avCache.set(name, u); }
  el.style.backgroundColor = hex || hsl(col(name)); el.style.backgroundImage = u;
}
const SIREN = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path d="M10 26v-8a8 8 0 0 1 16 0v8z" fill="#ff5a4d"/><rect x="7" y="26" width="22" height="4" rx="1.5" fill="#c9c6bc"/><path d="M18 5v3M7 9l2 2M29 9l-2 2M4 18h3M29 18h3" stroke="#ffb199" stroke-width="2" stroke-linecap="round"/><path d="M14 22v-4a4 4 0 0 1 3-3" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>') + '")';
let lastMine = null, modAt = 0, modN = 0, roomList = [{ name: 'main', n: 0, cap: 150 }], room = ls('oac-room') || 'main';
function drawRooms() {
  const w = $('#rooms'); w.textContent = '';
  roomList.forEach(x => { const b = document.createElement('button'), full = x.n >= x.cap; b.className = 'rm' + (x.name === room ? ' act' : '') + (full ? ' full' : ''); b.append('# ' + x.name);
    const c = document.createElement('small'); c.textContent = full ? 'full' : x.n; b.append(c); b.onclick = () => enter(x.name); w.append(b); });
}
function enter(n) {
  const x = roomList.find(y => y.name === n); if (n === room || !x || x.n >= x.cap) return;
  T.join(n); if (mobile()) { side.classList.add('closed'); sync(); }
}
function modWarn() {
  const now = Date.now(); if (now - modAt < 8000) return; modAt = now;
  add({ type: 'msg', id: 'mod' + (++modN), name: 'Siren', mod: true, ts: now, text: me + ', please stop spamming. Keep it up and you will be removed from the chat.',
    reply: lastMine ? { id: lastMine.id, name: me, snippet: snip(lastMine.text) } : undefined }, true);
}
let me = '', reply = null, unread = 0, last = null, bucket = { t: 5, at: Date.now() };

function ls(k, v) { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { return null; } }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function col(n) { const h = hash(n); return { h: h % 360, s: 58 + (h >>> 9) % 22, l: 62 + (h >>> 14) % 11 }; }
const hsl = (c, d = 0) => `hsl(${c.h} ${c.s}% ${c.l + d}%)`;
const clean = t => t.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u0000-\u0008\u000B-\u001F]/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().split('\n').slice(0, 10).join('\n').slice(0, LIM);
const snip = t => { t = t.replace(/\|\|.+?\|\|/g, '[spoiler]').replace(/\s+/g, ' ').replace(/\*+|~~|__|\|\|/g, '').trim(); return t.length > 80 ? t.slice(0, 80) + '…' : t; };

/* ---------- transports (swap these in Phase 2) ---------- */
function fakeTransport() {
  const A = 'lazy fuzzy quiet brave sleepy sunny wild tiny jolly misty cosmic happy grumpy silver mellow snappy cheeky dusty mighty gentle'.split(' ');
  const B = 'turtle fox dog sparrow panda otter owl moth newt llama heron badger gecko yak lynx finch crab koala bat hare'.split(' ');
  const rn = () => A[r(A.length)] + B[r(B.length)] + String(r(100)).padStart(2, '0');
  const L = ['hello from the other side of the world :hi:', 'anyone awake? :sleep:', 'this chat is surprisingly fast', 'just got here, what did i miss', 'tea or coffee :coffee:', 'lol :lol:', 'bruh :bruh:', 'no way :shock:', 'the sock emojis are the best part honestly', 'who else is up at this hour', 'i have been staring at a spreadsheet all day :dead:', 'okay but pizza for breakfast is valid :pizza:', 'good morning everyone :sock:', 'what are you all listening to :music:', 'that is a great point', 'hmm :think:', 'it is raining here :umbrella:', 'goodnight, see you tomorrow :bye:', 'big mood :hype:', 'not sure about that one :sus:', 'welcome in :party:', 'so true', 'i need a nap :yawn:', '**big news**: the *sock* emojis are here', '> quote me on that\nagreed', 'my list:\n- coffee :coffee:\n- tea\n- more coffee', 'the ending was ||a total twist||', '__underlined__ and ~~crossed out~~, ***loud***'];
  const users = Array.from({ length: 9 }, rn), hist = []; let n = 0, t = {};
  const mk = (name, text, ts, rep) => { const m = { type: 'msg', id: 'f' + (++n), name, text, ts, reply: rep || undefined }; hist.push(m); if (hist.length > 60) hist.shift(); return m; };
  const loop = () => { setTimeout(() => {
    const p = hist[r(hist.length)], rep = Math.random() < .2 && p ? { id: p.id, name: p.name, snippet: snip(p.text) } : null;
    t.on(mk(users[r(users.length)], Math.random() < .1 ? '@' + me + ' hey, welcome in :hi:' : L[r(L.length)], Date.now(), rep)); loop(); }, 1200 + r(3200)); };
  const rooms = [{ name: 'main', n: 148, cap: 150 }, { name: 'room 2', n: 12, cap: 150 }]; let cur = 'main';
  t.join = n => { const ok = rooms.find(x => x.name === n && x.n < x.cap) || rooms.find(x => x.n < x.cap) || rooms[0]; cur = ok.name; hist.length = 0;
    const h = Array.from({ length: 24 }, (_, i) => mk(users[r(users.length)], L[r(L.length)], Date.now() - (24 - i) * 70000 - r(30000)));
    t.on({ type: 'welcome', name: me, room: cur, history: h, online: ok.n }); t.on({ type: 'rooms', list: rooms }); };
  t.start = () => {
    me = ls('oac-name') || rn(); ls('oac-name', me);
    t.join(room); loop();
    setInterval(() => { rooms[0].n = Math.min(150, Math.max(138, rooms[0].n + r(5) - 2)); rooms[1].n = Math.max(5, rooms[1].n + r(5) - 2); t.on({ type: 'rooms', list: rooms }); t.on({ type: 'online', count: rooms.find(x => x.name === cur).n }); }, 4000);
  };
  t.send = o => {
    if (o.type === 'report' || o.type === 'adm') return;
    if (o.type === 'profile') { if (/^[A-Za-z][A-Za-z0-9]{2,15}$/.test(o.name || '')) { me = o.name; ls('oac-name', me); } t.on({ type: 'profile', ok: true, name: me, color: /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : undefined }); return; }
    if (o.type === 'react') { const x = hist.find(h => h.id === String(o.id)); if (!x) return; x.rx = x.rx || {}; const a = x.rx[o.e] || [], i = a.indexOf(me); if (i < 0) a.push(me); else a.splice(i, 1); if (a.length) x.rx[o.e] = a; else delete x.rx[o.e]; t.on({ type: 'reactions', id: x.id, rx: x.rx }); return; }
    const p = o.replyTo && store.get(String(o.replyTo));
    setTimeout(() => t.on(mk(me, o.text, Date.now(), p ? { id: p.id, name: p.name, snippet: snip(p.text) } : null)), 40); };
  return t;
}
const ADM = (() => { try { return { t: sessionStorage.getItem('oac-admin') || '', n: sessionStorage.getItem('oac-aname') || '' }; } catch (e) { return { t: '', n: '' }; } })();   // set by the admin page
let tsId = null, tsRes = null;
function tsToken() {   // a fresh Turnstile token for every connection ('' while the bot check is off)
  return new Promise(res => {
    if (!TS_KEY) return res('');
    let n = 0;
    const go = () => {
      if (!window.turnstile) { if (++n > 80) return res(''); return setTimeout(go, 100); }
      tsRes = res; const done = t => { if (tsRes) { tsRes(t); tsRes = null; } };
      if (tsId === null) tsId = turnstile.render('#ts', { sitekey: TS_KEY, appearance: 'interaction-only', callback: done, 'error-callback': () => done(''), 'timeout-callback': () => done('') });
      else turnstile.reset(tsId);
    };
    go();
  });
}
function wsTransport() {
  let ws, fails = 0, idle = false, dead = false, hideT = 0; const t = {};
  const open = () => {
    if (dead || idle) return;
    tsToken().then(tok => {
      if (dead || idle || (ws && ws.readyState <= 1)) return;
      ws = new WebSocket(WS_URL + '?room=' + encodeURIComponent(room) + (tok ? '&t=' + encodeURIComponent(tok) : ''));
      ws.onopen = () => { fails = 0; t.status('up'); ws.send(JSON.stringify({ type: 'join', token: ls('oac-token'), color: ls('oac-color') || undefined, admin: ADM.t || undefined, aname: ADM.n || undefined })); };
      ws.onmessage = e => { try { t.on(JSON.parse(e.data)); } catch (x) {} };
      ws.onclose = e => {
        if (e.code === 4003) { dead = true; return; }   // the server turned us away on purpose (timeout, pause, failed check): do not retry
        if (idle) return;
        fails++; t.status('down', fails);
        setTimeout(open, Math.min(fails >= 6 ? 300000 : 30000, 1000 * Math.pow(2, fails) * (.5 + Math.random())));
      };
    });
  };
  t.start = open;
  t.send = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));
  t.join = n => { room = n; if (ws) { ws.onclose = null; ws.close(); } fails = 0; open(); };
  document.addEventListener('visibilitychange', () => {   // a tab nobody is looking at should not hold a connection open
    if (document.hidden) { hideT = setTimeout(() => { if (ws && ws.readyState <= 1) { idle = true; ws.onclose = null; ws.close(); } }, 120000); }
    else { clearTimeout(hideT); if (idle) { idle = false; fails = 0; open(); } }
  });
  return t;
}
const T = WS_URL ? wsTransport() : fakeTransport();

/* ---------- rendering (everything goes in with textContent, never innerHTML) ---------- */
const DEL = [['***', 'bi'], ['**', 'b'], ['__', 'u'], ['~~', 's'], ['||', 'sp'], ['*', 'i'], ['_', 'i']];
const wd = c => /[A-Za-z0-9]/.test(c || '');
function closer(str, d, from) {
  if (d.length > 1) return str.indexOf(d, from);
  for (let j = from; j < str.length; j++) if (str[j] === d && str[j - 1] !== d && str[j + 1] !== d) return j;
  return -1;
}
function txt(parent, s) {   // @name becomes a highlighted mention
  const re = /(^|[^A-Za-z0-9@])@([A-Za-z0-9]{3,24})(?![A-Za-z0-9])/g; let i = 0, m;
  while ((m = re.exec(s))) {
    const at = m.index + m[1].length; if (at > i) parent.append(s.slice(i, at));
    const sp = document.createElement('span'); sp.className = 'ment' + (m[2].toLowerCase() === me.toLowerCase() ? ' me' : ''); sp.textContent = '@' + m[2]; parent.append(sp);
    i = at + 1 + m[2].length;
  }
  if (i < s.length) parent.append(s.slice(i));
}
function emo(parent, text) {
  text.split(/(:[a-z0-9]+:)/g).forEach(p => {
    const m = /^:([a-z0-9]+):$/.exec(p);
    if (m && EMO.includes(m[1])) { const i = new Image(); i.className = 'e'; i.alt = p; i.loading = 'lazy'; i.src = 'emoji/' + m[1] + '.svg'; i.onerror = () => i.replaceWith(p); parent.append(i); }
    else if (p) txt(parent, p);
  });
}
function inl(str, parent, depth) {
  let i = 0, buf = '';
  const flush = () => { if (buf) { emo(parent, buf); buf = ''; } };
  while (i < str.length) {
    let hit = null;
    if (depth < 5) for (const [d, k] of DEL) {
      if (!str.startsWith(d, i)) continue;
      if (d === '_' && wd(str[i - 1])) continue;
      const j = closer(str, d, i + d.length);
      if (j <= i + d.length) continue;
      const inner = str.slice(i + d.length, j);
      if (/^\s|\s$/.test(inner) || (d === '_' && wd(str[j + 1]))) continue;
      hit = [d, k, j, inner]; break;
    }
    if (!hit) { buf += str[i++]; continue; }
    flush();
    const [d, k, j, inner] = hit, el = document.createElement(k === 'b' || k === 'bi' ? 'strong' : k === 'i' ? 'em' : k === 's' ? 's' : 'span');
    if (k === 'u') el.className = 'u';
    if (k === 'sp') el.className = 'sp';
    let target = el; if (k === 'bi') { target = document.createElement('em'); el.append(target); }
    inl(inner, target, depth + 1); parent.append(el); i = j + d.length;
  }
  flush();
}
function fill(el, text) {
  if (!text.replace(/:[a-z0-9]+:|\s/g, '')) el.classList.add('big');
  text.split('\n').forEach(line => {
    const d = document.createElement('div'); d.className = 'ln'; let m;
    if ((m = /^>\s?(.*)$/.exec(line))) { d.className = 'ln q'; line = m[1]; }
    else if ((m = /^[-*]\s+(.*)$/.exec(line))) { d.className = 'ln li'; line = m[1]; d.append('– '); }
    inl(line, d, 0); el.append(d);
  });
}
log.addEventListener('click', e => { const sp = e.target.closest('.sp'); if (sp) sp.classList.toggle('show'); const h = e.target.closest('.hid .t'); if (h) h.closest('.m').classList.toggle('show'); });
function add(e, live) {
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 90, mine = e.name === me;
  const grouped = last && last.name === e.name && !e.reply && e.ts - last.ts < 3e5 && !e.mod; last = e;
  store.set(String(e.id), e); if (mine) lastMine = e;
  const c = col(e.name), m = document.createElement('div');
  m.className = 'm' + (grouped ? ' g' : '') + (live ? ' in' : '') + (e.mod ? ' mod' : ''); m.id = 'm-' + e.id;
  if (muted.has(e.name) && !e.mod) m.classList.add('hid');
  if (!mine && !e.mod && ((e.reply && e.reply.name === me) || new RegExp('(^|[^A-Za-z0-9@])@' + me + '(?![A-Za-z0-9])', 'i').test(e.text))) { m.classList.add('ping'); if (live && document.hidden) { unseen++; badge(); } }
  const av = document.createElement('div'); av.className = 'av'; av.textContent = e.name[0]; setAv(av, e.name, e.c); if (e.mod) { av.textContent = ''; av.style.backgroundImage = SIREN; av.style.backgroundColor = '#2e2220'; }
  const b = document.createElement('div'), h = document.createElement('div'), n = document.createElement('span'), tm = document.createElement('time');
  h.className = 'h'; n.className = 'n'; n.textContent = e.name + (mine ? ' (you)' : ''); n.style.color = e.c || hsl(c, 5); if (e.adm) n.classList.add('isadm');
  tm.textContent = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  h.append(n, tm); b.append(h);
  if (e.reply) { const q = document.createElement('div'); q.className = 'rp'; q.textContent = '↩ ' + e.reply.name + ': ' + e.reply.snippet; q.onclick = () => jump(e.reply.id); b.append(q); }
  const t = document.createElement('div'); t.className = 't'; fill(t, e.text); b.append(t); const rxd = document.createElement('div'); rxd.className = 'rx'; drawRx(rxd, e); b.append(rxd);
  const rb = document.createElement('div'); rb.className = 'rb'; [['↩', 'Reply', () => setReply(e)], ['⋯', 'More options', ev => menu(e.id, ev)]].forEach(([t, l, f]) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.setAttribute('aria-label', l); x.onclick = f; rb.append(x); });
  m.append(av, b, rb); log.append(m);
  while (log.children.length > MAX) { const f = log.firstChild; store.delete(f.id.slice(2)); f.remove(); }
  if (near || mine) log.scrollTop = log.scrollHeight;
  else { unread++; $('#new').textContent = unread + ' new message' + (unread > 1 ? 's' : ''); $('#new').classList.add('on'); }
}
function jump(id) { const el = $('#m-' + id); if (!el) return; el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); }
function setReply(e) { reply = e; $('#rbar').classList.toggle('on', !!e); if (e) { $('#rtxt').textContent = 'Replying to ' + e.name + ': ' + snip(e.text); box.focus(); } }

/* ---------- events from the transport ---------- */
T.on = e => {
  if (e.type === 'welcome') {
    me = e.name; if (e.token) ls('oac-token', e.token); room = e.room || room; ls('oac-room', room); $('#rname').textContent = '# ' + room;
    isAdmin = !!e.adm; myColor = e.color || ''; if (!e.adm) ls('oac-color', myColor); paintMe();
    log.textContent = ''; last = null; store.clear(); e.history.forEach(x => add(x)); log.scrollTop = log.scrollHeight; online(e.online);
  } else if (e.type === 'msg') add(e, true);
  else if (e.type === 'reactions') { const x = store.get(String(e.id)); if (x) { x.rx = e.rx; const el = $('#m-' + e.id + ' .rx'); if (el) drawRx(el, x); } }
  else if (e.type === 'rooms') { roomList = e.list; drawRooms(); }
  else if (e.type === 'online') online(e.count);
  else if (e.type === 'hide') { const el = $('#m-' + e.id); if (el) el.remove(); }
  else if (e.type === 'profile') {
    if (e.ok) { me = e.name; myColor = e.color || ''; if (e.token) ls('oac-token', e.token); if (!isAdmin) ls('oac-color', myColor); paintMe(); closeProf(); }
    else $('#perr').textContent = e.text || 'Could not save that.';
  }
  else if (e.type === 'clear') { log.textContent = ''; store.clear(); last = null; T.on({ type: 'system', text: 'The chat was cleared by an admin.' }); }
  else if (e.type === 'banned' || e.type === 'paused' || e.type === 'error') {
    const mins = e.until ? Math.max(1, Math.round((e.until - Date.now()) / 60000)) : 0;
    showLim(e.type === 'banned' ? 'You have been timed out' : e.type === 'paused' ? 'Chat is paused' : "We couldn't let you in",
      (e.text || '') + (mins ? ' You can come back in about ' + (mins >= 90 ? Math.round(mins / 60) + ' hours.' : mins + ' minutes.') : ''));
  }
  else if (e.type === 'system' || e.type === 'error') { const d = document.createElement('div'); d.className = 'sys'; d.textContent = e.text || ('Error: ' + e.code); log.append(d); log.scrollTop = log.scrollHeight; }
};
T.status = (s, fails) => { $('#state').textContent = s === 'up' ? '' : 'Reconnecting...'; $('#lim').classList.toggle('on', s === 'down' && fails >= 3); };
function online(n) { $('#on').textContent = n; }

/* ---------- overlays (one history entry covers all of them), message menu, reactions ---------- */
const pkEl = $('#pk'), sheet = $('#sheet'), side = $('#side'), scrim = $('#scrim');
const coarse = () => matchMedia('(pointer:coarse)').matches, mobile = () => innerWidth < 760;
let cur = null, lp = null, lx = 0, ly = 0, hs = false, skip = 0;
const sideOpen = () => mobile() && !side.classList.contains('closed');
function sync() {   // keeps exactly one extra history entry while anything is open, so Back closes it instead of leaving the site
  scrim.classList.toggle('on', sideOpen());
  const open = pkEl.classList.contains('on') || sheet.classList.contains('on') || sideOpen();
  if (open && !hs) { hs = true; history.pushState({ o: 1 }, ''); }
  else if (!open && hs) { hs = false; skip++; history.back(); }
}
addEventListener('popstate', () => {
  if (skip > 0) { skip--; return; }
  if (hs) { hs = false; pkEl.classList.remove('on'); sheet.classList.remove('on'); if (mobile()) side.classList.add('closed'); scrim.classList.remove('on'); }
});
const favs = () => { try { return JSON.parse(ls('oac-fav') || '{}'); } catch (e) { return {}; } };
function useEmo(names) { const f = favs(); names.forEach(n => { f[n] = (f[n] || 0) + 1; }); ls('oac-fav', JSON.stringify(f)); }
function buildGrid(host, pick) {
  host.textContent = '';
  const f = favs(), total = Object.values(f).reduce((a, b) => a + b, 0);
  const top = Object.keys(f).filter(n => EMO.includes(n)).sort((a, b) => f[b] - f[a]).slice(0, 8);
  const add = n => { const b = document.createElement('button'), i = new Image(); i.src = 'emoji/' + n + '.svg'; i.alt = ':' + n + ':'; i.title = ':' + n + ':'; i.draggable = false; b.type = 'button'; b.append(i); b.onclick = () => pick(n); host.append(b); };
  const lab = t => { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = t; host.append(d); };
  if (total >= 3 && top.length) { lab('Frequently used'); top.forEach(add); lab('All'); }
  EMO.forEach(add);
  host.scrollTop = 0;
}
function openPk() { buildGrid(pkEl, n => { box.value += ':' + n + ': '; grow(); if (!coarse()) box.focus(); }); pkEl.classList.add('on'); sync(); }
function closePk() { pkEl.classList.remove('on'); sync(); }
function place(ev) {   // on a computer the menu opens next to the click, on a phone it slides up from the bottom
  const sh = $('#sh');
  if (coarse() || !ev || ev.clientX === undefined) { sheet.classList.remove('pop'); sh.style.left = sh.style.top = ''; return; }
  sheet.classList.add('pop');
  const r = $('#main').getBoundingClientRect(), w = sh.offsetWidth, h = sh.offsetHeight;
  sh.style.left = Math.max(8, Math.min(ev.clientX - r.left, r.width - w - 8)) + 'px';
  sh.style.top = Math.max(8, Math.min(ev.clientY - r.top, r.height - h - 8)) + 'px';
}
let unseen = 0;
function badge() { document.title = (unseen ? '(' + unseen + ') ' : '') + 'OAC · Online Anonymous Chat'; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && unseen) { unseen = 0; badge(); } });
function menu(id, ev) {
  const x = store.get(String(id)); if (!x || x.mod || sheet.classList.contains('on')) return;
  cur = x; $('#mmute').hidden = $('#mreport').hidden = x.name === me; $('#mdel').hidden = $('#mto').hidden = !isAdmin; $('#mmute').textContent = 'Hide ' + x.name; buildGrid($('#qr'), n => { useEmo([n]); T.send({ type: 'react', id: x.id, e: n }); closeMenu(); });
  sheet.classList.add('on'); place(ev); sync();
}
function closeMenu() { sheet.classList.remove('on'); sync(); }
function toggleSide() { side.classList.toggle('closed'); sync(); }
scrim.onclick = () => { side.classList.add('closed'); sync(); };
$('#mrep').onclick = () => { const x = cur; closeMenu(); setReply(x); };
function copyText(t) {
  const old = () => { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.append(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(old); else old();
}
$('#mcopy').onclick = () => { copyText(cur.text); closeMenu(); };
let muted = new Set(); try { muted = new Set(JSON.parse(ls('oac-mute') || '[]')); } catch (e) {}
function saveMuted() {
  ls('oac-mute', JSON.stringify([...muted])); const w = $('#muted'); w.textContent = ''; $('#mutedSec').hidden = !muted.size;
  muted.forEach(n => { const b = document.createElement('button'), c = document.createElement('small'); b.className = 'rm'; b.append(n); c.textContent = 'unhide'; b.append(c); b.onclick = () => { muted.delete(n); saveMuted(); markHid(n, false); }; w.append(b); });
}
$('#mmute').onclick = () => {
  const n = cur.name; closeMenu(); muted.add(n); saveMuted(); markHid(n, true);
};
function markHid(n, on) {   // hidden people's messages stay in place behind a click-to-reveal cover; unhiding is instant
  [...log.querySelectorAll('.m')].forEach(m => { const x = store.get(m.id.slice(2)); if (x && x.name === n) { m.classList.toggle('hid', on); if (!on) m.classList.remove('show'); } });
}
$('#mreport').onclick = () => { T.send({ type: 'report', id: cur.id }); closeMenu(); T.on({ type: 'system', text: 'Thanks. The message was reported.' }); };
function showLim(h, p) { $('#lh').textContent = h; $('#lp').textContent = p; $('#clock').hidden = true; $('#lf').hidden = true; $('#lim').classList.add('on'); }
saveMuted();
sheet.addEventListener('click', e => { if (e.target === sheet) closeMenu(); });
function drawRx(el, x) {
  el.textContent = '';
  Object.entries(x.rx || {}).forEach(([n, a]) => {
    if (!EMO.includes(n)) return;
    const b = document.createElement('button'), i = new Image(); b.className = 'chip' + (a.includes(me) ? ' me' : '');
    i.src = 'emoji/' + n + '.svg'; i.alt = ':' + n + ':'; b.append(i, String(a.length)); b.onclick = () => T.send({ type: 'react', id: x.id, e: n }); el.append(b);
  });
}
const stopLp = () => { clearTimeout(lp); lp = null; };
log.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  if (!e.isPrimary) { stopLp(); return; }
  const m = e.target.closest('.m'); if (!m || e.target.closest('.chip,.sp,.rp')) return;
  lx = e.clientX; ly = e.clientY; lp = setTimeout(() => { lp = null; if (navigator.vibrate) navigator.vibrate(12); menu(m.id.slice(2)); }, 450);
});
log.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lx, e.clientY - ly) > 10) stopLp(); });
['pointerup', 'pointercancel', 'scroll'].forEach(t => log.addEventListener(t, stopLp, true));
document.addEventListener('pointerdown', e => { if (!e.isPrimary) stopLp(); }, true);                        // a second finger (screenshot gesture) cancels the hold
document.addEventListener('touchstart', e => { if (e.touches.length > 1) stopLp(); }, { passive: true, capture: true });
addEventListener('blur', stopLp); document.addEventListener('visibilitychange', stopLp);
log.addEventListener('contextmenu', e => { const m = e.target.closest('.m'); if (m) { e.preventDefault(); menu(m.id.slice(2), e); } });
$('#go').addEventListener('pointerdown', e => e.preventDefault());                                              // Send keeps the keyboard open
$('#emo').addEventListener('pointerdown', e => { if (!coarse()) e.preventDefault(); });

/* ---------- profile (name and color) and admin tools ---------- */
let isAdmin = false, myColor = '';
function paintMe() { $('#me').textContent = me; const av = $('#meav'); av.textContent = me[0]; setAv(av, me, myColor); }
function closeProf() { $('#prof').hidden = true; $('#edit').hidden = false; }
$('#edit').onclick = () => { $('#pname').value = me; $('#phex').value = myColor; $('#pcol').value = myColor || '#e29776'; $('#perr').textContent = ''; $('#prof').hidden = false; $('#edit').hidden = true; $('#pname').focus(); };
$('#pcol').oninput = () => { $('#phex').value = $('#pcol').value; };
$('#phex').oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test($('#phex').value)) $('#pcol').value = $('#phex').value; };
$('#pcancel').onclick = closeProf;
$('#psave').onclick = () => {
  const hex = $('#phex').value.trim();
  if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) { $('#perr').textContent = 'The color should look like #e29776'; return; }
  T.send({ type: 'profile', name: $('#pname').value.trim(), color: hex });
};
$('#mdel').onclick = () => { T.send({ type: 'adm', action: 'delete', id: cur.id }); closeMenu(); };
$('#mto').onclick = () => { T.send({ type: 'adm', action: 'timeout', id: cur.id }); closeMenu(); };

/* ---------- sending ---------- */
function send() {
  const t = clean(box.value); if (!t) return;
  const now = Date.now(); bucket.t = Math.min(5, bucket.t + (now - bucket.at) / 1000); bucket.at = now;
  if (!WS_URL) { if (bucket.t < 1) { modWarn(); return; } bucket.t--; }
  T.send({ type: 'msg', text: t, replyTo: reply && reply.id });
  box.value = ''; grow(); setReply(null); closePk(); const u = (t.match(/:([a-z0-9]+):/g) || []).map(q => q.slice(1, -1)).filter(n => EMO.includes(n)); if (u.length) useEmo(u);
}
function grow() {
  if (!box.value) { box.style.height = '44px'; box.style.overflowY = 'hidden'; $('#cnt').textContent = ''; $('#go').disabled = true; return; }
  const max = Math.min(200, innerHeight * .3);
  box.style.height = '44px'; const h = Math.min(Math.max(box.scrollHeight + 2, 44), max);
  box.style.height = h + 'px'; box.style.overflowY = box.scrollHeight + 2 > max ? 'auto' : 'hidden';
  const n = box.value.length; $('#cnt').textContent = n > 240 ? n + ' / ' + LIM : ''; $('#go').disabled = !box.value.trim();
}
box.addEventListener('input', grow);
box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); send(); } });
$('#go').onclick = send; $('#rx').onclick = () => setReply(null);
$('#menu').onclick = toggleSide;
$('#new').onclick = () => { log.scrollTop = log.scrollHeight; };
log.addEventListener('scroll', () => { if (log.scrollHeight - log.scrollTop - log.clientHeight < 90) { unread = 0; $('#new').classList.remove('on'); } });
$('#emo').onclick = () => { if (pkEl.classList.contains('on')) closePk(); else { if (coarse()) box.blur(); openPk(); } };
document.addEventListener('click', e => { if (!e.target.closest('#pk,#emo')) closePk(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closePk(); } });
let stick = true;
log.addEventListener('scroll', () => { stick = log.scrollHeight - log.scrollTop - log.clientHeight < 90; });
if (window.ResizeObserver) new ResizeObserver(() => { if (stick) log.scrollTop = log.scrollHeight; }).observe(log);

/* ---------- daily limit screen (preview it by adding #limit to the address) ---------- */
function tick() { const d = new Date(), nx = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1), s = Math.floor((nx - d) / 1000), p = x => String(x).padStart(2, '0'); $('#clock').textContent = `${p(s / 3600 | 0)}:${p(s % 3600 / 60 | 0)}:${p(s % 60)}`; }
setInterval(tick, 1000); tick();

if (innerWidth < 760) $('#side').classList.add('closed');
if (location.hash === '#limit') $('#lim').classList.add('on');
drawRooms();
/* ---------- @mention suggestions and keyboard navigation ---------- */
const ac = $('#ac'); let sel = null, acList = [], acI = 0;
function select(m) { if (sel) sel.classList.remove('sel'); sel = m; if (m) { m.classList.add('sel'); m.scrollIntoView({ block: 'nearest' }); } }
function acHide() { ac.classList.remove('on'); acList = []; }
function acPick(n) {
  const pos = box.selectionStart, before = box.value.slice(0, pos).replace(/@[A-Za-z0-9]*$/, '@' + n + ' ');
  box.value = before + box.value.slice(pos); box.selectionStart = box.selectionEnd = before.length; acHide(); grow(); box.focus();
}
function acUpdate() {
  const m = /(^|\s)@([A-Za-z0-9]{0,24})$/.exec(box.value.slice(0, box.selectionStart)); if (!m) return acHide();
  const q = m[2].toLowerCase(), seen = {}, names = [];
  [...store.values()].reverse().forEach(x => { if (!x.mod && x.name !== me && !seen[x.name] && x.name.indexOf(q) === 0) { seen[x.name] = 1; names.push(x.name); } });
  acList = names.slice(0, 6); acI = 0; if (!acList.length) return acHide();
  ac.textContent = '';
  acList.forEach((n, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'aci' + (i ? '' : ' on'); b.textContent = '@' + n; b.addEventListener('pointerdown', e => e.preventDefault()); b.onclick = () => acPick(n); ac.append(b); });
  ac.classList.add('on');
}
box.addEventListener('input', acUpdate);
box.addEventListener('keydown', e => {
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (acList.length) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { stop(); acI = (acI + (e.key === 'ArrowDown' ? 1 : acList.length - 1)) % acList.length; [...ac.children].forEach((b, i) => b.classList.toggle('on', i === acI)); return; }
    if (e.key === 'Tab' || e.key === 'Enter') { stop(); acPick(acList[acI]); return; }
    if (e.key === 'Escape') { acHide(); return; }
  }
  const all = () => [...log.querySelectorAll('.m:not(.mod)')];
  if (sel) {   // message selection: Up/Down move, Enter replies, Right opens the menu, any other key goes back to typing
    const list = all(), i = list.indexOf(sel);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { stop(); const j = i + (e.key === 'ArrowUp' ? -1 : 1); select(j >= list.length ? null : list[Math.max(0, j)]); return; }
    if (e.key === 'Enter') { stop(); const x = store.get(sel.id.slice(2)); select(null); if (x) setReply(x); return; }
    if (e.key === 'ArrowRight') { stop(); const r = sel.getBoundingClientRect(); menu(sel.id.slice(2), { clientX: r.left + 60, clientY: r.top }); return; }
    select(null);
  } else if (e.key === 'ArrowUp' && !box.value) { const list = all(); if (list.length) { stop(); select(list[list.length - 1]); } }
  else if (e.key === 'Escape' && reply) setReply(null);
}, true);
if (window.visualViewport) {   // iOS Safari: keep the layout the size of the visible area when the keyboard opens
  const fit = () => { if (visualViewport.scale > 1.01) return; document.body.style.height = visualViewport.height + 'px'; scrollTo(0, 0); };
  visualViewport.addEventListener('resize', fit); visualViewport.addEventListener('scroll', fit); fit();
}
grow();
T.start();

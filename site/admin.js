'use strict';
const API = 'https://oac-worker.hymeys.workers.dev';
const $ = s => document.querySelector(s), out = $('#out');
let tok = '';
try { tok = sessionStorage.getItem('oac-adm') || ''; } catch (e) {}
function show() { $('#login').hidden = !!tok; $('#panel').hidden = !tok; }
async function post(path, body, token) {
  try {
    const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
    const r = await fetch(API + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); j.status = r.status; return j;
  } catch (e) { return { status: 0, error: 'Could not reach the server.' }; }
}
$('#go').onclick = async () => {
  out.textContent = '...';
  const j = await post('/admin/login', { key: $('#key').value.trim(), code: $('#code').value.trim() });
  if (j.token) {
    tok = j.token; try { sessionStorage.setItem('oac-adm', tok); } catch (e) {}
    $('#key').value = ''; $('#code').value = '';
    out.textContent = j.twoFactor ? '' : 'Signed in with the key only. Set up the authenticator code below to protect this page properly.'; show();
  } else out.textContent = j.error || 'Could not sign in.';
};
async function act(action, extra) {
  out.textContent = '...';
  const j = await post('/admin', Object.assign({ action }, extra), tok);
  if (j.status === 401) { tok = ''; try { sessionStorage.removeItem('oac-adm'); } catch (e) {} show(); out.textContent = j.error || 'Please sign in again.'; return; }
  out.textContent = JSON.stringify(j, null, 2);
}
document.querySelectorAll('[data-a]').forEach(b => {
  b.onclick = () => { if (b.dataset.a === 'clear' && !confirm('Clear the chat for everyone and delete all saved messages?')) return; act(b.dataset.a, { text: $('#msg').value }); };
});
$('#join').onclick = () => {
  const n = $('#aname').value.trim();
  if (!/^[A-Za-z][A-Za-z0-9]{2,15}$/.test(n)) { out.textContent = 'Pick a name: 3 to 16 letters or numbers.'; return; }
  try { sessionStorage.setItem('oac-admin', tok); sessionStorage.setItem('oac-aname', n); } catch (e) {}
  location.href = '/';
};
$('#out2').onclick = () => { tok = ''; try { sessionStorage.removeItem('oac-adm'); sessionStorage.removeItem('oac-admin'); } catch (e) {} show(); out.textContent = 'Signed out.'; };
$('#gen').onclick = () => {
  const b = new Uint8Array(20); crypto.getRandomValues(b);
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '', s = '';
  b.forEach(x => { bits += x.toString(2).padStart(8, '0'); });
  for (let i = 0; i + 5 <= bits.length; i += 5) s += A[parseInt(bits.slice(i, i + 5), 2)];
  $('#sec').textContent = s + '\n\nIn your authenticator app: add an account, choose "enter a setup key", and paste this key.\nThen add the same key as a Worker secret named ADMIN_TOTP.';
};
show();

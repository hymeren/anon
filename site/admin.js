'use strict';
const API = 'https://oac-worker.hymeys.workers.dev/admin';
const $ = s => document.querySelector(s), out = $('#out');
async function call(action, text) {
  const key = $('#key').value.trim();
  if (!key) { out.textContent = 'Enter the admin key first.'; return; }
  out.textContent = '...';
  try {
    const r = await fetch(API, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, text }) });
    out.textContent = r.status === 401 ? 'Wrong key.' : JSON.stringify(await r.json(), null, 2);
  } catch (e) { out.textContent = 'Could not reach the server.'; }
}
document.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => call(b.dataset.a, $('#msg').value); });

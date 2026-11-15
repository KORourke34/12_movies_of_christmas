// admin.js – admin login + dashboard (edit doors, preview, reorder, manage friends, backup).
let doors = [];
const msg = t => { $('#msg').textContent = t; };
const show = ok => { $('#login').hidden = ok; $('#dash').hidden = !ok; };
api('/me').then(m => { if (!m.admin) throw 0; show(true); load(); }).catch(() => show(false));

$('#lf').onsubmit = async e => { e.preventDefault();
  try { const r = await api('/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value } });
    if (!r.admin) { await api('/logout', { method: 'POST' }); throw new Error('That account is not an admin'); }
    show(true); load(); } catch (x) { $('#err').textContent = x.message; } };

async function load() { doors = await api('/admin/doors'); render(); users(); }
function render() {
  $('#doors').innerHTML = doors.map(d => `<form class="dform" data-n="${d.door}"><h3>Door ${d.door}</h3>
    <label>Unlock date <input type="date" name="unlock_at" value="${esc(d.unlock_at)}" required></label>
    <label>Title <input name="title" value="${esc(d.title)}"></label>
    <div class="row"><label>Year <input name="year" value="${esc(d.year)}"></label><label>Runtime <input name="runtime" value="${esc(d.runtime)}" placeholder="97 min"></label>
    <label>Genre <input name="genre" value="${esc(d.genre)}"></label></div>
    <label>Where to watch <input name="watch" value="${esc(d.watch)}"></label>
    <label>Synopsis <textarea name="synopsis" rows="3">${esc(d.synopsis)}</textarea></label>
    <label>Poster URL <input name="poster" value="${esc(d.poster)}"></label>
    <label>…or upload a poster <input type="file" accept="image/*" data-act="file"></label>
    <div class="row"><button class="btn">Save</button><button type="button" class="btn alt" data-act="preview">Preview</button>
    <button type="button" class="btn alt" data-act="up" aria-label="Swap with door ${d.door - 1}">↑</button>
    <button type="button" class="btn alt" data-act="down" aria-label="Swap with door ${d.door + 1}">↓</button></div></form>`).join('');
}
const data = f => Object.fromEntries(new FormData(f));
const toData = file => new Promise(r => { const i = new Image(); i.onload = () => {            // shrink uploads to 400px wide
  const s = Math.min(1, 400 / i.width), c = document.createElement('canvas'); c.width = i.width * s; c.height = i.height * s;
  c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); r(c.toDataURL('image/jpeg', .8)); }; i.src = URL.createObjectURL(file); });

$('#doors').onsubmit = async e => { e.preventDefault(); const f = e.target;
  try { await api('/admin/doors/' + f.dataset.n, { method: 'PUT', body: data(f) }); msg('Saved door ' + f.dataset.n); } catch (x) { msg(x.message); } };
$('#doors').onchange = async e => { if (e.target.dataset.act === 'file' && e.target.files[0])
  e.target.form.poster.value = await toData(e.target.files[0]); };
$('#doors').onclick = async e => { const a = e.target.dataset.act, f = e.target.closest('form'); if (!f || !a || a === 'file') return;
  const n = +f.dataset.n; if (a === 'preview') return openModal(data(f));
  const other = a === 'up' ? n - 1 : n + 1; if (other < 1 || other > doors.length) return;
  await api('/admin/swap', { method: 'POST', body: { a: n, b: other } }); load(); msg(`Swapped movies on doors ${n} and ${other}`); };

async function users() { const u = await api('/admin/users');
  $('#users').innerHTML = u.map(x => `<li>${esc(x.name)}${x.admin ? ' (admin)' : ` <button class="btn alt" data-u="${esc(x.username)}">Remove</button>`}</li>`).join(''); }
$('#users').onclick = async e => { const u = e.target.dataset.u; if (u && confirm('Remove ' + u + '?')) { await api('/admin/users/' + encodeURIComponent(u), { method: 'DELETE' }); users(); } };
$('#uf').onsubmit = async e => { e.preventDefault();
  try { await api('/admin/users', { method: 'POST', body: { username: $('#nu').value, password: $('#np').value } }); e.target.reset(); users(); }
  catch (x) { msg(x.message); } };
$('#rs').onchange = async e => { try { await api('/admin/restore', { method: 'POST', body: JSON.parse(await e.target.files[0].text()) }); load(); msg('Backup restored'); }
  catch { msg('That file could not be restored'); } };

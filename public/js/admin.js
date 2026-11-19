// admin.js – admin login + dashboard (edit doors, preview, reorder, manage friends, backup).
let doors = [];
let liveRefresh;

const msg = (t) => {
  $('#msg').textContent = t;
};
const show = (ok) => {
  $('#login').hidden = ok;
  $('#dash').hidden = !ok;
  clearInterval(liveRefresh);
  if (ok) liveRefresh = setInterval(refreshLiveCounts, 15000);
};

api('/me')
  .then((m) => {
    if (!m.admin) throw 0;
    show(true);
    load();
  })
  .catch(() => show(false));

$('#lf').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await api('/login', {
      method: 'POST',
      body: { username: $('#u').value, password: $('#p').value },
    });
    if (!r.admin) {
      await api('/logout', { method: 'POST' });
      throw new Error('That account is not an admin');
    }
    show(true);
    load();
  } catch (x) {
    $('#err').textContent = x.message;
  }
};

async function load() {
  doors = await api('/admin/doors');
  render();
  users();
}

function render() {
  $('#doors').innerHTML = doors
    .map(
      (d) => `<form class="dform" data-n="${d.door}"><h3>Door ${d.door}</h3>
    <label>Unlock date <input type="date" name="unlock_at" value="${esc(d.unlock_at)}" required></label>
    <label>Title <input name="title" value="${esc(d.title)}"></label>
    <div class="row">
      <label>Year <input name="year" value="${esc(d.year)}"></label>
      <label>Runtime <input name="runtime" value="${esc(d.runtime)}" placeholder="97 min"></label>
      <label>Genre <input name="genre" value="${esc(d.genre)}"></label>
    </div>
    <label>Where to watch <input name="watch" value="${esc(d.watch)}"></label>
    <label>Synopsis <textarea name="synopsis" rows="3">${esc(d.synopsis)}</textarea></label>
    <label>Poster URL <input name="poster" value="${esc(d.poster)}"></label>
    <label>…or upload a poster <input type="file" accept="image/*" data-act="file"></label>
    <label>Trailer URL (http or https) <input name="trailer" type="url" value="${esc(d.trailer)}" placeholder="https://…"></label>
    <p class="rating-admin">Festive rating: <b>${d.rating_average ?? '—'}/5</b> (${d.rating_count} rating${d.rating_count === 1 ? '' : 's'})</p>
    <fieldset class="vote-admin">
      <legend>Friends' pick vote door</legend>
      <label class="inline-check"><input type="checkbox" name="vote_enabled" ${d.vote_enabled ? 'checked' : ''}> Enable voting on this door</label>
      <label>Voting opens <input type="date" name="vote_open_at" value="${esc(d.vote_open_at)}"></label>
      <p class="small">Add 2–5 candidate movies. Voting closes automatically when the unlock date arrives.</p>
      <div class="candidate-fields">${Array.from({ length: 5 }, (_, index) => {
        const candidate = d.vote_candidates[index] || {};
        return `<fieldset class="candidate-form"><legend>Candidate ${index + 1}</legend>
          <label>Title <input name="candidate_title_${index}" value="${esc(candidate.title)}"></label>
          <label>Year <input name="candidate_year_${index}" value="${esc(candidate.year)}"></label>
          <label>Poster URL <input name="candidate_poster_${index}" value="${esc(candidate.poster)}"></label>
          <label>Short synopsis <textarea name="candidate_synopsis_${index}" rows="2">${esc(candidate.synopsis)}</textarea></label>
        </fieldset>`;
      }).join('')}</div>
      <label>Winner on reveal
        <select name="vote_winner">
          <option value="">Automatic (most votes; ties go to first)</option>
          ${d.vote_candidates.map((candidate, index) => `<option value="${index}" ${d.vote_winner === index ? 'selected' : ''}>${esc(candidate.title)} — ${d.vote_counts[index] || 0} votes</option>`).join('')}
        </select>
      </label>
      <p class="vote-live">Live votes: ${d.vote_candidates.map((candidate, index) => `${esc(candidate.title)}: ${d.vote_counts[index] || 0}`).join(' · ') || 'No candidates yet'}</p>
    </fieldset>
    <div class="row">
      <button class="btn">Save</button>
      <button type="button" class="btn alt" data-act="preview">Preview</button>
      <button type="button" class="btn alt" data-act="up" aria-label="Swap with door ${d.door - 1}">↑</button>
      <button type="button" class="btn alt" data-act="down" aria-label="Swap with door ${d.door + 1}">↓</button>
    </div>
  </form>`,
    )
    .join('');
}

async function refreshLiveCounts() {
  if (document.hidden || $('#dash').hidden) return;
  try {
    const updated = await api('/admin/doors');
    updated.forEach((door) => {
      const form = $(`.dform[data-n="${door.door}"]`);
      if (!form) return;
      const rating = form.querySelector('.rating-admin');
      const votes = form.querySelector('.vote-live');
      rating.textContent = `Festive rating: ${door.rating_average ?? '—'}/5 (${door.rating_count} rating${door.rating_count === 1 ? '' : 's'})`;
      votes.textContent = `Live votes: ${door.vote_candidates.map((candidate, index) => `${candidate.title}: ${door.vote_counts[index] || 0}`).join(' · ') || 'No candidates yet'}`;
    });
  } catch (error) {
    msg(`Could not refresh ratings and votes: ${error.message}`);
  }
}

const data = (f) => {
  const result = Object.fromEntries(new FormData(f));
  result.vote_enabled = f.elements.vote_enabled.checked;
  result.vote_candidates = Array.from({ length: 5 }, (_, index) => ({
    title: f.elements[`candidate_title_${index}`].value,
    year: f.elements[`candidate_year_${index}`].value,
    poster: f.elements[`candidate_poster_${index}`].value,
    synopsis: f.elements[`candidate_synopsis_${index}`].value,
  })).filter((candidate) => candidate.title.trim());
  return result;
};
const toData = (file) =>
  new Promise((r) => {
    const i = new Image();
    i.onload = () => {
      // shrink uploads to 400px wide
      const s = Math.min(1, 400 / i.width);
      const c = document.createElement('canvas');
      c.width = i.width * s;
      c.height = i.height * s;
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
      r(c.toDataURL('image/jpeg', 0.8));
    };
    i.src = URL.createObjectURL(file);
  });

$('#doors').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/admin/doors/' + f.dataset.n, {
      method: 'PUT',
      body: data(f),
    });
    await load();
    msg('Saved door ' + f.dataset.n);
  } catch (x) {
    msg(x.message);
  }
};

$('#doors').onchange = async (e) => {
  if (e.target.dataset.act === 'file' && e.target.files[0]) {
    e.target.form.poster.value = await toData(e.target.files[0]);
  }
};

$('#doors').onclick = async (e) => {
  const a = e.target.dataset.act;
  const f = e.target.closest('form');
  if (!f || !a || a === 'file') return;

  const n = +f.dataset.n;
  if (a === 'preview') return openModal(data(f));

  const other = a === 'up' ? n - 1 : n + 1;
  if (other < 1 || other > doors.length) return;

  await api('/admin/swap', {
    method: 'POST',
    body: { a: n, b: other },
  });
  load();
  msg(`Swapped movies on doors ${n} and ${other}`);
};

async function users() {
  const u = await api('/admin/users');
  $('#users').innerHTML = u
    .map(
      (x) =>
        `<li>${esc(x.name)}${
          x.admin
            ? ' (admin)'
            : ` <button class="btn alt" data-u="${esc(x.username)}">Remove</button>`
        }</li>`,
    )
    .join('');
}

$('#users').onclick = async (e) => {
  const u = e.target.dataset.u;
  if (u && confirm('Remove ' + u + '?')) {
    await api('/admin/users/' + encodeURIComponent(u), { method: 'DELETE' });
    users();
  }
};

$('#uf').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('/admin/users', {
      method: 'POST',
      body: { username: $('#nu').value, password: $('#np').value },
    });
    e.target.reset();
    users();
  } catch (x) {
    msg(x.message);
  }
};

$('#rs').onchange = async (e) => {
  try {
    await api('/admin/restore', {
      method: 'POST',
      body: JSON.parse(await e.target.files[0].text()),
    });
    load();
    msg('Backup restored');
  } catch {
    msg('That file could not be restored');
  }
};

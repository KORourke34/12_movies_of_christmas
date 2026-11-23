// admin.js – admin login + dashboard (edit doors, preview, reorder, manage friends, backup).
let doors = [];
let liveRefresh;
const openMoviesKey = 'admin-open-movies';
const tabNames = ['overview', 'movies', 'accounts', 'backup'];

function setActiveTab(name, { updateHash = false, focus = false } = {}) {
  const active = tabNames.includes(name) ? name : 'overview';
  tabNames.forEach((tabName) => {
    const tab = $(`#tab-${tabName}`);
    const selected = tabName === active;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(`#panel-${tabName}`).hidden = !selected;
  });
  if (focus) $(`#tab-${active}`).focus();
  if (updateHash && location.hash !== `#${active}`) {
    location.hash = active;
  }
}

function activateTabFromHash() {
  setActiveTab(location.hash.slice(1));
}

document.querySelector('[role="tablist"]').addEventListener('click', (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) setActiveTab(tab.id.slice(4), { updateHash: true });
});

document.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
  const currentIndex = tabNames.indexOf(event.target.id.slice(4));
  if (currentIndex < 0) return;

  let nextIndex;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % tabNames.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + tabNames.length) % tabNames.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = tabNames.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  setActiveTab(tabNames[nextIndex], { updateHash: true, focus: true });
});

if (!location.hash) {
  history.replaceState(null, '', `${location.pathname}${location.search}#overview`);
}
activateTabFromHash();
window.addEventListener('hashchange', activateTabFromHash);

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

async function load(openDoor = null) {
  doors = await api('/admin/doors');
  render(openDoor);
  await users();
}

function render(openDoor = null) {
  const storedOpen = readStored(openMoviesKey, []);
  const openDoors = new Set(Array.isArray(storedOpen) ? storedOpen.map(Number) : []);
  if (openDoor !== null) openDoors.add(Number(openDoor));

  $('#doors').innerHTML = doors
    .map(
      (d) => {
        const isOpen = openDoors.has(d.door);
        const panelId = `door-panel-${d.door}`;
        const hasMovie = Boolean(d.title && d.title.trim());
        return `<article class="movie-card ${isOpen ? 'is-open' : ''}" data-door="${d.door}">
    <button class="movie-card-toggle" type="button" aria-expanded="${isOpen}" aria-controls="${panelId}" data-act="toggle">
      <span class="movie-card-door">Door ${d.door}</span>
      <span class="movie-card-title">${esc(hasMovie ? d.title : 'No movie yet')}</span>
      <span class="movie-card-date">Unlocks ${esc(d.unlock_at)}</span>
      <span class="movie-card-status ${hasMovie ? '' : 'empty'}">${hasMovie ? 'Ready' : 'Empty'}</span>
      <span class="movie-card-chevron" aria-hidden="true">⌄</span>
    </button>
    <div id="${panelId}" class="movie-panel" aria-hidden="${!isOpen}" ${isOpen ? '' : 'inert'}>
      <div class="movie-panel-inner">
      <form class="dform" data-n="${d.door}">
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
      <button type="button" class="btn alt" data-act="clear">Clear movie</button>
      <button type="button" class="btn alt" data-act="up" aria-label="Swap with door ${d.door - 1}">↑</button>
      <button type="button" class="btn alt" data-act="down" aria-label="Swap with door ${d.door + 1}">↓</button>
    </div>
      </form>
      </div>
    </div>
  </article>`;
      },
    )
    .join('');
  saveOpenMovieCards();
}

function saveOpenMovieCards() {
  const openDoors = [...document.querySelectorAll('.movie-card.is-open')]
    .map((card) => Number(card.dataset.door));
  try {
    localStorage.setItem(openMoviesKey, JSON.stringify(openDoors));
  } catch (error) {
    msg(`Could not remember expanded movie cards: ${error.message}`);
  }
}

function setMovieCardOpen(card, open) {
  card.classList.toggle('is-open', open);
  const button = card.querySelector('.movie-card-toggle');
  const panel = card.querySelector('.movie-panel');
  button.setAttribute('aria-expanded', String(open));
  panel.setAttribute('aria-hidden', String(!open));
  panel.toggleAttribute('inert', !open);
  saveOpenMovieCards();
}

function updateOverview(friendUsers = null) {
  const filled = doors.filter((door) => door.title && door.title.trim()).length;
  $('#overview-movies').textContent = `${filled} of ${doors.length} doors have a movie`;

  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const nextDoor = doors
    .filter((door) => door.unlock_at >= todayString)
    .sort((a, b) => a.unlock_at.localeCompare(b.unlock_at) || a.door - b.door)[0];
  if (!nextDoor) {
    $('#overview-next').textContent = 'All doors have unlocked';
  } else {
    const date = new Date(`${nextDoor.unlock_at}T00:00:00`).toLocaleDateString();
    const when = nextDoor.unlock_at === todayString ? 'Today' : date;
    $('#overview-next').textContent = `Door ${nextDoor.door} · ${when}`;
  }
  if (friendUsers) {
    const count = friendUsers.filter((user) => !user.admin).length;
    $('#overview-friends').textContent = `${count} friend account${count === 1 ? '' : 's'}`;
  }
}

$('#expand-all').onclick = () => {
  document.querySelectorAll('.movie-card').forEach((card) => setMovieCardOpen(card, true));
};

$('#collapse-all').onclick = () => {
  document.querySelectorAll('.movie-card').forEach((card) => setMovieCardOpen(card, false));
};

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
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      reject(new Error('Choose an image smaller than 10 MB'));
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      cleanup();
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth > 10000 ||
        image.naturalHeight > 10000
      ) {
        reject(new Error('That image has unsupported dimensions'));
        return;
      }

      try {
        const scale = Math.min(1, 400 / image.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Could not process that image'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        if (dataUrl.length > 2_500_000) {
          reject(new Error('That image is too large after processing'));
          return;
        }
        resolve(dataUrl);
      } catch {
        reject(new Error('Could not process that image'));
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('Could not read that image'));
    };
    image.src = objectUrl;
  });

$('#doors').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const doorNumber = Number(f.dataset.n);
  try {
    await api('/admin/doors/' + f.dataset.n, {
      method: 'PUT',
      body: data(f),
    });
    await load(doorNumber);
    msg('Saved door ' + f.dataset.n);
  } catch (x) {
    const card = f.closest('.movie-card');
    if (card) setMovieCardOpen(card, true);
    msg(x.message);
  }
};

$('#doors').onchange = async (e) => {
  if (e.target.dataset.act === 'file' && e.target.files[0]) {
    try {
      e.target.form.poster.value = await toData(e.target.files[0]);
    } catch (error) {
      msg(error.message);
      e.target.value = '';
    }
  }
};

$('#doors').onclick = async (e) => {
  const toggle = e.target.closest('.movie-card-toggle');
  if (toggle) {
    const card = toggle.closest('.movie-card');
    setMovieCardOpen(card, toggle.getAttribute('aria-expanded') !== 'true');
    return;
  }

  const a = e.target.dataset.act;
  const f = e.target.closest('form');
  if (!f || !a || a === 'file') return;

  const n = +f.dataset.n;
  if (a === 'preview') return openModal(data(f));
  if (a === 'clear') {
    if (!confirm(`Remove the movie details from door ${n}?`)) return;
    [
      'title',
      'year',
      'runtime',
      'genre',
      'watch',
      'synopsis',
      'poster',
      'trailer',
      'vote_open_at',
    ].forEach((name) => {
      f.elements[name].value = '';
    });
    f.elements.vote_enabled.checked = false;
    f.elements.vote_winner.value = '';
    try {
      await api('/admin/doors/' + n, { method: 'PUT', body: data(f) });
      await load(n);
      msg(`Cleared movie details from door ${n}`);
    } catch (error) {
      const card = f.closest('.movie-card');
      if (card) setMovieCardOpen(card, true);
      msg(error.message);
    }
    return;
  }

  const other = a === 'up' ? n - 1 : n + 1;
  if (other < 1 || other > doors.length) return;

  await api('/admin/swap', {
    method: 'POST',
    body: { a: n, b: other },
  });
  await load(n);
  msg(`Swapped movies on doors ${n} and ${other}`);
};

async function users() {
  const u = await api('/admin/users');
  $('#users').innerHTML = u
    .map(
      (x) => {
        const searchText = [x.name, x.username, x.email].filter(Boolean).join(' ');
        return `<li class="account-item" data-search="${esc(searchText)}">
          <div class="account-item-details">
            <strong>${esc(x.name)}${x.admin ? ' (admin)' : ''}</strong>
            <span class="small">${esc(x.username)}</span>
            ${x.admin ? '' : `<span class="small">${esc(x.email || 'No email set')}</span>`}
          </div>
          ${x.admin ? '' : `<div class="account-item-actions">
            <button class="btn alt" type="button" data-email="${esc(x.username)}" data-current-email="${esc(x.email || '')}">Set email</button>
            <button class="btn alt" type="button" data-reset="${esc(x.username)}">Reset password</button>
            <button class="btn alt" type="button" data-u="${esc(x.username)}">Remove</button>
          </div>`}
        </li>`;
      },
    )
    .join('');
  filterUsers();
  updateOverview(u);
  return u;
}

function filterUsers() {
  const query = $('#user-search').value.trim().toLowerCase();
  const userItems = [...$('#users').children];
  let visibleCount = 0;

  userItems.forEach((item) => {
    const matches = item.dataset.search.toLowerCase().includes(query);
    item.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  const status = $('#user-search-status');
  if (!query) {
    status.textContent = `Showing all ${userItems.length} account${userItems.length === 1 ? '' : 's'}.`;
  } else if (visibleCount === 0) {
    status.textContent = 'No accounts match your search.';
  } else {
    status.textContent = `Showing ${visibleCount} of ${userItems.length} accounts.`;
  }
}

$('#user-search').addEventListener('input', filterUsers);

$('#users').onclick = async (e) => {
  const emailUsername = e.target.dataset.email;
  if (emailUsername) return openEmailModal(emailUsername, e.target.dataset.currentEmail);
  const resetUsername = e.target.dataset.reset;
  if (resetUsername) return openPasswordReset(resetUsername);

  const u = e.target.dataset.u;
  if (u && confirm('Remove ' + u + '?')) {
    await api('/admin/users/' + encodeURIComponent(u), { method: 'DELETE' });
    users();
  }
};

const randomWord = (words) => {
  const index = crypto.getRandomValues(new Uint32Array(1))[0] % words.length;
  return words[index];
};

const generateMemorablePassword = () => {
  const adjectives = ['Bright', 'Cozy', 'Happy', 'Snowy', 'Jolly', 'Festive'];
  const nouns = ['Pine', 'Santa', 'Reindeer', 'Candle', 'Star', 'Cookie'];
  const number = crypto.getRandomValues(new Uint32Array(1))[0] % 900 + 100;
  return `${randomWord(adjectives)}${randomWord(nouns)}${number}`;
};

function openEmailModal(username, currentEmail) {
  $('#mbody').innerHTML = `
    <h2>Set email for ${esc(username)}</h2>
    <p>This email will receive password reset links.</p>
    <form id="friend-email-form">
      <label for="friend-email">
        Email address
        <input
          id="friend-email"
          type="email"
          maxlength="254"
          autocomplete="email"
          value="${esc(currentEmail)}"
          required
        >
      </label>
      <button class="btn" type="submit">Save email</button>
      <p id="friend-email-status" role="status"></p>
      <p id="friend-email-error" class="err" role="alert"></p>
    </form>`;
  $('#modal').hidden = false;

  $('#friend-email-form').onsubmit = async (event) => {
    event.preventDefault();
    $('#friend-email-status').textContent = '';
    $('#friend-email-error').textContent = '';
    try {
      await api('/admin/users/' + encodeURIComponent(username) + '/email', {
        method: 'PUT',
        body: { email: $('#friend-email').value },
      });
      $('#friend-email-status').textContent = `Email saved for ${username}.`;
      users();
      setTimeout(closeModal, 900);
    } catch (error) {
      $('#friend-email-error').textContent = error.message;
    }
  };
}

function openPasswordReset(username) {
  $('#mbody').innerHTML = `
    <h2>Reset ${esc(username)}'s password</h2>
    <p>The friend will be signed out and required to choose a new password next.</p>
    <form id="reset-password-form">
      <label for="reset-password">
        New password
        <input
          id="reset-password"
          type="password"
          minlength="8"
          maxlength="72"
          autocomplete="new-password"
          required
        >
      </label>
      <label for="reset-password-confirm">
        Confirm password
        <input
          id="reset-password-confirm"
          type="password"
          minlength="8"
          maxlength="72"
          autocomplete="new-password"
          required
        >
      </label>
      <div class="row">
        <button id="generate-password" class="btn alt" type="button">Generate one</button>
        <button id="copy-password" class="btn alt" type="button">Copy</button>
      </div>
      <button class="btn" type="submit">Reset password</button>
      <p id="reset-password-status" role="status"></p>
      <p id="reset-password-error" class="err" role="alert"></p>
    </form>`;
  $('#modal').hidden = false;
  setupPasswordToggles($('#mbody'));

  $('#generate-password').onclick = () => {
    const password = generateMemorablePassword();
    $('#reset-password').value = password;
    $('#reset-password-confirm').value = password;
    $('#reset-password-status').textContent = 'Password generated.';
  };

  $('#copy-password').onclick = async () => {
    const password = $('#reset-password').value;
    if (!password) {
      $('#reset-password-error').textContent = 'Generate or enter a password first.';
      return;
    }
    try {
      await navigator.clipboard.writeText(password);
      $('#reset-password-status').textContent = 'Password copied.';
    } catch {
      $('#reset-password-error').textContent = 'Could not copy the password.';
    }
  };

  $('#reset-password-form').onsubmit = async (event) => {
    event.preventDefault();
    const password = $('#reset-password').value;
    const confirmation = $('#reset-password-confirm').value;
    $('#reset-password-status').textContent = '';
    $('#reset-password-error').textContent = '';

    if (password !== confirmation) {
      $('#reset-password-error').textContent = 'Passwords do not match.';
      return;
    }

    try {
      await api('/admin/users/' + encodeURIComponent(username) + '/password', {
        method: 'POST',
        body: { password },
      });
      $('#reset-password-status').textContent = `Password reset for ${username}.`;
      users();
      setTimeout(closeModal, 900);
    } catch (error) {
      $('#reset-password-error').textContent = error.message;
    }
  };
}

function closeModal() {
  $('#modal').hidden = true;
  $('#mbody').innerHTML = '';
}

$('#close').onclick = closeModal;

$('#uf').onsubmit = async (e) => {
  e.preventDefault();
  $('#account-create-error').textContent = '';
  if ($('#np').value !== $('#ncp').value) {
    $('#account-create-error').textContent = 'The passwords do not match. Enter the same password in both fields.';
    $('#ncp').focus();
    return;
  }

  try {
    await api('/admin/users', {
      method: 'POST',
      body: {
        username: $('#nu').value,
        password: $('#np').value,
        email: $('#ne').value,
      },
    });
    e.target.reset();
    await users();
    msg('Friend account created.');
  } catch (x) {
    $('#account-create-error').textContent = x.message;
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

// fx.js – shared helpers: preferences, snow, fairy lights, confetti, movie modal.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
const readStored = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
};
const storedPrefs = readStored('prefs', {});
const prefs =
  storedPrefs && typeof storedPrefs === 'object' && !Array.isArray(storedPrefs)
    ? storedPrefs
    : {};
const savePrefs = () =>
  localStorage.setItem('prefs', JSON.stringify(prefs));
const reduced = () =>
  prefs.calm ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
const applyPrefs = () => {
  document.documentElement.classList.toggle('calm', reduced());
  document.documentElement.dataset.theme = prefs.theme || 'midnight';
};
applyPrefs();

function startSnow() {
  // falling snow on #snow
  const c = $('#snow');
  if (!c) return;
  const x = c.getContext('2d');
  const size = () => {
    c.width = innerWidth;
    c.height = innerHeight;
  };
  size();
  addEventListener('resize', size);

  const flakes = Array.from({ length: 90 }, () => ({
    x: Math.random() * c.width,
    y: Math.random() * c.height,
    r: 1 + Math.random() * 3,
    s: 0.4 + Math.random() * 1.2,
  }));
  (function tick() {
    x.clearRect(0, 0, c.width, c.height);
    if (!reduced()) {
      x.fillStyle = '#fff';
      flakes.forEach((p) => {
        p.y += p.s;
        p.x += Math.sin(p.y / 40) * 0.4;
        if (p.y > c.height) p.y = -5;
        x.beginPath();
        x.arc(p.x, p.y, p.r, 0, 7);
        x.fill();
      });
    }
    requestAnimationFrame(tick);
  })();
}

function lights() {
  // twinkling fairy lights along the top
  const el = $('#lights');
  if (!el) return;
  const cols = ['#e0213f', '#f5c542', '#2e9e5b', '#fff7e6'];
  el.innerHTML = Array.from(
    { length: Math.ceil(innerWidth / 36) },
    (_, i) => `<i style="--c:${cols[i % 4]};--d:${(i % 5) * 0.35}s"></i>`,
  ).join('');
}

function confetti() {
  // burst from the middle of the screen
  if (reduced()) return;
  const c = $('#confetti');
  const x = c.getContext('2d');
  c.width = innerWidth;
  c.height = innerHeight;

  const cols = ['#e0213f', '#2e9e5b', '#f5c542', '#fff7e6'];
  const p = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2,
    y: innerHeight / 2,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 3,
    w: 6 + Math.random() * 6,
    col: cols[(Math.random() * 4) | 0],
    a: Math.random() * 6,
  }));

  let n = 0;
  (function t() {
    x.clearRect(0, 0, c.width, c.height);
    p.forEach((q) => {
      q.vy += 0.4;
      q.x += q.vx;
      q.y += q.vy;
      q.a += 0.2;
      x.fillStyle = q.col;
      x.save();
      x.translate(q.x, q.y);
      x.rotate(q.a);
      x.fillRect(-q.w / 2, -q.w / 4, q.w, q.w / 2);
      x.restore();
    });
    if (++n < 110) requestAnimationFrame(t);
    else x.clearRect(0, 0, c.width, c.height);
  })();
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function movieHTML(d) {
  // Keep this shared builder safe for both admin previews and friend pop-ups.
  if (d.isWelcome) {
    return `<section class="welcome-card">
      <h2 id="mt">Welcome to 12 Movies of Christmas!</h2>
      <p>Get ready to count down to Christmas with friends, one festive movie at a time.</p>
      <h3>How it works</h3>
      <ul>
        <li>Open each of the 12 numbered doors when it unlocks to discover that day's movie.</li>
        <li>Mark a movie as watched in its information card, and track your progress from your profile.</li>
        <li>Rate how Christmassy each movie is, react with emojis, and share a comment.</li>
        <li>Some doors may have a Friends' Pick vote. Cast or change your vote before that door opens.</li>
      </ul>
      <p>Use your profile button to choose an avatar and view your account details. The settings menu has sound, motion, and theme options. Have fun, and happy watching!</p>
    </section>`;
  }

  if (d.vote_open) {
    return `<section class="vote-card"><h2 id="mt">Friends' pick</h2><p>Choose the movie you want to watch. You can change your vote until this door opens.</p>
    <form id="vote-form" data-door="${d.door}"><fieldset><legend>Vote for a movie</legend>${d.vote_candidates
      .map(
        (candidate, index) => `<label class="vote-choice"><input type="radio" name="candidate" value="${index}" ${d.user_vote === index ? 'checked' : ''} required>${candidate.poster ? `<img src="${esc(candidate.poster)}" alt="">` : ''}<span><b>${esc(candidate.title)}</b>${candidate.year ? ` · ${esc(candidate.year)}` : ''}${candidate.synopsis ? `<small>${esc(candidate.synopsis)}</small>` : ''}</span></label>`,
      )
      .join('')}</fieldset><button class="btn">Save vote</button><p class="vote-status" role="status"></p></form></section>`;
  }

  const trailer = d.trailer && safeHttpUrl(d.trailer)
    ? `<p><a class="btn trailer-button" href="${esc(d.trailer)}" target="_blank" rel="noopener noreferrer">▶ Watch trailer</a></p>`
    : '';
  const watched = d.unlocked && d.title && Number.isInteger(d.door)
    ? `<label class="watched-control card-watched-control"><input class="watched-toggle" type="checkbox" data-door="${d.door}" ${d.watched ? 'checked' : ''}><span>I've watched this movie</span></label>`
    : '';
  const results = d.vote_results
    ? `<section class="vote-results"><h3>Friends' pick results</h3>${d.vote_results
        .map((candidate, index) => {
          const max = Math.max(1, ...d.vote_results.map((item) => item.votes));
          const winner = index === d.vote_winner;
          return `<div class="vote-result"><div><b>${esc(candidate.title)}</b><span>${candidate.votes} vote${candidate.votes === 1 ? '' : 's'}${winner ? ' · winner' : ''}</span></div><div class="vote-bar"><i style="width:${Math.round((candidate.votes / max) * 100)}%"></i></div></div>`;
        })
        .join('')}</section>`
    : '';
  const community = d.unlocked && Number.isInteger(d.door)
    ? `<section class="movie-community" data-door="${d.door}">
      <fieldset class="rating-group"><legend>How Christmassy was it?</legend><div class="rating-stars" role="radiogroup" aria-label="Choose a rating from half a star to five stars">${[1, 2, 3, 4, 5]
        .map((star) => `<span class="rating-star"><span class="rating-star-icon" aria-hidden="true">★</span><label class="rating-half rating-half-left"><input type="radio" name="rating" value="${star - 0.5}" aria-label="${star - 0.5} stars"><span class="sr-only">${star - 0.5} stars</span></label><label class="rating-half rating-half-right"><input type="radio" name="rating" value="${star}" aria-label="${star} ${star === 1 ? 'star' : 'stars'}"><span class="sr-only">${star} ${star === 1 ? 'star' : 'stars'}</span></label></span>`)
        .join('')}</div><p class="rating-summary" role="status"></p></fieldset>
      <section><h3>Reactions</h3><div class="reaction-list"></div></section>
      <section><h3>Comments</h3><form class="comment-form"><label for="movie-comment">Add a comment (140 characters max)</label><textarea id="movie-comment" name="comment" maxlength="140" rows="2" required></textarea><button class="btn">Post comment</button><p class="comment-status" role="status"></p></form><ul class="comment-list"></ul></section>
    </section>`
    : '';

  return `${d.poster ? `<img class="poster" src="${esc(d.poster)}" alt="Poster for ${esc(d.title)}">` : '<div class="poster none">🎬</div>'}
  <div><h2 id="mt">${esc(d.title || 'Surprise!')}</h2><p class="meta">${[d.year, d.runtime, d.genre].filter(Boolean).map(esc).join(' • ')}</p>
  <p>${esc(d.synopsis)}</p>${d.watch ? `<p class="watch">📺 Watch on: <b>${esc(d.watch)}</b></p>` : ''}${trailer}${watched}${results}${community}</div>`;
}

let lastFocus;
function openModal(d) {
  lastFocus = document.activeElement;
  $('#mbody').innerHTML = movieHTML(d);
  $('#modal').hidden = false;
  $('#close').focus();
}

function closeModal() {
  $('#modal').hidden = true;
  lastFocus && lastFocus.focus();
}

// A small synthesized bell flourish; no external audio asset is needed.
function playSleighBells() {
  if (prefs.muted || reduced()) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const now = context.currentTime;
  [880, 1174.66, 1567.98, 1174.66, 1760].forEach((frequency, index) => {
    const start = now + index * 0.13;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.14, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.5);
  });
  setTimeout(() => context.close(), 1200);
}

const sleighButton = $('#sleigh-trigger');
const sleigh = $('#sleigh');
if (sleighButton && sleigh) {
  sleighButton.onclick = () => {
    if (reduced() || sleigh.classList.contains('sleigh-flight')) return;
    sleigh.classList.add('sleigh-flight');
    playSleighBells();
  };
  sleigh.addEventListener('animationend', () => {
    sleigh.classList.remove('sleigh-flight');
  });
}

if ($('#modal')) {
  $('#close').onclick = closeModal;
  $('#modal').onclick = (e) => {
    if (e.target === $('#modal')) closeModal();
  };
  addEventListener(
    'keydown',
    (e) => e.key === 'Escape' && !$('#modal').hidden && closeModal(),
  );
}

startSnow();
lights();
addEventListener('resize', lights);

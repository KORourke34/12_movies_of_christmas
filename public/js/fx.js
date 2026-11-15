// fx.js – shared helpers: preferences, snow, fairy lights, confetti, movie modal.
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const prefs = JSON.parse(localStorage.getItem('prefs') || '{}');          // remembered sound/motion/theme choices
const savePrefs = () => localStorage.setItem('prefs', JSON.stringify(prefs));
const reduced = () => prefs.calm ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
const applyPrefs = () => { document.documentElement.classList.toggle('calm', reduced());
  document.documentElement.dataset.theme = prefs.theme || 'midnight'; };
applyPrefs();

function startSnow() {                       // falling snow on #snow
  const c = $('#snow'); if (!c) return; const x = c.getContext('2d');
  const size = () => { c.width = innerWidth; c.height = innerHeight; }; size(); addEventListener('resize', size);
  const flakes = Array.from({ length: 90 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: 1 + Math.random() * 3, s: .4 + Math.random() * 1.2 }));
  (function tick() {
    x.clearRect(0, 0, c.width, c.height);
    if (!reduced()) { x.fillStyle = '#fff'; flakes.forEach(p => { p.y += p.s; p.x += Math.sin(p.y / 40) * .4;
      if (p.y > c.height) p.y = -5; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); }); }
    requestAnimationFrame(tick);
  })();
}
function lights() {                          // twinkling fairy lights along the top
  const el = $('#lights'); if (!el) return; const cols = ['#e0213f', '#f5c542', '#2e9e5b', '#fff7e6'];
  el.innerHTML = Array.from({ length: Math.ceil(innerWidth / 36) }, (_, i) => `<i style="--c:${cols[i % 4]};--d:${(i % 5) * .35}s"></i>`).join('');
}
function confetti() {                        // burst from the middle of the screen
  if (reduced()) return; const c = $('#confetti'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#e0213f', '#2e9e5b', '#f5c542', '#fff7e6'];
  const p = Array.from({ length: 120 }, () => ({ x: innerWidth / 2, y: innerHeight / 2, vx: (Math.random() - .5) * 14,
    vy: -Math.random() * 14 - 3, w: 6 + Math.random() * 6, col: cols[Math.random() * 4 | 0], a: Math.random() * 6 }));
  let n = 0; (function t() {
    x.clearRect(0, 0, c.width, c.height);
    p.forEach(q => { q.vy += .4; q.x += q.vx; q.y += q.vy; q.a += .2; x.fillStyle = q.col; x.save();
      x.translate(q.x, q.y); x.rotate(q.a); x.fillRect(-q.w / 2, -q.w / 4, q.w, q.w / 2); x.restore(); });
    if (++n < 110) requestAnimationFrame(t); else x.clearRect(0, 0, c.width, c.height);
  })();
}
function movieHTML(d) {                      // the content of the pop-up (also used for admin preview)
  return `${d.poster ? `<img class="poster" src="${esc(d.poster)}" alt="Poster for ${esc(d.title)}">` : '<div class="poster none">🎬</div>'}
  <div><h2 id="mt">${esc(d.title || 'Surprise!')}</h2><p class="meta">${[d.year, d.runtime, d.genre].filter(Boolean).map(esc).join(' • ')}</p>
  <p>${esc(d.synopsis)}</p>${d.watch ? `<p class="watch">📺 Watch on: <b>${esc(d.watch)}</b></p>` : ''}</div>`;
}
let lastFocus;
function openModal(d) { lastFocus = document.activeElement; $('#mbody').innerHTML = movieHTML(d); $('#modal').hidden = false; $('#close').focus(); }
function closeModal() { $('#modal').hidden = true; lastFocus && lastFocus.focus(); }
if ($('#modal')) { $('#close').onclick = closeModal; $('#modal').onclick = e => e.target.id === 'modal' && closeModal();
  addEventListener('keydown', e => e.key === 'Escape' && !$('#modal').hidden && closeModal()); }
startSnow(); lights(); addEventListener('resize', lights);

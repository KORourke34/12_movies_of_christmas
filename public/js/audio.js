// audio.js – sound effects are synthesised in the browser (no files needed).
// Background music plays assets/sounds/music.mp3 (you supply it) and only starts after a click.
let ctx; const ac = () => ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)());
const vol = () => prefs.vol ?? .6;
function tone(f, t, len, type = 'sine', v = .2) {
  if (prefs.muted) return; const a = ac(), o = a.createOscillator(), g = a.createGain(), s = a.currentTime + t;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(Math.max(.0001, v * vol()), s);
  g.gain.exponentialRampToValueAtTime(.0001, s + len); o.connect(g).connect(a.destination); o.start(s); o.stop(s + len);
}
const sfx = {
  open() { tone(110, 0, .4, 'sawtooth', .1); [1047, 1319, 1568, 2093, 1568].forEach((f, i) => tone(f, .1 * i + .1, .5, 'triangle')); }, // creak + sparkle chime
  nope() { tone(200, 0, .15, 'square', .1); tone(150, .15, .2, 'square', .1); },
};
const music = new Audio('assets/sounds/backgroundmusic.mp3'); music.loop = true;
const syncAudio = () => { music.volume = vol(); music.muted = !!prefs.muted; };
syncAudio();
addEventListener('pointerdown', () => prefs.music && music.play().catch(() => {}), { once: true }); // browsers need a click first

// server.js – Express + SQLite backend. Movie details for a door are only
// sent to the browser once its unlock date has arrived (so no peeking!).
const express = require('express'), Database = require('better-sqlite3'), bcrypt = require('bcryptjs'),
  jwt = require('jsonwebtoken'), cookieParser = require('cookie-parser'), path = require('path');
const cfg = require('./config');
const SECRET = process.env.SECRET || 'dev-only-change-me';      // set a long random SECRET online
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'advent.db'));
const F = ['title', 'year', 'runtime', 'genre', 'synopsis', 'watch', 'poster']; // movie fields

db.exec(`CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY, name TEXT, hash TEXT NOT NULL, admin INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS doors(door INTEGER PRIMARY KEY, unlock_at TEXT, title TEXT, year TEXT, runtime TEXT,
  genre TEXT, synopsis TEXT, watch TEXT, poster TEXT);`);
const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
for (const [column, definition] of Object.entries({
  first_name: 'TEXT',
  last_name: 'TEXT',
  email: 'TEXT',
})) {
  if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email)');
cfg.dates.forEach((d, i) => db.prepare('INSERT OR IGNORE INTO doors(door, unlock_at) VALUES(?,?)').run(i + 1, d));

// Admin account comes from environment variables (password is hashed before saving).
if (process.env.ADMIN_USER && process.env.ADMIN_PASS)
  db.prepare(`INSERT INTO users(username,name,hash,admin) VALUES(?,?,?,1)
    ON CONFLICT(username) DO UPDATE SET hash=excluded.hash, admin=1`)
    .run(process.env.ADMIN_USER.toLowerCase(), process.env.ADMIN_USER, bcrypt.hashSync(process.env.ADMIN_PASS, 10));

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }), cookieParser());
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: cfg.timezone });
const auth = (req, res, next) => { try { req.user = jwt.verify(req.cookies.t, SECRET); next(); }
  catch { res.status(401).json({ error: 'Please log in' }); } };
const admin = (req, res, next) => req.user.admin ? next() : res.status(403).json({ error: 'Admins only' });

// ----- login / logout -----
const setSession = (res, u) => {
  res.cookie('t', jwt.sign({ name: u.name, admin: !!u.admin }, SECRET, { expiresIn: '30d' }),
    { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 864e5 });
};
app.post('/api/login', (req, res) => {
  const { username = '', password = '' } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username).trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password), u.hash)) return res.status(401).json({ error: 'Wrong username or password' });
  setSession(res, u);
  res.json({ name: u.name, admin: !!u.admin });
});
app.post('/api/register', (req, res) => {
  const body = req.body || {};
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!firstName || !lastName || !username || password.length < 4 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Enter your first and last name, a valid email, a username, and a password of at least 4 characters' });

  const normalizedUsername = username.toLowerCase();
  const name = `${firstName} ${lastName}`;
  try {
    db.prepare(`INSERT INTO users(username,name,hash,admin,first_name,last_name,email)
      VALUES(?,?,?,0,?,?,?)`)
      .run(normalizedUsername, name, bcrypt.hashSync(password, 10), firstName, lastName, email);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      if (error.message.includes('users.email'))
        return res.status(409).json({ error: 'That email is already registered' });
      if (error.message.includes('users.username'))
        return res.status(409).json({ error: 'That username already exists' });
    }
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY')
      return res.status(409).json({ error: 'That username already exists' });
    throw error;
  }

  setSession(res, { name, admin: false });
  res.status(201).json({ name, admin: false });
});
app.post('/api/logout', (req, res) => res.clearCookie('t').json({ ok: true }));
app.get('/api/me', auth, (req, res) => res.json({ name: req.user.name, admin: req.user.admin }));

// ----- calendar (friends) -----
app.get('/api/doors', auth, (req, res) => {
  const t = today();
  const doors = db.prepare('SELECT * FROM doors ORDER BY door').all().map(d =>
    d.unlock_at <= t ? { ...d, unlocked: true } : { door: d.door, unlock_at: d.unlock_at, unlocked: false });
  res.json({ today: t, doors });
});

// ----- admin -----
app.get('/api/admin/doors', auth, admin, (req, res) => res.json(db.prepare('SELECT * FROM doors ORDER BY door').all()));
app.put('/api/admin/doors/:n', auth, admin, (req, res) => {
  const b = req.body, cols = ['unlock_at', ...F];
  db.prepare(`UPDATE doors SET ${cols.map(c => c + '=?').join(',')} WHERE door=?`).run(...cols.map(c => String(b[c] ?? '')), req.params.n);
  res.json({ ok: true });
});
app.post('/api/admin/swap', auth, admin, (req, res) => {          // reorder = swap movies between two doors
  const g = db.prepare('SELECT * FROM doors WHERE door=?'), a = g.get(req.body.a), b = g.get(req.body.b);
  if (!a || !b) return res.status(400).json({ error: 'No such door' });
  const set = db.prepare(`UPDATE doors SET ${F.map(c => c + '=?').join(',')} WHERE door=?`);
  db.transaction(() => { set.run(...F.map(c => b[c]), a.door); set.run(...F.map(c => a[c]), b.door); })();
  res.json({ ok: true });
});
app.get('/api/admin/users', auth, admin, (req, res) => res.json(db.prepare('SELECT username,name,admin FROM users').all()));
app.post('/api/admin/users', auth, admin, (req, res) => {
  const { username = '', password = '' } = req.body;
  if (!username.trim() || password.length < 4) return res.status(400).json({ error: 'Need a name and a password of 4+ characters' });
  try { db.prepare('INSERT INTO users(username,name,hash,admin) VALUES(?,?,?,0)').run(username.trim().toLowerCase(), username.trim(), bcrypt.hashSync(password, 10)); res.json({ ok: true }); }
  catch { res.status(400).json({ error: 'That username already exists' }); }
});
app.delete('/api/admin/users/:u', auth, admin, (req, res) => {
  db.prepare('DELETE FROM users WHERE username=? AND admin=0').run(req.params.u); res.json({ ok: true }); });
app.get('/api/admin/backup', auth, admin, (req, res) => {          // free hosts can wipe the database: keep a backup!
  res.attachment('movies-backup.json').json(db.prepare('SELECT * FROM doors ORDER BY door').all()); });
app.post('/api/admin/restore', auth, admin, (req, res) => {
  const cols = ['unlock_at', ...F], up = db.prepare(`UPDATE doors SET ${cols.map(c => c + '=?').join(',')} WHERE door=?`);
  db.transaction(() => req.body.forEach(d => up.run(...cols.map(c => String(d[c] ?? '')), d.door)))();
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(process.env.PORT || 3000, () => console.log('🎄 Running on http://localhost:' + (process.env.PORT || 3000)));

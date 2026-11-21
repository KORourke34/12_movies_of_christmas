// server.js – Express + SQLite backend. Movie details for a door are only
// sent to the browser once its unlock date has arrived (so no peeking!).
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'advent.db');
process.env.DATABASE_URL = `file:${dbPath}`;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const production = process.env.NODE_ENV === 'production';
const registrationEnabled = production
  ? process.env.REGISTRATION_ENABLED === 'true'
  : process.env.REGISTRATION_ENABLED !== 'false';
if (production && !process.env.SECRET) {
  throw new Error('Production requires a SECRET environment variable');
}
const SECRET = production
  ? process.env.SECRET
  : (process.env.SECRET || crypto.randomBytes(32).toString('hex'));
const validPassword = (password) =>
  typeof password === 'string' &&
  [...password].length >= 12 &&
  Buffer.byteLength(password, 'utf8') <= 72;
const validNewPassword = (password) =>
  typeof password === 'string' &&
  [...password].length >= 8 &&
  Buffer.byteLength(password, 'utf8') <= 72;
const hashResetToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');
if (production && (!process.env.SECRET || Buffer.byteLength(SECRET, 'utf8') < 32)) {
  throw new Error('Production requires a SECRET of at least 32 bytes');
}
if (production && (!process.env.ADMIN_USER || !process.env.ADMIN_PASS)) {
  throw new Error('Production requires ADMIN_USER and ADMIN_PASS');
}
if (process.env.ADMIN_PASS && !validPassword(process.env.ADMIN_PASS)) {
  throw new Error('ADMIN_PASS must be at least 12 characters and no more than 72 UTF-8 bytes');
}
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS must be a non-negative integer');
}
const F = [
  'title',
  'year',
  'runtime',
  'genre',
  'synopsis',
  'watch',
  'poster',
  'trailer',
]; // movie fields saved by the admin form
const REACTIONS = ['🎄', '😂', '😭', '🔥', '❤️'];
const AVATARS = new Set([
  'santa',
  'reindeer',
  'snowman',
  'elf',
  'penguin',
  'gingerbread',
  'tree',
  'present',
]);


async function bootstrap() {
  if (
    !process.env.BREVO_API_KEY ||
    !process.env.BREVO_SENDER_EMAIL ||
    !process.env.APP_BASE_URL
  ) {
    console.warn(
      'Password-reset email is not fully configured: set APP_BASE_URL, BREVO_API_KEY, and BREVO_SENDER_EMAIL.',
    );
  }
  await Promise.all(
    cfg.dates.map((unlockAt, index) =>
      prisma.doors.upsert({
        where: { door: index + 1 },
        update: {},
        create: { door: index + 1, unlock_at: unlockAt },
      }),
    ),
  );

  if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    // Admins are bootstrapped only from these environment variables.
    // Change the admin password by updating ADMIN_PASS in the host environment
    // and restarting; do not expose a password reset route for admin accounts.
    const adminUsername = process.env.ADMIN_USER.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(adminUsername)) {
      throw new Error('ADMIN_USER must be 3 to 32 letters, numbers, dots, underscores or hyphens');
    }
    const existingAdmin = await prisma.users.findUnique({
      where: { username: adminUsername },
    });
    const nextHash = bcrypt.hashSync(process.env.ADMIN_PASS, 12);
    if (existingAdmin) {
      const passwordChanged = !bcrypt.compareSync(
        process.env.ADMIN_PASS,
        existingAdmin.hash,
      );
      await prisma.users.update({
        where: { username: adminUsername },
        data: passwordChanged
          ? { hash: nextHash, admin: 1, tokenVersion: { increment: 1 } }
          : { admin: 1 },
      });
    } else {
      await prisma.users.create({
        data: {
        username: adminUsername,
        name: process.env.ADMIN_USER.trim(),
        hash: nextHash,
        admin: 1,
        mustChange: false,
        tokenVersion: 0,
        },
      });
    }
  }
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', trustProxyHops);
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self'; connect-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store',
  });
  next();
});
app.use(express.json({ limit: '8mb' }), cookieParser());

const loginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});
const passwordRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many password attempts. Please try again later.' },
});
const registrationRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many account creation attempts. Please try again later.' },
});

const today = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: cfg.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${date.year}-${date.month}-${date.day}`;
};
const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value;
};
const validHttpUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};
const readCandidates = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const doorExistsAndUnlocked = async (doorNumber) => {
  const door = await prisma.doors.findUnique({ where: { door: doorNumber } });
  return door && door.unlock_at <= today() ? door : null;
};
const ratingSummary = async (doorNumber) => {
  const ratings = await prisma.movie_ratings.findMany({
    where: { door: doorNumber },
    select: { stars_half: true },
  });
  if (!ratings.length) return { average: null, count: 0 };
  const average =
    Math.round(
      (ratings.reduce((sum, rating) => sum + rating.stars_half, 0) /
        ratings.length /
        2) *
        10,
    ) / 10;
  return { average, count: ratings.length };
};
const voteTally = async (doorNumber, candidates) => {
  const counts = await Promise.all(
    candidates.map(async (_, candidate) => {
      const count = await prisma.movie_votes.count({
        where: { door: doorNumber, candidate },
      });
      return count;
    }),
  );
  return counts;
};
const winningCandidate = (door, candidates, counts) => {
  if (Number.isInteger(door.vote_winner) && candidates[door.vote_winner]) {
    return door.vote_winner;
  }
  return counts.reduce(
    (winner, count, candidate) => (count > counts[winner] ? candidate : winner),
    0,
  );
};
const auth = async (req, res, next) => {
  let claims;
  try {
    claims = jwt.verify(req.cookies.t, SECRET);
  } catch {
    return res.status(401).json({ error: 'Please log in' });
  }

  let username = claims.username;
  if (!username) {
    const matches = await prisma.users.findMany({
      where: { name: claims.name },
      select: { username: true },
    });
    if (matches.length === 1) username = matches[0].username;
  }
  if (!username) return res.status(401).json({ error: 'Please log in again' });

  const currentUser = await prisma.users.findUnique({
    where: { username },
    select: {
      username: true,
      name: true,
      admin: true,
      mustChange: true,
      tokenVersion: true,
    },
  });
  if (!currentUser) return res.status(401).json({ error: 'Please log in again' });
  if (
    typeof claims.tokenVersion !== 'number' ||
    claims.tokenVersion !== currentUser.tokenVersion
  ) {
    res.clearCookie('t');
    return res.status(401).json({ error: 'Please log in again' });
  }

  req.user = {
    ...claims,
    username: currentUser.username,
    name: currentUser.name,
    admin: !!currentUser.admin,
    mustChange: currentUser.mustChange,
    tokenVersion: currentUser.tokenVersion,
  };
  next();
};
const admin = (req, res, next) =>
  req.user.admin ? next() : res.status(403).json({ error: 'Admins only' });
const passwordChangeCompleted = (req, res, next) =>
  req.user.mustChange
    ? res.status(403).json({
        error: 'Choose a new password before using the calendar',
        mustChange: true,
      })
    : next();

// ----- login / logout -----
const setSession = (res, u) => {
  res.cookie(
    't',
    jwt.sign(
      {
        username: u.username,
        name: u.name,
        admin: !!u.admin,
        tokenVersion: u.tokenVersion ?? 0,
        mustChange: !!u.mustChange,
      },
      SECRET,
      { expiresIn: '30d' },
    ),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      maxAge: 30 * 864e5,
    },
  );
};

app.post('/api/login', loginRateLimit, async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const normalizedUsername =
    typeof username === 'string' ? username.trim().toLowerCase() : '';
  const passwordValue = typeof password === 'string' ? password : '';
  if (
    normalizedUsername.length > 32 ||
    Buffer.byteLength(passwordValue, 'utf8') > 72
  ) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  const u = await prisma.users.findUnique({ where: { username: normalizedUsername } });
  if (!u || !bcrypt.compareSync(passwordValue, u.hash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }

  setSession(res, u);
  res.json({
    name: u.name,
    admin: !!u.admin,
    mustChange: u.mustChange,
  });
});

app.post('/api/register', registrationRateLimit, async (req, res) => {
  if (!registrationEnabled) {
    return res.status(403).json({ error: 'Account creation is disabled' });
  }
  const body = req.body || {};
  const firstName =
    typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName =
    typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const username =
    typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (
    !firstName ||
    !lastName ||
    !/^[a-z0-9._-]{3,32}$/i.test(username) ||
    !validPassword(password) ||
    firstName.length > 80 ||
    lastName.length > 80 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).json({
      error:
        'Enter names up to 80 characters, a valid email, a 3–32 character username, and a password of at least 12 characters (maximum 72 UTF-8 bytes)',
    });
  }

  const normalizedUsername = username.toLowerCase();
  const name = `${firstName} ${lastName}`;
  try {
    await prisma.users.create({
      data: {
        username: normalizedUsername,
        name,
        hash: bcrypt.hashSync(password, 12),
        admin: 0,
        first_name: firstName,
        last_name: lastName,
        email,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      if (target.includes('email')) {
        return res.status(409).json({ error: 'That email is already registered' });
      }
      return res.status(409).json({ error: 'That username already exists' });
    }
    throw error;
  }

  setSession(res, { username: normalizedUsername, name, admin: false });
  res.status(201).json({ name, admin: false });
});

app.post('/api/logout', (req, res) => res.clearCookie('t').json({ ok: true }));
app.get('/api/password/status', auth, async (req, res) => {
  res.json({
    mustChange: req.user.mustChange,
    name: req.user.name,
  });
});

app.post('/api/password/change', passwordRateLimit, auth, async (req, res) => {
  const body = req.body || {};
  const currentPassword =
    typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword =
    typeof body.newPassword === 'string' ? body.newPassword : '';
  const confirmPassword =
    typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (
    !validNewPassword(newPassword) ||
    Buffer.byteLength(newPassword, 'utf8') > 72
  ) {
    return res.status(400).json({
      error: 'New password must be at least 8 characters and no more than 72 bytes',
    });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match' });
  }

  const user = await prisma.users.findUnique({
    where: { username: req.user.username },
  });
  if (!user || !bcrypt.compareSync(currentPassword, user.hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (bcrypt.compareSync(newPassword, user.hash) || newPassword === currentPassword) {
    return res.status(400).json({
      error: 'New password must be different from the current password',
    });
  }

  const updated = await prisma.users.update({
    where: { username: user.username },
    data: {
      hash: bcrypt.hashSync(newPassword, 12),
      mustChange: false,
      tokenVersion: { increment: 1 },
    },
  });

  setSession(res, updated);
  res.json({ ok: true, name: updated.name, mustChange: false });
});

app.post('/api/password/forgot', passwordRateLimit, async (req, res) => {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

  // Always return the same response to avoid revealing whether an email exists.
  const genericMessage =
    'If that email is registered, a password reset link has been sent.';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.json({ ok: true, message: genericMessage });
  }

  const user = await prisma.users.findFirst({
    where: { email: email, admin: 0 },
  });
  if (!user) return res.json({ ok: true, message: genericMessage });

  const resetToken = crypto.randomBytes(32).toString('hex');
  await prisma.users.update({
    where: { username: user.username },
    data: {
      resetTokenHash: hashResetToken(resetToken),
      resetTokenExpires: new Date(Date.now() + 30 * 60_000),
    },
  });

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    console.error('Password reset email is not configured');
    return res.json({ ok: true, message: genericMessage });
  }

  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) {
    console.error('APP_BASE_URL is not configured');
    return res.json({ ok: true, message: genericMessage });
  }

  const resetUrl =
    `${baseUrl}/reset-password.html?token=${encodeURIComponent(resetToken)}`;
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: senderEmail,
          name: process.env.BREVO_SENDER_NAME || '12 Movies of Christmas',
        },
        to: [{ email: user.email, name: user.name || user.username }],
        subject: 'Reset your 12 Movies of Christmas password',
        htmlContent:
          `<p>Use this link to reset your password:</p>` +
          `<p><a href="${resetUrl}">Reset password</a></p>` +
          `<p>This link expires in 30 minutes.</p>`,
      }),
    });
    if (!response.ok) {
      console.error('Brevo password reset request failed');
      await prisma.users.update({
        where: { username: user.username },
        data: { resetTokenHash: null, resetTokenExpires: null },
      });
    }
  } catch {
    console.error('Could not send password reset email');
  }

  return res.json({ ok: true, message: genericMessage });
});

app.post('/api/password/reset', passwordRateLimit, async (req, res) => {
  const token =
    typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const newPassword =
    typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword =
    typeof req.body?.confirmPassword === 'string'
      ? req.body.confirmPassword
      : '';

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  }
  if (!validNewPassword(newPassword)) {
    return res.status(400).json({
      error: 'New password must be at least 8 characters and no more than 72 bytes',
    });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match' });
  }

  const tokenHash = hashResetToken(token);
  const user = await prisma.users.findFirst({
    where: {
      resetTokenHash: tokenHash,
      resetTokenExpires: { gt: new Date() },
    },
  });
  if (!user) {
    return res.status(400).json({
      error: 'This reset link is invalid or has expired',
    });
  }
  if (bcrypt.compareSync(newPassword, user.hash)) {
    return res.status(400).json({
      error: 'New password must be different from the current password',
    });
  }

  await prisma.users.update({
    where: { username: user.username },
    data: {
      hash: bcrypt.hashSync(newPassword, 12),
      mustChange: false,
      tokenVersion: { increment: 1 },
      resetTokenHash: null,
      resetTokenExpires: null,
    },
  });

  res.clearCookie('t');
  res.json({
    ok: true,
    message: 'Password changed. You can now log in.',
  });
});

const movieProgress = async (username) => {
  const doors = await prisma.doors.findMany({
    select: {
      door: true,
      title: true,
      unlock_at: true,
      vote_enabled: true,
    },
  });
  const currentDay = today();
  const countedDoors = doors.filter(
    (door) =>
      (door.vote_enabled === 0 && !!door.title?.trim()) ||
      (door.vote_enabled === 1 && door.unlock_at <= currentDay),
  );
  const watched = await prisma.watched_movies.findMany({
    where: {
      username,
      door: { in: countedDoors.map((door) => door.door) },
    },
    select: { door: true },
  });
  const movieCount = countedDoors.length;
  const watchedCount = watched.length;

  return {
    movieCount,
    watchedCount,
    watchedPercentage: movieCount
      ? Math.round((watchedCount / movieCount) * 100)
      : 0,
  };
};

app.get('/api/me', auth, async (req, res) => {
  const user = await prisma.users.findUnique({
    where: { username: req.user.username },
    select: {
      username: true,
      name: true,
      first_name: true,
      last_name: true,
      email: true,
      admin: true,
      avatar: true,
      mustChange: true,
    },
  });
  if (!user) return res.status(401).json({ error: 'Please log in again' });

  res.json({
    ...user,
    admin: !!user.admin,
    avatar: AVATARS.has(user.avatar) ? user.avatar : 'santa',
    ...(await movieProgress(user.username)),
  });
});

app.put('/api/profile/avatar', auth, passwordChangeCompleted, async (req, res) => {
  const { avatar } = req.body || {};
  if (typeof avatar !== 'string' || !AVATARS.has(avatar)) {
    return res.status(400).json({ error: 'Choose a profile picture from the list' });
  }

  await prisma.users.update({
    where: { username: req.user.username },
    data: { avatar },
  });
  res.json({ avatar });
});

// ----- calendar (friends) -----
app.get('/api/doors', auth, passwordChangeCompleted, async (req, res) => {
  const t = today();
  const watchedRows = await prisma.watched_movies.findMany({
    where: { username: req.user.username },
    select: { door: true },
  });
  const watched = new Set(watchedRows.map((row) => row.door));
  const doorRows = await prisma.doors.findMany({ orderBy: { door: 'asc' } });
  const doors = await Promise.all(
    doorRows.map(async (d) => {
      if (d.unlock_at <= t) {
        if (d.vote_enabled) {
          const candidates = readCandidates(d.vote_candidates);
          const counts = await voteTally(d.door, candidates);
          const winner = winningCandidate(d, candidates, counts);
          return {
            ...d,
            ...candidates[winner],
            runtime: '',
            genre: '',
            watch: '',
            trailer: '',
            unlocked: true,
            watched: watched.has(d.door),
            vote_results: candidates.map((candidate, index) => ({
              ...candidate,
              votes: counts[index],
            })),
            vote_winner: winner,
          };
        }
        return { ...d, unlocked: true, watched: watched.has(d.door) };
      }

      if (
        d.vote_enabled &&
        d.vote_open_at &&
        d.vote_open_at <= t
      ) {
        const vote = await prisma.movie_votes.findUnique({
          where: {
            username_door: { username: req.user.username, door: d.door },
          },
        });
        return {
          door: d.door,
          unlock_at: d.unlock_at,
          unlocked: false,
          vote_open: true,
          vote_candidates: readCandidates(d.vote_candidates),
          user_vote: vote ? vote.candidate : null,
        };
      }

      return {
        door: d.door,
        unlock_at: d.unlock_at,
        unlocked: false,
        vote_opens_at: d.vote_enabled ? d.vote_open_at : null,
      };
    }),
  );
  res.json({ today: t, doors, ...(await movieProgress(req.user.username)) });
});

app.patch('/api/doors/:n/watched', auth, passwordChangeCompleted, async (req, res) => {
  if (!/^\d+$/.test(req.params.n)) {
    return res.status(400).json({ error: 'Choose a valid movie door' });
  }

  const doorNumber = Number(req.params.n);
  const door = await prisma.doors.findUnique({
    where: { door: doorNumber },
    select: { door: true, unlock_at: true, title: true, vote_enabled: true },
  });
  const isVoteMovie = door?.vote_enabled;
  if (!door || (!door.title?.trim() && !isVoteMovie)) {
    return res.status(404).json({ error: 'There is no movie on that door' });
  }
  if (door.unlock_at > today()) {
    return res.status(403).json({ error: 'That movie is not available yet' });
  }

  const { watched } = req.body || {};
  if (typeof watched !== 'boolean') {
    return res.status(400).json({ error: 'Watched must be true or false' });
  }

  if (watched) {
    await prisma.watched_movies.upsert({
      where: { username_door: { username: req.user.username, door: doorNumber } },
      update: {},
      create: { username: req.user.username, door: doorNumber },
    });
  } else {
    await prisma.watched_movies.deleteMany({
      where: { username: req.user.username, door: doorNumber },
    });
  }

  res.json({ watched, ...(await movieProgress(req.user.username)) });
});

// All movie community data is private until the movie's unlock date.
app.get('/api/doors/:n/community', auth, passwordChangeCompleted, async (req, res) => {
  if (!/^\d+$/.test(req.params.n)) {
    return res.status(400).json({ error: 'Choose a valid movie door' });
  }
  const doorNumber = Number(req.params.n);
  if (!(await doorExistsAndUnlocked(doorNumber))) {
    return res.status(403).json({ error: 'That movie is not available yet' });
  }

  const ownRating = await prisma.movie_ratings.findUnique({
    where: { username_door: { username: req.user.username, door: doorNumber } },
  });
  const summary = await ratingSummary(doorNumber);
  const counts = await prisma.movie_reactions.groupBy({
    by: ['emoji'],
    where: { door: doorNumber },
    _count: { emoji: true },
  });
  const mineRows = await prisma.movie_reactions.findMany({
    where: { username: req.user.username, door: doorNumber },
    select: { emoji: true },
  });
  const mine = new Set(mineRows.map((row) => row.emoji));
  const commentRows = await prisma.movie_comments.findMany({
    where: { door: doorNumber },
    orderBy: { id: 'asc' },
    include: { users: { select: { name: true } } },
  });
  const comments = commentRows.map((comment) => ({
    id: comment.id,
    username: comment.username,
    author: comment.users.name,
    comment: comment.comment,
    created_at: comment.created_at,
  }));

  res.json({
    rating: ownRating ? ownRating.stars_half / 2 : 0,
    ratingAverage: summary.average,
    ratingCount: summary.count,
    reactions: REACTIONS.map((emoji) => ({
      emoji,
      count: counts.find((row) => row.emoji === emoji)?._count.emoji || 0,
      reacted: mine.has(emoji),
    })),
    comments,
    admin: !!req.user.admin,
  });
});

app.put('/api/doors/:n/rating', auth, passwordChangeCompleted, async (req, res) => {
  if (!/^\d+$/.test(req.params.n)) {
    return res.status(400).json({ error: 'Choose a valid movie door' });
  }
  const doorNumber = Number(req.params.n);
  if (!(await doorExistsAndUnlocked(doorNumber))) {
    return res.status(403).json({ error: 'That movie is not available yet' });
  }
  const { stars } = req.body || {};
  if (
    typeof stars !== 'number' ||
    !Number.isFinite(stars) ||
    stars < 0.5 ||
    stars > 5 ||
    !Number.isInteger(stars * 2)
  ) {
    return res.status(400).json({ error: 'Choose a rating from 0.5 to 5 stars in half-star steps' });
  }

  await prisma.movie_ratings.upsert({
    where: { username_door: { username: req.user.username, door: doorNumber } },
    update: { stars_half: stars * 2 },
    create: { username: req.user.username, door: doorNumber, stars_half: stars * 2 },
  });
  res.json({ rating: stars, ...(await ratingSummary(doorNumber)) });
});

app.post('/api/doors/:n/reactions', auth, passwordChangeCompleted, async (req, res) => {
  if (!/^\d+$/.test(req.params.n)) {
    return res.status(400).json({ error: 'Choose a valid movie door' });
  }
  const doorNumber = Number(req.params.n);
  if (!(await doorExistsAndUnlocked(doorNumber))) {
    return res.status(403).json({ error: 'That movie is not available yet' });
  }
  const { emoji } = req.body || {};
  if (typeof emoji !== 'string' || !REACTIONS.includes(emoji)) {
    return res.status(400).json({ error: 'Choose one of the listed reactions' });
  }

  const existing = await prisma.movie_reactions.findUnique({
    where: {
      username_door_emoji: {
        username: req.user.username,
        door: doorNumber,
        emoji,
      },
    },
  });
  if (existing) {
    await prisma.movie_reactions.delete({
      where: {
        username_door_emoji: {
          username: req.user.username,
          door: doorNumber,
          emoji,
        },
      },
    });
  } else {
    await prisma.movie_reactions.create({
      data: { username: req.user.username, door: doorNumber, emoji },
    });
  }
  const counts = await prisma.movie_reactions.groupBy({
    by: ['emoji'],
    where: { door: doorNumber },
    _count: { emoji: true },
  });
  const mineRows = await prisma.movie_reactions.findMany({
    where: { username: req.user.username, door: doorNumber },
    select: { emoji: true },
  });
  const mine = new Set(mineRows.map((row) => row.emoji));
  res.json({
    reactions: REACTIONS.map((reaction) => ({
      emoji: reaction,
      count: counts.find((row) => row.emoji === reaction)?._count.emoji || 0,
      reacted: mine.has(reaction),
    })),
  });
});

app.post('/api/doors/:n/comments', auth, passwordChangeCompleted, async (req, res) => {
  if (!/^\d+$/.test(req.params.n)) {
    return res.status(400).json({ error: 'Choose a valid movie door' });
  }
  const doorNumber = Number(req.params.n);
  if (!(await doorExistsAndUnlocked(doorNumber))) {
    return res.status(403).json({ error: 'Comments open when the movie is available' });
  }
  const comment =
    typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
  if (!comment || comment.length > 140) {
    return res.status(400).json({ error: 'Comments must be 1 to 140 characters' });
  }
  const created = await prisma.movie_comments.create({
    data: { username: req.user.username, door: doorNumber, comment },
    include: { users: { select: { name: true } } },
  });
  res.status(201).json({
    id: created.id,
    username: created.username,
    author: created.users.name,
    comment: created.comment,
    created_at: created.created_at,
  });
});

app.delete('/api/doors/:n/comments/:id', auth, passwordChangeCompleted, async (req, res) => {
  if (!/^\d+$/.test(req.params.n) || !/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Choose a valid comment' });
  }
  const comment = await prisma.movie_comments.findFirst({
    where: { id: Number(req.params.id), door: Number(req.params.n) },
  });
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.username !== req.user.username && !req.user.admin) {
    return res.status(403).json({ error: 'You can only remove your own comments' });
  }
  await prisma.movie_comments.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

app.post('/api/doors/:n/vote', auth, passwordChangeCompleted, async (req, res) => {
  if (!/^\d+$/.test(req.params.n)) {
    return res.status(400).json({ error: 'Choose a valid movie door' });
  }
  const doorNumber = Number(req.params.n);
  const door = await prisma.doors.findUnique({ where: { door: doorNumber } });
  const t = today();
  if (
    !door ||
    !door.vote_enabled ||
    !door.vote_open_at ||
    t < door.vote_open_at ||
    t >= door.unlock_at
  ) {
    return res.status(403).json({ error: 'Voting is not open for that door' });
  }
  const candidates = readCandidates(door.vote_candidates);
  const { candidate } = req.body || {};
  if (!Number.isInteger(candidate) || !candidates[candidate]) {
    return res.status(400).json({ error: 'Choose one of the listed movies' });
  }
  await prisma.movie_votes.upsert({
    where: { username_door: { username: req.user.username, door: doorNumber } },
    update: { candidate },
    create: { username: req.user.username, door: doorNumber, candidate },
  });
  res.json({ candidate });
});

// ----- admin -----
app.get('/api/admin/doors', auth, passwordChangeCompleted, admin, async (req, res) => {
  const doorRows = await prisma.doors.findMany({ orderBy: { door: 'asc' } });
  const doors = await Promise.all(doorRows.map(async (door) => {
    const rating = await ratingSummary(door.door);
    const candidates = readCandidates(door.vote_candidates);
    const counts = await voteTally(door.door, candidates);
    return {
      ...door,
      vote_enabled: !!door.vote_enabled,
      vote_candidates: candidates,
      rating_average: rating.average,
      rating_count: rating.count,
      vote_counts: counts,
      vote_winner: door.vote_winner,
    };
  }));
  res.json(doors);
});

app.put('/api/admin/doors/:n', auth, passwordChangeCompleted, admin, async (req, res) => {
  if (!/^\d+$/.test(req.params.n)) {
    return res.status(400).json({ error: 'Choose a valid door' });
  }
  const doorNumber = Number(req.params.n);
  const existing = await prisma.doors.findUnique({
    where: { door: doorNumber },
    select: { door: true, vote_enabled: true, vote_candidates: true },
  });
  if (!existing) return res.status(404).json({ error: 'Door not found' });

  const body = req.body || {};
  const stringField = (field, max) => {
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    return value.length <= max ? value : null;
  };
  const unlockAt = stringField('unlock_at', 10);
  if (!validDate(unlockAt)) {
    return res.status(400).json({ error: 'Enter a valid unlock date' });
  }
  const fields = {};
  const limits = {
    title: 200,
    year: 20,
    runtime: 40,
    genre: 100,
    synopsis: 4000,
    watch: 300,
    poster: 2_500_000,
    trailer: 2000,
  };
  for (const [field, max] of Object.entries(limits)) {
    fields[field] = stringField(field, max);
    if (fields[field] === null) {
      return res.status(400).json({ error: `${field} is too long` });
    }
  }
  if (!validHttpUrl(fields.trailer)) {
    return res.status(400).json({ error: 'Trailer links must use http or https' });
  }

  const voteEnabled =
    body.vote_enabled === true ||
    body.vote_enabled === 'true' ||
    body.vote_enabled === 'on' ||
    body.vote_enabled === '1';
  const voteOpenAt = stringField('vote_open_at', 10);
  let candidates = body.vote_candidates;
  if (typeof candidates === 'string') {
    try {
      candidates = JSON.parse(candidates);
    } catch {
      return res.status(400).json({ error: 'Vote candidates are not valid JSON' });
    }
  }
  if (!Array.isArray(candidates)) candidates = [];
  if (candidates.length > 5) {
    return res.status(400).json({ error: 'A vote can have at most 5 candidates' });
  }
  candidates = candidates.map((candidate) => {
    const item = candidate || {};
    return {
      title: typeof item.title === 'string' ? item.title.trim() : '',
      year: typeof item.year === 'string' ? item.year.trim() : '',
      poster: typeof item.poster === 'string' ? item.poster.trim() : '',
      synopsis: typeof item.synopsis === 'string' ? item.synopsis.trim() : '',
    };
  });
  if (candidates.some((candidate) => !candidate.title || candidate.title.length > 200 ||
      candidate.year.length > 20 || candidate.poster.length > 2_500_000 ||
      candidate.synopsis.length > 600)) {
    return res.status(400).json({ error: 'Each vote candidate needs a title and valid field lengths' });
  }
  if (voteEnabled && (candidates.length < 2 || !validDate(voteOpenAt))) {
    return res.status(400).json({ error: 'A vote door needs 2 to 5 candidates and a valid opening date' });
  }
  if (voteEnabled && voteOpenAt >= unlockAt) {
    return res.status(400).json({ error: 'Voting must open before the door unlocks' });
  }
  const override =
    body.vote_winner === '' || body.vote_winner === null ||
    body.vote_winner === undefined
      ? null
      : Number(body.vote_winner);
  if (
    override !== null &&
    (!Number.isInteger(override) || override < 0 || override >= candidates.length)
  ) {
    return res.status(400).json({ error: 'Choose a valid winning candidate' });
  }

  const serializedCandidates = JSON.stringify(candidates);
  await prisma.$transaction(async (tx) => {
    await tx.doors.update({
      where: { door: doorNumber },
      data: {
        unlock_at: unlockAt,
        ...fields,
        vote_enabled: voteEnabled ? 1 : 0,
        vote_open_at: voteEnabled ? voteOpenAt : null,
        vote_candidates: serializedCandidates,
        vote_winner: override,
      },
    });
    if (
      existing.vote_enabled !== (voteEnabled ? 1 : 0) ||
      existing.vote_candidates !== serializedCandidates
    ) {
      await tx.movie_votes.deleteMany({ where: { door: doorNumber } });
    }
  });
  res.json({ ok: true });
});

app.post('/api/admin/swap', auth, passwordChangeCompleted, admin, async (req, res) => {
  // reorder = swap movies between two doors
  const { a: firstDoor, b: secondDoor } = req.body || {};
  if (!Number.isInteger(firstDoor) || !Number.isInteger(secondDoor)) {
    return res.status(400).json({ error: 'Choose two valid doors' });
  }
  const [a, b] = await Promise.all([
    prisma.doors.findUnique({ where: { door: firstDoor } }),
    prisma.doors.findUnique({ where: { door: secondDoor } }),
  ]);
  if (!a || !b) return res.status(400).json({ error: 'No such door' });

  await prisma.$transaction([
    prisma.doors.update({
      where: { door: a.door },
      data: Object.fromEntries(F.map((field) => [field, b[field]])),
    }),
    prisma.doors.update({
      where: { door: b.door },
      data: Object.fromEntries(F.map((field) => [field, a[field]])),
    }),
  ]);
  res.json({ ok: true });
});

app.get('/api/admin/users', auth, passwordChangeCompleted, admin, async (req, res) =>
  res.json(await prisma.users.findMany({
    select: { username: true, name: true, email: true, admin: true, mustChange: true },
  })),
);

app.post('/api/admin/users', auth, passwordChangeCompleted, admin, async (req, res) => {
  const { username = '', password = '', email = '' } = req.body || {};
  const normalizedUsername =
    typeof username === 'string' ? username.trim().toLowerCase() : '';
  const normalizedEmail =
    typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername) || !validPassword(password)) {
    return res
      .status(400)
      .json({ error: 'Usernames must be 3–32 letters, numbers, dots, underscores or hyphens; passwords need 12+ characters (maximum 72 UTF-8 bytes)' });
  }
  if (
    !normalizedEmail ||
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    return res.status(400).json({
      error: 'Enter a valid friend email address for password reset',
    });
  }

  try {
    await prisma.users.create({
      data: {
        username: normalizedUsername,
        name: username.trim(),
        hash: bcrypt.hashSync(password, 12),
        admin: 0,
        email: normalizedEmail,
      },
    });
    res.json({ ok: true });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'That username already exists' });
    }
    throw error;
  }
});

app.put(
  '/api/admin/users/:u/email',
  auth,
  passwordChangeCompleted,
  admin,
  async (req, res) => {
    const username =
      typeof req.params.u === 'string'
        ? req.params.u.trim().toLowerCase()
        : '';
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return res.status(400).json({
        error: 'Enter a valid friend email address',
      });
    }

    const user = await prisma.users.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ error: 'Friend account not found' });
    if (user.admin) {
      return res.status(403).json({ error: 'Admin account email cannot be changed here' });
    }

    try {
      await prisma.users.update({
        where: { username },
        data: { email },
      });
      res.json({ ok: true, email });
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'That email is already registered' });
      }
      throw error;
    }
  },
);

app.delete('/api/admin/users/:u', auth, passwordChangeCompleted, admin, async (req, res) => {
  await prisma.users.deleteMany({
    where: { username: req.params.u, admin: 0 },
  });
  res.json({ ok: true });
});

app.post(
  '/api/admin/users/:u/password',
  passwordRateLimit,
  auth,
  passwordChangeCompleted,
  admin,
  async (req, res) => {
    const username = typeof req.params.u === 'string'
      ? req.params.u.trim().toLowerCase()
      : '';
    const newPassword =
      typeof req.body?.password === 'string' ? req.body.password : '';

    if (!validNewPassword(newPassword)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and no more than 72 bytes',
      });
    }

    const user = await prisma.users.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ error: 'Friend account not found' });
    if (user.admin) {
      return res.status(403).json({ error: 'Admin account passwords cannot be reset here' });
    }
    if (bcrypt.compareSync(newPassword, user.hash)) {
      return res.status(400).json({
        error: 'New password must be different from the current password',
      });
    }

    await prisma.users.update({
      where: { username },
      data: {
        hash: bcrypt.hashSync(newPassword, 12),
        mustChange: true,
        tokenVersion: { increment: 1 },
      },
    });

    res.json({ ok: true, mustChange: true });
  },
);

app.get('/api/admin/backup', auth, passwordChangeCompleted, admin, async (req, res) => {
  // free hosts can wipe the database: keep a backup!
  res
    .attachment('movies-backup.json')
    .json(await prisma.doors.findMany({ orderBy: { door: 'asc' } }));
});

app.post('/api/admin/restore', auth, passwordChangeCompleted, admin, async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Backup must contain a list of doors' });
  }
  const rows = [];
  for (const row of req.body) {
    if (!row || !Number.isInteger(row.door) || !validDate(row.unlock_at)) {
      return res.status(400).json({ error: 'Backup has an invalid door or date' });
    }
    const current = await prisma.doors.findUnique({ where: { door: row.door } });
    if (!current) return res.status(400).json({ error: `Door ${row.door} does not exist` });

    const fieldLimits = {
      title: 200,
      year: 20,
      runtime: 40,
      genre: 100,
      synopsis: 4000,
      watch: 300,
      poster: 2_500_000,
      trailer: 2000,
    };
    const fields = F.map((field) => {
      const value = typeof row[field] === 'string' ? row[field].trim() : '';
      return value.length <= fieldLimits[field] ? value : null;
    });
    if (fields.some((value) => value === null)) {
      return res.status(400).json({ error: `Backup has an overlong field on door ${row.door}` });
    }
    const trailer = fields[F.indexOf('trailer')];
    if (!validHttpUrl(trailer)) {
      return res.status(400).json({ error: 'Backup trailer links must use http or https' });
    }
    const enabled = row.vote_enabled === true || row.vote_enabled === 1;
    let candidates = Array.isArray(row.vote_candidates)
      ? row.vote_candidates
      : readCandidates(row.vote_candidates);
    if (candidates.length > 5 || (enabled && candidates.length < 2)) {
      return res.status(400).json({ error: 'Backup vote doors need 2 to 5 candidates' });
    }
    candidates = candidates.map((candidate) => {
      const item = candidate || {};
      return {
        title: typeof item.title === 'string' ? item.title.trim() : '',
        year: typeof item.year === 'string' ? item.year.trim() : '',
        poster: typeof item.poster === 'string' ? item.poster.trim() : '',
        synopsis: typeof item.synopsis === 'string' ? item.synopsis.trim() : '',
      };
    });
    if (candidates.some((candidate) => !candidate.title ||
      candidate.title.length > 200 || candidate.year.length > 20 ||
      candidate.poster.length > 2_500_000 || candidate.synopsis.length > 600)) {
      return res.status(400).json({ error: `Backup has an invalid vote candidate on door ${row.door}` });
    }
    if (
      enabled &&
      (!validDate(row.vote_open_at) || row.vote_open_at >= row.unlock_at)
    ) {
      return res.status(400).json({ error: 'Backup has an invalid vote opening date' });
    }
    const winner =
      row.vote_winner === '' || row.vote_winner === null ||
      row.vote_winner === undefined
        ? null
        : Number(row.vote_winner);
    if (
      winner !== null &&
      (!Number.isInteger(winner) || winner < 0 || winner >= candidates.length)
    ) {
      return res.status(400).json({ error: 'Backup has an invalid vote winner' });
    }
    rows.push({
      door: row.door,
      unlock_at: row.unlock_at,
      ...Object.fromEntries(F.map((field, index) => [field, fields[index]])),
      vote_enabled: enabled ? 1 : 0,
      vote_open_at: enabled ? row.vote_open_at : null,
      vote_candidates: JSON.stringify(candidates),
      vote_winner: winner,
    });
  }
  await prisma.$transaction(
    rows.map((row) =>
      prisma.doors.update({
        where: { door: row.door },
        data: row,
      }),
    ),
  );
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  console.error('Unhandled request error:', error);
  res.status(500).json({ error: 'An unexpected server error occurred' });
});
bootstrap()
  .then(() => {
    app.listen(port, () => console.log(`🎄 Running on port ${port}`));
  })
  .catch((error) => {
    console.error('Failed to start Prisma database:', error);
    process.exit(1);
  });

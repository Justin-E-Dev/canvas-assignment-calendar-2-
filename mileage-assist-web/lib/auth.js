'use strict';
const argon2 = require('@node-rs/argon2');
const crypto = require('node:crypto');
const db = require('./db');
const { encrypt, decrypt, blindIndex, sha256, randomToken, safeEqual, ON_VERCEL } = require('./crypto');
const { HttpError, parseCookies, addCookie } = require('./http');
const v = require('./validate');

const SECURE = ON_VERCEL || process.env.MA_SECURE_COOKIES === 'true';
// "__Host-" cookies can only be set over HTTPS, for this exact host, on path "/".
const SESSION_COOKIE = SECURE ? '__Host-ma_session' : 'ma_session';
const CSRF_COOKIE = 'XSRF-TOKEN';
const IDLE_MS = 2 * 60 * 60 * 1000;      // signed out after 2 hours without activity
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;  // and after 8 hours no matter what
const ARGON = { algorithm: 2 /* Argon2id */, memoryCost: 65536, timeCost: 3, parallelism: 1 };
let dummyHash;

function cookie(name, value, { httpOnly = true, maxAge } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Strict`;
  if (httpOnly) c += '; HttpOnly';
  if (SECURE) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  return c;
}

// ---------- CSRF: double-submit token + same-origin check ----------
function issueCsrf(req, res) {
  const existing = parseCookies(req)[CSRF_COOKIE];
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
  const token = randomToken();
  addCookie(res, cookie(CSRF_COOKIE, token, { httpOnly: false }));
  return token;
}

function checkCsrf(req) {
  const fromCookie = parseCookies(req)[CSRF_COOKIE];
  const fromHeader = req.headers['x-xsrf-token'];
  if (!fromCookie || !fromHeader || !safeEqual(fromCookie, fromHeader)) {
    throw new HttpError(403, 'Your session expired. Please reload the page.');
  }
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let ok = false;
    try { ok = new URL(origin).host === host; } catch { ok = false; }
    if (!ok) throw new HttpError(403, 'Request blocked.');
  }
}

// ---------- Sessions (stored server-side; the cookie holds only a random token) ----------
async function createSession(res, userId) {
  const token = randomToken();
  await db.query('insert into sessions (id_hash, user_id, expires_at) values ($1, $2, $3)',
    [sha256(token), userId, new Date(Date.now() + ABSOLUTE_MS)]);
  addCookie(res, cookie(SESSION_COOKIE, token, { maxAge: ABSOLUTE_MS / 1000 }));
  // Occasional clean-up of expired rows.
  if (Math.random() < 0.05) {
    db.query("delete from sessions where expires_at < now() or last_seen < now() - interval '2 hours'").catch(() => {});
    db.query('delete from challenges where expires_at < now()').catch(() => {});
    db.query("delete from login_attempts where window_start < now() - interval '1 day'").catch(() => {});
  }
}

async function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || token.length > 100) return null;
  const { rows } = await db.query(
    `update sessions set last_seen = now()
       where id_hash = $1 and expires_at > now() and last_seen > now() - ($2 * interval '1 millisecond')
     returning user_id`, [sha256(token), IDLE_MS]);
  if (!rows.length) return null;
  const u = await db.query('select id, email_enc, first_name_enc from users where id = $1', [rows[0].user_id]);
  if (!u.rows.length) return null;
  const r = u.rows[0];
  return { id: r.id, email: decrypt(r.email_enc, 'user:email'), firstName: decrypt(r.first_name_enc, `${r.id}:firstName`) };
}

async function endSession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) await db.query('delete from sessions where id_hash = $1', [sha256(token)]);
  addCookie(res, cookie(SESSION_COOKIE, '', { maxAge: 0 }));
}

// ---------- Brute-force protection ----------
const LIMITS = { email: { max: 5, minutes: 15 }, ip: { max: 30, minutes: 15 } };

function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0].trim();
}

async function isLocked(kind, value) {
  const { max, minutes } = LIMITS[kind];
  const { rows } = await db.query(
    `select failures from login_attempts where key = $1 and window_start > now() - ($2 * interval '1 minute')`,
    [blindIndex(value, 'attempts:' + kind), minutes]);
  return rows.length > 0 && rows[0].failures >= max;
}

async function recordFailure(kind, value) {
  const { minutes } = LIMITS[kind];
  await db.query(
    `insert into login_attempts (key, failures, window_start) values ($1, 1, now())
     on conflict (key) do update set
       failures = case when login_attempts.window_start > now() - ($2 * interval '1 minute')
                       then login_attempts.failures + 1 else 1 end,
       window_start = case when login_attempts.window_start > now() - ($2 * interval '1 minute')
                           then login_attempts.window_start else now() end`,
    [blindIndex(value, 'attempts:' + kind), minutes]);
}

async function clearFailures(kind, value) {
  await db.query('delete from login_attempts where key = $1', [blindIndex(value, 'attempts:' + kind)]);
}

// ---------- Sign-up and sign-in ----------
function signupAllowed(email) {
  const list = String(process.env.MA_ALLOWED_SIGNUP_EMAILS || '').split(/[,\s;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list.includes(email);
  return !ON_VERCEL; // online, sign-ups are closed until approved emails are configured
}

async function signup(req, res, body) {
  const ip = clientIp(req);
  if (await isLocked('ip', ip)) throw new HttpError(429, 'Too many attempts. Please try again later.');
  const email = v.email(body.email);
  const firstName = v.text(body.firstName, 'your first name', 80);
  const password = String(body.password ?? '');
  if (password.length < 12) throw v.bad('Password must be at least 12 characters.');
  if (password.length > 128) throw v.bad('Password is too long (128 characters max).');
  if (!signupAllowed(email)) {
    await recordFailure('ip', ip);
    throw new HttpError(403, "Sign-ups for this email aren't allowed. Ask the app owner to add your email.");
  }
  const hash = await argon2.hash(password, ARGON);
  const emailHash = blindIndex(email, 'email');
  const user = await db.tx(async (c) => {
    const exists = await c.query('select 1 from users where email_hash = $1', [emailHash]);
    if (exists.rows.length) return null;
    const ins = await c.query(
      `insert into users (email_hash, email_enc, first_name_enc, password_hash, webauthn_id)
       values ($1, $2, '', $3, $4) returning id`,
      [emailHash, encrypt(email, 'user:email'), hash, crypto.randomBytes(32)]);
    const id = ins.rows[0].id;
    await c.query('update users set first_name_enc = $1 where id = $2', [encrypt(firstName, `${id}:firstName`), id]);
    return id;
  });
  if (!user) throw new HttpError(409, 'An account with that email already exists.');
  await createSession(res, user);
}

async function login(req, res, body) {
  const ip = clientIp(req);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 254);
  const password = String(body.password ?? '').slice(0, 128);
  if (await isLocked('ip', ip) || await isLocked('email', email)) {
    throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
  }
  const { rows } = await db.query('select id, password_hash from users where email_hash = $1', [blindIndex(email, 'email')]);
  // Always run one Argon2 check so response time doesn't reveal whether the email exists.
  dummyHash ||= await argon2.hash(randomToken(), ARGON);
  const ok = await argon2.verify(rows.length ? rows[0].password_hash : dummyHash, password).catch(() => false);
  if (!rows.length || !ok) {
    await Promise.all([recordFailure('email', email), recordFailure('ip', ip)]);
    throw new HttpError(401, 'Incorrect email or password.');
  }
  await clearFailures('email', email);
  await createSession(res, rows[0].id);
}

module.exports = {
  issueCsrf, checkCsrf, createSession, currentUser, endSession, signup, login,
  clientIp, isLocked, recordFailure, ARGON, SECURE,
};

'use strict';
// Biometric sign-in (passkeys / WebAuthn): Face ID, Touch ID, Windows Hello, Android fingerprint.
// The fingerprint/face never leaves the device; the server stores only a public key.
const swa = require('@simplewebauthn/server');
const db = require('./db');
const { encrypt, decrypt, sha256, randomToken, ON_VERCEL } = require('./crypto');
const { HttpError, parseCookies, addCookie } = require('./http');
const auth = require('./auth');

const CHALLENGE_COOKIE = 'ma_wa';
const CHALLENGE_MS = 5 * 60 * 1000;

/** Where passkeys are bound to. Online this is the production domain. */
function relyingParty(req) {
  const host = process.env.MA_RP_ID || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(':')[0];
  const rpID = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  let origin = process.env.MA_ORIGIN;
  if (!origin) {
    if (ON_VERCEL || process.env.MA_RP_ID) origin = 'https://' + rpID;
    else origin = (auth.SECURE ? 'https://' : 'http://') + (req.headers['x-forwarded-host'] || req.headers.host);
  }
  return { rpID, origin };
}

async function saveChallenge(res, challenge, purpose, userId) {
  const token = randomToken();
  await db.query('insert into challenges (id_hash, challenge, user_id, purpose, expires_at) values ($1, $2, $3, $4, $5)',
    [sha256(token), challenge, userId ?? null, purpose, new Date(Date.now() + CHALLENGE_MS)]);
  let c = `${CHALLENGE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${CHALLENGE_MS / 1000}`;
  if (auth.SECURE) c += '; Secure';
  addCookie(res, c);
}

/** One-time use: the challenge is deleted as it is read. */
async function takeChallenge(req, purpose, userId) {
  const token = parseCookies(req)[CHALLENGE_COOKIE];
  if (!token) throw new HttpError(400, 'Biometric request expired. Please try again.');
  const { rows } = await db.query(
    `delete from challenges where id_hash = $1 and purpose = $2 and expires_at > now() returning challenge, user_id`,
    [sha256(token), purpose]);
  if (!rows.length || (userId !== undefined && rows[0].user_id !== userId)) {
    throw new HttpError(400, 'Biometric request expired. Please try again.');
  }
  return rows[0].challenge;
}

async function count(userId) {
  const { rows } = await db.query('select count(*)::int as n from credentials where user_id = $1', [userId]);
  return rows[0].n;
}

async function registrationOptions(req, res, user) {
  const { rpID } = relyingParty(req);
  const u = await db.query('select webauthn_id from users where id = $1', [user.id]);
  const existing = await db.query('select id, transports from credentials where user_id = $1', [user.id]);
  const options = await swa.generateRegistrationOptions({
    rpName: 'Mileage Assist',
    rpID,
    userName: user.email,
    userDisplayName: user.firstName,
    userID: new Uint8Array(u.rows[0].webauthn_id),
    attestationType: 'none',
    excludeCredentials: existing.rows.map((c) => ({ id: c.id, transports: c.transports ? c.transports.split(',') : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  await saveChallenge(res, options.challenge, 'register', user.id);
  return options;
}

async function register(req, user, body) {
  const { rpID, origin } = relyingParty(req);
  const expectedChallenge = await takeChallenge(req, 'register', user.id);
  let result;
  try {
    result = await swa.verifyRegistrationResponse({
      response: body.credential, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
    });
  } catch {
    throw new HttpError(400, 'Biometric login could not be set up.');
  }
  if (!result.verified) throw new HttpError(400, 'Biometric login could not be set up.');
  const cred = result.registrationInfo.credential;
  const label = String(body.label || 'Device').slice(0, 100);
  await db.query(
    `insert into credentials (id, user_id, public_key, counter, transports, label_enc) values ($1, $2, $3, $4, $5, $6)`,
    [cred.id, user.id, Buffer.from(cred.publicKey), cred.counter, (cred.transports || []).join(','),
      encrypt(label, `${user.id}:credentialLabel`)]);
  return { success: true };
}

async function authenticationOptions(req, res) {
  const { rpID } = relyingParty(req);
  const ip = auth.clientIp(req);
  if (await auth.isLocked('ip', ip)) throw new HttpError(429, 'Too many attempts. Please try again later.');
  const options = await swa.generateAuthenticationOptions({ rpID, userVerification: 'required' });
  await saveChallenge(res, options.challenge, 'login', null);
  return options;
}

async function login(req, res, body) {
  const { rpID, origin } = relyingParty(req);
  const ip = auth.clientIp(req);
  const expectedChallenge = await takeChallenge(req, 'login');
  const id = String(body.id || '');
  const { rows } = await db.query('select * from credentials where id = $1', [id]);
  const fail = async () => {
    await auth.recordFailure('ip', ip);
    throw new HttpError(401, 'Biometric sign-in failed.');
  };
  if (!rows.length) return fail();
  const c = rows[0];
  let result;
  try {
    result = await swa.verifyAuthenticationResponse({
      response: body, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: c.id, publicKey: new Uint8Array(c.public_key), counter: Number(c.counter),
        transports: c.transports ? c.transports.split(',') : undefined },
    });
  } catch {
    return fail();
  }
  if (!result.verified) return fail();
  await db.query('update credentials set counter = $1, last_used = now() where id = $2', [result.authenticationInfo.newCounter, c.id]);
  await auth.createSession(res, c.user_id);
  return { authenticated: true };
}

module.exports = { registrationOptions, register, authenticationOptions, login, count };

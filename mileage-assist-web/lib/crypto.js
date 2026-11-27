'use strict';
// Field-level encryption: sensitive values are encrypted with AES-256-GCM before they
// reach the database, so the database host only ever stores ciphertext.
// Each value is bound to its owner and field (AAD), so ciphertext can't be swapped
// between users or columns. Lookups use keyed hashes (HMAC) instead of plaintext.
const crypto = require('node:crypto');

const ON_VERCEL = process.env.VERCEL === '1';

function loadKeys() {
  let raw = process.env.MA_DATA_KEY;
  if (!raw) {
    if (ON_VERCEL) throw Object.assign(new Error('MA_DATA_KEY is missing. Add it under Settings → Environment Variables, then redeploy.'), { setup: true });
    // Local development only: a fixed throwaway key so restarts can read earlier data.
    raw = crypto.createHash('sha256').update('mileage-assist-local-dev-key').digest('base64');
    if (!global.__maWarned) {
      console.warn('[mileage-assist] Using a local development encryption key. Set MA_DATA_KEY in production.');
      global.__maWarned = true;
    }
  }
  const master = Buffer.from(raw, 'base64');
  if (master.length !== 32) {
    throw Object.assign(new Error('MA_DATA_KEY looks incomplete. Paste the whole key (44 characters ending in =), then redeploy.'), { setup: true });
  }
  const derive = (info) => Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
  return { enc: derive('mileage-assist/enc/v1'), mac: derive('mileage-assist/mac/v1') };
}

let keys;
const k = () => (keys ||= loadKeys());

/** Encrypts a string. `context` ties it to e.g. "42:startLocation". Returns "v1.<base64>". */
function encrypt(text, context) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k().enc, iv);
  c.setAAD(Buffer.from(String(context)));
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

function decrypt(blob, context) {
  if (blob === null || blob === undefined) return '';
  if (!String(blob).startsWith('v1.')) throw new Error('Unknown ciphertext format');
  const buf = Buffer.from(String(blob).slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', k().enc, buf.subarray(0, 12));
  d.setAAD(Buffer.from(String(context)));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

function encryptBytes(bytes, context) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k().enc, iv);
  c.setAAD(Buffer.from(String(context)));
  const ct = Buffer.concat([c.update(bytes), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function decryptBytes(buf, context) {
  const d = crypto.createDecipheriv('aes-256-gcm', k().enc, buf.subarray(0, 12));
  d.setAAD(Buffer.from(String(context)));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

/** Keyed hash for equality lookups (email, remembered initials/programs, rate-limit keys). */
function blindIndex(value, context) {
  return crypto.createHmac('sha256', k().mac).update(String(context) + '\0' + String(value)).digest();
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { encrypt, decrypt, encryptBytes, decryptBytes, blindIndex, sha256, randomToken, safeEqual, ON_VERCEL };

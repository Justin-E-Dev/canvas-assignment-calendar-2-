'use strict';
const { HttpError } = require('./http');

const bad = (msg) => new HttpError(400, msg);

/** Trims, removes control characters and collapses whitespace. */
function text(v, field, max, { required = true } = {}) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !s) throw bad(`Please fill in ${field}.`);
  if (s.length > max) throw bad(`${field[0].toUpperCase() + field.slice(1)} is too long (${max} characters max).`);
  return s;
}

function date(v, field = 'the date') {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad(`Please check ${field}.`);
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw bad(`Please check ${field}.`);
  const y = d.getUTCFullYear();
  if (y < 2000 || y > 2100) throw bad(`Please check ${field}.`);
  return s;
}

/** Odometer readings, stored as whole tenths of a mile. */
function tenths(v, field) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (String(v ?? '').trim() === '' || !Number.isFinite(n) || n < 0 || n > 99_999_999) throw bad(`Please check the ${field}.`);
  return Math.round(n * 10);
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
function email(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s.length > 254 || !EMAIL.test(s)) throw bad('Please enter a valid email.');
  return s;
}

function id(v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(404, 'Not found.');
  return n;
}

module.exports = { text, date, tenths, email, id, bad };

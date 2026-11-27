'use strict';
const db = require('./db');
const { encrypt, decrypt, blindIndex } = require('./crypto');
const { HttpError } = require('./http');
const v = require('./validate');

const FIELDS = { initials: 'initials_enc', startLocation: 'start_enc', endLocation: 'end_enc', program: 'program_enc' };
const ctx = (userId, field) => `${userId}:${field}`;

function toEntry(userId, r) {
  const s = Math.round(Number(r.odometer_start) * 10);
  const e = Math.round(Number(r.odometer_end) * 10);
  return {
    id: r.id,
    date: r.entry_date,
    initials: decrypt(r.initials_enc, ctx(userId, 'initials')),
    startLocation: decrypt(r.start_enc, ctx(userId, 'startLocation')),
    endLocation: decrypt(r.end_enc, ctx(userId, 'endLocation')),
    program: decrypt(r.program_enc, ctx(userId, 'program')),
    odometerStart: s / 10,
    odometerEnd: e / 10,
    miles: (e - s) / 10,
    milesTenths: e - s,
  };
}

const publicEntry = ({ milesTenths, ...rest }) => rest;

/** Newest first, like the daily log expects. */
async function list(userId) {
  const { rows } = await db.query('select * from entries where user_id = $1 order by entry_date desc, id desc', [userId]);
  return rows.map((r) => toEntry(userId, r));
}

async function find(userId, id) {
  const { rows } = await db.query('select * from entries where user_id = $1 and id = $2', [userId, id]);
  return rows.length ? toEntry(userId, rows[0]) : null;
}

function readInput(body, { requireDate }) {
  const initials = v.text(body.initials, 'initials', 10).toUpperCase();
  if (!/^[A-Z .-]+$/.test(initials)) throw v.bad('Initials can only contain letters.');
  const out = {
    date: body.date || !requireDate ? v.date(body.date || new Date().toISOString().slice(0, 10)) : v.date(body.date),
    initials,
    startLocation: v.text(body.startLocation, 'the start location', 200),
    endLocation: v.text(body.endLocation, 'the end location', 200),
    program: v.text(body.program, 'the program', 100, { required: false }),
    start: v.tenths(body.odometerStart, 'odometer start'),
    end: v.tenths(body.odometerEnd, 'odometer end'),
  };
  if (out.end < out.start) throw v.bad('Odometer end must be greater than or equal to odometer start.');
  return out;
}

async function remember(client, userId, kind, value) {
  if (!value) return;
  const norm = kind === 'program' ? value.toLowerCase() : value;
  await client.query(
    `insert into remembered (user_id, kind, value_hash, value_enc) values ($1, $2, $3, $4)
     on conflict (user_id, kind, value_hash) do nothing`,
    [userId, kind, blindIndex(`${userId}:${norm}`, 'remember:' + kind), encrypt(value, ctx(userId, 'remember:' + kind))]);
}

function encValues(userId, i) {
  return [
    encrypt(i.initials, ctx(userId, 'initials')),
    encrypt(i.startLocation, ctx(userId, 'startLocation')),
    encrypt(i.endLocation, ctx(userId, 'endLocation')),
    encrypt(i.program, ctx(userId, 'program')),
    (i.start / 10).toFixed(1),
    (i.end / 10).toFixed(1),
  ];
}

async function create(userId, body) {
  const i = readInput(body, { requireDate: false });
  const id = await db.tx(async (c) => {
    const { rows } = await c.query(
      `insert into entries (user_id, entry_date, initials_enc, start_enc, end_enc, program_enc, odometer_start, odometer_end)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`, [userId, i.date, ...encValues(userId, i)]);
    await remember(c, userId, 'initials', i.initials);
    await remember(c, userId, 'program', i.program);
    return rows[0].id;
  });
  return publicEntry(await find(userId, id));
}

async function update(userId, id, body) {
  const i = readInput(body, { requireDate: true });
  const n = await db.tx(async (c) => {
    const r = await c.query(
      `update entries set entry_date = $3, initials_enc = $4, start_enc = $5, end_enc = $6, program_enc = $7,
         odometer_start = $8, odometer_end = $9 where id = $1 and user_id = $2`,
      [id, userId, i.date, ...encValues(userId, i)]);
    if (r.rowCount) {
      await remember(c, userId, 'initials', i.initials);
      await remember(c, userId, 'program', i.program);
    }
    return r.rowCount;
  });
  if (!n) throw new HttpError(404, 'Not found.');
  return publicEntry(await find(userId, id));
}

async function remove(userId, id) {
  const r = await db.query('delete from entries where id = $1 and user_id = $2', [id, userId]);
  if (!r.rowCount) throw new HttpError(404, 'Not found.');
}

async function remembered(userId, kind) {
  const { rows } = await db.query('select value_enc from remembered where user_id = $1 and kind = $2', [userId, kind]);
  return rows.map((r) => decrypt(r.value_enc, ctx(userId, 'remember:' + kind)))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function forget(userId, kind, value) {
  const norm = kind === 'program' ? value.toLowerCase() : value;
  await db.query('delete from remembered where user_id = $1 and kind = $2 and value_hash = $3',
    [userId, kind, blindIndex(`${userId}:${norm}`, 'remember:' + kind)]);
}

/** Client (end location) -> program of its most recent trip. */
function clientPrograms(entries) {
  const map = {};
  entries.slice().sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    .forEach((e) => { if (e.program) map[e.endLocation] = e.program; });
  return map;
}

// ---------- Reimbursement rates ----------
async function rates(userId) {
  const { rows } = await db.query('select effective_date, rate from rates where user_id = $1 order by effective_date', [userId]);
  return rows.map((r) => ({ effectiveDate: r.effective_date, rate: Number(r.rate) }));
}

async function saveRate(userId, body) {
  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 10) throw v.bad('Enter a rate between $0.01 and $10.00 per mile.');
  const date = v.date(body.effectiveDate || new Date().toISOString().slice(0, 10), 'the effective date');
  await db.query(
    `insert into rates (user_id, effective_date, rate) values ($1, $2, $3)
     on conflict (user_id, effective_date) do update set rate = excluded.rate`, [userId, date, rate.toFixed(4)]);
  return rates(userId);
}

async function deleteRate(userId, date) {
  const r = await db.query('delete from rates where user_id = $1 and effective_date = $2', [userId, v.date(date)]);
  if (!r.rowCount) throw new HttpError(404, 'Not found.');
  return rates(userId);
}

module.exports = { list, create, update, remove, remembered, forget, clientPrograms, rates, saveRate, deleteRate, publicEntry };

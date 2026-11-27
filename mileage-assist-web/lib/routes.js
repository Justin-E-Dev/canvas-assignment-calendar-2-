'use strict';
const auth = require('./auth');
const entries = require('./entries');
const sheets = require('./sheets');
const dashboard = require('./dashboard');
const passkeys = require('./passkeys');
const v = require('./validate');
const { HttpError, send, sendFile, jsonBody, formBody, rawBody } = require('./http');

const today = () => new Date().toISOString().slice(0, 10);

function fileBase(label) {
  const safe = String(label || 'mileage').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
  return safe || 'mileage';
}

/** Only the signed-in user's trips, in the order requested. */
async function pick(userId, ids) {
  if (!Array.isArray(ids) || ids.length > 20000) throw v.bad('Invalid request.');
  const mine = new Map((await entries.list(userId)).map((e) => [e.id, e]));
  const out = [];
  for (const id of new Set(ids.map(Number))) if (mine.has(id)) out.push(mine.get(id));
  return out;
}

async function renderPart(user, format, part, template) {
  const rows = await pick(user.id, part.ids);
  if (format === 'csv') return { bytes: sheets.csv(rows), ext: 'csv', type: 'text/csv; charset=utf-8' };
  const ctx = { firstName: user.firstName, sheetNumber: Number(part.number) || 1, sheetCount: Number(part.total) || 1,
    group: String(part.group || '').slice(0, 120) };
  const bytes = template ? await sheets.fill(template.content, rows, ctx) : await sheets.standardXlsx(rows);
  return { bytes, ext: 'xlsx', type: sheets.XLSX_TYPE };
}

// [method, pattern, handler(ctx), options]
const ROUTES = [
  ['GET', /^\/api\/auth\/csrf$/, ({ req, res }) => { auth.issueCsrf(req, res); return { headerName: 'X-XSRF-TOKEN' }; }, { public: true }],
  ['POST', /^\/api\/auth\/signup$/, async ({ req, res }) => { await auth.signup(req, res, await jsonBody(req)); return { ok: true }; }, { public: true }],
  ['POST', /^\/login$/, async ({ req, res }) => { await auth.login(req, res, await formBody(req)); return { ok: true }; }, { public: true }],
  ['POST', /^\/logout$/, async ({ req, res }) => { await auth.endSession(req, res); return { ok: true }; }, { public: true }],

  ['POST', /^\/webauthn\/authenticate\/options$/, ({ req, res }) => passkeys.authenticationOptions(req, res), { public: true }],
  ['POST', /^\/login\/webauthn$/, async ({ req, res }) => passkeys.login(req, res, await jsonBody(req)), { public: true }],
  ['POST', /^\/webauthn\/register\/options$/, ({ req, res, user }) => passkeys.registrationOptions(req, res, user)],
  ['POST', /^\/webauthn\/register$/, async ({ req, user }) => passkeys.register(req, user, await jsonBody(req))],

  ['GET', /^\/api\/me$/, async ({ user }) => ({ email: user.email, firstName: user.firstName, passkeys: await passkeys.count(user.id) })],

  ['GET', /^\/api\/entries$/, async ({ user }) => (await entries.list(user.id)).map(entries.publicEntry)],
  ['POST', /^\/api\/entries$/, async ({ req, res, user }) => { res.statusCode = 201; return entries.create(user.id, await jsonBody(req)); }],
  ['PUT', /^\/api\/entries\/(\d+)$/, async ({ req, user, params }) => entries.update(user.id, v.id(params[0]), await jsonBody(req))],
  ['DELETE', /^\/api\/entries\/(\d+)$/, async ({ user, params }) => { await entries.remove(user.id, v.id(params[0])); }],

  ['GET', /^\/api\/initials$/, ({ user }) => entries.remembered(user.id, 'initials')],
  ['DELETE', /^\/api\/initials\/(.+)$/, async ({ user, params }) => { await entries.forget(user.id, 'initials', decodeURIComponent(params[0])); }],
  ['GET', /^\/api\/programs$/, async ({ user }) => ({
    programs: await entries.remembered(user.id, 'program'),
    clients: entries.clientPrograms(await entries.list(user.id)),
  })],
  ['DELETE', /^\/api\/programs\/(.+)$/, async ({ user, params }) => { await entries.forget(user.id, 'program', decodeURIComponent(params[0])); }],

  ['GET', /^\/api\/template$/, async ({ user }) => (await sheets.templateInfo(user.id)) ?? undefined],
  ['POST', /^\/api\/template$/, async ({ req, user }) => {
    let name = 'template.xlsx';
    try { name = decodeURIComponent(String(req.headers['x-file-name'] || name)); } catch { /* keep default */ }
    return sheets.saveTemplate(user.id, name, await rawBody(req) || Buffer.alloc(0));
  }],
  ['DELETE', /^\/api\/template$/, async ({ user }) => { await sheets.deleteTemplate(user.id); }],

  ['GET', /^\/api\/export\/csv$/, async ({ res, user }) => {
    sendFile(res, sheets.csv((await entries.list(user.id))), `mileage-${today()}.csv`, 'text/csv; charset=utf-8');
  }],
  ['GET', /^\/api\/export\/xlsx$/, async ({ res, user }) => {
    const t = await sheets.loadTemplate(user.id);
    const f = await renderPart(user, 'xlsx', { ids: (await entries.list(user.id)).map((e) => e.id) }, t);
    sendFile(res, f.bytes, `mileage-${today()}.xlsx`, f.type);
  }],
  ['POST', /^\/api\/export\/part$/, async ({ req, res, user, query }) => {
    const part = await jsonBody(req);
    const format = query.get('format') === 'csv' ? 'csv' : 'xlsx';
    const t = format === 'xlsx' ? await sheets.loadTemplate(user.id) : null;
    const f = await renderPart(user, format, part, t);
    sendFile(res, f.bytes, `${fileBase(part.label)}.${f.ext}`, f.type);
  }],
  ['POST', /^\/api\/export\/zip$/, async ({ req, res, user }) => {
    const body = await jsonBody(req);
    if (!Array.isArray(body.parts) || !body.parts.length || body.parts.length > 500) throw v.bad('Invalid request.');
    const format = body.format === 'csv' ? 'csv' : 'xlsx';
    const t = format === 'xlsx' ? await sheets.loadTemplate(user.id) : null;
    const files = [];
    for (const part of body.parts) {
      const f = await renderPart(user, format, part, t);
      files.push({ name: `${fileBase(part.label)}.${f.ext}`, bytes: f.bytes });
    }
    sendFile(res, await sheets.zip(files), `mileage-spreadsheets-${today()}.zip`, 'application/zip');
  }],

  ['GET', /^\/api\/rates$/, ({ user }) => entries.rates(user.id)],
  ['POST', /^\/api\/rates$/, async ({ req, user }) => entries.saveRate(user.id, await jsonBody(req))],
  ['DELETE', /^\/api\/rates\/(\d{4}-\d{2}-\d{2})$/, ({ user, params }) => entries.deleteRate(user.id, params[0])],
  ['GET', /^\/api\/dashboard$/, async ({ user, query }) => {
    const weeks = Math.max(2, Math.min(104, Number(query.get('weeks')) || 12));
    // The browser's calendar day, accepted only within a day of the server's.
    let day = today();
    const asked = query.get('today');
    if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && Math.abs(Date.parse(asked) - Date.parse(day)) <= 86400000) day = asked;
    return dashboard.build(await entries.list(user.id), await entries.rates(user.id), day, weeks);
  }],
];

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.searchParams.get('__path') || url.pathname;
  url.searchParams.delete('__path');
  const method = req.method.toUpperCase();
  try {
    let route = null;
    let params = [];
    let pathMatched = false;
    for (const [m, re, fn, opts] of ROUTES) {
      const hit = re.exec(path);
      if (!hit) continue;
      pathMatched = true;
      if (m === method) { route = [fn, opts || {}]; params = hit.slice(1); break; }
    }
    if (!route) throw new HttpError(pathMatched ? 405 : 404, 'Not found.');
    const [fn, opts] = route;
    if (method !== 'GET' && method !== 'HEAD') auth.checkCsrf(req);
    const user = opts.public ? null : await auth.currentUser(req);
    if (!opts.public && !user) throw new HttpError(401, 'Please sign in.');
    const out = await fn({ req, res, user, params, query: url.searchParams });
    if (!res.writableEnded) send(res, res.statusCode === 201 ? 201 : out === undefined ? 204 : 200, out);
  } catch (e) {
    if (res.headersSent) return res.end();
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    // Setup problems are reported plainly (they contain no user data) so they can be fixed.
    if (e && e.setup) return send(res, 503, { error: 'Setup incomplete: ' + e.message });
    const dbCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', '28P01', '28000', '3D000'];
    if (e && (dbCodes.includes(e.code) || /certificate|SSL|connect/i.test(e.message || ''))) {
      console.error('[mileage-assist] database connection failed:', e.code || e.message);
      return send(res, 503, { error: "Setup incomplete: the app can't connect to its database. Check Storage → Neon is "
        + 'connected to this project, then redeploy.' });
    }
    console.error('[mileage-assist] request failed:', e && e.name, e && e.message && e.message.slice(0, 200));
    send(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}

module.exports = { handle };

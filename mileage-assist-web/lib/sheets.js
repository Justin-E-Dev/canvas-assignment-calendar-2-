'use strict';
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const db = require('./db');
const { encrypt, decrypt, encryptBytes, decryptBytes } = require('./crypto');
const { HttpError } = require('./http');

const HEADERS = ['Date', 'Initials', 'Start Location', 'End Location', 'Program', 'Odometer Start', 'Odometer End', 'Miles'];
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_TEMPLATE = 4 * 1024 * 1024;

const usDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}/${y}`; };
const excelDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

// ---------- CSV ----------
/** Quotes a value and neutralises spreadsheet formula injection (=, +, -, @, tab, CR). */
function csvCell(v) {
  let s = String(v ?? '');
  if (s && '=+-@\t\r'.includes(s[0])) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function csv(entries) {
  const lines = [HEADERS.join(',')];
  for (const e of entries) {
    lines.push([e.date, csvCell(e.initials), csvCell(e.startLocation), csvCell(e.endLocation), csvCell(e.program),
      e.odometerStart.toFixed(1), e.odometerEnd.toFixed(1), e.miles.toFixed(1)].join(','));
  }
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8'); // BOM so Excel reads UTF-8
}

// ---------- Standard Excel file ----------
async function standardXlsx(entries) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mileage', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [12, 10, 30, 30, 22, 15, 15, 10].map((width, i) => ({ header: HEADERS[i], width }));
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
  });
  for (const e of entries) {
    ws.addRow([excelDate(e.date), e.initials, e.startLocation, e.endLocation, e.program, e.odometerStart, e.odometerEnd, e.miles]);
  }
  ws.getColumn(1).numFmt = 'm/d/yyyy';
  [6, 7, 8].forEach((i) => { ws.getColumn(i).numFmt = '0.0'; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Templates ----------
const FIELDS = {
  date: 'Date', initials: 'Initials', start: 'Start Location', end: 'End Location', program: 'Program',
  odoStart: 'Odometer Start', odoEnd: 'Odometer End', miles: 'Miles',
};
const EXACT = {};
const put = (f, ...keys) => keys.forEach((k) => { EXACT[k] = f; });
put('date', 'date', 'tripdate', 'dateoftravel', 'traveldate', 'day');
put('initials', 'initials', 'init', 'staffinitials', 'employeeinitials', 'driverinitials');
put('start', 'startlocation', 'from', 'origin', 'startingpoint', 'startingaddress', 'startaddress', 'startinglocation',
  'departure', 'departurelocation', 'fromlocation', 'fromaddress');
put('end', 'endlocation', 'to', 'destination', 'client', 'clientname', 'endaddress', 'endinglocation', 'tolocation',
  'toaddress', 'arrival', 'clientaddress');
put('program', 'program', 'programname', 'programtype');
put('odoStart', 'odometerstart', 'startodometer', 'beginningodometer', 'odostart', 'startingodometer', 'startingmileage',
  'beginningmileage', 'startmileage', 'odometerbegin', 'odometerbeginning', 'beginodometer', 'beginningreading', 'startreading');
put('odoEnd', 'odometerend', 'endodometer', 'endingodometer', 'odoend', 'endingmileage', 'endmileage', 'odometerending',
  'endingreading', 'endreading');
put('miles', 'miles', 'totalmiles', 'mileage', 'distance', 'tripmiles', 'milesdriven', 'totalmileage', 'milestraveled',
  'milestravelled', 'numberofmiles');

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function match(n) {
  if (!n || n.length > 60) return null;
  if (EXACT[n]) return EXACT[n];
  const odo = n.includes('odometer') || n.includes('odo') || n.includes('reading');
  if (odo && (n.includes('start') || n.includes('begin'))) return 'odoStart';
  if (odo && (n.includes('end') || n.includes('finish'))) return 'odoEnd';
  if (n.includes('date')) return 'date';
  if (n.includes('initial')) return 'initials';
  if (n.includes('program')) return 'program';
  const place = n.includes('location') || n.includes('address') || n.includes('point') || n.includes('place');
  if (n.includes('destination') || n.startsWith('client') || ((n.startsWith('to') || n.startsWith('end') || n.startsWith('finish')
    || n.startsWith('arriv')) && place)) return 'end';
  if (n.includes('origin') || n.startsWith('from') || ((n.startsWith('start') || n.startsWith('begin') || n.startsWith('depart')) && place)) return 'start';
  if (n.includes('miles') || n.includes('distance')) return 'miles';
  return null;
}

/** Plain text of a cell whose value is a string or rich text (not formulas or numbers). */
function cellText(cell) {
  const v = cell.value;
  if (typeof v === 'string') return v;
  if (v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
  return null;
}
const isFormula = (cell) => cell.value && typeof cell.value === 'object' && ('formula' in cell.value || 'sharedFormula' in cell.value);

/** Guards against "zip bombs": files that are small to upload but enormous once unpacked. */
async function checkZip(buf) {
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new HttpError(400, 'Please upload an Excel .xlsx file. (Older .xls files: open in Excel and "Save As" .xlsx.)');
  }
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch { throw new HttpError(400, "That file couldn't be opened as an Excel spreadsheet."); }
  let total = 0;
  let count = 0;
  zip.forEach((path, f) => {
    count += 1;
    total += (f._data && f._data.uncompressedSize) || 0;
  });
  if (count > 2000 || total > 60 * 1024 * 1024) throw new HttpError(400, 'That spreadsheet is too large to use as a template.');
}

async function openWorkbook(buf) {
  await checkZip(buf);
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch { throw new HttpError(400, "That file couldn't be opened as an Excel spreadsheet."); }
  return wb;
}

/** True for the hidden cells of a merged block (they mirror the top-left cell's value). */
const isMergedCopy = (cell) => cell.isMerged && cell.master && cell.master.address !== cell.address;

/** Last row covered by a (possibly merged) cell. */
function bottomOf(ws, row, col) {
  const master = ws.getCell(row, col).master || ws.getCell(row, col);
  let r = row;
  while (r < row + 20) {
    const below = ws.getCell(r + 1, col);
    if (below.isMerged && below.master && below.master.address === master.address) r += 1; else break;
  }
  return r;
}

const hasValue = (cell) => {
  if (isFormula(cell)) return false; // a form's own formulas (e.g. Miles = End - Start) belong to data rows
  const v = cell.value;
  return !(v === null || v === undefined || (typeof v === 'string' && !v.trim()));
};

/** Rows available between the first data row and a "Total" row, if the form has one. */
function capacity(ws, dataStart) {
  const last = Math.min(ws.rowCount, dataStart + 500);
  for (let r = dataStart; r <= last; r++) {
    let found = false;
    ws.getRow(r).eachCell((c) => {
      if (isMergedCopy(c)) return;
      const t = cellText(c);
      if ((t && norm(t).startsWith('total')) || (isFormula(c) && /SUM\(/i.test(c.value.formula || ''))) found = true;
    });
    if (found) return r - dataStart > 0 ? r - dataStart : null;
  }
  return null;
}

/**
 * Column headings can span several stacked rows ("Odometer" / "Start") or merged cells, and forms often put
 * hints or a sample line under them. Each candidate block of 1-3 rows is read as one heading per column;
 * the best-scoring block wins and trips start on the first empty row after it.
 */
function headingsAt(ws, top, height) {
  const texts = new Map();
  for (let r = top; r < top + height; r++) {
    ws.getRow(r).eachCell((c, col) => {
      if (isMergedCopy(c)) return;
      const t = cellText(c);
      if (t === null || !t.trim()) return;
      texts.set(col, (texts.get(col) ? texts.get(col) + ' ' : '') + t);
    });
  }
  const cols = {};
  const bareStart = [];
  const bareEnd = [];
  [...texts.keys()].sort((a, b) => a - b).forEach((col) => {
    const n = norm(texts.get(col));
    if (['start', 'begin', 'beginning', 'starting'].includes(n)) bareStart.push(col);
    else if (['end', 'ending', 'finish'].includes(n)) bareEnd.push(col);
    else { const f = match(n); if (f && !(f in cols)) cols[f] = col; }
  });
  bareStart.forEach((col) => { const f = 'odoStart' in cols ? 'start' : 'odoStart'; if (!(f in cols)) cols[f] = col; });
  bareEnd.forEach((col) => { const f = 'odoEnd' in cols ? 'end' : 'odoEnd'; if (!(f in cols)) cols[f] = col; });
  return cols;
}

function analyze(wb) {
  let best = null;
  let bestScore = 1;
  let bestHeight = 0;
  wb.worksheets.slice(0, 10).forEach((ws, sheetIndex) => {
    for (let r = 1; r <= Math.min(ws.rowCount, 80); r++) {
      for (let h = 1; h <= 3; h++) {
        const cols = headingsAt(ws, r, h);
        const score = Object.keys(cols).length;
        // Most columns recognised wins; on a tie, the tightest block (fewest rows) wins.
        if (score < bestScore || (score === bestScore && (!best || h >= bestHeight))) continue;
        // Trips start below the heading block (and below any merged heading cells)...
        let dataStart = r + h;
        for (const col of Object.values(cols)) dataStart = Math.max(dataStart, bottomOf(ws, r, col) + 1);
        // ...skipping up to 3 hint/sample rows that already hold values in the matched columns.
        for (let skip = 0; skip < 3; skip++) {
          const row = ws.getRow(dataStart);
          if (!Object.values(cols).some((col) => hasValue(row.getCell(col)) || isMergedCopy(row.getCell(col)))) break;
          dataStart += 1;
        }
        bestScore = score;
        bestHeight = h;
        best = { sheet: ws, sheetIndex, headerRow: r, dataStart, cols, capacity: capacity(ws, dataStart) };
      }
    }
  });
  if (!best) {
    throw new HttpError(400, "Couldn't find column headings in that file. Make sure it has a row of headings such as "
      + 'Date, Start Location, End Location, Program, Odometer Start, Odometer End.');
  }
  return best;
}

function describe(fileName, layout) {
  const order = Object.keys(FIELDS);
  return {
    fileName,
    columns: order.filter((f) => f in layout.cols).map((f) => FIELDS[f]),
    capacity: layout.capacity,
    headerRow: layout.headerRow,
    firstDataRow: layout.dataStart,
  };
}

/** Copies a worksheet (formatting, merges, formulas) into a new tab before it is filled. */
function cloneSheet(wb, src, name) {
  const copy = wb.addWorksheet(name);
  const model = JSON.parse(JSON.stringify(src.model));
  // Excel tables need unique names, so they aren't copied onto extra tabs.
  copy.model = { ...model, name, id: copy.id, mergeCells: model.merges, tables: [], media: model.media || [] };
  return copy;
}

function sheetName(wb, base, n) {
  const suffix = ` (${n})`;
  let name = (base.length + suffix.length > 31 ? base.slice(0, 31 - suffix.length) : base) + suffix;
  for (let i = 2; wb.getWorksheet(name); i++) name = name.slice(0, 27) + '~' + i;
  return name;
}

function writeRow(ws, layout, rowNumber, e) {
  const row = ws.getRow(rowNumber);
  const model = ws.getRow(layout.dataStart);
  for (const [field, col] of Object.entries(layout.cols)) {
    const cell = row.getCell(col);
    if (isFormula(cell)) continue; // keep the form's own calculations
    if (!cell.style || Object.keys(cell.style).length === 0) cell.style = JSON.parse(JSON.stringify(model.getCell(col).style || {}));
    switch (field) {
      case 'date': {
        cell.value = excelDate(e.date);
        const fmt = (cell.style && cell.style.numFmt) || '';
        if (!/[dmy]/i.test(fmt.replace(/"[^"]*"/g, ''))) cell.style = { ...JSON.parse(JSON.stringify(cell.style || {})), numFmt: 'm/d/yyyy' };
        break;
      }
      case 'initials': cell.value = e.initials; break;
      case 'start': cell.value = e.startLocation; break;
      case 'end': cell.value = e.endLocation; break;
      case 'program': cell.value = e.program; break;
      case 'odoStart': cell.value = e.odometerStart; break;
      case 'odoEnd': cell.value = e.odometerEnd; break;
      case 'miles': cell.value = e.miles; break;
      default: break;
    }
  }
}

function common(rows, key) {
  const vals = [...new Set(rows.map((r) => r[key]))];
  return vals.length === 1 ? vals[0] : vals.join(', ');
}

/** Replaces {{placeholders}} and fills "Program:"-style labels above the headings. */
function fillLabels(ws, layout, rows, ctx, tab, tabs) {
  const dates = rows.map((r) => r.date).sort();
  const first = dates[0];
  const totalMiles = Math.round(rows.reduce((a, r) => a + r.miles * 10, 0)) / 10;
  const sheetNo = ctx.sheetCount > 1 || tabs === 1 ? ctx.sheetNumber : tab;
  const values = {
    program: rows.length ? common(rows, 'program') : '',
    initials: rows.length ? common(rows, 'initials') : '',
    name: ctx.firstName,
    firstname: ctx.firstName,
    totalmiles: totalMiles,
    startdate: first ? usDate(first) : '',
    enddate: dates.length ? usDate(dates[dates.length - 1]) : '',
    month: first ? new Date(first + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '',
    today: usDate(new Date().toISOString().slice(0, 10)),
    sheet: tabs > 1 ? `${sheetNo}.${tab}` : String(sheetNo),
    sheets: String(ctx.sheetCount),
    group: ctx.group || '',
  };
  const token = /\{\{\s*([A-Za-z ]+?)\s*\}\}/g;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    const cells = [];
    row.eachCell((c, col) => cells.push([c, col]));
    for (const [c, col] of cells) {
      const t = cellText(c);
      if (t === null) continue;
      if (t.includes('{{')) {
        const whole = /^\s*\{\{\s*([A-Za-z ]+?)\s*\}\}\s*$/.exec(t);
        if (whole && typeof values[norm(whole[1])] === 'number') { c.value = values[norm(whole[1])]; continue; }
        c.value = t.replace(token, (m, name) => {
          const val = values[norm(name)];
          if (val === undefined) return m;
          return typeof val === 'number' ? val.toFixed(1) : val;
        });
      } else if (r < layout.headerRow) {
        const n = norm(t);
        const fillWith = ['program', 'programname', 'programtype'].includes(n) ? values.program
          : ['initials', 'staffinitials', 'employeeinitials'].includes(n) ? values.initials : null;
        if (!fillWith) continue;
        const next = row.getCell(col + 1);
        const nt = next.value;
        if (nt === null || nt === undefined || (typeof nt === 'string' && !nt.trim())) next.value = fillWith;
      }
    }
  });
}

async function fill(templateBuf, entries, ctx) {
  const wb = await openWorkbook(templateBuf);
  const layout = analyze(wb);
  const cap = layout.capacity || Math.max(entries.length, 1);
  const pages = Math.max(1, Math.ceil(entries.length / cap));
  const sheets = [layout.sheet];
  for (let p = 2; p <= pages; p++) sheets.push(cloneSheet(wb, layout.sheet, sheetName(wb, layout.sheet.name, p)));
  for (let p = 0; p < pages; p++) {
    const chunk = entries.slice(p * cap, (p + 1) * cap);
    chunk.forEach((e, i) => writeRow(sheets[p], layout, layout.dataStart + i, e));
    fillLabels(sheets[p], layout, chunk, ctx, p + 1, pages);
  }
  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Template storage (encrypted) ----------
async function saveTemplate(userId, fileName, buf) {
  if (buf.length > MAX_TEMPLATE) throw new HttpError(413, 'That file is too large. Templates can be up to 4 MB.');
  const safe = String(fileName || 'template.xlsx').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(-200);
  if (!/\.(xlsx|xlsm)$/i.test(safe)) throw new HttpError(400, 'Please upload an Excel .xlsx file.');
  const wb = await openWorkbook(buf);
  const info = describe(safe, analyze(wb));
  await db.query(
    `insert into templates (user_id, file_name_enc, content_enc, uploaded_at) values ($1, $2, $3, now())
     on conflict (user_id) do update set file_name_enc = excluded.file_name_enc, content_enc = excluded.content_enc,
       uploaded_at = now()`,
    [userId, encrypt(safe, `${userId}:templateName`), encryptBytes(buf, `${userId}:template`)]);
  return info;
}

async function loadTemplate(userId) {
  const { rows } = await db.query('select file_name_enc, content_enc from templates where user_id = $1', [userId]);
  if (!rows.length) return null;
  return {
    fileName: decrypt(rows[0].file_name_enc, `${userId}:templateName`),
    content: decryptBytes(rows[0].content_enc, `${userId}:template`),
  };
}

async function templateInfo(userId) {
  const t = await loadTemplate(userId);
  if (!t) return null;
  try {
    return describe(t.fileName, analyze(await openWorkbook(t.content)));
  } catch {
    return { fileName: t.fileName, error: 'This template can no longer be read.' };
  }
}

async function deleteTemplate(userId) {
  await db.query('delete from templates where user_id = $1', [userId]);
}

async function zip(files) {
  const z = new JSZip();
  const used = new Set();
  for (const f of files) {
    let name = f.name;
    for (let i = 2; used.has(name); i++) name = f.name.replace(/(\.[a-z]+)$/, `-${i}$1`);
    used.add(name);
    z.file(name, f.bytes);
  }
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = {
  csv, standardXlsx, fill, analyze, openWorkbook, describe, saveTemplate, loadTemplate, templateInfo, deleteTemplate, zip,
  XLSX_TYPE, csvCell,
};

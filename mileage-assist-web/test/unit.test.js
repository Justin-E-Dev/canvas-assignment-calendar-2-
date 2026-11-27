'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const crypto = require('../lib/crypto');
const dashboard = require('../lib/dashboard');
const sheets = require('../lib/sheets');

const trip = (id, date, program, client, miles) => ({
  id, date, initials: 'JE', startLocation: 'Office', endLocation: client, program,
  odometerStart: 1000, odometerEnd: 1000 + miles, miles, milesTenths: Math.round(miles * 10),
});

test('encryption round-trips and rejects tampering or the wrong owner', () => {
  const c = crypto.encrypt('Smith House', '7:endLocation');
  assert.notEqual(c, 'Smith House');
  assert.equal(crypto.decrypt(c, '7:endLocation'), 'Smith House');
  assert.throws(() => crypto.decrypt(c, '8:endLocation')); // another user's context
  const tampered = c.slice(0, -4) + (c.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  assert.throws(() => crypto.decrypt(tampered, '7:endLocation'));
  assert.notEqual(crypto.encrypt('x', 'a'), crypto.encrypt('x', 'a')); // random IVs
});

test('dashboard averages full weeks and applies each rate from its effective date', () => {
  const rates = [{ effectiveDate: '2026-01-01', rate: 0.5 }, { effectiveDate: '2026-11-16', rate: 1 }];
  const d = dashboard.build([
    trip(1, '2026-11-03', 'Senior Care', 'Smith', 100), // $50 at old rate
    trip(2, '2026-11-10', 'Youth', 'Jones', 40),        // $20
    trip(3, '2026-11-17', 'Senior Care', 'Smith', 30),  // $30 at new rate
    trip(4, '2026-11-24', 'Youth', 'Jones', 10),        // $10 this week (in progress)
  ], rates, '2026-11-25', 4);
  assert.equal(d.weeks.length, 4);
  assert.equal(d.weeks[3].partial, true);
  assert.equal(d.weeksCounted, 3);
  assert.equal(d.avgWeekly.amount, 33.33);
  assert.equal(d.thisWeek.amount, 10);
  assert.ok(Math.abs(d.changeVsAvg + 0.7) < 0.01);
  assert.equal(d.rangeTotal.amount, 110);
  assert.equal(d.currentRate, 1);
  assert.equal(d.byProgram[0].name, 'Senior Care');
  assert.equal(d.byProgram[0].avgWeekly, 26.67);
  assert.ok(Math.abs(d.byProgram[0].share - 0.8) < 0.001);
  assert.equal(d.byWeekday[1].name, 'Tue');
});

test('new accounts average only from their first week; small clients fold into Other', () => {
  const r = [{ effectiveDate: '2026-01-01', rate: 0.7 }];
  const d = dashboard.build([trip(1, '2026-11-24', 'P', 'C', 10)], r, '2026-11-25', 12);
  assert.equal(d.avgIsThisWeekSoFar, true);
  assert.equal(d.avgWeekly.amount, 7);
  const many = Array.from({ length: 9 }, (_, i) => trip(i + 1, '2026-11-1' + i, 'P', 'Client ' + i, 10 + i));
  const d2 = dashboard.build(many, [{ effectiveDate: '2026-01-01', rate: 1 }], '2026-11-25', 4);
  assert.equal(d2.topClients.length, 6);
  assert.equal(d2.topClients[5].name, 'Other (4)');
});

test('CSV neutralises spreadsheet formulas', () => {
  const out = sheets.csv([{ ...trip(1, '2026-01-02', '+prog', '@x', 9), startLocation: '=cmd()' }]).toString('utf8');
  assert.match(out, /"'=cmd\(\)"/);
  assert.match(out, /"'@x"/);
  assert.match(out, /"'\+prog"/);
});

async function agencyForm({ inline = false } = {}) {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('Mileage Log');
  s.getCell('A1').value = 'Monthly Mileage Reimbursement';
  s.getCell('A2').value = 'Program:';
  s.getCell('D2').value = inline ? { richText: [{ text: 'Employee: ' }, { text: '{{name}}' }] } : 'Employee: {{name}}';
  s.getCell('F2').value = 'Sheet {{sheet}} of {{sheets}}';
  ['Date', 'From', 'To', 'Program', 'Beginning Odometer', 'Ending Odometer', 'Miles'].forEach((h, i) => { s.getRow(4).getCell(i + 1).value = h; });
  for (let r = 5; r <= 16; r++) {
    s.getCell('G' + r).value = { formula: `IF(F${r}="","",F${r}-E${r})` };
    for (let c = 1; c <= 7; c++) s.getRow(r).getCell(c).border = { bottom: { style: 'thin' } };
  }
  s.getCell('F17').value = 'Total';
  s.getCell('G17').value = { formula: 'SUM(G5:G16)' };
  s.mergeCells('A1:G1');
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('template: finds headings, keeps formulas, fills labels/placeholders, overflows to new tabs', async () => {
  const tpl = await agencyForm({ inline: true });
  const info = sheets.describe('Form.xlsx', sheets.analyze(await sheets.openWorkbook(tpl)));
  assert.equal(info.capacity, 12);
  assert.deepEqual(info.columns, ['Date', 'Start Location', 'End Location', 'Program', 'Odometer Start', 'Odometer End', 'Miles']);

  const rows = Array.from({ length: 14 }, (_, i) => trip(i + 1, `2026-11-${String(i + 1).padStart(2, '0')}`, 'Senior Care', 'Client ' + i, 5));
  const out = await sheets.fill(tpl, rows, { firstName: 'Pat', sheetNumber: 2, sheetCount: 4, group: 'Senior Care' });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out);
  assert.equal(wb.worksheets.length, 2);
  const [s1, s2] = wb.worksheets;
  assert.equal(s1.getCell('B2').value, 'Senior Care');
  assert.equal(s1.getCell('D2').value, 'Employee: Pat');
  assert.equal(s1.getCell('F2').value, 'Sheet 2.1 of 4');
  assert.equal(s1.getCell('A5').value.toISOString().slice(0, 10), '2026-11-01');
  assert.equal(s1.getCell('B5').value, 'Office');
  assert.equal(s1.getCell('C5').value, 'Client 0');
  assert.equal(s1.getCell('E5').value, 1000);
  assert.ok(s1.getCell('G5').value.formula, 'form formula kept');
  assert.equal(s1.getCell('G17').value.formula, 'SUM(G5:G16)');
  assert.equal(s2.name, 'Mileage Log (2)');
  assert.equal(s2.getCell('C5').value, 'Client 12');
  assert.equal(s2.getCell('C6').value, 'Client 13');
  assert.ok(!s2.getCell('C7').value);
  assert.equal(s2.getCell('A1').value, 'Monthly Mileage Reimbursement');
});

test('template upload rejects non-Excel files and zip bombs', async () => {
  await assert.rejects(sheets.openWorkbook(Buffer.from('not a spreadsheet')), /xlsx/);
  const JSZip = require('jszip');
  const z = new JSZip();
  z.file('big.xml', Buffer.alloc(80 * 1024 * 1024)); // 80 MB of zeros compresses to ~80 KB
  const bomb = await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  assert.ok(bomb.length < 1024 * 1024);
  await assert.rejects(sheets.openWorkbook(bomb), /too large/);
});

/** Re-creation of a real agency form ("Staff Travel") with headings over several rows and a hint/sample row. */
async function staffTravel({ merged }) {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('Sheet1');
  s.getCell('A1').value = 'Staff Travel';
  s.mergeCells('A1:H1');
  const reason = 'Reason for travel\nPlease be specific. Example "transporting client to court, picking intake up, traveling to client home for session, etc."';
  if (merged) {
    const heads = { A: 'Travel\nDate', B: 'Start\nLocation', C: 'Finish\nLocation', D: reason, F: 'Odometer\nStart', G: 'Odometer\nFinish', H: 'Miles' };
    for (const [col, text] of Object.entries(heads)) {
      s.getCell(col + '2').value = text;
      s.mergeCells(`${col}2:${col}${['F', 'G', 'A'].includes(col) ? 3 : 4}`);
    }
    s.getCell('A4').value = { formula: 'TODAY()' };
  } else {
    ['Travel', 'Start', 'Finish', 'Reason for travel', 'Program', 'Odometer', 'Odometer', 'Miles'].forEach((t, i) => { s.getRow(2).getCell(i + 1).value = t; });
    ['Date', 'Location', 'Location', 'Please be specific. Example "transporting client to court,'].forEach((t, i) => { s.getRow(3).getCell(i + 1).value = t; });
    s.getCell('F3').value = 'Start';
    s.getCell('G3').value = 'Finish';
    s.getCell('A4').value = { formula: 'TODAY()' };
    s.getCell('D4').value = 'picking intake up, traveling to client home for session, etc."';
  }
  s.getCell('E2').value = 'Program';
  s.getCell('E3').value = 'Voy, PTR';
  s.getCell('E4').value = 'MDFT, OP, SAP';
  s.getCell('F4').value = 36;
  s.getCell('G4').value = 67;
  for (let r = 5; r <= 16; r++) s.getCell('H' + r).value = { formula: `IF(G${r}="","",G${r}-F${r})` };
  s.getCell('G17').value = 'Total Miles';
  s.getCell('H17').value = { formula: 'SUM(H5:H16)' };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

for (const merged of [false, true]) {
  test(`Staff Travel form (${merged ? 'merged headings' : 'stacked heading rows'}) is filled below its hints`, async () => {
    const tpl = await staffTravel({ merged });
    const layout = sheets.analyze(await sheets.openWorkbook(tpl));
    assert.deepEqual(layout.cols, { date: 1, start: 2, end: 3, program: 5, odoStart: 6, odoEnd: 7, miles: 8 });
    assert.equal(layout.dataStart, 5);
    assert.equal(layout.capacity, 12);

    const rows = [trip(1, '2026-11-02', 'MDFT', 'Court House', 12.5), trip(2, '2026-11-03', 'Voy', 'Client Home', 7)];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await sheets.fill(tpl, rows, { firstName: 'Justin', sheetNumber: 1, sheetCount: 1 }));
    const s = wb.worksheets[0];
    assert.equal(s.getCell('E3').value, 'Voy, PTR');        // hints untouched
    assert.equal(s.getCell('E4').value, 'MDFT, OP, SAP');
    assert.equal(s.getCell('F4').value, 36);                // sample row untouched
    assert.equal(s.getCell('A5').value.toISOString().slice(0, 10), '2026-11-02');
    assert.equal(s.getCell('B5').value, 'Office');
    assert.equal(s.getCell('C5').value, 'Court House');
    assert.equal(s.getCell('E5').value, 'MDFT');
    assert.equal(s.getCell('F5').value, 1000);
    assert.equal(s.getCell('G5').value, 1012.5);
    assert.ok(s.getCell('H5').value.formula, "form's miles formula kept");
    assert.equal(s.getCell('C6').value, 'Client Home');
    assert.ok(!s.getCell('C7').value);
    assert.equal(s.getCell('H17').value.formula, 'SUM(H5:H16)');
  });
}

test('"Minus miles" style deduction columns are left for the form, "Total miles" is the miles column', () => {
  assert.equal(sheets.match('minusmiles'), null);
  assert.equal(sheets.match('lesscommutemiles'), null);
  assert.equal(sheets.match('commutededuction'), null);
  assert.equal(sheets.match('totalmiles'), 'miles');
  assert.equal(sheets.match('irsmileagereimbursementrate'), null);
});

test('Staff Travel form with Minus miles + formula Total miles keeps the form math intact', async () => {
  const wb0 = new ExcelJS.Workbook();
  const s0 = wb0.addWorksheet('Sheet1');
  ['Travel Date', 'Start Location', 'Finish Location', 'Reason for travel', 'Program', 'Odometer Start', 'Odometer Finish',
    'Minus miles', 'Total miles', 'IRS Mileage Reimbursement Rate'].forEach((h, i) => { s0.getRow(3).getCell(i + 1).value = h; });
  s0.getCell('J4').value = 0.76;
  for (let r = 5; r <= 20; r++) {
    s0.getCell('I' + r).value = { formula: `G${r}-F${r}-H${r}` };
    s0.getCell('J' + r).value = { formula: `I${r}*$J$4` };
  }
  s0.getCell('E21').value = 'Subtotals';
  s0.getCell('I21').value = { formula: 'SUM(I5:I20)' };
  const tpl = Buffer.from(await wb0.xlsx.writeBuffer());
  const layout = sheets.analyze(await sheets.openWorkbook(tpl));
  assert.equal(layout.cols.miles, 9);          // "Total miles", not "Minus miles"
  assert.equal(layout.dataStart, 5);           // the 0.760 rate row is skipped
  assert.equal(layout.capacity, 16);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await sheets.fill(tpl, [trip(1, '2026-11-02', 'MDFT', 'Court', 31)], { firstName: 'J', sheetNumber: 1, sheetCount: 1 }));
  const s = wb.worksheets[0];
  assert.equal(s.getCell('F5').value, 1000);
  assert.equal(s.getCell('G5').value, 1031);
  assert.ok(!s.getCell('H5').value, 'Minus miles left blank');
  assert.equal(s.getCell('I5').value.formula, 'G5-F5-H5');
  assert.equal(s.getCell('J4').value, 0.76);
});

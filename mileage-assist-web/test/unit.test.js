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

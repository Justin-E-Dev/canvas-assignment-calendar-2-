'use strict';
// Weekly reimbursement figures. Money is computed in whole cents (integers) to avoid rounding drift.
// Weeks run Monday-Sunday. Averages use full weeks only (the current week is still in progress),
// counted from the week of the first trip so a new account isn't dragged down by empty weeks.

const DAY = 86400000;
const toDay = (iso) => Date.parse(iso + 'T00:00:00Z') / DAY;
const toIso = (day) => new Date(day * DAY).toISOString().slice(0, 10);
const monday = (day) => day - ((new Date(day * DAY).getUTCDay() + 6) % 7);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Rate (in 1/10000 dollars) in force on a date; trips before the first rate use the earliest rate. */
function rateOn(rates, iso) {
  let r = null;
  for (const x of rates) if (x.effectiveDate <= iso) r = x.rate10k;
  return r ?? (rates.length ? rates[0].rate10k : 0);
}

// miles (tenths) x rate (1/10000 $) = 1/100000 $; /1000 -> cents
const cents = (e, rates) => Math.round((e.milesTenths * rateOn(rates, e.date)) / 1000);
const dollars = (c) => Math.round(c) / 100;
const miles = (t) => Math.round(t) / 10;

function sum(list, rates) {
  return list.reduce((a, e) => ({ c: a.c + cents(e, rates), t: a.t + e.milesTenths, n: a.n + 1 }), { c: 0, t: 0, n: 0 });
}

function slices(list, rates, nameOf, totalCents, weeks, limit) {
  const groups = new Map();
  for (const e of list) {
    const name = nameOf(e).trim();
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    groups.get(key).items.push(e);
  }
  const out = [...groups.values()].map((g) => {
    const s = sum(g.items, rates);
    return { name: g.name, c: s.c, t: s.t, n: s.n };
  }).sort((a, b) => b.c - a.c || a.name.localeCompare(b.name));
  let shown = out;
  if (out.length > limit) {
    const rest = out.slice(limit - 1);
    shown = out.slice(0, limit - 1).concat([{
      name: `Other (${rest.length})`, c: rest.reduce((a, x) => a + x.c, 0), t: rest.reduce((a, x) => a + x.t, 0),
      n: rest.reduce((a, x) => a + x.n, 0),
    }]);
  }
  return shown.map((x) => ({
    name: x.name, miles: miles(x.t), amount: dollars(x.c), trips: x.n,
    share: totalCents ? x.c / totalCents : 0, avgWeekly: dollars(x.c / weeks),
  }));
}

/**
 * @param entries trips with { date, milesTenths, program, endLocation }
 * @param rateRows [{ effectiveDate, rate }] oldest first
 */
function build(entries, rateRows, todayIso, weeksBack) {
  const rates = rateRows.map((r) => ({ effectiveDate: r.effectiveDate, rate10k: Math.round(r.rate * 10000) }));
  const thisMonday = monday(toDay(todayIso));
  const rangeStart = thisMonday - 7 * (weeksBack - 1);
  const rangeEnd = thisMonday + 6;
  const trips = entries.filter((e) => { const d = toDay(e.date); return d >= rangeStart && d <= rangeEnd; });

  const byWeek = new Map();
  for (const e of trips) {
    const w = monday(toDay(e.date));
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(e);
  }
  const weeks = [];
  for (let w = rangeStart; w <= thisMonday; w += 7) {
    const s = sum(byWeek.get(w) || [], rates);
    weeks.push({ start: toIso(w), end: toIso(w + 6), miles: miles(s.t), amount: dollars(s.c), cents: s.c, tenths: s.t,
      trips: s.n, partial: w === thisMonday });
  }

  const firstTripWeek = entries.length ? monday(Math.min(...entries.map((e) => toDay(e.date)))) : thisMonday;
  const avgFrom = Math.max(firstTripWeek, rangeStart);
  let counted = weeks.filter((w) => toDay(w.start) >= avgFrom && !w.partial);
  const soFar = counted.length === 0;
  if (soFar) counted = weeks.filter((w) => w.partial);
  const n = Math.max(1, counted.length);
  const avgCents = counted.reduce((a, w) => a + w.cents, 0) / n;
  const avg = {
    amount: dollars(avgCents),
    miles: miles(counted.reduce((a, w) => a + w.tenths, 0) / n),
    trips: Math.round(counted.reduce((a, w) => a + w.trips, 0) / n),
  };
  const cur = weeks[weeks.length - 1];
  const total = sum(trips, rates);

  const countedStarts = new Set(counted.map((w) => w.start));
  const avgTrips = trips.filter((e) => countedStarts.has(toIso(monday(toDay(e.date)))));
  const avgTotal = sum(avgTrips, rates).c;

  const byDow = WEEKDAYS.map(() => []);
  trips.forEach((e) => { byDow[(new Date(e.date + 'T00:00:00Z').getUTCDay() + 6) % 7].push(e); });

  return {
    currentRate: rates.length ? rateOn(rates, todayIso) / 10000 : null,
    rates: rateRows,
    weeks: weeks.map(({ cents: _c, tenths: _t, ...w }) => w),
    weeksCounted: counted.length,
    avgIsThisWeekSoFar: soFar,
    avgWeekly: avg,
    thisWeek: { amount: cur.amount, miles: cur.miles, trips: cur.trips },
    changeVsAvg: avgCents === 0 ? null : (cur.cents - avgCents) / avgCents,
    rangeTotal: { amount: dollars(total.c), miles: miles(total.t), trips: total.n },
    avgPerTrip: total.n ? dollars(total.c / total.n) : 0,
    avgMilesPerTrip: total.n ? miles(total.t / total.n) : 0,
    byProgram: slices(avgTrips, rates, (e) => e.program || '(No program)', avgTotal, n, Infinity),
    byWeekday: byDow.map((list, i) => {
      const s = sum(list, rates);
      return { name: WEEKDAYS[i], miles: miles(s.t), amount: dollars(s.c), trips: s.n, share: total.c ? s.c / total.c : 0 };
    }),
    topClients: slices(trips, rates, (e) => e.endLocation, total.c, n, 6),
  };
}

module.exports = { build };

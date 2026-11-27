// Reimbursement dashboard: rate settings, KPI tiles and SVG charts (no third-party chart code).
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const C = {
    bar: '#2E7D32', other: '#8A918D', partial: '#A5D6A7', grid: '#E3E6E4', axis: '#8A918D', ink: '#2F3437', track: '#EEF0EF',
  };
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
  const money0 = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const num1 = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (n) => Math.round(n * 100) + '%';
  const shortDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const longDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  let data = null;

  function el(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // Bar with rounded data-end and a square baseline.
  function barPath(x, y, w, h, horizontal) {
    const r = Math.min(4, w / 2, h / 2);
    if (h <= 0 || w <= 0) return '';
    if (horizontal) {
      return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    }
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  // ---------- Tooltip ----------
  const tip = $('chart-tip');
  function showTip(evt, lines) {
    tip.replaceChildren();
    lines.forEach((line, i) => {
      if (i) tip.appendChild(document.createElement('br'));
      // Plain strings are body text; { bold: true, text } is the heading line.
      if (typeof line === 'object' && line.bold) {
        const b = document.createElement('b');
        b.textContent = line.text;
        tip.appendChild(b);
      } else {
        tip.appendChild(document.createTextNode(typeof line === 'object' ? line.text : line));
      }
    });
    tip.hidden = false;
    const pt = evt.touches ? evt.touches[0] : evt;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = pt.clientX + 14;
    let y = pt.clientY - h - 10;
    if (x + w > innerWidth - 8) x = pt.clientX - w - 14;
    if (y < 8) y = pt.clientY + 16;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function hover(node, lines) {
    node.addEventListener('mousemove', (e) => showTip(e, lines));
    node.addEventListener('mouseleave', hideTip);
    node.addEventListener('touchstart', (e) => showTip(e, lines), { passive: true });
  }
  document.addEventListener('scroll', hideTip, { passive: true });

  function empty(box, msg) {
    const p = document.createElement('p');
    p.className = 'chart-empty';
    p.textContent = msg;
    box.replaceChildren(p);
  }

  // ---------- Weekly bars + average line ----------
  function weeklyChart(box, weeks, avg) {
    if (!weeks.some((w) => w.trips > 0)) return empty(box, 'No trips in this time range yet.');
    const W = Math.max(300, box.clientWidth);
    const H = W < 500 ? 220 : 260;
    const m = { l: 52, r: 10, t: 14, b: 30 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const top = niceMax(Math.max(avg, ...weeks.map((w) => Number(w.amount))) * 1.08);
    const y = (v) => m.t + ih - (v / top) * ih;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': 'Weekly reimbursements bar chart. Average ' + money.format(avg) + ' per week.' });

    for (let i = 0; i <= 4; i++) {
      const v = (top / 4) * i;
      svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: C.grid, 'stroke-width': 1 }));
      svg.appendChild(el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: C.axis }, money0.format(v)));
    }
    const band = iw / weeks.length;
    const bw = Math.max(4, Math.min(36, band - 2));
    const every = Math.ceil(weeks.length / Math.max(1, Math.floor(iw / 56)));
    weeks.forEach((w, i) => {
      const x = m.l + band * i + (band - bw) / 2;
      const v = Number(w.amount);
      if (v > 0) svg.appendChild(el('path', { d: barPath(x, y(v), bw, y(0) - y(v)), fill: w.partial ? C.partial : C.bar }));
      if (i % every === 0) {
        svg.appendChild(el('text', { x: x + bw / 2, y: H - 10, 'text-anchor': 'middle', 'font-size': 11, fill: C.axis }, shortDate(w.start)));
      }
      const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ih, fill: 'transparent', class: 'hit' });
      hover(hit, [
        { bold: true, text: 'Week of ' + longDate(w.start) + (w.partial ? ' (in progress)' : '') },
        money.format(v) + ' reimbursed',
        num1(w.miles) + ' miles · ' + w.trips + ' trip' + (w.trips === 1 ? '' : 's'),
      ]);
      svg.appendChild(hit);
    });
    svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: C.axis, 'stroke-width': 1 }));
    // Average line, labelled once.
    svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: y(avg), y2: y(avg), stroke: C.ink, 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
    const label = 'Avg ' + money.format(avg);
    const lw = label.length * 6.6 + 10;
    svg.appendChild(el('rect', { x: W - m.r - lw, y: y(avg) - 20, width: lw, height: 16, rx: 3, fill: '#fff', opacity: 0.9 }));
    svg.appendChild(el('text', { x: W - m.r - 5, y: y(avg) - 8, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 700, fill: C.ink }, label));
    box.replaceChildren(svg);

    const legend = document.createElement('div');
    legend.className = 'legend';
    [['l-full', 'Full week'], ['l-part', 'This week (in progress)'], ['l-avg', 'Weekly average']].forEach(([c, t]) => {
      const s = document.createElement('span');
      const i = document.createElement('i');
      i.className = c;
      s.append(i, t);
      legend.appendChild(s);
    });
    box.appendChild(legend);
  }

  function weeklyTable(box, weeks) {
    const t = document.createElement('table');
    const head = t.createTHead().insertRow();
    ['Week of', 'Trips', 'Miles', 'Reimbursed'].forEach((h) => { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
    const body = t.createTBody();
    weeks.slice().reverse().forEach((w) => {
      const r = body.insertRow();
      [longDate(w.start) + (w.partial ? ' (so far)' : ''), w.trips, num1(w.miles), money.format(w.amount)]
        .forEach((v) => { r.insertCell().textContent = v; });
    });
    box.replaceChildren(t);
  }

  // ---------- Horizontal bars (program, clients) ----------
  function hbarChart(box, slices, opts) {
    if (!slices.length) return empty(box, opts.emptyText);
    const W = Math.max(280, box.clientWidth);
    const row = 46;
    const H = slices.length * row;
    const max = Math.max(...slices.map((s) => Number(opts.value(s)))) || 1;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria });
    slices.forEach((s, i) => {
      const y0 = i * row;
      const v = Number(opts.value(s));
      const valText = opts.valueText(s);
      const maxName = Math.floor((W - valText.length * 7 - 16) / 7);
      const name = s.name.length > maxName ? s.name.slice(0, Math.max(4, maxName - 1)) + '…' : s.name;
      svg.appendChild(el('text', { x: 0, y: y0 + 15, 'font-size': 13, 'font-weight': 600, fill: C.ink }, name));
      svg.appendChild(el('text', { x: W, y: y0 + 15, 'text-anchor': 'end', 'font-size': 12, fill: C.ink }, valText));
      svg.appendChild(el('rect', { x: 0, y: y0 + 22, width: W, height: 12, rx: 4, fill: C.track }));
      const bw = (v / max) * W;
      // "Other" is a combined total of smaller items, so it's grey rather than a real entity's green.
      const fill = /^Other \(\d+\)$/.test(s.name) ? C.other : C.bar;
      if (bw > 0) svg.appendChild(el('path', { d: barPath(0, y0 + 22, Math.max(bw, 3), 12, true), fill }));
      const hit = el('rect', { x: 0, y: y0, width: W, height: row, fill: 'transparent' });
      hover(hit, opts.tip(s));
      svg.appendChild(hit);
    });
    box.replaceChildren(svg);
  }

  // ---------- Day-of-week columns ----------
  function weekdayChart(box, days) {
    if (!days.some((d) => d.trips > 0)) return empty(box, 'No trips in this time range yet.');
    const W = Math.max(280, box.clientWidth);
    const H = 200;
    const m = { t: 22, b: 26 };
    const ih = H - m.t - m.b;
    const max = Math.max(...days.map((d) => d.share)) || 1;
    const band = W / 7;
    const bw = Math.min(40, band - 10);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Share of reimbursement by day of week' });
    days.forEach((d, i) => {
      const x = band * i + (band - bw) / 2;
      const h = (d.share / max) * ih;
      svg.appendChild(el('rect', { x, y: m.t, width: bw, height: ih, rx: 4, fill: C.track }));
      if (h > 0) svg.appendChild(el('path', { d: barPath(x, m.t + ih - h, bw, h), fill: C.bar }));
      svg.appendChild(el('text', { x: x + bw / 2, y: m.t + ih - h - 6, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, fill: C.ink },
        d.trips ? pct(d.share) : ''));
      svg.appendChild(el('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 11, fill: C.axis }, d.name));
      const hit = el('rect', { x: band * i, y: 0, width: band, height: H, fill: 'transparent' });
      hover(hit, [{ bold: true, text: d.name }, money.format(d.amount) + ' · ' + pct(d.share) + ' of total',
        d.trips + ' trip' + (d.trips === 1 ? '' : 's') + ' · ' + num1(d.miles) + ' mi']);
      svg.appendChild(hit);
    });
    box.replaceChildren(svg);
  }

  // ---------- Page ----------
  function renderRates(rates, current) {
    const list = $('r-list');
    list.replaceChildren();
    const today = MA.todayISO();
    let currentDate = null;
    rates.forEach((r) => { if (r.effectiveDate <= today) currentDate = r.effectiveDate; });
    if (!currentDate && rates.length) currentDate = rates[0].effectiveDate;
    rates.slice().reverse().forEach((r) => {
      const li = document.createElement('li');
      if (r.effectiveDate === currentDate) li.className = 'current';
      li.append('$' + Number(r.rate).toFixed(3) + ' from ' + longDate(r.effectiveDate)
        + (r.effectiveDate === currentDate ? ' (current)' : r.effectiveDate > today ? ' (upcoming)' : ''));
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = 'Remove this rate';
      del.setAttribute('aria-label', 'Remove rate from ' + longDate(r.effectiveDate));
      del.addEventListener('click', async () => {
        if (!confirm('Remove the $' + Number(r.rate).toFixed(3) + ' rate from ' + longDate(r.effectiveDate) + '? Trips will be recalculated.')) return;
        try { await MA.api('/api/rates/' + r.effectiveDate, { method: 'DELETE' }); load(); } catch (ex) { MA.toast(ex.message, true); }
      });
      li.appendChild(del);
      list.appendChild(li);
    });
    if (!$('r-rate').value && current != null) $('r-rate').value = Number(current).toFixed(3);
    if (!$('r-date').value) $('r-date').value = today;
  }

  function render() {
    if (!data) return;
    const d = data;
    renderRates(d.rates, d.currentRate);
    const hasRate = d.rates.length > 0;
    $('d-norate').hidden = hasRate;
    $('d-body').hidden = !hasRate;
    $('d-sub').textContent = hasRate
      ? 'Weekly reimbursements at $' + Number(d.currentRate).toFixed(3) + ' per mile.'
      : 'Weekly reimbursements at your rate per mile.';
    if (!hasRate) return;

    $('k-avg').textContent = money.format(d.avgWeekly.amount);
    $('k-avg-foot').textContent = d.avgIsThisWeekSoFar ? 'Based on this week so far' : 'Across ' + d.weeksCounted + ' full week' + (d.weeksCounted === 1 ? '' : 's');
    $('k-week').textContent = money.format(d.thisWeek.amount);
    const foot = $('k-week-foot');
    foot.replaceChildren();
    if (d.changeVsAvg != null) {
      const s = document.createElement('span');
      const up = d.changeVsAvg >= 0;
      s.className = up ? 'trend-up' : 'trend-down';
      s.textContent = (up ? '▲ ' : '▼ ') + pct(Math.abs(d.changeVsAvg));
      foot.append(s, (up ? ' above' : ' below') + ' average · ' + d.thisWeek.trips + ' trips');
    } else {
      foot.textContent = d.thisWeek.trips + ' trips';
    }
    $('k-miles').textContent = num1(d.avgWeekly.miles) + ' mi';
    $('k-miles-foot').textContent = '≈ ' + d.avgWeekly.trips + ' trips a week · ' + num1(d.avgMilesPerTrip) + ' mi per trip';
    $('k-total').textContent = money.format(d.rangeTotal.amount);
    $('k-total-foot').textContent = d.rangeTotal.trips + ' trips · ' + money.format(d.avgPerTrip) + ' per trip';

    weeklyChart($('c-weekly'), d.weeks, Number(d.avgWeekly.amount));
    weeklyTable($('t-weekly'), d.weeks);
    hbarChart($('c-program'), d.byProgram, {
      emptyText: 'No full weeks with trips yet.',
      aria: 'Average weekly reimbursement by program',
      value: (s) => s.avgWeekly,
      valueText: (s) => money.format(s.avgWeekly) + '/wk · ' + pct(s.share),
      tip: (s) => [{ bold: true, text: s.name }, money.format(s.avgWeekly) + ' per week on average',
        pct(s.share) + ' of reimbursements', s.trips + ' trips · ' + num1(s.miles) + ' mi'],
    });
    weekdayChart($('c-weekday'), d.byWeekday);
    hbarChart($('c-clients'), d.topClients, {
      emptyText: 'No trips in this time range yet.',
      aria: 'Top clients by reimbursement',
      value: (s) => s.amount,
      valueText: (s) => money.format(s.amount) + ' · ' + pct(s.share),
      tip: (s) => [{ bold: true, text: s.name }, money.format(s.amount) + ' (' + pct(s.share) + ' of total)',
        s.trips + ' trip' + (s.trips === 1 ? '' : 's') + ' · ' + num1(s.miles) + ' mi'],
    });
  }

  async function load() {
    try {
      data = await MA.api('/api/dashboard?weeks=' + $('d-range').value + '&today=' + MA.todayISO());
      render();
    } catch (ex) {
      MA.toast(ex.message, true);
    }
  }

  try { const r = localStorage.getItem('ma.dashRange'); if (r) $('d-range').value = r; } catch (e) { /* ignore */ }
  $('d-range').addEventListener('change', () => {
    try { localStorage.setItem('ma.dashRange', $('d-range').value); } catch (e) { /* ignore */ }
    load();
  });

  $('rate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rate = parseFloat($('r-rate').value);
    if (!(rate > 0 && rate <= 10)) return MA.toast('Enter a rate between $0.01 and $10.00 per mile.', true);
    const btn = $('rate-form').querySelector('button');
    btn.disabled = true;
    try {
      await MA.api('/api/rates', { method: 'POST', body: { rate, effectiveDate: $('r-date').value || MA.todayISO() } });
      MA.toast('Rate saved: $' + rate.toFixed(3) + ' per mile from ' + longDate($('r-date').value || MA.todayISO()) + '.');
      await load();
    } catch (ex) {
      MA.toast(ex.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!$('view-dash').hidden) render(); }, 150);
  });

  window.Dashboard = { show: load };
})();

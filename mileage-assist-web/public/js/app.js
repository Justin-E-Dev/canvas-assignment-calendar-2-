(function () {
  const $ = (id) => document.getElementById(id);
  let entries = [];
  let initials = [];
  let programs = [];
  let clientPrograms = {}; // lower-cased client (end location) -> program
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>';

  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  window.MA.todayISO = todayISO;
  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined,
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtMiles = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // ---------- Account / nav ----------
  async function loadMe() {
    const me = await MA.api('/api/me');
    $('first-name').textContent = me.firstName;
    $('account-email').textContent = me.email;
    $('menu-email').textContent = me.email;
    $('passkey-label').textContent = me.passkeys > 0
      ? 'Add another biometric device (' + me.passkeys + ' set up)' : 'Set up biometric login';
    if (!Passkey.supported()) $('setup-passkey').hidden = true;
  }

  const accountBtn = $('account-btn');
  const menu = $('account-menu');
  accountBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    accountBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) {
      menu.hidden = true;
      accountBtn.setAttribute('aria-expanded', 'false');
    }
  });
  $('sign-out').addEventListener('click', async () => {
    try { await MA.api('/logout', { method: 'POST' }); } finally { location.href = '/login.html'; }
  });
  $('setup-passkey').addEventListener('click', async () => {
    menu.hidden = true;
    try {
      const label = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'This device';
      await Passkey.register(label);
      MA.toast('Biometric login is set up on this device.');
      loadMe();
    } catch (ex) {
      MA.toast(ex.name === 'NotAllowedError' ? 'Biometric setup was cancelled.' : 'Could not set up biometric login.', true);
    }
  });

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      $('view-log').hidden = tab.dataset.view !== 'log';
      $('view-sheet').hidden = tab.dataset.view !== 'sheet';
      $('view-dash').hidden = tab.dataset.view !== 'dash';
      if (tab.dataset.view === 'sheet') renderSheet();
      if (tab.dataset.view === 'dash') window.Dashboard && window.Dashboard.show();
    });
  });

  // ---------- Initials memory ----------
  function renderInitials() {
    const list = $('initials-list');
    const chips = $('initials-chips');
    list.replaceChildren();
    chips.replaceChildren();
    initials.forEach((v) => {
      const o = document.createElement('option');
      o.value = v;
      list.appendChild(o);
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip';
      c.textContent = v;
      c.addEventListener('click', () => { $('f-initials').value = v; });
      chips.appendChild(c);
    });
  }
  function fillChoices(listId, chipsId, values, inputId) {
    const list = $(listId);
    list.replaceChildren();
    values.forEach((v) => { const o = document.createElement('option'); o.value = v; list.appendChild(o); });
    if (!chipsId) return;
    const chips = $(chipsId);
    chips.replaceChildren();
    values.forEach((v) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip';
      c.textContent = v;
      c.addEventListener('click', () => { $(inputId).value = v; $(inputId).dataset.auto = ''; });
      chips.appendChild(c);
    });
  }

  async function loadPrograms() {
    const data = await MA.api('/api/programs');
    programs = data.programs;
    clientPrograms = {};
    const clients = [];
    Object.entries(data.clients).forEach(([client, program]) => {
      clientPrograms[client.trim().toLowerCase()] = program;
      clients.push(client);
    });
    fillChoices('programs-list', 'programs-chips', programs, 'f-program');
    fillChoices('clients-list', null, clients.sort((a, b) => a.localeCompare(b)));
  }

  // When the client (end location) is one we've seen, fill in its program,
  // unless the user has typed or picked a program themselves.
  function autoFillProgram() {
    const prog = $('f-program');
    const match = clientPrograms[$('f-end-loc').value.trim().toLowerCase()];
    const userChose = prog.value && prog.dataset.auto !== '1';
    if (userChose) return;
    prog.value = match || '';
    prog.dataset.auto = match ? '1' : '';
    $('program-hint').textContent = match
      ? 'Filled in from this client\'s last trip. Change it if needed.'
      : 'Fills in automatically for clients you\'ve logged before.';
  }
  $('f-end-loc').addEventListener('input', autoFillProgram);
  $('f-program').addEventListener('input', () => { $('f-program').dataset.auto = ''; });

  async function loadInitials() {
    initials = await MA.api('/api/initials');
    renderInitials();
  }

  // ---------- Daily log form ----------
  const form = $('entry-form');
  function setToday() { $('f-date').value = fmtDate(todayISO()); }
  function updateMiles() {
    const s = parseFloat($('f-odo-start').value);
    const e = parseFloat($('f-odo-end').value);
    $('f-miles').textContent = isFinite(s) && isFinite(e) && e >= s ? fmtMiles(e - s) : '0.0';
  }
  $('f-odo-start').addEventListener('input', updateMiles);
  $('f-odo-end').addEventListener('input', updateMiles);

  function prefill() {
    setToday();
    if (entries.length) {
      // Start the next trip where the last one ended.
      $('f-odo-start').value = entries[0].odometerEnd;
    }
    updateMiles();
  }

  form.addEventListener('reset', () => setTimeout(() => {
    $('entry-error').textContent = '';
    $('f-program').dataset.auto = '';
    $('program-hint').textContent = 'Fills in automatically for clients you\'ve logged before.';
    prefill();
  }, 0));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('entry-error');
    err.textContent = '';
    const body = {
      date: todayISO(),
      initials: $('f-initials').value.trim(),
      startLocation: $('f-start-loc').value.trim(),
      endLocation: $('f-end-loc').value.trim(),
      program: $('f-program').value.trim(),
      odometerStart: $('f-odo-start').value,
      odometerEnd: $('f-odo-end').value,
    };
    if (!body.initials || !body.startLocation || !body.endLocation || !body.program || body.odometerStart === '' || body.odometerEnd === '') {
      err.textContent = 'Please fill in every field.';
      return;
    }
    if (parseFloat(body.odometerEnd) < parseFloat(body.odometerStart)) {
      err.textContent = 'Odometer end must be at least the odometer start.';
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const saved = await MA.api('/api/entries', { method: 'POST', body });
      entries.unshift(saved);
      MA.toast('Trip saved: ' + fmtMiles(saved.miles) + ' miles.');
      form.reset();
      loadInitials();
      loadPrograms();
      renderToday();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  function renderToday() {
    const today = todayISO();
    const list = $('today-list');
    list.replaceChildren();
    const todays = entries.filter((x) => x.date === today);
    const total = todays.reduce((a, x) => a + Number(x.miles), 0);
    $('today-total').textContent = todays.length
      ? todays.length + ' trip' + (todays.length > 1 ? 's' : '') + ' · ' + fmtMiles(total) + ' miles' : '';
    if (!todays.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No trips logged today yet.';
      list.appendChild(li);
      return;
    }
    todays.forEach((x) => {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const route = document.createElement('div');
      route.className = 'trip-route';
      route.textContent = x.startLocation + ' → ' + x.endLocation;
      const meta = document.createElement('div');
      meta.className = 'trip-meta';
      meta.textContent = x.initials + (x.program ? ' · ' + x.program : '') + ' · ' + x.odometerStart + ' → ' + x.odometerEnd;
      left.append(route, meta);
      const miles = document.createElement('div');
      miles.className = 'trip-miles';
      miles.textContent = fmtMiles(x.miles) + ' mi';
      li.append(left, miles);
      list.appendChild(li);
    });
  }

  // ---------- Spreadsheet ----------
  const COLS = [
    { key: 'date', type: 'date', label: 'Date', cls: 'col-date' },
    { key: 'initials', type: 'text', max: 10, list: 'initials-list', label: 'Initials', cls: 'col-ini' },
    { key: 'startLocation', type: 'text', max: 200, label: 'Start Location' },
    { key: 'endLocation', type: 'text', max: 200, label: 'End Location' },
    { key: 'program', type: 'text', max: 100, list: 'programs-list', label: 'Program', cls: 'col-prog' },
    { key: 'odometerStart', type: 'number', num: true, label: 'Odometer Start', cls: 'col-num' },
    { key: 'odometerEnd', type: 'number', num: true, label: 'Odometer End', cls: 'col-num' },
  ];
  const NUMERIC = new Set(['odometerStart', 'odometerEnd', 'miles']);
  const FIELD_NAMES = {
    program: 'program', endLocation: 'client', startLocation: 'start location', initials: 'initials',
    date: 'date', odometerStart: 'odometer start', odometerEnd: 'odometer end', miles: 'miles',
  };

  // View settings are remembered on this device only.
  const view = { by: '', order: 'asc', rows: '', split: true };
  try { Object.assign(view, JSON.parse(localStorage.getItem('ma.sheetView') || '{}')); } catch (e) { /* ignore */ }
  const saveView = () => { try { localStorage.setItem('ma.sheetView', JSON.stringify(view)); } catch (e) { /* ignore */ } };
  $('o-by').value = view.by;
  $('o-order').value = view.order;
  $('o-rows').value = view.rows;
  $('o-split').checked = view.split;

  const groupKey = (e, by) => (NUMERIC.has(by) ? Number(e[by]) : String(e[by] || '').trim().toLowerCase());
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  function groupLabel(e, by) {
    const v = e[by];
    if (by === 'date') return fmtDate(v);
    if (by === 'miles') return fmtMiles(v) + ' miles';
    if (v === '' || v === null || v === undefined) return '(no ' + FIELD_NAMES[by] + ')';
    return String(v).trim();
  }

  /** Sorts trips, groups matching values together, then cuts into spreadsheets of N rows. */
  function computeParts() {
    const dir = view.order === 'desc' ? -1 : 1;
    const by = view.by;
    const sorted = entries.slice().sort((a, b) => {
      if (by) {
        const ka = groupKey(a, by);
        const kb = groupKey(b, by);
        const c = NUMERIC.has(by) ? ka - kb : collator.compare(ka, kb);
        if (c !== 0) return by === 'date' ? c * dir : c;
      }
      if (a.date !== b.date) return (a.date < b.date ? -1 : 1) * dir;
      return (a.id - b.id) * dir;
    });

    const groups = [];
    if (by && view.split) {
      sorted.forEach((e) => {
        const k = groupKey(e, by);
        const last = groups[groups.length - 1];
        if (last && last.key === k) last.rows.push(e);
        else groups.push({ key: k, label: groupLabel(e, by), rows: [e] });
      });
    } else if (sorted.length) {
      groups.push({ key: '', label: '', rows: sorted });
    }

    const size = parseInt(view.rows, 10);
    const parts = [];
    groups.forEach((g) => {
      const n = size > 0 ? Math.ceil(g.rows.length / size) : 1;
      for (let i = 0; i < n; i++) {
        parts.push({
          group: g.label,
          rows: size > 0 ? g.rows.slice(i * size, (i + 1) * size) : g.rows,
          index: i + 1,
          of: n,
        });
      }
    });
    parts.forEach((p, i) => { p.number = i + 1; p.total = parts.length; });
    return { sorted, parts };
  }

  function partLabel(p) {
    const base = p.group ? p.group : 'Mileage';
    return p.of > 1 ? base + ' ' + p.index + ' of ' + p.of : (p.group ? base : 'Mileage sheet ' + p.number + ' of ' + p.total);
  }
  const partBody = (p) => ({
    ids: p.rows.map((r) => r.id), label: partLabel(p), number: p.number, total: p.total, group: p.group,
  });

  async function runDownload(btn, url, body) {
    btn.disabled = true;
    try { await MA.download(url, body); } catch (ex) { MA.toast(ex.message, true); } finally { btn.disabled = false; }
  }

  function renderStats() {
    $('s-rows').textContent = entries.length;
    $('s-miles').textContent = fmtMiles(entries.reduce((a, x) => a + Number(x.miles), 0));
    $('sheet-empty').hidden = entries.length > 0;
  }

  function buildTable(rows) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    const table = document.createElement('table');
    table.className = 'sheet';
    const head = document.createElement('tr');
    COLS.concat([{ label: 'Miles', cls: 'col-miles' }, { label: '' }]).forEach((c) => {
      const th = document.createElement('th');
      th.textContent = c.label;
      if (c.cls) th.className = c.cls;
      head.appendChild(th);
    });
    const thead = document.createElement('thead');
    thead.appendChild(head);
    const tbody = document.createElement('tbody');
    rows.forEach((entry) => tbody.appendChild(buildRow(entry)));
    table.append(thead, tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function smallBtn(text, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm ' + cls;
    b.textContent = text;
    b.addEventListener('click', () => onClick(b));
    return b;
  }

  let currentParts = [];
  let currentSorted = [];

  function renderSheet() {
    const { sorted, parts } = computeParts();
    currentParts = parts;
    currentSorted = sorted;
    const box = $('sheet-parts');
    box.replaceChildren();
    renderStats();

    // Grouping checkbox only matters when organizing by something.
    $('o-split').disabled = !view.by;
    $('o-split-wrap').classList.toggle('off', !view.by);
    $('o-split-name').textContent = view.by ? FIELD_NAMES[view.by] : 'group';

    const multi = parts.length > 1;
    $('parts-summary').hidden = !multi;
    if (multi) {
      const groups = new Set(parts.map((p) => p.group)).size;
      $('parts-count').replaceChildren();
      const b = document.createElement('b');
      b.textContent = parts.length + ' spreadsheets';
      $('parts-count').append('This makes ', b,
        view.by && view.split ? ' across ' + groups + ' ' + FIELD_NAMES[view.by] + (groups === 1 ? '' : ' groups') + '.' : '.');
    }

    parts.forEach((p) => {
      const sec = document.createElement('div');
      sec.className = 'part';
      if (multi || p.group) {
        const head = document.createElement('div');
        head.className = 'part-head';
        const left = document.createElement('div');
        const h = document.createElement('h3');
        h.textContent = multi ? 'Spreadsheet ' + p.number + ' of ' + p.total : partLabel(p);
        const meta = document.createElement('div');
        meta.className = 'part-meta';
        const miles = p.rows.reduce((a, x) => a + Number(x.miles), 0);
        const bits = [];
        if (p.group) bits.push(FIELD_NAMES[view.by].replace(/^./, (c) => c.toUpperCase()) + ': ' + p.group
          + (p.of > 1 ? ' (' + p.index + ' of ' + p.of + ')' : ''));
        bits.push(p.rows.length + ' trip' + (p.rows.length === 1 ? '' : 's'));
        bits.push(fmtMiles(miles) + ' miles');
        meta.textContent = bits.join(' · ');
        left.append(h, meta);
        const acts = document.createElement('div');
        acts.className = 'actions';
        acts.append(
          smallBtn('Export as CSV', 'btn-ghost', (b) => runDownload(b, '/api/export/part?format=csv', partBody(p))),
          smallBtn('Open in Excel', 'btn-primary', (b) => runDownload(b, '/api/export/part?format=xlsx', partBody(p))),
        );
        head.append(left, acts);
        sec.appendChild(head);
      }
      sec.appendChild(buildTable(p.rows));
      box.appendChild(sec);
    });
  }

  function onViewChange() {
    view.by = $('o-by').value;
    view.order = $('o-order').value;
    const n = parseInt($('o-rows').value, 10);
    view.rows = n > 0 ? String(Math.min(n, 5000)) : '';
    view.split = $('o-split').checked;
    saveView();
    renderSheet();
    renderTemplate();
  }
  ['o-by', 'o-order', 'o-split'].forEach((id) => $(id).addEventListener('change', onViewChange));
  $('o-rows').addEventListener('input', onViewChange);

  const allBody = () => ({ ids: currentSorted.map((r) => r.id), label: 'mileage-' + todayISO(), number: 1, total: 1 });
  $('all-csv').addEventListener('click', (e) => runDownload(e.currentTarget, '/api/export/part?format=csv', allBody()));
  $('all-xlsx').addEventListener('click', (e) => runDownload(e.currentTarget, '/api/export/part?format=xlsx', allBody()));
  $('zip-csv').addEventListener('click', (e) => runDownload(e.currentTarget, '/api/export/zip',
    { format: 'csv', parts: currentParts.map(partBody) }));
  $('zip-xlsx').addEventListener('click', (e) => runDownload(e.currentTarget, '/api/export/zip',
    { format: 'xlsx', parts: currentParts.map(partBody) }));

  // ---------- Template ----------
  let template = null;

  function renderTemplate() {
    const has = !!template;
    $('t-remove').hidden = !has;
    $('t-upload-label').textContent = has ? 'Replace template' : 'Upload template';
    if (!has) {
      $('t-status').textContent = 'None. Excel files use the standard layout.';
      $('t-detail').textContent = 'Upload your own Excel form and it will be filled in automatically.';
      $('t-use-cap').hidden = true;
      return;
    }
    $('t-status').textContent = template.fileName;
    if (template.error) {
      $('t-detail').textContent = template.error;
      $('t-use-cap').hidden = true;
      return;
    }
    $('t-detail').textContent = 'Fills in: ' + template.columns.join(', ')
      + (template.capacity ? ' · room for ' + template.capacity + ' rows' : '');
    const cap = template.capacity;
    $('t-use-cap').hidden = !cap || String(cap) === view.rows;
    $('t-use-cap').textContent = 'Use ' + cap + ' rows per spreadsheet';
  }

  async function loadTemplate() {
    template = await MA.api('/api/template');
    renderTemplate();
  }

  $('t-upload').addEventListener('click', () => $('t-file').click());
  $('t-file').addEventListener('change', async () => {
    const file = $('t-file').files[0];
    $('t-file').value = '';
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) return MA.toast('Please choose an Excel .xlsx file. (Older .xls files: open in Excel and "Save As" .xlsx.)', true);
    if (file.size > 4 * 1024 * 1024) return MA.toast('That file is too large. Templates can be up to 4 MB.', true);
    const btn = $('t-upload');
    btn.disabled = true;
    try {
      template = await MA.api('/api/template', { method: 'POST', body: file,
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) } });
      if (template.capacity && !view.rows) {
        $('o-rows').value = template.capacity;
        onViewChange();
      }
      renderTemplate();
      MA.toast('Template saved. Excel downloads will use it.');
    } catch (ex) {
      MA.toast(ex.message, true);
    } finally {
      btn.disabled = false;
    }
  });
  $('t-remove').addEventListener('click', async () => {
    if (!confirm('Remove the template? Excel downloads will go back to the standard layout.')) return;
    try {
      await MA.api('/api/template', { method: 'DELETE' });
      template = null;
      renderTemplate();
    } catch (ex) { MA.toast(ex.message, true); }
  });
  $('t-use-cap').addEventListener('click', () => {
    $('o-rows').value = template.capacity;
    onViewChange();
  });

  function buildRow(entry) {
    const tr = document.createElement('tr');
    const inputs = {};
    COLS.forEach((col) => {
      const td = document.createElement('td');
      if (col.num) td.className = 'num';
      const input = document.createElement('input');
      input.type = col.type;
      input.value = entry[col.key];
      input.setAttribute('aria-label', col.key);
      if (col.max) input.maxLength = col.max;
      if (col.list) input.setAttribute('list', col.list);
      if (col.num) { input.step = '0.1'; input.min = '0'; input.inputMode = 'decimal'; }
      input.addEventListener('change', () => saveRow(entry, inputs, tr, col.key));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      inputs[col.key] = input;
      td.appendChild(input);
      tr.appendChild(td);
    });
    const miles = document.createElement('td');
    miles.className = 'miles';
    miles.textContent = fmtMiles(entry.miles);
    tr.appendChild(miles);
    const act = document.createElement('td');
    act.className = 'row-actions';
    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Delete trip';
    del.setAttribute('aria-label', 'Delete trip');
    del.innerHTML = TRASH; // static markup only
    del.addEventListener('click', async () => {
      if (!confirm('Delete this trip from ' + entry.date + '?')) return;
      try {
        await MA.api('/api/entries/' + entry.id, { method: 'DELETE' });
        entries = entries.filter((x) => x.id !== entry.id);
        renderSheet();
        renderToday();
        MA.toast('Trip deleted.');
      } catch (ex) { MA.toast(ex.message, true); }
    });
    act.appendChild(del);
    tr.appendChild(act);
    tr._miles = miles;
    return tr;
  }

  async function saveRow(entry, inputs, tr, key) {
    const body = {};
    COLS.forEach((c) => { body[c.key] = inputs[c.key].value.trim(); });
    tr.classList.remove('saved', 'bad');
    try {
      const saved = await MA.api('/api/entries/' + entry.id, { method: 'PUT', body });
      Object.assign(entry, saved);
      COLS.forEach((c) => { if (document.activeElement !== inputs[c.key]) inputs[c.key].value = saved[c.key]; });
      tr._miles.textContent = fmtMiles(saved.miles);
      void tr.offsetWidth;
      tr.classList.add('saved');
      entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
      // If the edit moves the row to another group or position, redraw the spreadsheets.
      const moves = key === view.by || key === 'date' || (view.by === 'miles' && key.startsWith('odometer'));
      if (moves) renderSheet(); else renderStats();
      renderToday();
      loadInitials();
      loadPrograms();
    } catch (ex) {
      tr.classList.add('bad');
      MA.toast(ex.message + ' Change not saved.', true);
      COLS.forEach((c) => { inputs[c.key].value = entry[c.key]; });
      setTimeout(() => tr.classList.remove('bad'), 1500);
    }
  }

  // ---------- Init ----------
  (async function init() {
    try {
      await loadMe();
      [entries] = await Promise.all([MA.api('/api/entries'), loadInitials(), loadPrograms()]);
      prefill();
      renderToday();
      renderSheet();
      loadTemplate().catch(() => {});
      if (new URLSearchParams(location.search).has('welcome')) {
        history.replaceState(null, '', '/');
        MA.toast('Welcome! Set up biometric login from the account menu.');
      }
    } catch (ex) {
      MA.toast(ex.message, true);
    }
  })();
})();

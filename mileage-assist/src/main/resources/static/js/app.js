(function () {
  const $ = (id) => document.getElementById(id);
  let entries = [];
  let initials = [];
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>';

  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
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
      if (tab.dataset.view === 'sheet') renderSheet();
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

  form.addEventListener('reset', () => setTimeout(() => { $('entry-error').textContent = ''; prefill(); }, 0));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('entry-error');
    err.textContent = '';
    const body = {
      date: todayISO(),
      initials: $('f-initials').value.trim(),
      startLocation: $('f-start-loc').value.trim(),
      endLocation: $('f-end-loc').value.trim(),
      odometerStart: $('f-odo-start').value,
      odometerEnd: $('f-odo-end').value,
    };
    if (!body.initials || !body.startLocation || !body.endLocation || body.odometerStart === '' || body.odometerEnd === '') {
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
      meta.textContent = x.initials + ' · ' + x.odometerStart + ' → ' + x.odometerEnd;
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
    { key: 'date', type: 'date' },
    { key: 'initials', type: 'text', max: 10, list: 'initials-list' },
    { key: 'startLocation', type: 'text', max: 200 },
    { key: 'endLocation', type: 'text', max: 200 },
    { key: 'odometerStart', type: 'number', num: true },
    { key: 'odometerEnd', type: 'number', num: true },
  ];

  function renderStats() {
    $('s-rows').textContent = entries.length;
    $('s-miles').textContent = fmtMiles(entries.reduce((a, x) => a + Number(x.miles), 0));
    $('sheet-empty').hidden = entries.length > 0;
  }

  function renderSheet() {
    const body = $('sheet-body');
    body.replaceChildren();
    entries.forEach((entry) => body.appendChild(buildRow(entry)));
    renderStats();
  }

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
      input.addEventListener('change', () => saveRow(entry, inputs, tr));
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
        tr.remove();
        renderStats();
        renderToday();
        MA.toast('Trip deleted.');
      } catch (ex) { MA.toast(ex.message, true); }
    });
    act.appendChild(del);
    tr.appendChild(act);
    tr._miles = miles;
    return tr;
  }

  async function saveRow(entry, inputs, tr) {
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
      renderStats();
      renderToday();
      loadInitials();
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
      [entries] = await Promise.all([MA.api('/api/entries'), loadInitials()]);
      prefill();
      renderToday();
      if (new URLSearchParams(location.search).has('welcome')) {
        history.replaceState(null, '', '/');
        MA.toast('Welcome! Set up biometric login from the account menu.');
      }
    } catch (ex) {
      MA.toast(ex.message, true);
    }
  })();
})();

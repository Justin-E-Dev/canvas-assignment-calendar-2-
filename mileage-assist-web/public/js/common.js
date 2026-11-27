// Shared helpers: CSRF-protected fetch and toast messages.
(function () {
  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function ensureCsrf() {
    if (!csrfToken()) await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  }

  async function api(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = Object.assign({}, opts.headers || {});
    if (method !== 'GET') {
      await ensureCsrf();
      headers['X-XSRF-TOKEN'] = csrfToken();
    }
    let body = opts.body;
    if (body && typeof body === 'object' && !(body instanceof URLSearchParams) && !(body instanceof FormData) && !(body instanceof Blob)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const res = await fetch(url, { method, headers, body, credentials: 'same-origin' });
    if (res.status === 401 && !url.startsWith('/login') && location.pathname !== '/login.html') {
      location.href = '/login.html';
      throw new Error('Signed out');
    }
    let data = null;
    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) data = await res.json();
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Something went wrong (' + res.status + ').');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // POSTs JSON and saves the file the server sends back.
  async function download(url, body) {
    await ensureCsrf();
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrfToken() },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { location.href = '/login.html'; throw new Error('Signed out'); }
    if (!res.ok) {
      let msg = 'Download failed (' + res.status + ').';
      try { msg = (await res.json()).error || msg; } catch (e) { /* not JSON */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const m = (res.headers.get('content-disposition') || '').match(/filename="?([^";]+)"?/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : 'mileage';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  let toastTimer;
  function toast(msg, isError) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.className = 'toast' + (isError ? ' err' : '');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  window.MA = { api, toast, ensureCsrf, csrfToken, download };
})();

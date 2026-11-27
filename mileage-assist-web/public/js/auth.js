(function () {
  const $ = (id) => document.getElementById(id);
  const tabs = { signin: $('tab-signin'), signup: $('tab-signup') };
  const forms = { signin: $('signin-form'), signup: $('signup-form') };

  function show(which) {
    for (const k of Object.keys(tabs)) {
      tabs[k].setAttribute('aria-selected', String(k === which));
      forms[k].hidden = k !== which;
    }
  }
  tabs.signin.addEventListener('click', () => show('signin'));
  tabs.signup.addEventListener('click', () => show('signup'));

  MA.ensureCsrf();

  forms.signin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = forms.signin.querySelector('button[type=submit]');
    $('si-error').textContent = '';
    btn.disabled = true;
    try {
      const body = new URLSearchParams({ email: $('si-email').value.trim(), password: $('si-password').value });
      await MA.api('/login', { method: 'POST', body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      location.href = '/';
    } catch (err) {
      $('si-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  forms.signup.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('su-error');
    err.textContent = '';
    const firstName = $('su-first').value.trim();
    const email = $('su-email').value.trim();
    const password = $('su-password').value;
    if (!firstName) return (err.textContent = 'Please enter your first name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return (err.textContent = 'Please enter a valid email.');
    if (password.length < 12) return (err.textContent = 'Password must be at least 12 characters.');
    if (password !== $('su-confirm').value) return (err.textContent = 'Passwords do not match.');
    const btn = forms.signup.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await MA.api('/api/auth/signup', { method: 'POST', body: { firstName, email, password } });
      location.href = '/?welcome=1';
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  if (Passkey.supported()) {
    $('passkey-area').hidden = false;
    $('passkey-btn').addEventListener('click', async () => {
      $('si-error').textContent = '';
      try {
        await Passkey.login();
        location.href = '/';
      } catch (ex) {
        $('si-error').textContent = ex.name === 'NotAllowedError'
          ? 'Biometric sign-in was cancelled.' : 'Biometric sign-in failed. Use your password, then set it up from the account menu.';
      }
    });
  }
})();

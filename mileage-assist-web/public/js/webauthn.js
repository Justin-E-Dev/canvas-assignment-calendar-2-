// Passkey (biometric) helpers for Spring Security's WebAuthn endpoints.
(function () {
  const b64urlToBuf = (s) => {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
  };
  const bufToB64url = (buf) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  function supported() {
    return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  }

  async function register(label) {
    const opts = await MA.api('/webauthn/register/options', { method: 'POST' });
    opts.challenge = b64urlToBuf(opts.challenge);
    opts.user.id = b64urlToBuf(opts.user.id);
    (opts.excludeCredentials || []).forEach((c) => { c.id = b64urlToBuf(c.id); });
    const cred = await navigator.credentials.create({ publicKey: opts });
    const body = {
      credential: {
        id: cred.id,
        rawId: bufToB64url(cred.rawId),
        response: {
          attestationObject: bufToB64url(cred.response.attestationObject),
          clientDataJSON: bufToB64url(cred.response.clientDataJSON),
          transports: cred.response.getTransports ? cred.response.getTransports() : [],
        },
        type: cred.type,
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: cred.authenticatorAttachment,
      },
      label: label,
    };
    const res = await MA.api('/webauthn/register', { method: 'POST', body });
    if (!res || !res.success) throw new Error('Biometric login could not be saved.');
  }

  async function login() {
    const opts = await MA.api('/webauthn/authenticate/options', { method: 'POST' });
    opts.challenge = b64urlToBuf(opts.challenge);
    (opts.allowCredentials || []).forEach((c) => { c.id = b64urlToBuf(c.id); });
    const cred = await navigator.credentials.get({ publicKey: opts });
    const body = {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      response: {
        authenticatorData: bufToB64url(cred.response.authenticatorData),
        clientDataJSON: bufToB64url(cred.response.clientDataJSON),
        signature: bufToB64url(cred.response.signature),
        userHandle: cred.response.userHandle ? bufToB64url(cred.response.userHandle) : null,
      },
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
      authenticatorAttachment: cred.authenticatorAttachment,
    };
    const res = await MA.api('/login/webauthn', { method: 'POST', body });
    if (!res || !res.authenticated) throw new Error('Biometric sign-in failed.');
  }

  window.Passkey = { supported, register, login };
})();

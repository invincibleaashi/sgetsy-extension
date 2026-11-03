// Runs on the ShipGlobal dashboard. The dashboard's "Get HSN" lookup isn't part of the
// public Vendor API — it uses the dashboard's own login session — so pass that session to
// the extension whenever you have the dashboard open while signed in.
(function () {
  // A copy from before an extension reload may still be running here; stop it.
  window.__sgSessionTeardown?.();

  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };

  function share() {
    if (!alive()) return teardown(); // cut off by an extension reload
    let auth;
    try {
      auth = JSON.parse(localStorage.getItem('auth-context') || 'null');
    } catch {
      return;
    }
    const state = auth?.state || auth;
    if (!state?.token) return;
    chrome.runtime.sendMessage({ type: 'sgSession', token: state.token, expiresAt: state.expiresAt || null })
      .catch(() => {});
  }

  const onStorage = (e) => { if (e.key === 'auth-context') share(); };
  const onVisible = () => { if (!document.hidden) share(); };
  // Pick up a new login (or a refreshed token) without needing a reload.
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(share, 5 * 60 * 1000);

  function teardown() {
    clearInterval(timer);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisible);
    window.__sgSessionTeardown = null;
  }
  window.__sgSessionTeardown = teardown;

  share();
})();

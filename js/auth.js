// Shared Novexa authentication helpers.
// V40: resilient session refresh for background tabs, concurrent requests and
// Supabase refresh-token rotation. Never sign a user out on the first 401.
(() => {
  const client = () => window.supabaseClient;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tokenExpiresSoon = (session, leewayMs = 90_000) => {
    const expiresAt = Number(session?.expires_at || 0) * 1000;
    return !expiresAt || expiresAt <= Date.now() + leewayMs;
  };

  let refreshPromise = null;
  let listenerAttached = false;
  let visibilityTimer = null;

  async function getSession() {
    const sb = client();
    if (!sb) throw new Error('Supabase client is not available.');
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    const sb = client();
    if (!sb) throw new Error('Supabase client is not available.');
    refreshPromise = (async () => {
      const { data, error } = await sb.auth.refreshSession();
      if (error) throw error;
      return data?.session || null;
    })();
    try { return await refreshPromise; } finally { refreshPromise = null; }
  }

  async function getValidSession(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    let session = await getSession();
    if (!forceRefresh && session && !tokenExpiresSoon(session)) return session;
    try {
      const refreshed = await refreshSession();
      return refreshed || session || null;
    } catch (error) {
      // Supabase can already be refreshing in another tab. Give that refresh a
      // short window to publish the new session before declaring it invalid.
      await sleep(180);
      const recovered = await getSession().catch(() => null);
      if (recovered && !tokenExpiresSoon(recovered, 5_000)) return recovered;
      if (forceRefresh) throw error;
      return session || null;
    }
  }

  function scheduleSessionRecovery() {
    const storage = window.sessionStorage;
    const recoveryKey = 'novexa-session-recovery-pending';
    if (storage?.getItem(recoveryKey)) return;
    try { storage?.setItem(recoveryKey, '1'); } catch (_) {}

    // Do not immediately sign out. A background tab may simply have an old
    // access token while Supabase still owns a valid refresh-token session.
    window.setTimeout(async () => {
      const recovered = await getValidSession({ forceRefresh: true }).catch(() => null);
      if (recovered?.access_token) {
        try { storage?.removeItem(recoveryKey); } catch (_) {}
        return;
      }
      const login = new URL(loginUrl());
      const current = new URL(window.location.href);
      if (current.origin === window.location.origin && !current.pathname.endsWith('/login.html')) {
        login.searchParams.set('next', `${current.pathname}${current.search}${current.hash}`);
      }
      login.searchParams.set('reason', 'session');
      window.location.replace(login.href);
    }, 600);
  }

  async function authorizedFetch(url, options = {}) {
    let session = await getValidSession();
    if (!session?.access_token) {
      scheduleSessionRecovery();
      const error = new Error('Your Novexa session has expired. Please sign in again.');
      error.code = 'SESSION_EXPIRED';
      throw error;
    }

    const request = async accessToken => {
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${accessToken}`);
      return fetch(url, { ...options, headers });
    };

    let response = await request(session.access_token);
    if (response.status !== 401) return response;

    // Background tabs commonly resume with an old access token. Refresh once
    // and retry the exact request before any recovery redirect.
    try { session = await getValidSession({ forceRefresh: true }); }
    catch (_) { session = await getSession().catch(() => null); }
    if (!session?.access_token) {
      scheduleSessionRecovery();
      return response;
    }
    response = await request(session.access_token);
    if (response.status === 401) {
      await sleep(250);
      session = await getValidSession({ forceRefresh: true }).catch(() => null);
      if (session?.access_token) response = await request(session.access_token);
      if (response.status === 401) scheduleSessionRecovery();
    }
    return response;
  }

  async function waitForSession(timeout = 8000) {
    const started = Date.now();
    while (!client() && Date.now() - started < timeout) await sleep(50);
    if (!client()) throw new Error('Supabase client did not load.');
    let session = await getValidSession().catch(() => null);
    if (session) return session;

    let resolver;
    const eventPromise = new Promise(resolve => { resolver = resolve; });
    const { data: listener } = client().auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) resolver(nextSession);
    });
    try {
      while (Date.now() - started < timeout) {
        session = await getValidSession().catch(() => null);
        if (session) return session;
        const remaining = timeout - (Date.now() - started);
        if (remaining <= 0) break;
        const result = await Promise.race([eventPromise, sleep(Math.min(250, remaining)).then(() => null)]);
        if (result) return result;
      }
      return null;
    } finally {
      try { listener?.subscription?.unsubscribe(); } catch (_) {}
    }
  }

  function displayName(user) {
    const meta = user?.user_metadata || {};
    return meta.full_name || meta.name || meta.user_name || user?.email?.split('@')[0] || 'Student';
  }
  function dashboardUrl() { return new URL('/pages/dashboard.html', window.location.origin).href; }
  function loginUrl() { return new URL('/pages/login.html', window.location.origin).href; }
  function signInMessage() { return 'Your Novexa session could not be refreshed. Please sign out and sign in again. If this continues, make sure the backend Supabase URL and publishable key match the frontend project.'; }

  async function requireAuth(options = {}) {
    document.body?.classList.add('auth-pending');
    const returnTo = options.returnTo || window.location.href;
    try {
      const session = await waitForSession(options.timeout || 8000);
      if (session?.user) { document.body?.classList.remove('auth-pending'); return session; }
    } catch (error) { console.warn('Novexa auth guard could not restore a session:', error); }
    const login = new URL(loginUrl());
    const safeReturn = new URL(returnTo, window.location.origin);
    if (safeReturn.origin === window.location.origin && !safeReturn.pathname.endsWith('/login.html')) login.searchParams.set('next', `${safeReturn.pathname}${safeReturn.search}${safeReturn.hash}`);
    window.location.replace(login.href);
    return null;
  }

  function attachListener() {
    if (listenerAttached || !client()) return;
    listenerAttached = true;
    client().auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && session) {
        try { window.sessionStorage?.removeItem('novexa-session-recovery-pending'); } catch (_) {}
      }
    });
  }

  async function recoverOnVisibility() {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(visibilityTimer);
    visibilityTimer = setTimeout(() => { getValidSession().catch(() => {}); }, 150);
  }

  attachListener();
  if (!listenerAttached) {
    const timer = setInterval(() => { attachListener(); if (listenerAttached) clearInterval(timer); }, 100);
    setTimeout(() => clearInterval(timer), 8000);
  }
  document.addEventListener('visibilitychange', recoverOnVisibility);
  window.addEventListener('pageshow', recoverOnVisibility);
  window.addEventListener('focus', recoverOnVisibility);

  window.NovexaAuth = { getSession, getValidSession, refreshSession, authorizedFetch, scheduleSessionRecovery, waitForSession, requireAuth, signInMessage, displayName, dashboardUrl, loginUrl };
})();

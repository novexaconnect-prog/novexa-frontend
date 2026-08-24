// Novexa production API bridge.
// Render static frontend deployments set NOVEXA_API_BASE at build time.
// Leave it empty for same-origin/local development.
(() => {
  const configured = String(window.NOVEXA_API_BASE || '').trim().replace(/\/$/, '');
  window.NOVEXA_API_BASE = configured;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const isRelativeApi = raw.startsWith('/api/');
      if (!isRelativeApi || !configured) return originalFetch(input, init);
      const target = configured + raw;
      if (input instanceof Request) return originalFetch(new Request(target, input), init);
      return originalFetch(target, init);
    } catch (_) {
      return originalFetch(input, init);
    }
  };
})();

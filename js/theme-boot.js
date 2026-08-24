/* Novexa theme bootstrap: run in <head> before page CSS to prevent light/dark flashes and cross-route mismatch. */
(() => {
  try {
    const saved = localStorage.getItem('novexa-theme');
    const theme = saved === 'dark' || saved === 'light' ? saved : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
})();

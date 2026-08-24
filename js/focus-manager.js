/* Novexa Focus Manager
 * Keeps Focus Mode alive across navigation by storing an absolute end time.
 * The timer is timestamp-based, so background tabs do not pause it.
 */
(() => {
  const KEY = 'novexa_focus_v2';
  const DEFAULT_DURATION = 25 * 60;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
  const write = state => localStorage.setItem(KEY, JSON.stringify(state));
  const now = () => Date.now();

  function normalize(state) {
    if (!state) return null;
    const s = { duration: DEFAULT_DURATION, remaining: DEFAULT_DURATION, running: false, endAt: null, startedAt: null, updatedAt: now(), ...state };
    if (s.running && s.endAt) {
      s.remaining = Math.max(0, Math.ceil((s.endAt - now()) / 1000));
      if (s.remaining <= 0) {
        s.running = false;
        s.endAt = null;
        s.remaining = 0;
        s.completedAt = now();
      }
    }
    return s;
  }

  function get() { return normalize(read()); }

  function start(duration) {
    const current = get() || { duration: duration || DEFAULT_DURATION, remaining: duration || DEFAULT_DURATION };
    const remaining = Math.max(1, Number(current.remaining || duration || DEFAULT_DURATION));
    const state = { ...current, duration: Number(current.duration || duration || DEFAULT_DURATION), remaining, running: true, startedAt: current.startedAt || now(), endAt: now() + remaining * 1000, updatedAt: now() };
    write(state); window.dispatchEvent(new CustomEvent('novexa-focus-change', { detail: state })); return state;
  }

  function pause() {
    const current = get(); if (!current) return null;
    const state = { ...current, remaining: Math.max(0, Math.ceil((current.endAt - now()) / 1000)), running: false, endAt: null, updatedAt: now() };
    write(state); window.dispatchEvent(new CustomEvent('novexa-focus-change', { detail: state })); return state;
  }

  function reset(duration = DEFAULT_DURATION) {
    const selected = Math.max(60, Number(duration) || DEFAULT_DURATION);
    const state = { duration: selected, remaining: selected, running: false, endAt: null, startedAt: null, updatedAt: now() };
    write(state); window.dispatchEvent(new CustomEvent('novexa-focus-change', { detail: state })); return state;
  }

  function setDuration(duration) {
    const current = get();
    if (current?.running) return current;
    return reset(duration);
  }

  function finish() {
    const current = get();
    if (!current) return null;
    const state = { ...current, running: false, endAt: null, remaining: 0, completedAt: now(), updatedAt: now() };
    write(state); window.dispatchEvent(new CustomEvent('novexa-focus-complete', { detail: state })); return state;
  }

  function format(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  window.NovexaFocus = { KEY, get, start, pause, reset, setDuration, finish, format, DEFAULT_DURATION };
})();

(async () => {
  const s = window.supabaseClient;
  const { data } = await s.auth.getUser();
  if (!data?.user) { location.replace('login.html'); return; }

  const timerEl = document.getElementById('timer');
  const ringEl = document.getElementById('timer-ring');
  const timerStateEl = document.getElementById('timer-state');
  const sessionLabelEl = document.getElementById('session-label');
  const sessionBadgeEl = document.getElementById('session-badge');
  const startBtn = document.getElementById('start');
  const pauseBtn = document.getElementById('pause');
  const resetBtn = document.getElementById('reset');
  const fullBtn = document.getElementById('full');
  const ambientBtn = document.getElementById('ambient');
  const stateApi = window.NovexaFocus;
  let audio = null;
  let lastCompletion = 0;
  let cachedRows = [];
  let plan = 'basic';

  const dayKey = value => new Date(value).toISOString().slice(0, 10);
  const formatMinutes = minutes => `${Math.round(Number(minutes || 0))}m`;
  const focusRows = rows => (rows || []).filter(row => !row.kind || row.kind === 'focus');
  const currentStreak = rows => {
    const days = new Set(focusRows(rows).map(row => dayKey(row.created_at)));
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (days.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  };

  function draw() {
    const state = stateApi.get() || { duration: stateApi.DEFAULT_DURATION, remaining: stateApi.DEFAULT_DURATION, running: false };
    const remaining = state.running ? state.remaining : (state.remaining ?? state.duration);
    const duration = Math.max(60, Number(state.duration || stateApi.DEFAULT_DURATION));
    const progress = Math.max(0, Math.min(100, ((duration - remaining) / duration) * 100));
    const minutes = Math.max(1, Math.round(duration / 60));
    timerEl.textContent = stateApi.format(remaining);
    ringEl.style.setProperty('--progress', `${progress}%`);
    sessionBadgeEl.textContent = `${minutes} min session`;
    document.title = state.running ? `${stateApi.format(remaining)} · Focus Mode — Novexa` : 'Focus Mode — Novexa';
    sessionLabelEl.textContent = state.running ? 'Stay with the task in front of you' : (state.remaining < duration ? 'Session paused — resume when ready' : 'Ready when you are');
    timerStateEl.textContent = state.running ? 'Focus in progress' : (state.remaining < duration ? 'Paused' : 'Your next focused block');
    startBtn.disabled = !!state.running;
    startBtn.innerHTML = state.running ? '<i data-lucide="loader-circle" width="15"></i> Running…' : '<i data-lucide="play" width="15"></i> Start session';
    pauseBtn.disabled = !state.running;
    document.querySelectorAll('.preset-row button').forEach(button => button.classList.toggle('active', Number(button.dataset.minutes) * 60 === duration));
    window.lucide?.createIcons();
  }

  function drawProCard() {
    const card = document.getElementById('proStreakCard');
    const copy = document.getElementById('proStreakCopy');
    const freeze = document.getElementById('freezeCount');
    const multiplier = document.getElementById('xpMultiplier');
    const exam = document.getElementById('examModeLink');
    if (!card) return;
    if (plan === 'pro') {
      card.classList.add('is-pro');
      copy.textContent = 'Your Pro rewards are active: one streak freeze, weekly challenges, XP multipliers, and achievement milestones.';
      freeze.textContent = '1';
      multiplier.textContent = '1.5×';
      return;
    }
    copy.innerHTML = 'Basic streaks are free. <a href="payment.html?feature=Advanced%20Streaks">Upgrade to Pro</a> for freezes, challenges, XP multipliers and advanced badges.';
    freeze.textContent = 'Pro';
    multiplier.textContent = 'Pro';
    if (exam) { exam.textContent = 'Unlock Exam Mode'; exam.href = 'payment.html?feature=Exam%20Mode'; }
  }

  function drawStats(rows) {
    const focus = focusRows(rows);
    const todayKey = dayKey(new Date());
    const todayMinutes = focus.filter(row => dayKey(row.created_at) === todayKey).reduce((total, row) => total + Number(row.minutes || 0), 0);
    const weekMinutes = focus.reduce((total, row) => total + Number(row.minutes || 0), 0);
    const score = Math.min(100, Math.round((weekMinutes / 150) * 100));
    const average = focus.length ? Math.round(weekMinutes / focus.length) : 0;
    const streak = currentStreak(focus);
    document.getElementById('today').textContent = formatMinutes(todayMinutes);
    document.getElementById('week').textContent = formatMinutes(weekMinutes);
    document.getElementById('sessions').textContent = focus.length;
    document.getElementById('average').textContent = formatMinutes(average);
    document.getElementById('score').textContent = `${score}%`;
    document.getElementById('score-bar').style.width = `${score}%`;
    document.getElementById('score-note').textContent = score ? `${Math.max(0, 150 - Math.round(weekMinutes))} minutes left to reach this week's goal.` : 'Complete a focus session to start building your weekly score.';
    document.getElementById('streak').textContent = `${streak} day${streak === 1 ? '' : 's'}`;
    document.getElementById('streak-note').textContent = streak ? 'Keep showing up for yourself.' : 'Your focus streak starts today.';
    const list = document.getElementById('session-list');
    const recent = [...focus].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    list.innerHTML = recent.length ? recent.map(row => `<div class="session-row"><div><strong>${new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong><span>${new Date(row.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></div><b>${formatMinutes(row.minutes)}</b></div>`).join('') : '<div class="focus-empty">No completed sessions yet. Your first one will appear here.</div>';
  }

  async function loadPlan() {
    try {
      const apiBase = ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port !== '3000') ? 'http://localhost:3000' : '';
      const response = await window.NovexaAuth.authorizedFetch(`${apiBase}/api/billing/status`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.ok) plan = data.plan === 'pro' ? 'pro' : 'basic';
    } catch (_) { plan = 'basic'; }
    drawProCard();
  }

  async function stats() {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const result = await s.from('study_events').select('minutes,created_at,kind').eq('user_id', data.user.id).gte('created_at', since.toISOString()).order('created_at', { ascending: false });
      cachedRows = result.data || [];
      drawStats(cachedRows);
    } catch (_) {
      drawStats(cachedRows);
    }
  }

  async function recordCompletion() {
    if (lastCompletion && Date.now() - lastCompletion < 5000) return;
    lastCompletion = Date.now();
    const state = stateApi.get();
    const minutes = Math.max(1, Math.round(Number(state?.duration || 1500) / 60));
    try {
      await s.from('study_events').insert({ user_id: data.user.id, kind: 'focus', minutes, metadata: { source: 'pomodoro', background: true } });
      const pet = await s.from('pets').select('*').eq('user_id', data.user.id).maybeSingle();
      if (pet.data) {
        const xp = Number(pet.data.xp || 0) + minutes;
        const level = Math.floor(xp / 100) + 1;
        await s.from('pets').update({ xp, level, last_seen: new Date().toISOString() }).eq('user_id', data.user.id);
      }
    } catch (_) {}
    await stats();
  }

  function tick() {
    const state = stateApi.get();
    if (state?.completedAt && state.completedAt > (state.updatedAt || 0)) {
      const duration = state.duration;
      recordCompletion();
      stateApi.reset(duration);
      alert('Focus session complete. Your streak and performance were updated.');
    }
    draw();
  }

  startBtn.onclick = () => { stateApi.start(); draw(); };
  pauseBtn.onclick = () => { stateApi.pause(); draw(); };
  resetBtn.onclick = () => { const state = stateApi.get(); stateApi.reset(state?.duration); draw(); };
  fullBtn.onclick = () => document.documentElement.requestFullscreen?.();
  ambientBtn.onclick = () => {
    if (audio) { audio.close(); audio = null; ambientBtn.innerHTML = '<i data-lucide="volume-2" width="15"></i> Ambient'; window.lucide?.createIcons(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    audio = new C();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 180; gain.gain.value = .018;
    oscillator.connect(gain).connect(audio.destination); oscillator.start();
    ambientBtn.innerHTML = '<i data-lucide="volume-x" width="15"></i> Ambient on';
    window.lucide?.createIcons();
  };
  document.querySelectorAll('.preset-row button').forEach(button => button.onclick = () => { if (stateApi.get()?.running) return; stateApi.setDuration(Number(button.dataset.minutes) * 60); draw(); });
  window.addEventListener('novexa-focus-complete', () => { recordCompletion(); draw(); });
  setInterval(tick, 500);
  draw();
  await loadPlan();
  stats();
})();

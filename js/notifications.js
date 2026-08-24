/* Novexa notification center. Notifications are derived from private Supabase data and lightweight local catalog metadata. */
(() => {
  const READ_PREFIX = 'novexa_notification_read_v2_';
  const PAPER_ACK_PREFIX = 'novexa_paper_notification_ack_v1_';
  const CREDIT_LEVELS = [25, 50, 75, 90];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  const readKey = userId => `${READ_PREFIX}${userId}`;
  const paperAckKey = userId => `${PAPER_ACK_PREFIX}${userId}`;
  const getReadIds = userId => { try { return new Set(JSON.parse(localStorage.getItem(readKey(userId)) || '[]')); } catch (_) { return new Set(); } };
  const saveReadIds = (userId, ids) => localStorage.setItem(readKey(userId), JSON.stringify([...ids].slice(-300)));
  const dayKey = value => new Date(value).toISOString().slice(0, 10);
  const ago = value => {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 2) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };

  async function credits(session) {
    if (!session?.access_token) return null;
    try {
      const result = await (window.NovexaAuth?.authorizedFetch ? window.NovexaAuth.authorizedFetch('/api/ai/credits', { cache: 'no-store' }) : fetch('/api/ai/credits', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' }));
      if (!result.ok) return null;
      return await result.json();
    } catch (_) { return null; }
  }

  async function recentNotes(supabase, user) {
    try {
      const result = await supabase.from('notes').select('id,title,subject,created_at,updated_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(6);
      return result.data || [];
    } catch (_) { return []; }
  }

  async function recentStudyEvents(supabase, user) {
    try {
      const since = new Date(); since.setDate(since.getDate() - 45);
      const result = await supabase.from('study_events').select('kind,minutes,created_at').eq('user_id', user.id).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(250);
      return result.data || [];
    } catch (_) { return []; }
  }

  function focusStreak(events) {
    const days = new Set((events || []).filter(event => !event.kind || event.kind === 'focus').map(event => dayKey(event.created_at)));
    let streak = 0;
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    while (days.has(dayKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    return streak;
  }

  function buildNotifications(user, credit, notes, events) {
    const now = Date.now();
    const list = [];
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Student';
    const accountAge = Math.max(0, now - new Date(user.created_at || now).getTime());

    // The welcome card is intentionally shown only for genuinely new accounts.
    if (accountAge <= 14 * 86400000) {
      list.push({
        id: `welcome-${user.id}`,
        type: 'welcome',
        icon: 'sparkles',
        title: `Welcome to Novexa, ${displayName}!`,
        body: 'Your study space is ready.\n\n📚 Explore past papers — find QPs & MS from your exam board and subject.\n🤖 Ask Novexa AI — get step-by-step explanations, quizzes, flashcards and exam help.\n📝 Build your notes — upload your own revision material and keep everything organised.\n🔥 Start your study streak — complete your first task today and keep it going!\n\nYour AI study buddy is waiting. 🐾\nLet’s make studying a little smarter.',
        createdAt: user.created_at || new Date().toISOString(),
        href: 'dashboard.html',
        featured: true
      });
    }

    if (credit && Number.isFinite(Number(credit.limit)) && Number(credit.limit) > 0) {
      const used = Math.max(0, Math.min(100, Math.round(((Number(credit.limit) - Number(credit.credits ?? credit.limit)) / Number(credit.limit)) * 100)));
      CREDIT_LEVELS.filter(level => used >= level).forEach(level => {
        list.push({
          id: `credits-${credit.resetAt || 'period'}-${level}`,
          type: 'credits',
          icon: level >= 90 ? 'alert-triangle' : 'gauge',
          title: `AI usage units ${level}% used`,
          body: level >= 90 ? `You have used ${used}% of this period's AI usage units. Consider upgrading to Pro or wait for the next reset.` : `You have used ${used}% of this period's AI usage units. Keep an eye on your remaining allowance.`,
          createdAt: new Date().toISOString(),
          href: 'settings.html',
          progress: used,
          priority: level >= 90 ? 'high' : 'normal'
        });
      });
      if (credit.resetAt) {
        list.push({ id: `reset-${credit.resetAt}`, type: 'credits', icon: 'refresh-cw', title: 'AI usage units reset date', body: `Your AI usage units reset on ${new Date(credit.resetAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`, createdAt: credit.resetAt, href: 'settings.html' });
      }
    }

    list.push({
      id: 'all-papers-linked-v1',
      type: 'content',
      icon: 'sparkles',
      title: 'ALL PAPERS LINKED',
      body: 'Every subject and session from the Edexcel archive is now accessible via direct Drive links.',
      createdAt: '2026-08-12T00:00:00.000Z',
      href: 'browse.html',
      featured: true
    });

    const latestNote = [...notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (latestNote && now - new Date(latestNote.created_at).getTime() <= 30 * 86400000) {
      list.push({ id: `note-${latestNote.id}`, type: 'content', icon: 'file-plus-2', title: 'New note in your study space', body: `${latestNote.title || 'A new note'}${latestNote.subject ? ` · ${latestNote.subject}` : ''} is ready to review.`, createdAt: latestNote.created_at, href: 'notes.html' });
    }

    try {
      const latestPaper = JSON.parse(localStorage.getItem('novexa_paper_catalog_latest_v1') || 'null');
      const acknowledged = Number(localStorage.getItem(paperAckKey(user.id)) || 0);
      if (latestPaper?.at && Number(latestPaper.at) > acknowledged) {
        list.push({ id: `papers-${latestPaper.fingerprint}`, type: 'content', icon: 'book-open-check', title: 'Past-paper archive updated', body: 'New Paper Lords sessions are available across the lightweight remote archive. Open Browse to view individual QP and MS files.', createdAt: latestPaper.at, href: 'browse.html', paperAt: latestPaper.at, paperFingerprint: latestPaper.fingerprint });
      }
    } catch (_) {}

    const streak = focusStreak(events);
    if (streak > 0) {
      list.push({ id: `streak-${dayKey(new Date())}-${streak}`, type: 'streak', icon: 'flame', title: `${streak}-day study streak`, body: 'Your focus sessions are building momentum. Keep it going today.', createdAt: new Date().toISOString(), href: 'focus.html', priority: 'normal' });
    }

    return list.sort((a, b) => {
      if (a.featured) return -1;
      if (b.featured) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  async function getForUser(user = null) {
    const supabase = window.supabaseClient;
    if (!supabase || !user) return [];
    const sessionResult = await supabase.auth.getSession();
    const session = sessionResult.data?.session;
    const [credit, notes, events] = await Promise.all([credits(session), recentNotes(supabase, user), recentStudyEvents(supabase, user)]);
    const disabled = type => localStorage.getItem(`novexa_notify_${type}`) === '0';
    const read = getReadIds(user.id);
    return buildNotifications(user, credit, notes, events)
      .filter(item => item.type !== 'credits' || !disabled('credits'))
      .filter(item => item.type !== 'streak' || !disabled('streaks'))
      .filter(item => item.type !== 'content' || !disabled('content'))
      .map(item => ({ ...item, unread: !read.has(item.id), age: ago(item.createdAt) }));
  }

  async function refreshBadge(header, user) {
    const badge = header?.querySelector('#navNotificationBadge');
    if (!badge || !user) { if (badge) badge.hidden = true; return []; }
    const list = await getForUser(user);
    const unread = list.filter(item => item.unread).length;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.hidden = unread === 0;
    return list;
  }

  function markRead(userId, ids) { const set = getReadIds(userId); ids.forEach(id => set.add(id)); saveReadIds(userId, set); }
  function markAllRead(userId, notifications) { markRead(userId, notifications.map(item => item.id)); }
  function acknowledgePaperUpdate(userId, timestamp) { if (timestamp) localStorage.setItem(paperAckKey(userId), String(new Date(timestamp).getTime())); }

  window.NovexaNotifications = { getForUser, refreshBadge, markRead, markAllRead, acknowledgePaperUpdate, esc };
})();

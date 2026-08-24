// Shared Novexa navigation and authentication state.
// Every page uses the same navbar so login/profile state cannot drift between pages.
(() => {
  function pageLinks() {
    const inPages = location.pathname.includes('/pages/');
    return inPages ? {
      home: '../index.html', pastPapers: 'browse.html', notes: 'notes.html', dashboard: 'dashboard.html', notifications: 'notifications.html',
      ai: 'ai.html', pet: 'pet.html', pricing: 'payment.html', login: 'login.html', settings: 'settings.html', payment: 'payment.html',
      logo: '../assets/images/logo landscape cropped.png', darkLogo: '../assets/images/logofordarktheme.png', instagram: '../assets/images/instagram-novexa.png'
    } : {
      home: 'index.html', pastPapers: 'pages/browse.html', notes: 'pages/notes.html', dashboard: 'pages/dashboard.html', notifications: 'pages/notifications.html',
      ai: 'pages/ai.html', pet: 'pages/pet.html', pricing: 'pages/payment.html', login: 'pages/login.html', settings: 'pages/settings.html', payment: 'pages/payment.html',
      logo: 'assets/images/logo landscape cropped.png', darkLogo: 'assets/images/logofordarktheme.png', instagram: 'assets/images/instagram-novexa.png'
    };
  }

  function buildHeader(links) {
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      <a class="brand logo" href="${links.home}" aria-label="Novexa home">
        <img src="${links.logo}" alt="Novexa" class="site-logo site-logo-light"><img src="${links.darkLogo}" alt="Novexa" class="site-logo site-logo-dark">
      </a>
      <button class="nav-menu-toggle" id="navMenuToggle" type="button" aria-expanded="false" aria-controls="primaryNav" aria-label="Open navigation menu"><i data-lucide="menu"></i><span>Menu</span></button>
      <nav class="nav-links" id="primaryNav" aria-label="Primary navigation">
        <a href="${links.home}" data-nav="home">Home</a>
        <a href="${links.pastPapers}" data-nav="past-papers">Past Papers</a>
        <a href="${links.notes}" data-nav="notes">Notes</a>
        <a href="${links.dashboard}" data-nav="dashboard">Dashboard</a>
        <a href="${links.ai}" data-nav="ai">Novexa AI</a>
        <a href="${links.pet}" data-nav="pet">AI Pet</a>
        <a href="${links.pricing}" data-nav="pricing">Pricing</a>
      </nav>
      <div class="nav-right">
        <a class="nav-notification-link" id="navNotificationLink" href="${links.notifications}" aria-label="Open notifications" title="Notifications"><i data-lucide="bell"></i><span class="nav-notification-badge" id="navNotificationBadge" hidden>0</span></a>
        <div class="focus-mini" id="focusMini" aria-live="polite"><span class="focus-mini-time" id="focusMiniTime">25:00</span><button class="focus-mini-btn" id="focusMiniToggle" type="button">Pause</button><button class="focus-mini-btn" id="focusMiniOpen" type="button">Open</button></div>
        <a class="nav-instagram" href="https://www.instagram.com/novexa_study/" target="_blank" rel="noopener noreferrer" aria-label="Novexa on Instagram" title="Follow Novexa on Instagram"><i data-lucide="instagram" aria-hidden="true"></i></a>
        <button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch to dark mode" title="Switch theme"><i data-lucide="moon"></i></button>
        <div class="nav-profile-wrap" id="profileWrap" hidden>
          <button class="user-menu" id="profileButton" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Open your profile menu">
            <span class="user-avatar-fallback" id="profileAvatar">U</span>
            <span class="user-menu-copy"><span class="user-label" id="profileName">User</span></span>
            <span class="nav-chevron"></span>
          </button>
          <div class="nav-popover profile-menu" id="profileMenu" hidden role="menu">
            <div class="profile-menu-header"><span class="user-avatar-fallback profile-menu-avatar" id="profileMenuAvatar">U</span><div><strong id="profileMenuName">User</strong></div></div>
            <div class="profile-menu-divider"></div>
            <button id="profileSettings" type="button" role="menuitem"><i data-lucide="settings"></i> Settings</button>
            <button id="logoutButton" type="button" role="menuitem"><i data-lucide="log-out"></i> Sign out</button>
          </div>
        </div>
        <a class="nav-login-btn" id="navLoginButton" href="${links.login}" hidden>Log in</a>
      </div>
    `;
    return header;
  }

  function activeNav(header) {
    const path = location.pathname.toLowerCase();
    let active = 'home';
    if (path.includes('browse')) active = 'past-papers';
    else if (path.includes('pet')) active = 'pet';
    else if (path.includes('payment')) active = 'pricing';
    else if (path.includes('notes')) active = 'notes';
    else if (path.includes('dashboard')) active = 'dashboard';
    else if (path.includes('ai') || path.includes('novexa_ai')) active = 'ai';
    header.querySelectorAll('[data-nav]').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === active);
    });
  }


  function setupProtectedNavigation() {
    const protectedPaths = new Set(['/pages/notes.html','/pages/dashboard.html','/pages/ai.html','/pages/Novexa_AI.html','/pages/pet.html','/pages/paper.html','/pages/flashcards.html']);
    if (window.__novexaProtectedNavBound) return;
    window.__novexaProtectedNavBound = true;
    document.addEventListener('click', async event => {
      const link = event.target.closest('a[href]');
      if (!link || link.target === '_blank' || event.defaultPrevented) return;
      const raw = link.getAttribute('href');
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || /^https?:/i.test(raw)) return;
      let target;
      try { target = new URL(raw, location.href); } catch (_) { return; }
      if (target.origin !== location.origin || !protectedPaths.has(target.pathname)) return;
      event.preventDefault();
      const session = await window.NovexaAuth?.getSession?.().catch?.(() => null);
      if (session?.user) { location.href = target.href; return; }
      const login = new URL(window.NovexaAuth?.loginUrl?.() || '/pages/login.html', location.origin);
      login.searchParams.set('next', `${target.pathname}${target.search}${target.hash}`);
      location.replace(login.href);
    }, true);
  }

  function setupResponsiveNav(header) {
    const toggle = header.querySelector('#navMenuToggle');
    const nav = header.querySelector('#primaryNav');
    if (!toggle || !nav) return;

    const setOpen = open => {
      header.classList.toggle('nav-menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      toggle.innerHTML = `<i data-lucide="${open ? 'x' : 'menu'}"></i><span>${open ? 'Close' : 'Menu'}</span>`;
      window.lucide?.createIcons();
    };

    toggle.addEventListener('click', () => setOpen(!header.classList.contains('nav-menu-open')));
    nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });

    const compactQuery = window.matchMedia('(max-width: 820px)');
    const sync = event => { if (!event.matches) setOpen(false); };
    if (compactQuery.addEventListener) compactQuery.addEventListener('change', sync);
    else compactQuery.addListener(sync);
  }

  async function loadProfileName(user) {
    const meta = user?.user_metadata || {};
    let name = meta.full_name || meta.name || meta.user_name || user?.email?.split('@')[0] || 'User';

    // Prefer the persisted Novexa profile name when available.
    let profileAvatar = '';
    try {
      const { data } = await window.supabaseClient
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.display_name) name = data.display_name;
      // Avatar images come from Supabase Auth metadata. Do not query
      // profiles.avatar_url because older Novexa schemas do not require it.
      profileAvatar = '';
    } catch (_) {}

    return { name, avatar: profileAvatar };
  }

  async function setupAuth(header, links) {
    const inPages = location.pathname.includes('/pages/');
    const profileWrap = header.querySelector('#profileWrap');
    const profile = header.querySelector('#profileButton');
    const profileMenu = header.querySelector('#profileMenu');
    const login = header.querySelector('#navLoginButton');
    const notificationLink = header.querySelector('#navNotificationLink');
    const showNotificationLink = () => {
      if (!notificationLink) return;
      notificationLink.hidden = false;
      notificationLink.style.display = 'inline-grid';
      notificationLink.style.visibility = 'visible';
      if (window.lucide) window.lucide.createIcons();
    };
    showNotificationLink();
    let authRequest = 0;

    const showUser = async user => {
      const requestId = ++authRequest;

      if (!user) {
        profileWrap.hidden = true;
        login.hidden = false;
        profileMenu.hidden = true;
        showNotificationLink();
        return;
      }

      profileWrap.hidden = false;
      showNotificationLink();
      login.hidden = true;
      // Home remains available after login; login.js and OAuth both send users to Dashboard first.
      profileMenu.hidden = true;

      const profileData = await loadProfileName(user);
      if (requestId !== authRequest) return;

      const meta = user.user_metadata || {};
      const name = profileData.name || 'User';
      const avatar = meta.avatar_url || meta.picture || profileData.avatar || '';
      const email = user.email || '';
      const avatarMarkup = avatar ? `<img src="${String(avatar).replace(/"/g, '&quot;')}" alt="" class="user-avatar-image">` : name.charAt(0).toUpperCase();
      header.querySelector('#profileName').textContent = name;
      header.querySelector('#profileMenuName').textContent = name;
      header.querySelector('#profileAvatar').innerHTML = avatarMarkup;
      header.querySelector('#profileMenuAvatar').innerHTML = avatarMarkup;
    };

    profile.onclick = () => {
      const open = profileMenu.hidden;
      profileMenu.hidden = !open;
      profile.setAttribute('aria-expanded', String(open));
    };

    const upgradeBtn = header.querySelector('#profileUpgrade');
    if (upgradeBtn) {
      upgradeBtn.onclick = () => {
        location.href = inPages ? 'payment.html' : 'pages/payment.html';
      };
    }
    const settingsBtn = header.querySelector('#profileSettings');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        location.href = links.settings;
      };
    }
    const logoutBtn = header.querySelector('#logoutButton');
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        logoutBtn.disabled = true;
        logoutBtn.textContent = 'Signing out…';
        try {
          await window.supabaseClient?.auth.signOut({ scope: 'local' });
        } finally {
          await showUser(null);
          location.replace(links.login);
        }
      };
    }

    // Persistent focus indicator: the timer is timestamp based, so it keeps running while the student navigates around Novexa.
    const ensureNotifications = () => {
      if (window.NovexaNotifications) return Promise.resolve();
      return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = inPages ? '../js/notifications.js' : 'js/notifications.js';
        script.onload = resolve; script.onerror = resolve;
        document.head.appendChild(script);
      });
    };
    const renderNotificationBadge = async user => {
      if (!user) { showNotificationLink(); return []; }
      await ensureNotifications();
      await window.NovexaNotifications?.refreshBadge?.(header, user);
    };

    const focusMini = header.querySelector('#focusMini');
    const focusMiniTime = header.querySelector('#focusMiniTime');
    const focusMiniToggle = header.querySelector('#focusMiniToggle');
    const focusMiniOpen = header.querySelector('#focusMiniOpen');
    const ensureFocusManager = () => {
      if (window.NovexaFocus) return Promise.resolve();
      return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = inPages ? '../js/focus-manager.js' : 'js/focus-manager.js';
        script.onload = resolve; script.onerror = resolve;
        document.head.appendChild(script);
      });
    };
    const renderFocusMini = async () => {
      await ensureFocusManager();
      const state = window.NovexaFocus?.get?.();
      if (!state?.running) { focusMini.classList.remove('is-active'); return; }
      focusMini.classList.add('is-active');
      focusMiniTime.textContent = window.NovexaFocus.format(state.remaining);
      focusMiniToggle.textContent = 'Pause';
    };
    focusMiniToggle.onclick = async () => {
      await ensureFocusManager();
      if (window.NovexaFocus?.get()?.running) window.NovexaFocus.pause();
      renderFocusMini();
    };
    focusMiniOpen.onclick = () => { location.href = inPages ? 'focus.html' : 'pages/focus.html'; };
    renderFocusMini();
    setInterval(renderFocusMini, 500);
    window.addEventListener('novexa-focus-change', renderFocusMini);
    window.addEventListener('novexa-focus-complete', renderFocusMini);

    if (!window.supabaseClient) {
      showUser(null);
      return;
    }

    // Render the current session immediately.
    try {
      const { data, error } = await window.supabaseClient.auth.getSession();
      if (error) throw error;
      const currentUser = data?.session?.user || null;
      await showUser(currentUser);
      renderNotificationBadge(currentUser);
    } catch (error) {
      console.warn('Navbar auth check failed:', error);
      await showUser(null);
    }

    // Keep profile state synchronized after password login, Google OAuth,
    // token refresh, and sign-out without requiring a page refresh.
    window.supabaseClient.auth.onAuthStateChange((_event, session) => {
      // Do not await Supabase queries inside the auth callback. Supabase can
      // otherwise block/deadlock while it is updating the session.
      setTimeout(() => {
        const currentUser = session?.user || null;
        showUser(currentUser);
        renderNotificationBadge(currentUser);
      }, 0);
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('#profileWrap')) profileMenu.hidden = true;
    });
  }

  function setupTheme(header) {
    const root = document.documentElement;
    const toggle = header.querySelector('#themeToggle');
    const saved = localStorage.getItem('novexa-theme') || 'light';
    const apply = theme => {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      localStorage.setItem('novexa-theme', theme);
      if (toggle) {
        toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        toggle.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
        window.lucide?.createIcons();
      }
    };
    apply(saved);
    toggle?.addEventListener('click', () => {
      root.classList.add('theme-transitioning');
      apply(root.dataset.theme === 'dark' ? 'light' : 'dark');
      window.setTimeout(() => root.classList.remove('theme-transitioning'), 360);
    });
  }

  function mount() {
    const placeholder = document.getElementById('site-navbar');
    const links = pageLinks();
    const header = buildHeader(links);
    if (placeholder) placeholder.replaceWith(header);
    else document.body.insertBefore(header, document.body.firstChild);
    activeNav(header);
    setupResponsiveNav(header);
    setupProtectedNavigation();
    setupTheme(header);
    setupAuth(header, links);
    if (window.lucide) {
      window.lucide.createIcons();
      // Second pass to catch any late-injected icons
      setTimeout(() => window.lucide.createIcons(), 100);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

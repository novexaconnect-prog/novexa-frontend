(() => {
  const checkoutButtons = [
    [document.getElementById('monthlyCheckout'), 'month'],
    [document.getElementById('annualCheckout'), 'year']
  ].filter(([button]) => button);
  const msg = document.getElementById('paymentMessage');
  const banner = document.getElementById('trialBanner');
  const apiBase = ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port !== '3000') ? 'http://localhost:3000' : '';

  const termsModal = document.getElementById('termsModal');
  const termsAgreement = document.getElementById('termsAgreement');
  const termsProceed = document.getElementById('termsProceed');
  const termsCloseButtons = [...document.querySelectorAll('[data-terms-close]')];
  const termsCancel = document.getElementById('termsCancel');
  let pendingCheckout = null;
  const show = (text, type = 'info') => {
    if (!msg) return;
    msg.hidden = false;
    msg.className = `payment-message ${type}`;
    msg.textContent = text;
  };

  function closeTermsModal() {
    if (!termsModal) return;
    termsModal.hidden = true;
    termsModal.setAttribute('aria-hidden', 'true');
    if (termsAgreement) termsAgreement.checked = false;
    if (termsProceed) termsProceed.disabled = true;
    pendingCheckout = null;
    document.body.classList.remove('terms-modal-open');
  }

  function openTermsModal(button, interval) {
    if (!termsModal) {
      paypalCheckout(button, interval);
      return;
    }
    pendingCheckout = { button, interval };
    if (termsAgreement) termsAgreement.checked = false;
    if (termsProceed) termsProceed.disabled = true;
    termsModal.hidden = false;
    termsModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('terms-modal-open');
    requestAnimationFrame(() => termsAgreement?.focus());
  }

  if (termsAgreement) {
    termsAgreement.addEventListener('change', () => {
      if (termsProceed) termsProceed.disabled = !termsAgreement.checked;
    });
  }

  termsCloseButtons.forEach(button => button.addEventListener('click', closeTermsModal));
  termsCancel?.addEventListener('click', closeTermsModal);

  termsProceed?.addEventListener('click', () => {
    if (!termsAgreement?.checked || !pendingCheckout) return;
    const { button, interval } = pendingCheckout;
    closeTermsModal();
    paypalCheckout(button, interval);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && termsModal && !termsModal.hidden) closeTermsModal();
  });

  async function session() {
    if (!window.NovexaAuth) throw new Error('Authentication helper did not load.');
    const s = await (window.NovexaAuth.getValidSession?.() || window.NovexaAuth.getSession());
    if (!s) throw new Error('Please sign in before subscribing to Novexa Pro.');
    return s;
  }

  async function proWelcome() {
    let name = 'Student';
    let pet = 'Nova';
    try {
      const account = await window.supabaseClient?.auth.getUser();
      const user = account?.data?.user;
      const meta = user?.user_metadata || {};
      name = meta.full_name || meta.name || user?.email?.split('@')[0] || name;
      const petResult = user ? await window.supabaseClient.from('pets').select('pet_name').eq('user_id', user.id).maybeSingle() : null;
      pet = petResult?.data?.pet_name || pet;
    } catch (_) {}
    return `Welcome to Novexa Pro, ${name}! 🎉\n\nYou now have 50 daily AI usage units and priority AI access.\n\n🤖 Advanced Novexa AI\n📝 AI Notes & Summaries\n🧠 Smart Quizzes & Flashcards\n✍️ AI Mark My Answer\n📊 Weakness Analysis & Analytics\n📅 Adaptive Study Planner\n📄 Past Paper Intelligence\n🐾 Advanced AI Pet varieties\n\nYour AI study buddy ${pet} is ready.`;
  }

  const setButtons = (active) => {
    checkoutButtons.forEach(([button]) => {
      if (!button) return;
      button.disabled = false;
      if (active) {
        button.textContent = 'Manage Pro plan';
        button.dataset.managePro = 'true';
      } else {
        button.textContent = button.id === 'annualCheckout' ? 'Continue annually' : 'Continue with Pro';
        button.dataset.managePro = 'false';
      }
    });
  };

  function applyCurrentPlan(plan) {
    document.querySelectorAll('.plan-card').forEach(card => card.classList.remove('is-current-plan'));
    const basicButton = document.querySelector('.plan-card:first-child .plan-button');
    if (plan === 'pro') {
      checkoutButtons.forEach(([button]) => button?.closest('.plan-card')?.classList.add('is-current-plan'));
      if (basicButton) basicButton.textContent = 'Not current plan';
      setButtons(true);
    } else if (basicButton) {
      basicButton.textContent = 'Current plan';
      setButtons(false);
    }
  }

  async function status() {
    try {
      const s = await session();
      const r = await window.NovexaAuth.authorizedFetch(`${apiBase}/api/billing/status`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load plan status.');
      applyCurrentPlan(d.plan);
      if (d.paymentFailure?.message) show(d.paymentFailure.message, 'error');
      if (banner) {
        banner.hidden = d.plan !== 'pro';
        if (d.plan === 'pro') banner.textContent = `Novexa Pro is active · ${Number(d.usageUnitsRemaining ?? d.credits ?? 50).toLocaleString()} / 50 AI usage units today.`;
      }
    } catch (error) {
      try {
        const userResult = await window.supabaseClient.auth.getUser();
        const uid = userResult?.data?.user?.id;
        if (uid) {
          const profile = await window.supabaseClient.from('profiles').select('plan,ai_daily_units_remaining').eq('user_id', uid).maybeSingle();
          const pro = profile.data?.plan === 'pro';
          applyCurrentPlan(pro ? 'pro' : 'basic');
          if (banner) {
            banner.hidden = !pro;
            if (pro) banner.textContent = `Novexa Pro is active · ${Number(profile.data?.ai_daily_units_remaining ?? 50).toLocaleString()} / 50 AI usage units today.`;
          }
          return;
        }
      } catch (_) {}
      if (new URLSearchParams(location.search).get('paypal') !== 'cancelled') show(error.message, 'info');
    }
  }

  async function paypalCheckout(button, interval) {
    if (button.dataset.managePro === 'true') {
      location.href = 'settings.html';
      return;
    }
    button.disabled = true;
    button.textContent = 'Opening PayPal…';
    try {
      const s = await session();
      const configResponse = await fetch(`${apiBase}/api/billing/paypal/config`, { cache: 'no-store' });
      const config = await configResponse.json().catch(() => ({}));
      if (!config.configured) throw new Error('PayPal is not configured yet. Add the PayPal Client ID, Client Secret and both Pro Plan IDs to backend/.env.');

      const r = await window.NovexaAuth.authorizedFetch(`${apiBase}/api/billing/paypal/create-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'PayPal could not start the subscription.');
      if (!d.approvalUrl) throw new Error('PayPal did not return a secure approval page.');
      location.href = d.approvalUrl;
    } catch (error) {
      show(error.message, 'error');
      button.disabled = false;
      button.textContent = interval === 'year' ? 'Continue annually' : 'Continue with Pro';
    }
  }

  async function confirmPayPal(subscriptionId) {
    const s = await session();
    show('Confirming your PayPal subscription…', 'info');
    const r = await window.NovexaAuth.authorizedFetch(`${apiBase}/api/billing/paypal/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'PayPal payment is still being confirmed.');
    show(await proWelcome(), 'success');
    if (banner) { banner.hidden = false; banner.textContent = 'Novexa Pro is active · 50 AI usage units/day · priority AI queue.'; }
    applyCurrentPlan('pro');
    history.replaceState({}, '', 'payment.html');
  }

  checkoutButtons.forEach(([button, interval]) => button.addEventListener('click', () => {
    if (button.dataset.managePro === 'true') {
      location.href = 'settings.html';
      return;
    }
    openTermsModal(button, interval);
  }));

  (async () => {
    const params = new URLSearchParams(location.search);
    if (params.get('paypal') === 'cancelled') show('PayPal checkout cancelled. Your account has not been charged.', 'info');
    try {
      const subscriptionId = params.get('subscription_id');
      if (params.get('paypal') === 'success' && subscriptionId) {
        await confirmPayPal(subscriptionId);
      } else {
        await status();
      }
    } catch (error) {
      show(error.message, 'error');
      setButtons(false);
    }
  })();
})();

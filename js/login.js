document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const googleLogin = document.getElementById('googleLogin');
  const appleLogin = document.getElementById('appleLogin');
  const signupLink = document.getElementById('signupLink');
  const forgotLink = document.getElementById('forgotPassword');
  const togglePassword = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');
  const emailInput = document.getElementById('email');
  const message = document.getElementById('loginMessage');
  const showMessage = (text, type = 'error') => { if (!message) return; message.textContent = text; message.className = `login-message ${type}`; message.hidden = false; };
  const setBusy = busy => document.querySelectorAll('#loginForm button, #googleLogin, #appleLogin').forEach(btn => { btn.disabled = busy; });
  const dashboardUrl = () => window.NovexaAuth?.dashboardUrl?.() || new URL('/pages/dashboard.html', window.location.origin).href;

  try { const session = await window.NovexaAuth?.waitForSession(2500); if (session?.user) { window.location.replace(dashboardUrl()); return; } } catch (_) {}

  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = emailInput?.value.trim().toLowerCase();
    const password = passwordInput?.value || '';
    if (!email || !password) return showMessage('Enter both your email address and password.');
    if (!window.supabaseClient) return showMessage('Supabase did not load. Refresh the page and try again.');
    setBusy(true); showMessage('Signing you in…', 'info');
    try {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const session = data?.session || await window.NovexaAuth.waitForSession(5000);
      if (!session?.user) throw new Error('Login succeeded, but Novexa could not restore your session. Please try again.');
      await new Promise(r => setTimeout(r, 150));
      const verified = await window.NovexaAuth.getSession();
      if (!verified?.user) throw new Error('Your session could not be persisted. Please try again.');
      showMessage('Login successful. Opening your dashboard…', 'success');
      window.location.replace(dashboardUrl());
    } catch (error) {
      console.error('Login error:', error);
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('email not confirmed')) showMessage('Please confirm your email first, then log in again.');
      else if (msg.includes('invalid login credentials')) showMessage('The email or password is incorrect.');
      else showMessage(error.message || 'Login failed. Please try again.');
      setBusy(false);
    }
  });

  googleLogin?.addEventListener('click', async () => {
    if (!window.supabaseClient) return showMessage('Supabase did not load. Refresh the page and try again.');
    setBusy(true); showMessage('Opening Google account chooser…', 'info');
    try {
      const { error } = await window.supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: dashboardUrl(), queryParams: { prompt: 'select_account' } } });
      if (error) throw error;
    } catch (error) { console.error('Google OAuth error:', error); showMessage(error.message || 'Google sign-in could not start.'); setBusy(false); }
  });

  appleLogin?.addEventListener('click', async () => {
    if (!window.supabaseClient) return showMessage('Supabase did not load. Refresh the page and try again.');
    setBusy(true); showMessage('Opening Apple sign-in…', 'info');
    try { const { error } = await window.supabaseClient.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: dashboardUrl() } }); if (error) throw error; }
    catch (error) { console.error('Apple OAuth error:', error); showMessage(error.message || 'Apple sign-in is not enabled for this Supabase project.'); setBusy(false); }
  });

  forgotLink?.addEventListener('click', async event => {
    event.preventDefault(); const email = emailInput?.value.trim().toLowerCase(); if (!email) return showMessage('Enter your email address first.');
    try { const redirectTo = new URL('/pages/reset-password.html', window.location.origin).href; const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, { redirectTo }); if (error) throw error; showMessage('Password reset email sent. Check your inbox.', 'success'); }
    catch (error) { showMessage(error.message || 'Could not send the password reset email.'); }
  });
  signupLink?.addEventListener('click', event => { event.preventDefault(); window.location.href = 'signup.html'; });
  togglePassword?.addEventListener('click', () => { passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password'; togglePassword.textContent = passwordInput.type === 'password' ? 'Show' : 'Hide'; });
});

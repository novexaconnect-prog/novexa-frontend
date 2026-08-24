document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('signupForm');
  const msg = document.getElementById('signupMessage');
  const show = (text, type = 'info') => {
    msg.hidden = false;
    msg.className = `login-message ${type}`;
    msg.innerHTML = text;
  };

  try {
    const session = await window.NovexaAuth?.waitForSession(2000);
    if (session?.user) {
      location.replace(new URL('dashboard.html', location.href).href);
      return;
    }
  } catch (_) {}

  form?.addEventListener('submit', async event => {
    event.preventDefault();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    if (name.length < 2) return show('Please enter your name.', 'error');
    if (password.length < 6) return show('Use a password with at least 6 characters.', 'error');

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Creating account…';

    try {
      const redirectTo = new URL('dashboard.html', location.href).href;
      const { data, error } = await window.supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, name },
          emailRedirectTo: redirectTo
        }
      });

      if (error) throw error;

      if (data?.session) {
        show('Account created. Taking you to your dashboard…', 'success');
        setTimeout(() => location.replace(redirectTo), 250);
        return;
      }

      // Supabase returns no session when email confirmation is enabled.
      show(
        `Account created successfully. Please confirm <strong>${email}</strong> from your inbox, then log in.
         <br><button id="resendConfirmation" type="button" class="inline-link-button">Resend confirmation email</button>`,
        'success'
      );

      document.getElementById('resendConfirmation')?.addEventListener('click', async () => {
        const { error: resendError } = await window.supabaseClient.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: redirectTo }
        });
        if (resendError) show(resendError.message, 'error');
        else show(`A new confirmation email was sent to <strong>${email}</strong>.`, 'success');
      });
    } catch (error) {
      console.error('Signup error:', error);
      const message = String(error.message || '');
      if (/already registered|already exists/i.test(message)) {
        show('An account with this email already exists. <a href="login.html">Log in instead →</a>', 'error');
      } else {
        show(message || 'Could not create your account. Please try again.', 'error');
      }
    } finally {
      button.disabled = false;
      button.textContent = 'Create Account';
    }
  });
});

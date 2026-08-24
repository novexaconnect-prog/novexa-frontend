(() => {
  const apiBase = ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port !== '3000')
    ? 'http://localhost:3000'
    : '';

  async function sendMessage(prompt, history = [], options = {}) {
    if (!prompt || !prompt.trim()) throw new Error('Please enter a study question.');

    const session = await (window.NovexaAuth?.getValidSession?.() || window.NovexaAuth?.getSession?.());
    if (!session?.access_token) throw new Error('Please sign in before using Novexa AI.');

    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        history,
        mode: options.mode || 'study',
        subject: options.subject || 'General',
        action: options.action || 'study',
        attachments: options.attachments || []
      })
    };
    const response = window.NovexaAuth?.authorizedFetch
      ? await window.NovexaAuth.authorizedFetch(`${apiBase}/api/ai`, requestOptions)
      : await fetch(`${apiBase}/api/ai`, { ...requestOptions, headers: { ...requestOptions.headers, Authorization: `Bearer ${session.access_token}` } });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) throw new Error(window.NovexaAuth?.signInMessage?.() || data.error || 'Your session expired. Please sign in again.');
      if (response.status === 402) throw new Error(data.error || 'You have no AI usage units left today. Upgrade to Pro for a higher daily allowance.');
      if (response.status === 502) throw new Error(data.error || 'Novexa could not reach the configured AI provider.');
      throw new Error(data.error || `AI request failed (${response.status})`);
    }

    return data;
  }

  window.NovexaAI = { send: sendMessage };
})();

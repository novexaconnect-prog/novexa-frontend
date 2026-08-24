(() => {
  const $ = id => document.getElementById(id);
  const userKey = 'novexa_tool_user';
  async function init() {
    if (!window.supabaseClient) return;
    const { data } = await window.supabaseClient.auth.getUser();
    const user = data?.user;
    const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Student';
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = name);
    if ($('logout')) $('logout').onclick = async () => { await window.supabaseClient.auth.signOut(); location.href='login.html'; };
  }
  document.querySelectorAll('[data-action="back"]').forEach(b => b.onclick = () => history.back());
  init();
})();

const SUPABASE_URL = "https://mmngzyskwbufmpdotzvn.supabase.co";
const SUPABASE_KEY = "sb_publishable_KMQihso9YvoG2RngHI3pew_Ccz2bYsS";
if (!window.supabaseClient && window.supabase?.createClient) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, storageKey: 'novexa-auth-session' }
  });
}

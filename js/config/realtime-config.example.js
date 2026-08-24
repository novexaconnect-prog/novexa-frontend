/*
  Copy this file to `realtime-config.js` and set `window.REALTIME_CONFIG` with your provider.

  Examples:

  // Supabase
  window.REALTIME_CONFIG = {
    provider: 'supabase',
    supabaseUrl: 'https://your-project.supabase.co',
    supabaseKey: 'public-anon-key'
  };

  // Firebase (Firestore)
  window.REALTIME_CONFIG = {
    provider: 'firebase',
    firebaseConfig: {
      apiKey: '...',
      authDomain: '...',
      projectId: '...',
      // ...
    }
  };

  Leave this file as-is if you want to use the built-in polling fallback.
*/

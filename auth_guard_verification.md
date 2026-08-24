# Authentication Guard Verification

The shared `NovexaAuth.requireAuth()` helper now waits for the Supabase client/session, preserves authenticated sessions, and redirects unauthenticated visitors to `/pages/login.html` with a safe `next` parameter.

The Dashboard page was tested while unauthenticated. The initial protected document was replaced by the Login page, and the final URL included `?next=%2Fpages%2Fdashboard.html`, confirming the guard fired and preserved the attempted destination.

The same guard is wired into Notes, Dashboard, Novexa AI, and AI Pet. Public routes remain unchanged: Home, Past Papers, Pricing, and Login are not guarded.

The Novexa AI route was also tested while unauthenticated. After the guard completed, the browser landed on `/pages/login.html?next=%2Fpages%2Fai.html`, confirming the AI page is protected and the attempted route is preserved.

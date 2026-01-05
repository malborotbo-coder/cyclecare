PROJECT CONTEXT:
This is a single codebase used for:
- Web
- iOS (Capacitor)
- Android (Capacitor)

ARCHITECTURE RULES:
1. Shared logic (auth, tokens, API, routes, business logic) is unified and must work across all platforms.
2. Platform-specific behavior MUST be isolated by platform checks.

PLATFORM SEPARATION:
- Web-only logic must not affect mobile apps.
- Mobile-only logic must not affect web.

Use:
- Capacitor.isNativePlatform() to detect mobile app runtime.

MOBILE-ONLY FEATURES (must be gated):
- Face ID / Touch ID (biometrics)
- Secure storage (Keychain / Keystore)
- Native plugins
- App-only UI/UX

WEB-ONLY FEATURES:
- localStorage
- cookies
- SEO-related code
- Web analytics

STRICT RULES:
- Never apply mobile-only changes globally.
- Never break web behavior when implementing app features.
- Never require app-only fields (e.g. phone, profile data) during web login unless explicitly requested.
- UI validation must match rendered fields exactly.

AUTH RULES:
- Firebase is the single source of truth.
- Presence of authToken + firebaseToken = authenticated user.
- Session APIs are enrichment only, never required for auth.
- phoneSession is required ONLY for phone-based auth.
- Biometrics only unlock existing sessions, never authenticate users directly.

UI RULES:
- Login and registration flows must be clearly separated.
- Never show validation errors for fields not visible to the user.
- Desktop and mobile UI differences must be intentional and scoped.

WORKFLOW:
- Prefer minimal, explicit changes.
- Do not refactor unrelated code.
- Follow existing file structure and naming.

DEFAULT ASSUMPTION:
If a task is ambiguous, ask whether it is:
- Shared
- Web-only
- Mobile-only
before implementing.

END OF RULES
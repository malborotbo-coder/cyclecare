# CycleCare Auth/Push Manual QA (Launch Pass)

## 1) Token Expiry
1. Sign in with email, then open any protected page (`/orders` or `/notifications`).
2. Force token expiry (use a short-lived token in backend/dev env or clear server session validity).
3. Trigger a protected request (refresh page or navigate to notifications).
4. Verify:
   - App performs one clean auth invalidation event.
   - User is returned to login state.
   - No repeated `/api/notifications` 401 loop.
   - No repeated `/api/push/unregister` loop.

## 2) Manual Logout
1. Sign in and confirm protected pages load.
2. Press logout from profile/side menu.
3. Verify:
   - Auth tokens are cleared.
   - Protected queries stop.
   - App returns to login state without spinner lock.
   - Push unregister is skipped when token/user is missing.

## 3) App Relaunch After Expired Token (iOS/Capacitor)
1. Sign in, then expire token externally.
2. Kill the app, relaunch.
3. Verify:
   - Startup does not hang.
   - App does not keep partial-auth state.
   - App lands on login cleanly (no unauthorized request spam).

## 4) Notifications Screen After Auth Loss
1. Open notifications while signed in.
2. Invalidate auth/token, then revisit notifications.
3. Verify:
   - Notifications query is disabled when unauthenticated.
   - No continuous retries/polling for `/api/notifications`.

## 5) Push Unregister Behavior
1. Logout with valid session once; verify one unregister attempt with Authorization.
2. Repeat logout/login edge cases where token is already cleared.
3. Verify:
   - `/api/push/unregister` is never called without token.
   - Client logs show skip reason instead of unauthorized loop.

## 6) Auth Method Switching (Google/Phone/Email)
1. Start Google flow, cancel, then immediately choose phone or email.
2. Start phone flow, go back, then choose Google or email.
3. Verify:
   - No stuck loading spinner.
   - No frozen login screen.
   - New method can start immediately.

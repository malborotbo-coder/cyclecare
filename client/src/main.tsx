import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { syncAuthTokensFromPreferences } from "./lib/authStorage";
import { restoreBiometricSession } from "./lib/biometricSession";
import { fetchWithFirebaseAuth } from "./lib/apiClient";

// Best-effort native token restore (biometric + preferences)
Promise.all([restoreBiometricSession(), syncAuthTokensFromPreferences()]).catch(() => null);

// Attach Firebase ID token to all /api requests
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const request = new Request(input as any, init);
    const url = request.url;
    const isApiCall = url.includes("/api/");

    if (isApiCall) {
      return fetchWithFirebaseAuth(input, init);
    }

    return originalFetch(request);
  } catch (error) {
    return originalFetch(input as any, init as any);
  }
};

// Keep native token cache in sync when auth token updates
window.addEventListener("auth-token-updated", (event: Event) => {
  const detail = (event as CustomEvent<{ action?: string }>).detail;
  if (detail?.action === "cleared") return;
  syncAuthTokensFromPreferences();
});

createRoot(document.getElementById("root")!).render(<App />);

// Disable service worker registration to avoid HTML MIME errors for now
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}

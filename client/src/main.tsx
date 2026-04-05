import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { syncAuthTokensFromPreferences } from "./lib/authStorage";
import { fetchWithFirebaseAuth } from "./lib/apiClient";
import { AppBootErrorBoundary } from "@/components/AppBootErrorBoundary";

console.info("[Bootstrap] main.tsx start");

// Best-effort native token restore from Preferences.
// Biometric restore is intentionally triggered from login flow after auth bootstrap is ready.
void syncAuthTokensFromPreferences().catch(() => null);

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

window.addEventListener("error", (event) => {
  console.error("[Bootstrap] window error", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Bootstrap] unhandled rejection", event.reason);
});

const rootNode = document.getElementById("root");
if (!rootNode) {
  throw new Error("Root node '#root' was not found.");
}

console.info("[Bootstrap] root render start");
createRoot(rootNode).render(
  <AppBootErrorBoundary>
    <App />
  </AppBootErrorBoundary>,
);
console.info("[Bootstrap] root render mounted");

// Disable service worker registration to avoid HTML MIME errors for now
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}

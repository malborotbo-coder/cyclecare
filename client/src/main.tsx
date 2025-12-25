import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Attach Authorization header to all /api requests when a token exists
const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const request = new Request(input as any, init);
    const url = request.url;
    const isApiCall =
      url.startsWith("/api/") ||
      url.startsWith(`${window.location.origin}/api/`);

    if (isApiCall) {
      const headers = new Headers(request.headers);
      if (!headers.has("Authorization")) {
        const authToken = localStorage.getItem("auth_token");
        const firebaseToken = localStorage.getItem("firebase_token");
        const phoneSession = localStorage.getItem("phone_session");

        if (authToken) {
          headers.set("Authorization", `Bearer ${authToken}`);
        } else if (firebaseToken) {
          headers.set("Authorization", `Bearer ${firebaseToken}`);
        } else if (phoneSession) {
          headers.set("Authorization", `Bearer ${phoneSession}`);
        }
      }

      return originalFetch(new Request(request, { headers }));
    }

    return originalFetch(request);
  } catch (error) {
    return originalFetch(input as any, init as any);
  }
};

createRoot(document.getElementById("root")!).render(<App />);

// Disable service worker registration to avoid HTML MIME errors for now
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}

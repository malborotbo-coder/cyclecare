import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { resolveApiUrl } from "./lib/apiConfig";
import { Capacitor } from "@capacitor/core";
import { syncAuthTokensFromPreferences } from "./lib/authStorage";

const platform = Capacitor.getPlatform();
const isNative = platform === "android" || platform === "ios";

// Sync native-stored tokens into localStorage on startup for unified access
syncAuthTokensFromPreferences();

// Attach Authorization header to all /api requests when a token exists
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
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

        const bearerToken = authToken || phoneSession || firebaseToken;
        if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
      }

      const resolvedUrl = resolveApiUrl(url);
      let body: BodyInit | undefined = init?.body ?? undefined;

      // Safari (and WKWebView) cannot upload ReadableStreams; normalize the body into concrete types
      if (!body && request.body && request.method !== "GET" && request.method !== "HEAD") {
        const contentType = headers.get("content-type") || "";
        const clonedRequest = request.clone();

        if (contentType.includes("application/json") || contentType.includes("text/")) {
          body = await clonedRequest.text();
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          body = await clonedRequest.text();
        } else if (contentType.includes("multipart/form-data")) {
          // Let the browser set the multipart boundary again
          headers.delete("content-type");
          body = await clonedRequest.formData();
        } else {
          body = await clonedRequest.blob();
        }
      }

      const updatedRequest = new Request(resolvedUrl, {
        method: request.method,
        headers,
        body,
        credentials: isNative ? "omit" : request.credentials,
        cache: request.cache,
        mode: request.mode as RequestMode,
        redirect: request.redirect as RequestRedirect,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        integrity: request.integrity,
        keepalive: request.keepalive,
        signal: request.signal,
      });
      return originalFetch(updatedRequest);
    }

    return originalFetch(request);
  } catch (error) {
    return originalFetch(input as any, init as any);
  }
};

// Keep native token cache in sync when auth token updates
window.addEventListener("auth-token-updated", () => {
  syncAuthTokensFromPreferences();
});

createRoot(document.getElementById("root")!).render(<App />);

// Disable service worker registration to avoid HTML MIME errors for now
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}

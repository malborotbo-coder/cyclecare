import { Capacitor } from "@capacitor/core";
import { resolveApiUrl } from "./apiConfig";
import { auth } from "./firebase";
import { getBestAuthToken } from "./authStorage";
import { handleAuthFailureResponse, invalidateAuthState } from "./authSession";

const platform = Capacitor.getPlatform();
const isNative = platform === "android" || platform === "ios";
const baseFetch = globalThis.fetch.bind(globalThis);

const isApiRequest = (url: string) => url.includes("/api/");

const getApiPath = (url: string) => {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    return new URL(url, origin).pathname;
  } catch {
    return "";
  }
};

const isPublicApiPath = (path: string, method: string) => {
  const normalizedPath = path.split("?")[0];
  const normalizedMethod = method.toUpperCase();

  if (normalizedPath.startsWith("/api/auth/")) return true;
  if (normalizedPath.startsWith("/api/public/")) return true;
  if (normalizedPath === "/api/logout") return true;
  if (normalizedPath === "/api/test") return true;
  if (normalizedPath === "/health") return true;
  if (normalizedPath === "/api/parts" && normalizedMethod === "GET") return true;
  if (normalizedPath === "/api/technicians" && normalizedMethod === "GET") return true;
  if (normalizedPath === "/api/technicians/nearby" && normalizedMethod === "GET") return true;
  if (normalizedPath === "/api/pricing/quote" && normalizedMethod === "POST") return true;
  if (normalizedPath === "/api/discount-codes/validate" && normalizedMethod === "POST") return true;
  if (normalizedPath === "/api/technicians/apply" && normalizedMethod === "POST") return true;
  if (normalizedPath === "/api/service-requests" && normalizedMethod === "POST") return true;
  if (normalizedPath === "/api/orders/mock-checkout" && normalizedMethod === "POST") return true;
  if (normalizedPath === "/api/shop/mock-checkout" && normalizedMethod === "POST") return true;
  if (normalizedPath === "/api/strava/connect") return true;
  if (normalizedPath === "/api/strava/callback") return true;
  return false;
};

async function getFirebaseIdToken(forceRefresh = true): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.error("[Auth] Failed to get Firebase ID token", err);
    return null;
  }
}

async function buildRequestBody(
  request: Request,
  headers: Headers,
  init?: RequestInit
): Promise<BodyInit | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  if (init?.body !== undefined) return init.body as BodyInit;
  if (!request.body) return undefined;

  const contentType = headers.get("content-type") || "";
  const clonedRequest = request.clone();

  if (contentType.includes("application/json") || contentType.includes("text/")) {
    return await clonedRequest.text();
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return await clonedRequest.text();
  }
  if (contentType.includes("multipart/form-data")) {
    headers.delete("content-type");
    return await clonedRequest.formData();
  }
  return await clonedRequest.blob();
}

async function tryParseErrorPayload(response: Response): Promise<any> {
  const clone = response.clone();
  const contentType = clone.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return clone.json().catch(() => null);
  }
  const text = await clone.text().catch(() => "");
  if (!text) return null;
  return { message: text };
}

export async function fetchWithFirebaseAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = new Request(input as any, init);
  const resolvedUrl = resolveApiUrl(request.url);
  const urlString = String(resolvedUrl);
  const apiPath = getApiPath(urlString);
  const headers = new Headers(request.headers);
  let usedToken: string | null = null;

  if (isApiRequest(urlString)) {
    const token = await getFirebaseIdToken(true);
    if (token) {
      usedToken = token;
      headers.set("Authorization", `Bearer ${token}`);
    } else {
      const fallbackToken = await getBestAuthToken();
      if (fallbackToken) {
        usedToken = fallbackToken;
        headers.set("Authorization", `Bearer ${fallbackToken}`);
      }
    }
    if (!usedToken && typeof localStorage !== "undefined") {
      const guestToken = localStorage.getItem("guest_token");
      if (guestToken) {
        headers.set("X-Guest-Token", guestToken);
      }
    }

    if (!isPublicApiPath(apiPath, request.method) && !headers.get("Authorization")) {
      await invalidateAuthState({
        reason: "missing_token",
        status: 401,
        source: "fetch_missing_token_guard",
        url: apiPath || urlString,
      });
      return new Response(
        JSON.stringify({
          message: "Unauthorized",
          reason: "missing_token",
          code: "UNAUTHORIZED",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  const body = await buildRequestBody(request, headers, init);
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    headers.delete("content-type");
  }

  const baseInit: RequestInit = {
    method: request.method,
    headers,
    body,
    credentials: init?.credentials ?? (isNative ? "omit" : request.credentials),
    cache: request.cache,
    mode: request.mode as RequestMode,
    redirect: request.redirect as RequestRedirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  };

  let response = await baseFetch(resolvedUrl as any, baseInit);

  if (isApiRequest(urlString) && response.status === 401) {
    const refreshed = await getFirebaseIdToken(true);
    if (refreshed && refreshed !== usedToken) {
      headers.set("Authorization", `Bearer ${refreshed}`);
      response = await baseFetch(resolvedUrl as any, { ...baseInit, headers });
    }
  }

  if (isApiRequest(urlString) && response.status === 401) {
    const payload = await tryParseErrorPayload(response);
    await handleAuthFailureResponse({
      status: response.status,
      payload,
      source: "fetch_with_firebase_auth",
      url: urlString,
    });
  }

  return response;
}

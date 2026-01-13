import { Capacitor } from "@capacitor/core";
import { resolveApiUrl } from "./apiConfig";
import { auth } from "./firebase";
import { getBestAuthToken } from "./authStorage";

const platform = Capacitor.getPlatform();
const isNative = platform === "android" || platform === "ios";
const baseFetch = globalThis.fetch.bind(globalThis);

const isApiRequest = (url: string) => url.includes("/api/");

async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn("[Auth] Failed to get Firebase ID token", err);
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

export async function fetchWithFirebaseAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = new Request(input as any, init);
  const resolvedUrl = resolveApiUrl(request.url);
  const urlString = typeof resolvedUrl === "string" ? resolvedUrl : resolvedUrl.toString();
  const headers = new Headers(request.headers);
  let usedToken: string | null = null;

  if (isApiRequest(urlString)) {
    const token = await getFirebaseIdToken(false);
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

  return response;
}

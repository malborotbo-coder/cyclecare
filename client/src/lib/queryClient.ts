import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { buildApiError, ensureApiError } from "@/lib/apiError";
import { buildApiUrl, getApiBaseUrl } from "@/lib/apiConfig";
import { type Language } from "@/lib/i18n";
import { Capacitor } from "@capacitor/core";
import { fetchWithFirebaseAuth } from "@/lib/apiClient";
import { hasStoredAuthTokenSync, invalidateAuthState } from "@/lib/authSession";

const platform = Capacitor.getPlatform();
const isNative = platform === "android" || platform === "ios";

// Mock data for iOS development
const mockTechnicians = [
  { id: 1, name: "فني #1", rating: "4.8", reviewCount: 45, isAvailable: true },
  { id: 2, name: "فني #2", rating: "4.5", reviewCount: 32, isAvailable: true },
  { id: 3, name: "فني #3", rating: "4.9", reviewCount: 58, isAvailable: false },
];

const debugApi =
  typeof window !== "undefined" &&
  (import.meta.env.DEV || localStorage.getItem("debug_api") === "true");
const seenDebugTargets = new Set<string>();

function getLanguagePreference(): Language {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("language");
    if (saved === "en" || saved === "ar") return saved;
  }
  return "ar";
}

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

async function guardProtectedApiRequest(path: string, method: string, source: string, lang: Language) {
  if (!path.startsWith("/api/")) return;
  if (isPublicApiPath(path, method)) return;
  if (hasStoredAuthTokenSync()) return;

  await invalidateAuthState({
    reason: "missing_token",
    status: 401,
    source,
    url: path,
  });
  throw buildApiError(
    { code: "UNAUTHORIZED", message: "Unauthorized", reason: "missing_token" } as any,
    401,
    lang,
  );
}

// Build headers with auth token if available (async version)
export async function getAuthHeadersAsync(includeContentType: boolean = false, lang?: Language): Promise<HeadersInit> {
  const headers: HeadersInit = {};
  const resolvedLang = lang || getLanguagePreference();

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  headers["Accept-Language"] = resolvedLang;
  headers["X-Lang"] = resolvedLang;
  
  return headers;
}

async function throwIfResNotOk(res: Response, lang: Language) {
  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch (e) {
      // ignore body parse errors
    }
    throw buildApiError(payload, res.status, lang);
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<any> {
  const lang = getLanguagePreference();
  const isFormData =
    typeof FormData !== "undefined" && data instanceof FormData;
  await guardProtectedApiRequest(url, method, "api_request_guard", lang);
  const headers = await getAuthHeadersAsync(!isFormData && !!data, lang);
  const targetUrl = buildApiUrl(url);
  if (debugApi && !seenDebugTargets.has(targetUrl)) {
    seenDebugTargets.add(targetUrl);
    const authHeader =
      headers instanceof Headers
        ? headers.get("Authorization")
        : (headers as any)?.Authorization;
    console.log("[API][request]", {
      targetUrl,
      credentials: isNative ? "omit" : "include",
      hasAuthHeader: !!authHeader,
      authPreview: authHeader ? `${authHeader.slice(0, 12)}...` : null,
      cookies:
        typeof document !== "undefined"
          ? document.cookie.split(";").filter(Boolean).length
          : 0,
      apiBase: getApiBaseUrl(),
    });
  }
  try {
    const res = await fetchWithFirebaseAuth(targetUrl, {
      method,
      headers,
      body: data ? (isFormData ? (data as FormData) : JSON.stringify(data)) : undefined,
      credentials: isNative ? "omit" : "include",
    });

    await throwIfResNotOk(res, lang);
  
    // Handle 204 No Content responses (like DELETE)
    if (res.status === 204) {
      return { success: true };
    }
    
    // Check if response has content
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await res.json();
    }
    
    return { success: true };
  } catch (error) {
    throw ensureApiError(error, lang);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey.join("/") as string;
    const lang = getLanguagePreference();
    await guardProtectedApiRequest(path, "GET", "query_guard", lang);
    
    // iOS development: Return mock data for technicians
    if (path === "/api/technicians" && typeof window !== "undefined" && (window as any).Capacitor) {
      return mockTechnicians;
    }

    try {
      const headers = await getAuthHeadersAsync(false, lang);
      const targetUrl = buildApiUrl(path);
      if (debugApi && !seenDebugTargets.has(targetUrl)) {
        seenDebugTargets.add(targetUrl);
        const authHeader =
          headers instanceof Headers
            ? headers.get("Authorization")
            : (headers as any)?.Authorization;
        console.log("[API][query]", {
          targetUrl,
          credentials: isNative ? "omit" : "include",
          hasAuthHeader: !!authHeader,
          authPreview: authHeader ? `${authHeader.slice(0, 12)}...` : null,
          cookies:
            typeof document !== "undefined"
              ? document.cookie.split(";").filter(Boolean).length
              : 0,
          apiBase: getApiBaseUrl(),
        });
      }
      const res = await fetchWithFirebaseAuth(targetUrl, {
        headers,
        credentials: isNative ? "omit" : "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res, lang);
      return await res.json();
    } catch (error) {
      throw ensureApiError(error, lang);
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

if (typeof window !== "undefined") {
  (window as any).__cyclecareQueryClient = queryClient;
}

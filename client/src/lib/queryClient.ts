import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";
import { buildApiError, ensureApiError } from "@/lib/apiError";
import { type Language } from "@/lib/i18n";

// Token storage key (must match FirebaseAuthContext)
const AUTH_TOKEN_KEY = "auth_token";

// Mock data for iOS development
const mockTechnicians = [
  { id: 1, name: "فني #1", rating: "4.8", reviewCount: 45, isAvailable: true },
  { id: 2, name: "فني #2", rating: "4.5", reviewCount: 32, isAvailable: true },
  { id: 3, name: "فني #3", rating: "4.9", reviewCount: 58, isAvailable: false },
];

function getLanguagePreference(): Language {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("language");
    if (saved === "en" || saved === "ar") return saved;
  }
  return "ar";
}

// Helper to get auth token - supports JWT, phone session, and Firebase tokens
async function getAuthToken(): Promise<string | null> {
  // Check for phone session first (non-Firebase)
  const phoneSession = localStorage.getItem("phone_session");
  if (phoneSession) {
    return phoneSession;
  }
  
  // Get stored tokens
  const storedFirebaseToken = localStorage.getItem("firebase_token");
  const storedAuthToken = localStorage.getItem(AUTH_TOKEN_KEY);
  
  // Try to refresh Firebase token if we have a current user
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      // Get fresh token (force refresh if token is old)
      const freshToken = await currentUser.getIdToken(false);
      // Update stored tokens
      localStorage.setItem(AUTH_TOKEN_KEY, freshToken);
      localStorage.setItem("firebase_token", freshToken);
      console.log("[Auth] Firebase token refreshed");
      return freshToken;
    }
  } catch (error) {
    console.error("[Auth] Error refreshing Firebase ID token:", error);
  }
  
  // If Firebase currentUser is not available yet (after page reload), 
  // use stored token as fallback - it's still valid for ~1 hour
  if (storedFirebaseToken) {
    console.log("[Auth] Using stored Firebase token (currentUser not ready)");
    return storedFirebaseToken;
  }
  
  // Check for JWT token (Google OAuth) - these are longer lived
  if (storedAuthToken) {
    console.log("[Auth] Using stored JWT token");
    return storedAuthToken;
  }
  
  return null;
}

// Build headers with auth token if available (async version)
async function getAuthHeadersAsync(includeContentType: boolean = false, lang?: Language): Promise<HeadersInit> {
  const headers: HeadersInit = {};
  const resolvedLang = lang || getLanguagePreference();
  
  const token = await getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
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
  const headers = await getAuthHeadersAsync(!!data, lang);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
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
    
    // iOS development: Return mock data for technicians
    if (path === "/api/technicians" && typeof window !== "undefined" && (window as any).Capacitor) {
      return mockTechnicians;
    }

    try {
      const headers = await getAuthHeadersAsync(false, lang);
      const res = await fetch(path, {
        headers,
        credentials: "include",
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

import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";

// Token storage key (must match FirebaseAuthContext)
const AUTH_TOKEN_KEY = "auth_token";

// Mock data for iOS development
const mockTechnicians = [
  { id: 1, name: "فني #1", rating: "4.8", reviewCount: 45, isAvailable: true },
  { id: 2, name: "فني #2", rating: "4.5", reviewCount: 32, isAvailable: true },
  { id: 3, name: "فني #3", rating: "4.9", reviewCount: 58, isAvailable: false },
];

// Helper to get auth token - supports JWT, phone session, and Firebase tokens
async function getAuthToken(): Promise<string | null> {
  // Check for phone session first (non-Firebase)
  const phoneSession = localStorage.getItem("phone_session");
  if (phoneSession) {
    return phoneSession;
  }
  
  // Check if we have a Firebase token stored - always refresh it
  const hasFirebaseToken = localStorage.getItem("firebase_token");
  if (hasFirebaseToken) {
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        // Always get fresh token to handle expiry (force refresh if needed)
        const freshToken = await currentUser.getIdToken(false);
        // Update stored token with fresh one
        localStorage.setItem(AUTH_TOKEN_KEY, freshToken);
        localStorage.setItem("firebase_token", freshToken);
        return freshToken;
      }
    } catch (error) {
      console.error("Error refreshing Firebase ID token:", error);
      // Token refresh failed, clear stored tokens
      localStorage.removeItem("firebase_token");
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }
  
  // Check for JWT token (Google OAuth) - these are longer lived
  const jwtToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (jwtToken && !hasFirebaseToken) {
    return jwtToken;
  }
  
  // Try Firebase auth directly if user is logged in
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      // Store for future use
      localStorage.setItem(AUTH_TOKEN_KEY, idToken);
      localStorage.setItem("firebase_token", idToken);
      return idToken;
    }
  } catch (error) {
    console.error("Error getting Firebase ID token:", error);
  }
  
  return null;
}

// Build headers with auth token if available (async version)
async function getAuthHeadersAsync(includeContentType: boolean = false): Promise<HeadersInit> {
  const headers: HeadersInit = {};
  
  const token = await getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const json = await res.json();
      const error: any = new Error(json.message || res.statusText);
      if (json.documentType) error.documentType = json.documentType;
      if (json.error) error.serverError = json.error;
      if (json.errors) error.validationErrors = json.errors;
      throw error;
    } catch (e) {
      if (e instanceof Error && e.message) {
        throw e;
      }
      throw new Error(res.statusText);
    }
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<any> {
  const headers = await getAuthHeadersAsync(!!data);
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
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
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey.join("/") as string;
    
    // iOS development: Return mock data for technicians
    if (path === "/api/technicians" && typeof window !== "undefined" && (window as any).Capacitor) {
      return mockTechnicians;
    }

    const headers = await getAuthHeadersAsync(false);
    const res = await fetch(path, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
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

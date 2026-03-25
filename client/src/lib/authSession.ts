import { clearAuthTokens } from "@/lib/authStorage";

export const AUTH_INVALIDATED_EVENT = "cyclecare:auth-invalidated";

const AUTH_FAILURE_REASONS = new Set([
  "token_expired",
  "invalid_token",
  "missing_token",
  "unauthorized",
  "unauthenticated",
]);

const TOKEN_KEYS = ["auth_token", "phone_session", "firebase_token"];
let invalidateInFlight: Promise<void> | null = null;
let lastInvalidationAt = 0;
let lastInvalidationReason = "";
let authCycleDebugLogged = false;

const now = () => Date.now();

const normalizeReason = (value: unknown): string => {
  if (!value) return "";
  const raw = String(value).trim().toLowerCase();
  if (!raw) return "";
  if (raw === "unauthorized" || raw === "unauthenticated") return "unauthorized";
  return raw;
};

const extractReasonFromPayload = (payload: any): string => {
  const fromReason = normalizeReason(payload?.reason);
  if (fromReason) return fromReason;
  const fromError = normalizeReason(payload?.error);
  if (fromError) return fromError;
  const fromCode = normalizeReason(payload?.code);
  if (fromCode === "unauthorized") return "unauthorized";
  const message = normalizeReason(payload?.message);
  if (AUTH_FAILURE_REASONS.has(message)) return message;
  return "";
};

const isApiQueryKey = (queryKey: readonly unknown[]) =>
  queryKey.some((part) => typeof part === "string" && part.includes("/api/"));

export const hasStoredAuthTokenSync = () => {
  if (typeof localStorage === "undefined") return false;
  return TOKEN_KEYS.some((key) => Boolean(localStorage.getItem(key)));
};

export async function invalidateAuthState(options?: {
  reason?: string;
  status?: number;
  source?: string;
  url?: string;
}) {
  const normalizedReason = normalizeReason(options?.reason) || "unauthorized";
  const ts = now();
  if (ts - lastInvalidationAt < 15000 && normalizedReason === lastInvalidationReason) {
    return;
  }
  lastInvalidationAt = ts;
  lastInvalidationReason = normalizedReason;

  if (!invalidateInFlight) {
    invalidateInFlight = (async () => {
      const hadStoredToken = hasStoredAuthTokenSync();
      await clearAuthTokens({ emitEvent: false }).catch(() => undefined);

      if (!authCycleDebugLogged) {
        authCycleDebugLogged = true;
        console.info("[Auth][CycleDebug] Invalidating auth state", {
          reason: normalizedReason,
          status: options?.status ?? 401,
          source: options?.source || "unknown",
          hadStoredToken,
          url: options?.url || "",
        });
      }

      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("google_auth_user");
      }

      if (typeof window !== "undefined") {
        const qc = (window as any).__cyclecareQueryClient;
        if (qc) {
          const predicate = (query: any) => isApiQueryKey(query.queryKey || []);
          await qc.cancelQueries({ predicate }).catch(() => undefined);
          qc.removeQueries({ predicate });
        }

        window.dispatchEvent(
          new CustomEvent(AUTH_INVALIDATED_EVENT, {
            detail: {
              reason: normalizedReason,
              status: options?.status ?? 401,
              source: options?.source || "unknown",
              url: options?.url || "",
            },
          }),
        );
      }

      console.warn("[Auth] Session invalidated", {
        reason: normalizedReason,
        status: options?.status ?? 401,
        source: options?.source || "unknown",
      });
    })().finally(() => {
      invalidateInFlight = null;
    });
  }

  await invalidateInFlight;
}

export async function handleAuthFailureResponse(options: {
  status: number;
  payload?: any;
  source?: string;
  url?: string;
}) {
  if (options.status !== 401) return false;
  const extracted = extractReasonFromPayload(options.payload);
  const reason = extracted || "unauthorized";
  if (!AUTH_FAILURE_REASONS.has(reason)) return false;
  await invalidateAuthState({
    reason,
    status: options.status,
    source: options.source,
    url: options.url,
  });
  return true;
}

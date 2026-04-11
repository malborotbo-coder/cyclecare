export type LoginMode = "rider" | "technician";
export type AppRole = "guest" | "rider" | "technician" | "admin";

const LOGIN_MODE_KEY = "cyclecare_login_mode";

export const DEFAULT_LOGIN_MODE: LoginMode = "rider";
export const POST_LOGIN_RESOLVER_PATH = "/auth/post-login";

export function isTechnicianRole(roles: string[] | null | undefined): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.includes("technician");
}

export function getStoredLoginMode(): LoginMode {
  if (typeof localStorage === "undefined") return DEFAULT_LOGIN_MODE;
  try {
    const raw = localStorage.getItem(LOGIN_MODE_KEY);
    if (raw === "technician" || raw === "rider") return raw;
  } catch {
    // Ignore storage errors and use default mode.
  }
  return DEFAULT_LOGIN_MODE;
}

export function setStoredLoginMode(mode: LoginMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOGIN_MODE_KEY, mode);
  } catch {
    // Ignore storage errors for non-critical UI preference.
  }
}

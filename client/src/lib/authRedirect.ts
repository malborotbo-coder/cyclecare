const REDIRECT_KEY = "post_login_redirect";
const BOOKING_DRAFT_KEY = "pending_booking_draft";

export type BookingDraft = {
  step?: number;
  selectedService?: string;
  selectedTechnicianId?: string;
  notes?: string;
  location?: { lat: number; lng: number };
  locationText?: string;
};

export function setPostLoginRedirect(path: string) {
  if (typeof localStorage === "undefined") return;
  if (!path) return;
  localStorage.setItem(REDIRECT_KEY, path);
}

export function consumePostLoginRedirect(fallback: string = "/") {
  if (typeof localStorage === "undefined") return fallback;
  const target = localStorage.getItem(REDIRECT_KEY);
  localStorage.removeItem(REDIRECT_KEY);
  return target || fallback;
}

export function saveBookingDraft(draft: BookingDraft) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
}

export function loadBookingDraft(): BookingDraft | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(BOOKING_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BookingDraft;
  } catch {
    return null;
  }
}

export function clearBookingDraft() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(BOOKING_DRAFT_KEY);
}

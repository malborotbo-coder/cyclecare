import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

type LiveActivityPayload = {
  orderId: string;
  orderNumber: string;
  status: string;
  title: string;
  subtitle: string;
  progress: number;
  stageIndex: number;
  totalStages: number;
  timestamp: number;
  technicianName?: string | null;
  etaMinutes?: number | null;
  locale?: string;
  bikeName?: string | null;
  userId?: string | null;
  role?: string | null;
};

type OrderLiveActivityPlugin = {
  start(options: LiveActivityPayload): Promise<void>;
  update(options: LiveActivityPayload): Promise<void>;
  end(options: LiveActivityPayload): Promise<void>;
};

const LiveActivity = registerPlugin<OrderLiveActivityPlugin>("OrderLiveActivity");
const ACTIVE_ORDER_KEY = "live_activity_active_order";
const ACTIVE_STATUS_KEY = "live_activity_active_status";
const ROLE_STORAGE_KEY = "push_device_role";
const isLiveActivityFeatureEnabled = () => import.meta.env.VITE_ENABLE_LIVE_ACTIVITIES === "true";
const isSupported = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios" &&
  isLiveActivityFeatureEnabled();

const getRequestTimestamp = (request: any) => {
  const raw = request?.updatedAt ?? request?.updated_at ?? request?.createdAt ?? request?.created_at ?? Date.now();
  const parsed = typeof raw === "string" ? Date.parse(raw) : Number(raw);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const mapStatusToState = (status: string, lang: "ar" | "en") => {
  const isArabic = lang === "ar";
  switch (status) {
    case "assigned":
    case "assigned_to_technician":
      return {
        title: isArabic ? "تم تعيين فني لطلبك 👨‍🔧" : "Technician assigned",
        subtitle: isArabic ? "جاري تجهيز الفني" : "Preparing your technician",
        progress: 0.25,
        stageIndex: 0,
      };
    case "accepted":
      return {
        title: isArabic ? "قام الفني بقبول طلبك 👍" : "Technician accepted your request",
        subtitle: isArabic ? "جاري تجهيز المسار" : "Preparing the route",
        progress: 0.25,
        stageIndex: 0,
      };
    case "on_the_way":
      return {
        title: isArabic ? "الفني في الطريق إليك 🚴‍♂️" : "Technician is on the way",
        subtitle: isArabic ? "يرجى الاستعداد" : "Please be ready",
        progress: 0.5,
        stageIndex: 1,
      };
    case "working":
    case "in_progress":
      return {
        title: isArabic ? "بدأ الفني العمل على طلبك 🛠️" : "Service started",
        subtitle: isArabic ? "جاري الصيانة" : "Maintenance in progress",
        progress: 0.75,
        stageIndex: 2,
      };
    case "completed":
      return {
        title: isArabic ? "تم إنجاز الطلب بنجاح 🎉" : "Service completed",
        subtitle: isArabic ? "شكرًا لاستخدام Cycle Care" : "Thanks for choosing Cycle Care",
        progress: 1,
        stageIndex: 3,
      };
    case "rejected_by_technician":
    case "cancelled":
      return {
        title: isArabic ? "تم إلغاء الطلب ❌" : "Order cancelled",
        subtitle: isArabic ? "يمكنك طلب فني آخر" : "You can request another technician",
        progress: 1,
        stageIndex: 3,
      };
    default:
      return {
        title: isArabic ? "تم تأكيد طلبك بنجاح ✅" : "Order confirmed",
        subtitle: isArabic ? "جاري تجهيز الطلب" : "Preparing your request",
        progress: 0.1,
        stageIndex: 0,
      };
  }
};

const getRequestId = (request: any) =>
  String(request?.id ?? request?.serviceRequestId ?? "");

const buildPayload = (request: any, lang: "ar" | "en"): LiveActivityPayload => {
  const status = String(request?.status || "pending");
  const orderNumber =
    request?.orderNumber ?? request?.order_number ?? request?.id ?? request?.serviceRequestId ?? "—";
  const { title, subtitle, progress, stageIndex } = mapStatusToState(status, lang);
  const bikeName =
    request?.bikeName ??
    request?.bike?.name ??
    request?.bike?.nickname ??
    null;
  const userId = request?.userId ?? request?.user_id ?? null;
  return {
    orderId: getRequestId(request) || "unknown",
    orderNumber: String(orderNumber),
    status,
    title,
    subtitle,
    progress,
    stageIndex,
    totalStages: 4,
    timestamp: Math.floor(Date.now() / 1000),
    locale: lang,
    bikeName,
    userId,
  };
};

const normalizeActivityState = (state?: string | null) => {
  const raw = String(state || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "confirmed") return null;
  if (raw === "started") return "working";
  if (raw === "rejected") return "rejected_by_technician";
  if (raw === "assigned_to_technician") return "assigned";
  if (raw === "accepted") return "assigned";
  if (raw === "assigned") return "assigned";
  return raw;
};

const buildPayloadFromStatus = (payload: {
  orderId: string;
  orderNumber?: string | null;
  status: string;
  title?: string | null;
  subtitle?: string | null;
  lang: "ar" | "en";
}): LiveActivityPayload => {
  const base = mapStatusToState(payload.status, payload.lang);
  const resolvedTitle = payload.title || base.title;
  const resolvedSubtitle = payload.subtitle || base.subtitle;
  return {
    orderId: payload.orderId,
    orderNumber: payload.orderNumber || payload.orderId,
    status: payload.status,
    title: resolvedTitle,
    subtitle: resolvedSubtitle,
    progress: base.progress,
    stageIndex: base.stageIndex,
    totalStages: 4,
    timestamp: Math.floor(Date.now() / 1000),
    locale: payload.lang,
  };
};

const readStoredValue = async (key: string) => {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return null;
  }
};

const isCustomerContext = async () => {
  const stored = await readStoredValue(ROLE_STORAGE_KEY);
  const role = String(stored || "").trim().toLowerCase();
  if (!role) return true;
  return role !== "technician" && role !== "admin";
};

const writeStoredValue = async (key: string, value: string) => {
  try {
    await Preferences.set({ key, value });
  } catch {
    // Ignore storage failures; do not block.
  }
};

const clearStoredValue = async (key: string) => {
  try {
    await Preferences.remove({ key });
  } catch {
    // Ignore storage failures; do not block.
  }
};

export const handleLiveActivityForRequest = async (request: any, lang: "ar" | "en") => {
  if (!isSupported()) return;
  if (!(await isCustomerContext())) return;
  const orderId = getRequestId(request);
  if (!orderId) return;

  const status = String(request?.status || "");
  const payload = buildPayload(request, lang);
  const storedRole = await readStoredValue(ROLE_STORAGE_KEY);
  if (storedRole) {
    payload.role = storedRole;
  }
  const activeOrderId = await readStoredValue(ACTIVE_ORDER_KEY);
  const activeStatus = await readStoredValue(ACTIVE_STATUS_KEY);

  if (status === "assigned" || status === "assigned_to_technician" || status === "accepted") {
    if (activeOrderId && activeOrderId !== orderId) {
      console.log("[LiveActivity] Skipped start: another order active.");
      return;
    }
    if (activeOrderId === orderId && activeStatus === status) return;
    console.log("[LiveActivity][Start]", { orderId, status });
    await LiveActivity.start(payload).catch(() => null);
    await writeStoredValue(ACTIVE_ORDER_KEY, orderId);
    await writeStoredValue(ACTIVE_STATUS_KEY, status);
    return;
  }

  if (status === "on_the_way" || status === "working" || status === "in_progress") {
    if (!activeOrderId || activeOrderId !== orderId) return;
    if (activeStatus === status) return;
    console.log("[LiveActivity][Update]", { orderId, status });
    await LiveActivity.update(payload).catch(() => null);
    await writeStoredValue(ACTIVE_STATUS_KEY, status);
    return;
  }

  if (status === "completed" || status === "cancelled" || status === "rejected_by_technician") {
    if (!activeOrderId || activeOrderId !== orderId) return;
    console.log("[LiveActivity][End]", { orderId, status });
    await LiveActivity.end(payload).catch(() => null);
    await clearStoredValue(ACTIVE_ORDER_KEY);
    await clearStoredValue(ACTIVE_STATUS_KEY);
  }
};

export const handleLiveActivityFromPush = async (payload: {
  orderId?: string | null;
  orderNumber?: string | null;
  activityState?: string | null;
  title?: string | null;
  body?: string | null;
  lang: "ar" | "en";
}) => {
  if (!isSupported()) return;
  if (!(await isCustomerContext())) return;
  const orderId = payload.orderId ? String(payload.orderId) : "";
  if (!orderId) return;
  const normalizedState = normalizeActivityState(payload.activityState);
  if (!normalizedState) return;

  const activityStatus = normalizedState;
  const livePayload = buildPayloadFromStatus({
    orderId,
    orderNumber: payload.orderNumber,
    status: activityStatus,
    title: payload.title || null,
    subtitle: payload.body || null,
    lang: payload.lang,
  });
  const storedRole = await readStoredValue(ROLE_STORAGE_KEY);
  if (storedRole) {
    livePayload.role = storedRole;
  }

  const activeOrderId = await readStoredValue(ACTIVE_ORDER_KEY);
  const activeStatus = await readStoredValue(ACTIVE_STATUS_KEY);

  if (activityStatus === "assigned") {
    if (activeOrderId && activeOrderId !== orderId) {
      console.log("[LiveActivity] Skipped start: another order active.");
      return;
    }
    if (activeOrderId === orderId && activeStatus === activityStatus) return;
    console.log("[LiveActivity][Start]", { orderId, status: activityStatus });
    await LiveActivity.start(livePayload).catch(() => null);
    await writeStoredValue(ACTIVE_ORDER_KEY, orderId);
    await writeStoredValue(ACTIVE_STATUS_KEY, activityStatus);
    return;
  }

  if (activityStatus === "on_the_way" || activityStatus === "working" || activityStatus === "in_progress") {
    if (!activeOrderId || activeOrderId !== orderId) return;
    if (activeStatus === activityStatus) return;
    console.log("[LiveActivity][Update]", { orderId, status: activityStatus });
    await LiveActivity.update(livePayload).catch(() => null);
    await writeStoredValue(ACTIVE_STATUS_KEY, activityStatus);
    return;
  }

  if (activityStatus === "completed" || activityStatus === "cancelled" || activityStatus === "rejected_by_technician") {
    if (!activeOrderId || activeOrderId !== orderId) return;
    console.log("[LiveActivity][End]", { orderId, status: activityStatus });
    await LiveActivity.end(livePayload).catch(() => null);
    await clearStoredValue(ACTIVE_ORDER_KEY);
    await clearStoredValue(ACTIVE_STATUS_KEY);
  }
};

export const syncLiveActivityFromRequests = async (requests: any[], lang: "ar" | "en") => {
  if (!isSupported()) return;
  if (!(await isCustomerContext())) return;
  if (!Array.isArray(requests)) return;

  const liveStatuses = new Set(["accepted", "on_the_way", "working", "in_progress"]);
  const terminalStatuses = new Set(["completed", "rejected_by_technician", "cancelled"]);

  const storedOrderId = await readStoredValue(ACTIVE_ORDER_KEY);
  const storedStatus = await readStoredValue(ACTIVE_STATUS_KEY);

  const storedRequest = storedOrderId
    ? requests.find((request) => String(request?.id) === storedOrderId)
    : null;

  if (storedRequest) {
    const currentStatus = String(storedRequest.status || "");
    if (terminalStatuses.has(currentStatus)) {
      await handleLiveActivityForRequest(storedRequest, lang);
      return;
    }
    if (liveStatuses.has(currentStatus) && storedStatus !== currentStatus) {
      await handleLiveActivityForRequest(storedRequest, lang);
      return;
    }
    if (liveStatuses.has(currentStatus)) {
      return;
    }
  }

  const nextLive = [...requests]
    .filter((request) => liveStatuses.has(String(request?.status || "")))
    .sort((a, b) => getRequestTimestamp(b) - getRequestTimestamp(a))[0];

  if (nextLive) {
    await handleLiveActivityForRequest(nextLive, lang);
    return;
  }

  if (storedOrderId) {
    const fallbackRequest = requests.find((request) => String(request?.id) === storedOrderId);
    if (fallbackRequest) {
      await handleLiveActivityForRequest(fallbackRequest, lang);
    }
    await clearStoredValue(ACTIVE_ORDER_KEY);
    await clearStoredValue(ACTIVE_STATUS_KEY);
  }
};

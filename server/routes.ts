import type { Express } from "express";
import { storage } from "./storage";
import { setupGoogleAuth } from "./googleAuth";
import { setupFirebaseAuth, isAuthenticated, isAdmin, initializeFirebaseAdmin } from "./firebaseMiddleware";
import {
  validateSchema,
  handleRouteError,
  AppError,
  errorHandler,
  getRequestLang,
  normalizeErrorBody,
  type Language,
} from "./errors";
import {
  insertBikeSchema,
  insertServiceRequestSchema,
  insertMaintenanceRecordSchema,
  insertPartSchema,
  insertTechnicianSchema,
  insertInvoiceSchema,
  insertDiscountCodeSchema,
  insertOrderSchema,
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { uploadBufferToStorage, getUploadClient } from "./supabaseClient";
import { pgFetch } from "./postgrest";
import { ensureStorageBucket, uploadToStorageRest } from "./storageRest";
import type { Role, InsertDiscountCode } from "@shared/schema";
import { computePricing } from "./pricingEngine";
import { signJWT, verifyJWT } from "./jwt";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomUUID, createHmac } from "crypto";
import { sendApns, sendApnsLiveActivity } from "./push/apns";

const ENABLE_MOCK_TECHNICIAN = process.env.ENABLE_MOCK_TECHNICIAN === "true";
const ALLOW_ALL_BOOKINGS = process.env.ALLOW_ALL_BOOKINGS === "true";
const ALLOW_MOCK_CHECKOUT_BYPASS = process.env.ALLOW_MOCK_CHECKOUT_BYPASS === "true";
const ALLOW_LEGACY_PHONE_TOKENS = process.env.ALLOW_LEGACY_PHONE_TOKENS === "true";
const MOCK_TECH_ID_PREFIX = "mock-";
const DEFAULT_LAT = 24.7136;
const DEFAULT_LNG = 46.6753;
const APPLE_BUNDLE_IDS = Array.from(
  new Set(
    [
      process.env.APPLE_BUNDLE_ID,
      process.env.APPLE_SERVICE_ID,
      process.env.APPLE_CLIENT_ID,
      process.env.APNS_BUNDLE_ID,
      process.env.IOS_BUNDLE_ID,
      process.env.BUNDLE_ID,
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  ),
);
if (APPLE_BUNDLE_IDS.length === 0) {
  APPLE_BUNDLE_IDS.push("com.mujtabanasr.cyclecare");
}
const PROFILE_IMAGE_BUCKET = process.env.PROFILE_IMAGE_BUCKET || "profile-images";
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const STRAVA_REDIRECT_URI = process.env.STRAVA_REDIRECT_URI;
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";
const STRAVA_CONNECT_COOKIE = "cc_strava_token";
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

const upload = multer({
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB to accommodate large mobile photos/HEIC
    fieldSize: 20 * 1024 * 1024,
    files: 10,
  },
  storage: multer.memoryStorage(),
});

const bikePhotoUpload = (req: any, res: any, next: any) => {
  upload.single("photo")(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ code: "PHOTO_TOO_LARGE", message: "Image too large (max 20MB)" });
      }
      return res.status(400).json({ code: "PHOTO_UPLOAD_INVALID", message: err.message || "Invalid photo upload" });
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ message: "No photo uploaded" });
    }
    if (!file.mimetype?.startsWith("image/")) {
      return res.status(400).json({ message: "Invalid image type" });
    }
    next();
  });
};

const partImageUpload = (req: any, res: any, next: any) => {
  if (!req.is("multipart/form-data")) {
    return next();
  }
  upload.single("image")(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ code: "PART_IMAGE_TOO_LARGE", message: "Image too large (max 20MB)" });
      }
      return res.status(400).json({ code: "PART_IMAGE_UPLOAD_INVALID", message: err.message || "Invalid image upload" });
    }
    next();
  });
};

function buildMockTech(lat: number, lng: number) {
  const mockDistance = 1.2;
  const pricePreview = computePricing({
    distanceKm: mockDistance,
    serviceBase: 150,
    serviceName: "Maintenance",
  });
  return {
    id: "mock-tech-1",
    name: "فني تجريبي",
    photo_url: "/assets/mock-tech.png",
    rating: 4.8,
    reviewCount: 120,
    is_available: true,
    isAvailable: true,
    status: "online",
    distanceKm: mockDistance,
    etaMinutes: 10,
    isMock: true,
    pricePreview,
    lastUpdated: new Date().toISOString(),
    latitude: lat,
    longitude: lng,
  };
}

const isMockTechnicianId = (value: unknown) =>
  typeof value === "string" && value.trim().startsWith(MOCK_TECH_ID_PREFIX);

const decodeJwtClaims = (token: string) => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload || null;
  } catch {
    return null;
  }
};

async function verifyAppleIdentityToken(identityToken: string) {
  try {
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      issuer: "https://appleid.apple.com",
      audience: APPLE_BUNDLE_IDS,
    });
    return payload;
  } catch (error: any) {
    const decoded = decodeJwtClaims(identityToken);
    console.error("[APPLE][VERIFY][FAILED]", {
      message: error?.message,
      aud: decoded?.aud,
      iss: decoded?.iss,
      sub: decoded?.sub,
      exp: decoded?.exp,
      expectedAud: APPLE_BUNDLE_IDS,
    });
    throw error;
  }
}

async function upsertTechnicianLocation(technicianId: string, lat?: number, lng?: number) {
  const latitude = Number.isFinite(lat) ? Number(lat) : DEFAULT_LAT;
  const longitude = Number.isFinite(lng) ? Number(lng) : DEFAULT_LNG;
  const payload = {
    technician_id: technicianId,
    latitude,
    longitude,
    last_updated: new Date().toISOString(),
  };
  try {
    const { resp, data } = await pgFetch(
      `/technician_locations?technician_id=eq.${encodeURIComponent(technicianId)}`,
      {
        method: "PATCH",
        body: payload,
        headers: { Prefer: "return=representation" },
      },
    );
    const updated = Array.isArray(data) ? data : data ? [data] : [];
    if (resp.status === 404 || resp.status === 0 || updated.length === 0) {
      await pgFetch("/technician_locations", {
        method: "POST",
        body: payload,
        headers: { Prefer: "return=representation" },
      });
    }
  } catch (err) {
    console.log("[TECH][LOC][UPSERT][WARN]", err);
  }
  return { latitude, longitude };
}

type TrackingStep = {
  id: string;
  title: string;
  description: string;
  status: "done" | "current" | "pending";
  timestamp: string;
};

type RouteSummary = {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  etaMinutes: number;
  lastUpdated: string;
};

const addMinutes = (base: Date, minutes: number) =>
  new Date(base.getTime() + minutes * 60_000);

const parseJsonValue = (value: any) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const getCookieValue = (cookieHeader: string | undefined, name: string) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return null;
};

const parseStorageUrl = (url: string) => {
  const match = url.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], path: match[2] };
};

const maskToken = (token?: string | null) => {
  if (!token || typeof token !== "string") return null;
  return `${token.slice(0, 6)}...`;
};

const computeExpiresAt = (payload: any) => {
  const expiresIn = Number(payload?.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Math.floor(Date.now() / 1000) + expiresIn;
  }
  const expiresAt = Number(payload?.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt > 0) {
    return expiresAt;
  }
  return null;
};

const signStorageUrl = async (url: string) => {
  if (!url) return url;
  const parsed = parseStorageUrl(url);
  if (!parsed) return url;
  try {
    const client = getUploadClient();
    const { data, error } = await client.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, 60 * 60);
    if (error || !data?.signedUrl) {
      console.warn("[STORAGE][SIGNED_URL][FAILED]", { bucket: parsed.bucket, path: parsed.path });
      return url;
    }
    return data.signedUrl;
  } catch (error: any) {
    console.warn("[STORAGE][SIGNED_URL][ERROR]", { message: error?.message });
    return url;
  }
};

const buildStravaState = (userId: string, timestamp: number, secret: string) => {
  const payload = JSON.stringify({ userId, ts: timestamp });
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sig}`;
};

const parseStravaState = (state: string, secret: string) => {
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) return null;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (expected !== sig) return null;
  try {
    return JSON.parse(payload) as { userId: string; ts: number };
  } catch {
    return null;
  }
};

const ensureStravaConfig = () => {
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REDIRECT_URI) {
    throw new Error("STRAVA_CONFIG_MISSING");
  }
};

const clearStravaConnectCookie = (res: any) => {
  res.setHeader(
    "Set-Cookie",
    `${STRAVA_CONNECT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`,
  );
};

async function resolveAuthFromToken(token: string): Promise<AuthContext | null> {
  if (!token) return null;

  const jwtPayload = verifyJWT(token);
  if (jwtPayload) {
    return {
      userId: jwtPayload.sub,
      isAdmin: jwtPayload.isAdmin === true,
      email: jwtPayload.email || undefined,
      phoneNumber: undefined,
    };
  }

  if (token.startsWith("session_")) {
    const dbSession = await storage.getPhoneSession(token);
    if (dbSession) {
      return {
        userId: dbSession.userId,
        isAdmin: false,
        email: undefined,
        phoneNumber: dbSession.phoneNumber,
      };
    }
  }

  if (ALLOW_LEGACY_PHONE_TOKENS && token.startsWith("phone_")) {
    return {
      userId: token,
      isAdmin: false,
      email: undefined,
      phoneNumber: `+${token.replace("phone_", "")}`,
    };
  }

  const firebaseAuth = await initializeFirebaseAdmin();
  if (!firebaseAuth) return null;
  const decoded = await firebaseAuth.verifyIdToken(token);
  return {
    userId: decoded.uid,
    isAdmin: decoded.admin === true,
    email: decoded.email || undefined,
    phoneNumber: decoded.phone_number,
  };
}

const buildDefaultRoute = (location?: string): RouteSummary => ({
  fromLabel: "نقطة انطلاق الفني",
  toLabel: location || "موقع العميل",
  distanceKm: 0,
  etaMinutes: 0,
  lastUpdated: new Date().toISOString(),
});

const buildDefaultTrackingSteps = (status?: string, createdAt?: string): TrackingStep[] => {
  const baseTime = createdAt ? new Date(createdAt) : new Date();
  const templates = [
    {
      id: "created",
      title: "تم استلام الطلب",
      description: "طلبك قيد المراجعة الآن.",
    },
    {
      id: "assigned",
      title: "تم إسناد الفني",
      description: "جارٍ تجهيز الفني والتواصل معك.",
    },
    {
      id: "on_the_way",
      title: "الفني في الطريق",
      description: "الفني متجه إلى موقعك.",
    },
    {
      id: "arrived",
      title: "جاري تنفيذ الصيانة",
      description: "الفني بدأ تنفيذ الخدمة.",
    },
    {
      id: "completed",
      title: "تمت الخدمة",
      description: "تم إنهاء الطلب بنجاح.",
    },
  ];

  if (status === "rejected_by_technician") {
    const steps = templates.map((step, index) => ({
      ...step,
      status: index === 0 ? "done" : "pending",
      timestamp: addMinutes(baseTime, index * 6).toISOString(),
    }));
    const rejectedStep = {
      id: "rejected",
      title: "تم رفض الطلب",
      description: "الفني رفض الطلب ويمكنك البحث عن فني آخر.",
      status: "current",
      timestamp: addMinutes(baseTime, templates.length * 6).toISOString(),
    };
    return [...steps, rejectedStep];
  }

  const stageMap: Record<string, number> = {
    pending: 0,
    created: 0,
    awaiting_payment: 0,
    payment_completed: 0,
    assigned: 1,
    assigned_to_technician: 1,
    accepted: 1,
    on_the_way: 2,
    arrived: 3,
    working: 3,
    in_progress: 3,
    completed: 4,
    cancelled: 0,
  };
  const stageIndex = stageMap[status || "pending"] ?? 0;

  return templates.map((step, index) => {
    const statusValue =
      status === "completed"
        ? "done"
        : index < stageIndex
        ? "done"
        : index === stageIndex
        ? "current"
        : "pending";
    return {
      ...step,
      status: statusValue,
      timestamp: addMinutes(baseTime, index * 6).toISOString(),
    };
  });
};

const mergeTrackingSteps = (baseSteps: TrackingStep[], existing: TrackingStep[]) => {
  const byId = new Map(existing.map((step) => [step.id, step]));
  return baseSteps.map((step) => {
    const stored = byId.get(step.id);
    if (!stored) return step;
    return {
      ...step,
      title: stored.title || step.title,
      description: stored.description || step.description,
      timestamp: stored.timestamp || step.timestamp,
    };
  });
};

const normalizeTrackingSteps = (input: any, status?: string, createdAt?: string): TrackingStep[] => {
  const baseSteps = buildDefaultTrackingSteps(status, createdAt);
  const parsed = parseJsonValue(input);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return mergeTrackingSteps(baseSteps, parsed as TrackingStep[]);
  }
  return baseSteps;
};

const buildShopTrackingSteps = (deliveryOption?: string, createdAt?: string): TrackingStep[] => {
  const baseTime = createdAt ? new Date(createdAt) : new Date();
  const isDelivery = deliveryOption === "delivery_installation";
  const templates = isDelivery
    ? [
        {
          id: "received",
          title: "تم استلام الطلب",
          description: "طلبك قيد التحضير حالياً.",
        },
        {
          id: "preparing",
          title: "جاري التحضير",
          description: "نقوم بتجهيز الطلب للشحن.",
        },
        {
          id: "out_for_delivery",
          title: "خارج للتوصيل",
          description: "طلبك في الطريق إليك.",
        },
        {
          id: "delivered",
          title: "تم التسليم",
          description: "تم تسليم الطلب بنجاح.",
        },
      ]
    : [
        {
          id: "received",
          title: "تم استلام الطلب",
          description: "طلبك قيد التحضير حالياً.",
        },
        {
          id: "preparing",
          title: "جاري التحضير",
          description: "نقوم بتجهيز الطلب للاستلام.",
        },
        {
          id: "ready_pickup",
          title: "جاهز للاستلام",
          description: "يمكنك استلام طلبك من المتجر.",
        },
        {
          id: "picked_up",
          title: "تم الاستلام",
          description: "تم استلام الطلب بنجاح.",
        },
      ];

  const currentIndex = 1;
  return templates.map((step, index) => ({
    ...step,
    status: index < currentIndex ? "done" : index === currentIndex ? "current" : "pending",
    timestamp: addMinutes(baseTime, index * 8).toISOString(),
  }));
};

const normalizeRoute = (input: any, location?: string): RouteSummary => {
  const parsed = parseJsonValue(input);
  if (parsed && typeof parsed === "object") {
    return parsed as RouteSummary;
  }
  return buildDefaultRoute(location);
};

const normalizeUserRow = (row: any) => ({
  id: row.id,
  email: row.email ?? null,
  firstName: row.first_name ?? row.firstName ?? null,
  lastName: row.last_name ?? row.lastName ?? null,
  phone: row.phone ?? row.phone_number ?? row.phoneNumber ?? null,
  authProvider: row.auth_provider ?? row.authProvider ?? null,
  authProviderId: row.auth_provider_id ?? row.authProviderId ?? null,
  profileImageUrl: row.profile_image_url ?? row.profileImageUrl ?? null,
  avatarUrl: row.avatar_url ?? row.avatarUrl ?? null,
  isTechnician: row.is_technician ?? row.isTechnician ?? false,
  technicianRemovedAt: row.technician_removed_at ?? row.technicianRemovedAt ?? null,
  isAdmin: row.is_admin ?? row.isAdmin ?? false,
  createdAt: row.created_at ?? row.createdAt ?? null,
  updatedAt: row.updated_at ?? row.updatedAt ?? null,
});

const buildReferenceFromId = (prefix: string, id?: string | null, createdAt?: string | null) => {
  if (!id) return null;
  const cleaned = String(id).replace(/-/g, "").toUpperCase();
  if (!cleaned) return null;
  const suffix = cleaned.slice(0, 6);
  let datePart = "";
  if (createdAt) {
    const date = new Date(createdAt);
    if (!Number.isNaN(date.getTime())) {
      datePart = date.toISOString().slice(2, 10).replace(/-/g, "");
    }
  }
  if (datePart) {
    return `${prefix}-${datePart}-${suffix}`;
  }
  return `${prefix}-${suffix}`;
};

const normalizeOrderRow = (row: any) => {
  const createdAt = row.created_at ?? row.createdAt ?? null;
  return {
    id: row.id,
    userId: row.user_id ?? row.userId ?? null,
    orderNumber: row.order_number ?? row.orderNumber ?? buildReferenceFromId("ORD", row.id, createdAt),
    subtotal: row.subtotal,
    taxRate: row.tax_rate ?? row.taxRate,
    taxAmount: row.tax_amount ?? row.taxAmount,
    total: row.total,
    deliveryType: row.delivery_type ?? row.deliveryType ?? null,
    deliveryAddress: row.delivery_address ?? row.deliveryAddress ?? null,
    deliveryOption: row.delivery_option ?? row.deliveryOption ?? null,
    paymentMethod: row.payment_method ?? row.paymentMethod ?? null,
    paymentStatus: row.payment_status ?? row.paymentStatus ?? null,
    items: row.items ?? [],
    trackingSteps: row.tracking_steps ?? row.trackingSteps ?? [],
    status: row.status,
    notes: row.notes ?? null,
    createdAt,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
};

const normalizeInvoiceRow = (row: any) => {
  const issuedDate = row.issued_date ?? row.issuedDate ?? null;
  const createdAt = row.created_at ?? row.createdAt ?? null;
  return {
    id: row.id,
    invoiceNumber:
      row.invoice_number ??
      row.invoiceNumber ??
      buildReferenceFromId("INV", row.id, issuedDate || createdAt),
    userId: row.user_id ?? row.userId ?? null,
    serviceRequestId: row.service_request_id ?? row.serviceRequestId ?? null,
    orderId: row.order_id ?? row.orderId ?? null,
    subtotal: row.subtotal,
    taxRate: row.tax_rate ?? row.taxRate,
    taxAmount: row.tax_amount ?? row.taxAmount,
    total: row.total,
    description: row.description ?? null,
    items: row.items ?? [],
    status: row.status,
    issuedDate,
    dueDate: row.due_date ?? row.dueDate ?? null,
    paidDate: row.paid_date ?? row.paidDate ?? null,
    createdAt,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
};

const normalizeBikeRow = (row: any) => ({
  id: row.id,
  userId: row.user_id ?? row.userId ?? null,
  bikeId: row.bike_id ?? row.bikeId ?? null,
  bikeType: row.bike_type ?? row.bikeType ?? null,
  brand: row.brand ?? null,
  model: row.model ?? null,
  year: row.year ?? null,
  totalDistance: row.total_distance ?? row.totalDistance ?? 0,
  imageUrl: row.image_url ?? row.imageUrl ?? null,
  createdAt: row.created_at ?? row.createdAt ?? null,
  updatedAt: row.updated_at ?? row.updatedAt ?? null,
});

const normalizeSupportReplyRow = (row: any) => ({
  id: row.id,
  ticketId: row.ticket_id ?? row.ticketId ?? null,
  senderId: row.sender_id ?? row.senderId ?? null,
  senderRole: row.sender_role ?? row.senderRole ?? "user",
  message: row.message ?? "",
  createdAt: row.created_at ?? row.createdAt ?? null,
});

const normalizeServiceRequestRow = (row: any) => {
  const createdAt = row.created_at ?? row.createdAt ?? null;
  return {
    id: row.id,
    userId: row.user_id ?? row.userId ?? null,
    bikeId: row.bike_id ?? row.bikeId ?? null,
    technicianId: row.technician_id ?? row.technicianId ?? null,
    serviceType: row.service_type ?? row.serviceType ?? null,
    status: row.status ?? null,
    location: row.location ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    notes: row.notes ?? null,
    estimatedCost: row.estimated_cost ?? row.estimatedCost ?? null,
    trackingSteps: row.tracking_steps ?? row.trackingSteps ?? [],
    route: row.route ?? row.route_data ?? row.routeData ?? null,
    createdAt,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    orderNumber: row.order_number ?? row.orderNumber ?? buildReferenceFromId("ORD", row.id, createdAt),
  };
};

const normalizeNotificationRow = (row: any) => ({
  id: row.id,
  userId: row.user_id ?? row.userId ?? null,
  role: row.role ?? null,
  title: row.title ?? "",
  message: row.message ?? "",
  emoji: row.emoji ?? null,
  type: row.type ?? null,
  entityType: row.entity_type ?? row.entityType ?? null,
  entityId: row.entity_id ?? row.entityId ?? null,
  state: row.state ?? null,
  activityType: row.activity_type ?? row.activityType ?? null,
  activityId: row.activity_id ?? row.activityId ?? null,
  activityState: row.activity_state ?? row.activityState ?? null,
  liveActivityPayload: row.live_activity_payload ?? row.liveActivityPayload ?? null,
  readAt: row.read_at ?? row.readAt ?? null,
  createdAt: row.created_at ?? row.createdAt ?? null,
});

const normalizePushTokenRow = (row: any) => ({
  id: row.id,
  userId: row.user_id ?? row.userId ?? null,
  token: row.token ?? null,
  tokenType: row.token_type ?? row.tokenType ?? null,
  role: row.role ?? null,
  platform: row.platform ?? null,
  deviceId: row.device_id ?? row.deviceId ?? null,
  appVersion: row.app_version ?? row.appVersion ?? null,
  environment: row.environment ?? null,
  lastSeenAt: row.last_seen_at ?? row.lastSeenAt ?? null,
  createdAt: row.created_at ?? row.createdAt ?? null,
  updatedAt: row.updated_at ?? row.updatedAt ?? null,
  isActive: row.is_active ?? row.isActive ?? null,
});

const normalizeNotificationLogRow = (row: any) => ({
  id: row.id,
  title: row.title ?? "",
  body: row.body ?? "",
  target: row.target ?? null,
  sentBy: row.sent_by ?? row.sentBy ?? null,
  sentAt: row.sent_at ?? row.sentAt ?? null,
  status: row.status ?? null,
});

const buildUserDisplayName = (user?: { firstName?: string | null; lastName?: string | null; email?: string | null }) => {
  if (!user) return null;
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email || null;
};

const NOTIFICATION_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7;

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || "";
const INTERNAL_NOTIFICATION_KEY = process.env.INTERNAL_NOTIFICATION_KEY || "";
const LIVE_ACTIVITIES_ENABLED =
  String(process.env.LIVE_ACTIVITIES_ENABLED || "true").toLowerCase() !== "false";

const buildPushPayload = (notification: any) => {
  const resolvedRole = normalizePushRole(notification.role) ?? notification.role ?? null;
  const data = {
    notificationId: notification.id ?? null,
    type: notification.type ?? null,
    role: resolvedRole,
    entityId: notification.entityId ?? null,
    activityType: notification.activityType ?? null,
    activityId: notification.activityId ?? null,
    activityState: notification.activityState ?? null,
    liveActivityPayload: notification.liveActivityPayload ?? null,
  };
  return {
    title: notification.title,
    body: notification.message,
    data,
  };
};

type LiveActivityPushEvent = "update" | "end";

type LiveActivityContentState = {
  status: string;
  title: string;
  subtitle: string;
  progress: number;
  stageIndex: number;
  totalStages: number;
  timestamp: number;
  technicianName?: string | null;
  etaMinutes?: number | null;
  locale: string;
};

const normalizeLiveActivityStatus = (status?: string | null) => {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "assigned_to_technician") return "assigned";
  if (raw === "accepted") return "assigned";
  if (raw === "rejected_by_technician") return "cancelled";
  return raw;
};

const buildLiveActivityContentState = (params: {
  status: string;
  title?: string | null;
  subtitle?: string | null;
  message?: string | null;
  lang: Language;
  technicianName?: string | null;
  etaMinutes?: number | null;
}) => {
  const normalized = normalizeLiveActivityStatus(params.status);
  if (!normalized) return null;
  const stageMap: Record<string, { progress: number; stageIndex: number; totalStages: number }> = {
    assigned: { progress: 0.25, stageIndex: 0, totalStages: 4 },
    on_the_way: { progress: 0.5, stageIndex: 1, totalStages: 4 },
    working: { progress: 0.75, stageIndex: 2, totalStages: 4 },
    in_progress: { progress: 0.75, stageIndex: 2, totalStages: 4 },
    completed: { progress: 1, stageIndex: 3, totalStages: 4 },
    cancelled: { progress: 1, stageIndex: 3, totalStages: 4 },
  };
  const stage = stageMap[normalized];
  if (!stage) return null;
  const fallbackTitle = params.lang === "ar" ? "تحديث الطلب" : "Order update";
  const resolvedSubtitle = params.subtitle || params.message || params.title || fallbackTitle;
  return {
    status: normalized,
    title: params.title || fallbackTitle,
    subtitle: resolvedSubtitle,
    progress: stage.progress,
    stageIndex: stage.stageIndex,
    totalStages: stage.totalStages,
    timestamp: Math.floor(Date.now() / 1000),
    technicianName: params.technicianName ?? null,
    etaMinutes: Number.isFinite(params.etaMinutes) ? Number(params.etaMinutes) : null,
    locale: params.lang,
  };
};

const sendLiveActivityUpdate = async (payload: {
  orderId: string;
  status: string;
  title?: string | null;
  subtitle?: string | null;
  message?: string | null;
  lang: Language;
  technicianName?: string | null;
  etaMinutes?: number | null;
  relevanceScore?: number | null;
  staleDate?: number | null;
}): Promise<{ sent: number; failed: number }> => {
  if (!LIVE_ACTIVITIES_ENABLED) {
    console.log("[LIVE_ACTIVITY][SKIPPED][DISABLED]", {
      orderId: payload.orderId,
      status: payload.status,
    });
    return { sent: 0, failed: 0 };
  }
  const state = buildLiveActivityContentState({
    status: payload.status,
    title: payload.title,
    message: payload.message,
    subtitle: payload.subtitle,
    technicianName: payload.technicianName,
    etaMinutes: payload.etaMinutes,
    lang: payload.lang,
  });
  if (!state) return { sent: 0, failed: 0 };

  const normalizedStatus = normalizeLiveActivityStatus(payload.status);
  if (!normalizedStatus) return { sent: 0, failed: 0 };
  const terminal = new Set(["completed", "cancelled"]);
  const event: LiveActivityPushEvent = terminal.has(normalizedStatus) ? "end" : "update";

  const { resp, data } = await pgFetch(
    `/live_activity_tokens?order_id=eq.${encodeURIComponent(payload.orderId)}&is_active=eq.true`,
  );
  if (!resp.ok) {
    console.warn("[LIVE_ACTIVITY][TOKENS][FAILED]", { status: resp.status, body: data });
    return { sent: 0, failed: 0 };
  }
  const tokens = Array.isArray(data) ? data : [];
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const row of tokens) {
    const token = row?.token;
    if (!token) continue;
    const tokenEnv = normalizeApnsEnv(row?.environment ?? null) ?? undefined;
    const response = await sendApnsLiveActivity({
      token,
      event,
      contentState: state,
      timestamp: state.timestamp,
      env: tokenEnv,
      relevanceScore: Number.isFinite(payload.relevanceScore) ? payload.relevanceScore! : undefined,
      staleDate: Number.isFinite(payload.staleDate) ? payload.staleDate! : undefined,
    });
    if (response.ok) {
      sent += 1;
    } else {
      failed += 1;
      const reason = String(response.reason || "").toLowerCase();
      if (response.status === 410 || reason.includes("unregistered")) {
        const tokenId = row?.id;
        if (tokenId) {
          await pgFetch(`/live_activity_tokens?id=eq.${encodeURIComponent(tokenId)}`, {
            method: "PATCH",
            body: { is_active: false, updated_at: new Date().toISOString() },
          }).catch(() => {});
        }
      }
    }
    if (event === "end" && row?.id) {
      await pgFetch(`/live_activity_tokens?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: { is_active: false, updated_at: new Date().toISOString() },
      }).catch(() => {});
    }
  }

  console.log("[LIVE_ACTIVITY][PUSH][RESULT]", {
    orderId: payload.orderId,
    status: payload.status,
    sent,
    failed,
    event,
  });
  return { sent, failed };
};

const isPaymentCompletedForRequest = async (serviceRequestId: string) => {
  if (!serviceRequestId) return false;
  try {
    const { resp, data } = await pgFetch(
      `/invoices?service_request_id=eq.${encodeURIComponent(serviceRequestId)}&status=eq.paid&limit=1`,
    );
    if (!resp.ok) {
      console.warn("[PAYMENT][CHECK][FAILED]", { status: resp.status, body: data });
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.warn("[PAYMENT][CHECK][ERROR]", error);
    return false;
  }
};

const logDeliveryAttempt = async (payload: {
  notificationId: string;
  userId: string;
  token: string;
  platform: string | null;
  status: string;
  response: any;
}) => {
  try {
    await pgFetch("/notification_deliveries", {
      method: "POST",
      body: [
        {
          notification_id: payload.notificationId,
          user_id: payload.userId,
          token: payload.token,
          platform: payload.platform,
          status: payload.status,
          response: payload.response ?? null,
        },
      ],
    });
  } catch (error) {
    console.warn("[NOTIFICATIONS][DELIVERY_LOG][FAILED]", error);
  }
};

const normalizeApnsEnv = (value?: string | null) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "production") return "production" as const;
  if (raw === "development") return "development" as const;
  if (raw === "sandbox") return "development" as const;
  return null;
};

const sendApnsPush = async (
  token: string,
  payload: { title: string; body: string; data: any },
  env?: "development" | "production" | null,
) => {
  const result = await sendApns({
    token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    env: env ?? undefined,
  });
  return {
    ok: result.ok,
    status: result.status ?? (result.ok ? 200 : 500),
    body: result.details ?? { reason: result.reason ?? null, env: result.env },
  };
};

const sendFcmPush = async (token: string, payload: { title: string; body: string; data: any }) => {
  if (!FCM_SERVER_KEY) {
    return { ok: false, status: 500, body: { message: "FCM config missing" } };
  }
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    }),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
};

const resolveNotificationRole = (notification: any) => {
  const direct = normalizePushRole(notification?.role) ?? notification?.role ?? null;
  if (direct) return direct;
  const type = String(notification?.type || "").toLowerCase();
  const activityType = String(notification?.activityType || "").toLowerCase();
  const entityType = String(notification?.entityType || "").toLowerCase();
  if (type === "admin" && entityType === "broadcast") return null;
  if (type.includes("technician") || activityType === "technician_route") return "technician";
  return "customer";
};

const deliverNotificationPush = async (notification: any) => {
  if (!notification?.id || !notification?.userId) return { sent: 0, failed: 0 };
  const resolvedRole = resolveNotificationRole(notification);
  const roleFilter = resolvedRole
    ? resolvedRole === "customer"
      ? `&or=(role.eq.${encodeURIComponent(resolvedRole)},role.is.null)`
      : `&role=eq.${encodeURIComponent(resolvedRole)}`
    : "";
  const { resp, data } = await pgFetch(
    `/push_tokens?user_id=eq.${encodeURIComponent(notification.userId)}&is_active=eq.true${roleFilter}`,
  );
  if (!resp.ok) {
    console.warn("[NOTIFICATIONS][PUSH][TOKENS_FAILED]", { status: resp.status, body: data });
    return { sent: 0, failed: 0 };
  }
  const tokens = Array.isArray(data) ? data.map(normalizePushTokenRow) : [];
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  console.log("[NOTIFICATIONS][PUSH][TOKENS]", {
    notificationId: notification.id,
    userId: notification.userId,
    role: resolvedRole,
    count: tokens.length,
    tokenIds: tokens.map((t) => t.id).filter(Boolean),
    tokenRoles: tokens.map((t) => t.role).filter(Boolean),
    deviceIds: tokens.map((t) => t.deviceId).filter(Boolean),
  });

  const payload = buildPushPayload(notification);
  let sent = 0;
  let failed = 0;

  let allowNullCustomerRole: boolean | null = null;
  for (const tokenRow of tokens) {
    if (tokenRow.userId && tokenRow.userId !== notification.userId) {
      console.warn("[NOTIFICATIONS][PUSH][SKIP][USER_MISMATCH]", {
        notificationId: notification.id,
        tokenId: tokenRow.id,
        tokenUserId: tokenRow.userId,
        targetUserId: notification.userId,
        deviceId: tokenRow.deviceId,
      });
      if (tokenRow.id) {
        await pgFetch(`/push_tokens?id=eq.${encodeURIComponent(tokenRow.id)}`, {
          method: "PATCH",
          body: { is_active: false, updated_at: new Date().toISOString() },
        }).catch(() => {});
      }
      continue;
    }
    const tokenRole = normalizePushRole(tokenRow.role);
    if (resolvedRole && tokenRole && tokenRole !== resolvedRole) {
      console.warn("[NOTIFICATIONS][PUSH][SKIP][ROLE_MISMATCH]", {
        notificationId: notification.id,
        tokenId: tokenRow.id,
        tokenRole,
        targetRole: resolvedRole,
        deviceId: tokenRow.deviceId,
      });
      if (tokenRow.id) {
        await pgFetch(`/push_tokens?id=eq.${encodeURIComponent(tokenRow.id)}`, {
          method: "PATCH",
          body: { is_active: false, updated_at: new Date().toISOString() },
        }).catch(() => {});
      }
      continue;
    }
    if (resolvedRole && !tokenRole && tokenRow.id) {
      if (resolvedRole === "customer") {
        if (allowNullCustomerRole === null) {
          try {
            allowNullCustomerRole = !(await userHasRole(notification.userId, "technician"));
          } catch (error) {
            console.warn("[NOTIFICATIONS][PUSH][ROLE_CHECK_FAILED]", error);
            allowNullCustomerRole = true;
          }
        }
        if (!allowNullCustomerRole) {
          console.warn("[NOTIFICATIONS][PUSH][SKIP][LEGACY_ROLE_NULL]", {
            notificationId: notification.id,
            tokenId: tokenRow.id,
            deviceId: tokenRow.deviceId,
          });
          await pgFetch(`/push_tokens?id=eq.${encodeURIComponent(tokenRow.id)}`, {
            method: "PATCH",
            body: { is_active: false, updated_at: new Date().toISOString() },
          }).catch(() => {});
          continue;
        }
      }
      await pgFetch(`/push_tokens?id=eq.${encodeURIComponent(tokenRow.id)}`, {
        method: "PATCH",
        body: { role: resolvedRole, updated_at: new Date().toISOString() },
      }).catch(() => {});
    }
    const token = tokenRow.token;
    if (!token) continue;
    const platform = tokenRow.platform ?? null;
    const tokenType = tokenRow.tokenType ?? (platform === "ios" ? "apns" : "fcm");
    const tokenEnv = tokenType === "apns" ? normalizeApnsEnv(tokenRow.environment) : null;
    const response =
      tokenType === "apns"
        ? await sendApnsPush(token, payload, tokenEnv)
        : await sendFcmPush(token, payload);
    if (response.ok) {
      sent += 1;
      await logDeliveryAttempt({
        notificationId: notification.id,
        userId: notification.userId,
        token,
        platform,
        status: "sent",
        response: response.body,
      });
    } else {
      failed += 1;
      await logDeliveryAttempt({
        notificationId: notification.id,
        userId: notification.userId,
        token,
        platform,
        status: "failed",
        response: response.body,
      });
    }
  }

  return { sent, failed };
};

const sendNotificationPush = async (notification: any) => {
  if (!notification?.id) return { sent: 0, failed: 0 };
  const delivery = await deliverNotificationPush(notification);
  const nextState = delivery.sent > 0 ? "sent" : "failed";
  await pgFetch(`/notifications?id=eq.${encodeURIComponent(notification.id)}`, {
    method: "PATCH",
    body: { state: nextState },
  }).catch(() => {});
  console.log("[NOTIFICATIONS][PUSH][RESULT]", {
    id: notification.id,
    sent: delivery.sent,
    failed: delivery.failed,
    state: nextState,
  });
  return delivery;
};

function normalizePushRole(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "rider") return "customer";
  if (raw === "technician" || raw === "customer" || raw === "admin") return raw;
  return null;
}

const resolvePushRole = async (payload: {
  userId: string;
  auth?: AuthContext | null;
  requestedRole?: string | null;
}) => {
  const normalized = normalizePushRole(payload.requestedRole);
  if (normalized) return normalized;
  if (payload.auth?.isAdmin) return "admin";
  try {
    const hasTechnicianRole = await userHasRole(payload.userId, "technician");
    if (hasTechnicianRole) return "technician";
  } catch (error) {
    console.warn("[PUSH][ROLE] Failed to resolve roles:", error);
  }
  try {
    const { resp, data } = await pgFetch(
      `/users?id=eq.${encodeURIComponent(payload.userId)}&select=is_technician`,
    );
    if (resp.ok) {
      const row = Array.isArray(data) ? data[0] : data?.[0];
      if (row?.is_technician === true) return "technician";
    }
  } catch (error) {
    console.warn("[PUSH][ROLE] Failed to check user flag:", error);
  }
  return "customer";
};

const buildPushTokenFilter = (payload: {
  token: string;
  tokenType: string;
  platform?: string | null;
  deviceId?: string | null;
}) => {
  const base = [
    `token=eq.${encodeURIComponent(payload.token)}`,
    `token_type=eq.${encodeURIComponent(payload.tokenType)}`,
  ];
  if (payload.platform) {
    base.push(`platform=eq.${encodeURIComponent(payload.platform)}`);
  }
  if (payload.deviceId) {
    base.push(`device_id=eq.${encodeURIComponent(payload.deviceId)}`);
  }
  return `/push_tokens?${base.join("&")}`;
};

const registerDeviceToken = async (payload: {
  userId: string;
  token: string;
  tokenType: "apns" | "fcm";
  role?: string | null;
  platform?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
  environment?: string | null;
}) => {
  const now = new Date().toISOString();
  const resolvedRole = normalizePushRole(payload.role) ?? payload.role ?? null;
  const tokenFilter = buildPushTokenFilter({
    token: payload.token,
    tokenType: payload.tokenType,
    platform: null,
    deviceId: null,
  });

  await pgFetch(`${tokenFilter}&user_id=neq.${encodeURIComponent(payload.userId)}`, {
    method: "PATCH",
    body: { is_active: false, updated_at: now },
  }).catch(() => {});

  if (payload.deviceId) {
    const baseFilters = [
      `device_id=eq.${encodeURIComponent(payload.deviceId)}`,
      `token_type=eq.${encodeURIComponent(payload.tokenType)}`,
      `token=neq.${encodeURIComponent(payload.token)}`,
    ];
    if (payload.platform) {
      baseFilters.push(`platform=eq.${encodeURIComponent(payload.platform)}`);
    }
    await pgFetch(`/push_tokens?${baseFilters.join("&")}`, {
      method: "PATCH",
      body: { is_active: false, updated_at: now },
    }).catch(() => {});
  }

  const { resp, data } = await pgFetch("/push_tokens?on_conflict=user_id,token,token_type", {
    method: "POST",
    body: [
      {
        user_id: payload.userId,
        token: payload.token,
        token_type: payload.tokenType,
        role: resolvedRole,
        platform: payload.platform || null,
        device_id: payload.deviceId || null,
        app_version: payload.appVersion || null,
        environment: payload.environment || null,
        last_seen_at: now,
        updated_at: now,
        is_active: true,
      },
    ],
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  });
  if (!resp.ok) {
    console.warn("[PUSH][REGISTER][FAILED]", { status: resp.status, body: data });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data?.[0];
  return row ? normalizePushTokenRow(row) : null;
};

const registerLiveActivityToken = async (payload: {
  userId: string;
  orderId: string;
  orderNumber?: string | null;
  token: string;
  activityId?: string | null;
  environment?: string | null;
}) => {
  const now = new Date().toISOString();
  await pgFetch(
    `/live_activity_tokens?order_id=eq.${encodeURIComponent(payload.orderId)}&user_id=eq.${encodeURIComponent(payload.userId)}&token=neq.${encodeURIComponent(payload.token)}`,
    {
      method: "PATCH",
      body: { is_active: false, updated_at: now },
    },
  ).catch(() => {});

  const { resp, data } = await pgFetch("/live_activity_tokens?on_conflict=order_id,token", {
    method: "POST",
    body: [
      {
        order_id: payload.orderId,
        user_id: payload.userId,
        order_number: payload.orderNumber || null,
        token: payload.token,
        activity_id: payload.activityId || null,
        environment: payload.environment || null,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ],
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  });
  if (!resp.ok) {
    console.warn("[LIVE_ACTIVITY][REGISTER][FAILED]", { status: resp.status, body: data });
    return null;
  }
  return Array.isArray(data) ? data[0] : data?.[0];
};

async function createNotification(payload: {
  userId: string;
  role?: string | null;
  title: string;
  message: string;
  emoji?: string | null;
  type?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  state?: string | null;
  activityType?: string | null;
  activityId?: string | null;
  activityState?: string | null;
  liveActivityPayload?: any;
  sendPush?: boolean;
}) {
  try {
    const body = {
      user_id: payload.userId,
      role: payload.role ?? null,
      title: payload.title,
      message: payload.message,
      emoji: payload.emoji || null,
      type: payload.type || null,
      entity_type: payload.entityType || null,
      entity_id: payload.entityId || null,
      state: payload.state ?? "created",
      activity_type: payload.activityType ?? null,
      activity_id: payload.activityId ?? null,
      activity_state: payload.activityState ?? null,
      live_activity_payload: payload.liveActivityPayload ?? null,
    };
    const { resp, data } = await pgFetch("/notifications", {
      method: "POST",
      body: [body],
      headers: { Prefer: "return=representation" },
    });
    if (!resp.ok) {
      console.warn("[NOTIFICATIONS][CREATE][FAILED]", data);
      return null;
    }
    const created = Array.isArray(data) ? data[0] : data?.[0] ?? data;
    const normalized = created ? normalizeNotificationRow(created) : null;
    if (normalized) {
      console.log("[NOTIFICATIONS][CREATED]", {
        id: normalized.id,
        userId: normalized.userId,
        type: normalized.type,
        state: normalized.state,
      });
    }
    if (normalized && payload.sendPush !== false) {
      await sendNotificationPush(normalized);
    }
    return normalized;
  } catch (error) {
    console.warn("[NOTIFICATIONS][CREATE][FAILED]", error);
    return null;
  }
}

type SystemNotificationEvent =
  | "ORDER_CREATED"
  | "ORDER_PAID"
  | "TECHNICIAN_ASSIGNED"
  | "TECHNICIAN_ACCEPTED"
  | "TECHNICIAN_ON_THE_WAY"
  | "TECHNICIAN_ARRIVED"
  | "SERVICE_STARTED"
  | "SERVICE_COMPLETED"
  | "SERVICE_CANCELLED";

const SYSTEM_EVENT_BY_STATUS: Record<string, SystemNotificationEvent> = {
  pending: "ORDER_CREATED",
  awaiting_payment: "ORDER_CREATED",
  payment_completed: "ORDER_PAID",
  accepted: "TECHNICIAN_ACCEPTED",
  assigned: "TECHNICIAN_ASSIGNED",
  assigned_to_technician: "TECHNICIAN_ASSIGNED",
  on_the_way: "TECHNICIAN_ON_THE_WAY",
  working: "SERVICE_STARTED",
  in_progress: "SERVICE_STARTED",
  completed: "SERVICE_COMPLETED",
  cancelled: "SERVICE_CANCELLED",
  rejected_by_technician: "SERVICE_CANCELLED",
};

const SYSTEM_NOTIFICATION_COPY: Record<SystemNotificationEvent, {
  ar: { title: string; message: string };
  en: { title: string; message: string };
  emoji: string;
  activityState?: string | null;
}> = {
  ORDER_CREATED: {
    ar: { title: "تم تأكيد طلبك بنجاح", message: "تم تأكيد طلبك بنجاح ✅" },
    en: { title: "Order confirmed", message: "Your order has been confirmed ✅" },
    emoji: "✅",
    activityState: null,
  },
  ORDER_PAID: {
    ar: { title: "تم استلام الدفع بنجاح", message: "تم استلام الدفع بنجاح 💳" },
    en: { title: "Payment received", message: "Payment received successfully 💳" },
    emoji: "💳",
    activityState: null,
  },
  TECHNICIAN_ASSIGNED: {
    ar: { title: "تم تعيين فني لطلبك", message: "تم تعيين فني لطلبك 👨‍🔧" },
    en: { title: "Technician assigned", message: "A technician was assigned to your request 👨‍🔧" },
    emoji: "👨‍🔧",
    activityState: "assigned",
  },
  TECHNICIAN_ACCEPTED: {
    ar: { title: "قام الفني بقبول طلبك", message: "قام الفني بقبول طلبك 👍" },
    en: { title: "Technician accepted", message: "Your technician accepted the request 👍" },
    emoji: "👍",
    activityState: "assigned",
  },
  TECHNICIAN_ON_THE_WAY: {
    ar: { title: "الفني في الطريق إليك", message: "الفني في الطريق إليك 🚴‍♂️" },
    en: { title: "Technician on the way", message: "Your technician is on the way 🚴‍♂️" },
    emoji: "🚴‍♂️",
    activityState: "on_the_way",
  },
  TECHNICIAN_ARRIVED: {
    ar: { title: "وصل الفني إلى موقعك", message: "وصل الفني إلى موقعك 📍" },
    en: { title: "Technician arrived", message: "The technician arrived at your location 📍" },
    emoji: "📍",
    activityState: null,
  },
  SERVICE_STARTED: {
    ar: { title: "بدأ الفني العمل على طلبك", message: "بدأ الفني العمل على طلبك 🛠️" },
    en: { title: "Service started", message: "The technician started working 🛠️" },
    emoji: "🛠️",
    activityState: "started",
  },
  SERVICE_COMPLETED: {
    ar: { title: "تم إنجاز الطلب بنجاح", message: "تم إنجاز الطلب بنجاح 🎉" },
    en: { title: "Service completed", message: "Your request has been completed 🎉" },
    emoji: "🎉",
    activityState: "completed",
  },
  SERVICE_CANCELLED: {
    ar: { title: "تم إلغاء الطلب", message: "تم إلغاء الطلب ❌" },
    en: { title: "Service cancelled", message: "The request has been cancelled ❌" },
    emoji: "❌",
    activityState: null,
  },
};

const resolveSystemEvent = (eventOrStatus: string): SystemNotificationEvent | null => {
  if (!eventOrStatus) return null;
  if (SYSTEM_NOTIFICATION_COPY[eventOrStatus as SystemNotificationEvent]) {
    return eventOrStatus as SystemNotificationEvent;
  }
  return SYSTEM_EVENT_BY_STATUS[eventOrStatus] || null;
};

const resolveLiveActivityState = (eventOrStatus: string, event: SystemNotificationEvent): string | null => {
  const normalized = String(eventOrStatus || "").trim();
  const directStates = new Set([
    "assigned",
    "assigned_to_technician",
    "accepted",
    "on_the_way",
    "working",
    "in_progress",
    "completed",
    "cancelled",
    "rejected_by_technician",
  ]);
  if (directStates.has(normalized)) {
    if (normalized === "assigned_to_technician") return "assigned";
    if (normalized === "accepted") return "assigned";
    if (normalized === "rejected_by_technician") return "cancelled";
    return normalized;
  }

  switch (event) {
    case "TECHNICIAN_ACCEPTED":
      return "assigned";
    case "TECHNICIAN_ASSIGNED":
      return "assigned";
    case "TECHNICIAN_ON_THE_WAY":
      return "on_the_way";
    case "SERVICE_STARTED":
      return "working";
    case "SERVICE_COMPLETED":
      return "completed";
    case "SERVICE_CANCELLED":
      return "cancelled";
    default:
      return null;
  }
};

const triggerSystemNotification = async (
  eventOrStatus: string,
  context: { userId: string; orderId: string; technicianId?: string | null; extraData?: any },
  lang: Language,
) => {
  const event = resolveSystemEvent(eventOrStatus);
  if (!event) return null;
  const copy = SYSTEM_NOTIFICATION_COPY[event];
  const isArabic = lang === "ar";
  const text = isArabic ? copy.ar : copy.en;
  const resolvedActivityState = resolveLiveActivityState(eventOrStatus, event);
  const created = await createNotification({
    userId: context.userId,
    role: "customer",
    title: text.title,
    message: text.message,
    emoji: copy.emoji,
    type: "order_update",
    entityType: "service_request",
    entityId: context.orderId,
    activityType: "order_tracking",
    activityId: context.orderId,
    activityState: resolvedActivityState ?? copy.activityState ?? null,
    liveActivityPayload: context.extraData?.liveActivityPayload ?? null,
    sendPush: false,
  });
  if (created) {
    await sendNotificationPush(created);
    if (resolvedActivityState) {
      await sendLiveActivityUpdate({
        orderId: context.orderId,
        status: resolvedActivityState,
        title: text.title,
        message: text.message,
        lang,
      });
    }
  }
  return created;
};

async function maybeCreateMaintenanceNotification(userId: string, status: string, remainingKm: number, lang: Language) {
  if (status !== "NEAR" && status !== "OVERDUE") return;
  const type = status === "OVERDUE" ? "maintenance_overdue" : "maintenance_near";
  try {
    const { resp, data } = await pgFetch(
      `/notifications?user_id=eq.${encodeURIComponent(userId)}&type=eq.${type}&order=created_at.desc&limit=1`,
    );
    if (resp.ok && Array.isArray(data) && data.length > 0) {
      const latest = data[0];
      const lastCreated = new Date(latest.created_at || latest.createdAt || 0).getTime();
      if (Number.isFinite(lastCreated) && Date.now() - lastCreated < NOTIFICATION_COOLDOWN_MS) {
        return;
      }
    }

    const isArabic = lang === "ar";
    const emoji = status === "OVERDUE" ? "⚠️" : "🔧";
    const title = status === "OVERDUE"
      ? (isArabic ? "صيانة مستحقة" : "Maintenance overdue")
      : (isArabic ? "موعد صيانة قريب" : "Maintenance due soon");
    const message = status === "OVERDUE"
      ? (isArabic
          ? "تجاوزت حد الصيانة. ننصحك بحجز صيانة الآن."
          : "You are overdue for maintenance. Please book a service.")
      : (isArabic
          ? `متبقي تقريبًا ${Math.max(0, remainingKm).toFixed(0)} كم قبل الصيانة.`
          : `About ${Math.max(0, remainingKm).toFixed(0)} km left before service.`);

    await createNotification({
      userId,
      role: "customer",
      title,
      message,
      emoji,
      type,
      entityType: "maintenance",
    });
  } catch (error) {
    console.warn("[NOTIFICATIONS][MAINTENANCE][FAILED]", error);
  }
}

async function attachSupportReplies(tickets: any[]) {
  if (!Array.isArray(tickets) || tickets.length === 0) return [];
  const ticketIds = tickets.map((ticket) => ticket?.id).filter(Boolean);
  if (ticketIds.length === 0) return tickets;
  const ids = ticketIds.map((id) => encodeURIComponent(id)).join(",");
  const { resp, data } = await pgFetch(
    `/support_ticket_replies?ticket_id=in.(${ids})&order=created_at.asc`,
  );
  if (!resp.ok) {
    console.warn("[SUPPORT][REPLIES][FETCH_FAILED]", { status: resp.status, body: data });
    return tickets;
  }
  const replies = Array.isArray(data) ? data.map(normalizeSupportReplyRow) : [];
  const byTicket = new Map<string, any[]>();
  for (const reply of replies) {
    if (!reply.ticketId) continue;
    const bucket = byTicket.get(reply.ticketId) ?? [];
    bucket.push(reply);
    byTicket.set(reply.ticketId, bucket);
  }
  return tickets.map((ticket) => ({
    ...ticket,
    replies: byTicket.get(ticket.id) ?? [],
  }));
}

const normalizeDiscountCodeRow = (row: any) => ({
  id: row.id,
  code: row.code,
  discountType: row.discount_type ?? row.discountType ?? null,
  discountValue: row.discount_value ?? row.discountValue ?? null,
  maxUses: row.max_uses ?? row.maxUses ?? null,
  currentUses: row.current_uses ?? row.currentUses ?? null,
  isActive: row.is_active ?? row.isActive ?? false,
  expiresAt: row.expires_at ?? row.expiresAt ?? null,
  createdBy: row.created_by ?? row.createdBy ?? null,
  createdAt: row.created_at ?? row.createdAt ?? null,
  updatedAt: row.updated_at ?? row.updatedAt ?? null,
});

const DISCOUNT_INVALID_MESSAGES: Record<Language, string> = {
  ar: "كود الخصم غير صالح",
  en: "Discount code is invalid",
};

const respondDiscountInvalid = (req: any, res: any, context?: Record<string, any>) => {
  if (context) {
    console.warn("[DISCOUNT][INVALID]", context);
  }
  const lang = getRequestLang(req);
  return res.status(400).json({ code: "DISCOUNT_INVALID", message: DISCOUNT_INVALID_MESSAGES[lang] });
};

const normalizeDiscountCodeInput = (value?: string | null) => {
  const normalized = (value || "").trim().toUpperCase();
  if (!normalized) return "";
  return normalized.replace(/-+$/, "");
};

const parseDiscountNumber = (value: any) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const validateDiscountCode = (discount: any) => {
  if (!discount) return { ok: false, reason: "not_found" };
  if (discount.isActive === false || discount.is_active === false) {
    return { ok: false, reason: "inactive" };
  }
  const expiresAt = discount.expiresAt ?? discount.expires_at;
  if (expiresAt) {
    const expiry = new Date(expiresAt);
    if (Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
  }
  const maxUses = discount.maxUses ?? discount.max_uses;
  const currentUses = discount.currentUses ?? discount.current_uses ?? 0;
  if (Number.isFinite(maxUses) && Number(maxUses) > 0 && Number(currentUses) >= Number(maxUses)) {
    return { ok: false, reason: "usage_limit" };
  }
  return { ok: true };
};

const computeDiscountAmount = (subtotal: number, discount: any) => {
  const safeSubtotal = Number.isFinite(subtotal) ? subtotal : 0;
  if (safeSubtotal <= 0) return 0;
  const discountType = (discount.discountType ?? discount.discount_type ?? "").toString();
  const discountValue = parseDiscountNumber(discount.discountValue ?? discount.discount_value);
  if (discountValue <= 0) return 0;
  const rawAmount =
    discountType === "percentage"
      ? (safeSubtotal * discountValue) / 100
      : discountType === "fixed"
      ? discountValue
      : 0;
  const bounded = Math.min(Math.max(rawAmount, 0), safeSubtotal);
  return Number(bounded.toFixed(2));
};

const applyDiscountToTotals = ({
  subtotal,
  taxRate,
  discountAmount,
}: {
  subtotal: number;
  taxRate: number;
  discountAmount: number;
}) => {
  const safeSubtotal = Number.isFinite(subtotal) ? subtotal : 0;
  const safeDiscount = Number.isFinite(discountAmount) ? discountAmount : 0;
  const discountedSubtotal = Math.max(safeSubtotal - safeDiscount, 0);
  const rate = Number.isFinite(taxRate) ? taxRate : 15;
  const taxAmount = Number(((discountedSubtotal * rate) / 100).toFixed(2));
  const total = Number((discountedSubtotal + taxAmount).toFixed(2));
  return { discountedSubtotal, taxAmount, total, taxRate: rate };
};

const fetchDiscountCodeByValue = async (code: string) => {
  const normalized = normalizeDiscountCodeInput(code);
  if (!normalized) return null;
  try {
    const discount = await storage.getDiscountCode(normalized);
    return discount ? normalizeDiscountCodeRow(discount) : null;
  } catch (error) {
    console.warn("[DISCOUNT][FETCH] storage fallback", error);
    try {
      const { resp, data } = await pgFetch(
        `/discount_codes?code=eq.${encodeURIComponent(normalized)}&limit=1`,
      );
      if (!resp.ok) return null;
      const row = Array.isArray(data) ? data[0] : data?.[0];
      return row ? normalizeDiscountCodeRow(row) : null;
    } catch {
      return null;
    }
  }
};

const incrementDiscountUsage = async (discount: any) => {
  if (!discount?.id) return;
  const currentUses = Number(discount.currentUses ?? discount.current_uses ?? 0);
  const nextUses = Number.isFinite(currentUses) ? currentUses + 1 : 1;
  try {
    await pgFetch(`/discount_codes?id=eq.${encodeURIComponent(discount.id)}`, {
      method: "PATCH",
      body: { current_uses: nextUses },
      headers: { Prefer: "return=representation" },
    });
  } catch (error) {
    console.warn("[DISCOUNT][USAGE] Failed to increment usage", error);
  }
};

const profilePhotoUpload = (req: any, res: any, next: any) => {
  upload.single("photo")(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ code: "PHOTO_TOO_LARGE", message: "Image too large (max 20MB)" });
      }
      return res.status(400).json({ code: "PHOTO_UPLOAD_INVALID", message: err.message || "Invalid photo upload" });
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ message: "No photo uploaded" });
    }
    if (!file.mimetype?.startsWith("image/")) {
      return res.status(400).json({ message: "Invalid image type" });
    }
    next();
  });
};

async function fetchUserRest(userId: string) {
  const { resp, data } = await pgFetch(
    `/users?id=eq.${encodeURIComponent(userId)}&select=id,first_name,last_name,email,phone,profile_image_url,avatar_url,auth_provider,auth_provider_id,is_admin&limit=1`,
  );
  if (!resp.ok) {
    console.warn("[PROFILE][REST][FETCH_FAILED]", { status: resp.status, body: data });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data?.[0];
  return normalizeUserRow(row);
}

async function upsertUserRest(payload: Record<string, any>) {
  const { resp, data } = await pgFetch("/users", {
    method: "POST",
    body: [payload],
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  });
  if (!resp.ok) {
    console.warn("[PROFILE][REST][UPSERT_FAILED]", { status: resp.status, body: data });
    throw new Error("PROFILE_REST_UPSERT_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data?.[0];
  return normalizeUserRow(row);
}

async function updateUserRest(userId: string, payload: Record<string, any>) {
  const { resp, data } = await pgFetch(`/users?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: payload,
    headers: { Prefer: "return=representation" },
  });
  if (!resp.ok) {
    console.warn("[PROFILE][REST][UPDATE_FAILED]", { status: resp.status, body: data });
    throw new Error("PROFILE_REST_UPDATE_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data?.[0];
  return normalizeUserRow(row);
}

async function getStravaAccount(userId: string) {
  const { resp, data } = await pgFetch(
    `/user_strava_accounts?user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (!resp.ok) {
    console.warn("[STRAVA][ACCOUNT][FETCH_FAILED]", { status: resp.status, body: data });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data?.[0];
  return row || null;
}

async function upsertStravaAccount(payload: Record<string, any>) {
  const { resp, data } = await pgFetch("/user_strava_accounts?on_conflict=user_id", {
    method: "POST",
    body: [payload],
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  });
  if (!resp.ok) {
    console.warn("[STRAVA][ACCOUNT][UPSERT_FAILED]", { status: resp.status, body: data });
    throw new Error("STRAVA_ACCOUNT_UPSERT_FAILED");
  }
  return Array.isArray(data) ? data[0] : data?.[0];
}

async function getLastMaintenanceDate(userUuid: string): Promise<string | null> {
  try {
    const { resp: bikesResp, data: bikesData } = await pgFetch(
      `/bikes?user_id=eq.${encodeURIComponent(userUuid)}&select=id`,
    );
    if (!bikesResp.ok) return null;
    const bikes = Array.isArray(bikesData) ? bikesData : [];
    const bikeIds = bikes.map((bike: any) => bike?.id).filter(Boolean);
    if (bikeIds.length === 0) return null;
    const ids = bikeIds.map((id: string) => encodeURIComponent(id)).join(",");
    const { resp: recordsResp, data: recordsData } = await pgFetch(
      `/maintenance_records?bike_id=in.(${ids})&select=created_at&order=created_at.desc&limit=1`,
    );
    if (!recordsResp.ok) return null;
    const row = Array.isArray(recordsData) ? recordsData[0] : recordsData?.[0];
    return row?.created_at || null;
  } catch (error: any) {
    console.error("[STRAVA][MAINTENANCE][FETCH_FAILED]", { message: error?.message });
    return null;
  }
}

async function removeStravaAccount(userUuid: string) {
  const { resp, data } = await pgFetch(
    `/user_strava_accounts?user_id=eq.${encodeURIComponent(userUuid)}`,
    { method: "DELETE" },
  );
  if (!resp.ok) {
    console.warn("[STRAVA][ACCOUNT][DELETE_FAILED]", { status: resp.status, body: data });
  }
}

async function refreshStravaAccount(account: any, userUuid: string) {
  let refreshResp: Response;
  let refreshData: any = {};
  try {
    refreshResp = await fetch(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        refresh_token: account.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    refreshData = await refreshResp.json().catch(() => ({}));
  } catch (error: any) {
    console.error("[STRAVA][REFRESH] Network error", { message: error?.message });
    return {
      account: null,
      error: {
        status: "NETWORK_ERROR",
        code: "NETWORK_ERROR",
      },
    };
  }
  if (!refreshResp.ok) {
    console.error("[STRAVA][REFRESH] Failed", { status: refreshResp.status, body: refreshData });
    return {
      account: null,
      error: {
        status: refreshResp.status,
        code: refreshData?.error || null,
        body: refreshData,
      },
    };
  }
  const expiresAt = computeExpiresAt(refreshData);
  try {
    const updated = await upsertStravaAccount({
      user_id: userUuid,
      athlete_id: refreshData?.athlete?.id || account.athlete_id,
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token || account.refresh_token,
      expires_at: expiresAt,
    });
    return { account: updated, error: null };
  } catch (error: any) {
    console.error("[STRAVA][REFRESH] Upsert failed", { message: error?.message });
    return {
      account: null,
      error: {
        status: "UPSERT_FAILED",
        code: "UPSERT_FAILED",
      },
    };
  }
}

const buildTemporaryStravaResponse = (
  status: string = "temporary_unavailable",
  message: string = "Strava is temporarily unavailable. Try again later.",
) => {
  const serviceIntervalKm = 150;
  const summary = {
    rideCount: 0,
    totalDistanceKm: 0,
    lastRide: null,
    distanceSinceLastServiceKm: 0,
    remainingKm: serviceIntervalKm,
    maintenanceStatus: "OK",
    serviceIntervalKm,
  };
  return {
    connected: true,
    activities: [],
    summary,
    rideCount: summary.rideCount,
    totalDistanceKm: summary.totalDistanceKm,
    lastRide: summary.lastRide,
    lastServiceAt: null,
    distanceSinceLastServiceKm: summary.distanceSinceLastServiceKm,
    remainingKm: summary.remainingKm,
    maintenanceStatus: summary.maintenanceStatus,
    serviceIntervalKm: summary.serviceIntervalKm,
    sync: {
      status,
      message,
    },
  };
};

const handleProfileAvatarUpload = async (req: any, res: any) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED", reason: "missing_token" });
    }
    const userUuid = await ensureUserUuid(auth);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ message: "No photo uploaded" });
    }

    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
    const path = `profile-avatars/${userUuid}/${Date.now()}.${ext}`;

    let targetBucket = PROFILE_IMAGE_BUCKET;
    try {
      await ensureStorageBucket(targetBucket, { public: true });
    } catch (error: any) {
      if (error?.message === "STORAGE_CONFIG_MISSING") {
        console.error("[PROFILE][AVATAR][CONFIG_MISSING]", {
          bucket: targetBucket,
          message: error?.message,
        });
        return res
          .status(503)
          .json({ code: "PROFILE_STORAGE_UNAVAILABLE", message: "Profile image storage is not available" });
      }
      const fallbackBucket = process.env.TECHNICIAN_DOCS_BUCKET || "technician-docs";
      console.error("[PROFILE][AVATAR][BUCKET]", {
        bucket: targetBucket,
        message: error?.message,
        fallback: fallbackBucket,
      });
      targetBucket = fallbackBucket;
    }

    console.log("[PROFILE][AVATAR][UPLOAD]", {
      bucket: targetBucket,
      path,
      size: file.size,
      contentType: file.mimetype,
    });

    let publicUrl: string;
    try {
      publicUrl = await uploadToStorageRest({
        file,
        path,
        bucket: targetBucket,
      });
    } catch (error: any) {
      console.error("[PROFILE][AVATAR][UPLOAD_FAILED]", {
        bucket: targetBucket,
        path,
        message: error?.message,
      });
      return res.status(500).json({ code: "PROFILE_UPLOAD_FAILED", message: "Failed to upload profile image" });
    }

    let saved = false;
    let savedUrl: string | null = null;
    try {
      const user = await storage.upsertUser({
        id: userUuid,
        profileImageUrl: publicUrl,
        avatarUrl: publicUrl,
      });
      saved = true;
      savedUrl = user?.avatarUrl || user?.profileImageUrl || null;
    } catch (error: any) {
      console.error("[PROFILE][AVATAR][SAVE_FAILED]", {
        userId: userUuid,
        message: error?.message,
      });
      try {
        const restUser = await updateUserRest(userUuid, {
          profile_image_url: publicUrl,
          avatar_url: publicUrl,
        });
        saved = true;
        savedUrl = restUser?.avatarUrl || restUser?.profileImageUrl || null;
      } catch (restError: any) {
        console.error("[PROFILE][AVATAR][REST_SAVE_FAILED]", {
          userId: userUuid,
          message: restError?.message,
        });
      }
    }

    return res.json({ imageUrl: savedUrl || publicUrl, uploaded: true, saved });
  } catch (error: any) {
    console.error("[PROFILE][AVATAR] Error:", { message: error?.message, stack: error?.stack });
    return res.status(500).json({ message: "Failed to upload profile photo" });
  }
};

const buildShortReference = (prefix: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, "");
  const randPart = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-${datePart}-${randPart}`;
};

const buildOrderNumber = () => buildShortReference("ORD");
const buildInvoiceNumber = () => buildShortReference("INV");
const buildServiceOrderNumber = (requestId?: string, createdAt?: string) => {
  if (!requestId) return buildOrderNumber();
  const dateSource = createdAt ? new Date(createdAt) : new Date();
  const datePart = dateSource.toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = requestId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ORD-${datePart}-${suffix}`;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type AuthContext = {
  userId: string;
  isAdmin: boolean;
  email?: string;
  phoneNumber?: string;
};

const parseEnvList = (value?: string) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeTestPhone = (phone?: string | null): string | null => {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  const normalized = digits.slice(-9);
  return normalized || null;
};

const testUserEmailSet = new Set(parseEnvList(process.env.TEST_USER_EMAILS).map((email) => email.toLowerCase()));
const testUserIdSet = new Set(parseEnvList(process.env.TEST_USER_UIDS));
const testUserPhoneSet = new Set(
  parseEnvList(process.env.TEST_USER_PHONES)
    .map((phone) => normalizeTestPhone(phone))
    .filter((phone): phone is string => !!phone),
);

function isTestUser(auth: AuthContext | null): boolean {
  if (!auth) return false;
  if (auth.email && testUserEmailSet.has(auth.email.toLowerCase())) return true;
  if (testUserIdSet.has(auth.userId)) return true;
  const normalizedPhone = normalizeTestPhone(auth.phoneNumber);
  if (normalizedPhone && testUserPhoneSet.has(normalizedPhone)) return true;
  return false;
}

function canUseTestMode(auth: AuthContext | null): boolean {
  return !!auth && (auth.isAdmin || isTestUser(auth));
}

// Role helpers (primary source: roles + user_roles)
let roleCache: { byName: Record<string, Role>; lastFetched?: number } = {
  byName: {},
};

const DEFAULT_ROLES = [
  "admin",
  "project_manager",
  "technician",
  "marketing",
  "sales",
  "support",
];

async function loadRolesFromDb(): Promise<Role[]> {
  try {
    return await storage.getAllRoles();
  } catch (error) {
    console.warn("[ROLES][LIST] storage failed, falling back to REST", error);
    const { resp, data } = await pgFetch("/roles?order=created_at.desc");
    if (!resp.ok) {
      console.warn("[ROLES][LIST] REST failed", { status: resp.status, body: data });
      return [];
    }
    return Array.isArray(data) ? (data as Role[]) : [];
  }
}

async function ensureDefaultRoles(): Promise<void> {
  const roles = await loadRolesFromDb();
  const existing = new Set((roles || []).map((role) => role.name));
  const missing = DEFAULT_ROLES.filter((name) => !existing.has(name));
  if (missing.length === 0) return;

  for (const name of missing) {
    try {
      const { resp } = await pgFetch("/roles", {
        method: "POST",
        body: [{ name, description: `${name} role` }],
        headers: { Prefer: "return=representation" },
      });
      if (!resp.ok) {
        console.warn("[ROLES][CREATE] Failed", { name, status: resp.status });
      }
    } catch (error) {
      console.warn("[ROLES][CREATE] Error", { name, error });
    }
  }
}

async function getRoleByName(name: string): Promise<Role | undefined> {
  const now = Date.now();
  const cacheHit =
    roleCache.byName[name] && roleCache.lastFetched && now - roleCache.lastFetched < 5 * 60 * 1000;
  if (cacheHit) return roleCache.byName[name];

  const roles = await loadRolesFromDb();
  roleCache = {
    byName: roles.reduce((acc, r) => {
      acc[r.name] = r;
      return acc;
    }, {} as Record<string, Role>),
    lastFetched: now,
  };
  return roleCache.byName[name];
}

async function ensureRoleAssignment(userUuid: string, roleName: string, assignerId: string) {
  let role = await getRoleByName(roleName);
  if (!role) {
    const { resp, data } = await pgFetch("/roles", {
      method: "POST",
      body: [{ name: roleName, description: `${roleName} role` }],
      headers: { Prefer: "return=representation" },
    });
    if (!resp.ok) {
      throw new Error(`Failed to create role ${roleName}`);
    }
    const created = Array.isArray(data) ? data[0] : data;
    role = created as Role;
    // refresh cache
    roleCache.byName[roleName] = role;
    roleCache.lastFetched = Date.now();
  }
  try {
    await storage.assignUserRole(userUuid, role.id, assignerId);
  } catch (err: any) {
    if (err?.message?.includes("already has this role")) {
      return;
    }
    try {
      const { resp: existingResp, data: existingData } = await pgFetch(
        `/user_roles?user_id=eq.${encodeURIComponent(userUuid)}&role_id=eq.${encodeURIComponent(role.id)}&limit=1`,
      );
      if (existingResp.ok) {
        const existing = Array.isArray(existingData) ? existingData[0] : existingData?.[0];
        if (existing) return;
      }
      await pgFetch("/user_roles", {
        method: "POST",
        body: [{ user_id: userUuid, role_id: role.id, assigned_by: assignerId }],
        headers: { Prefer: "return=representation" },
      });
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}

async function ensureTechnicianRoleFromProfile(userUuid: string): Promise<boolean> {
  const { resp, data } = await pgFetch(
    `/technicians?user_id=eq.${encodeURIComponent(userUuid)}&select=id,status,is_active,is_approved&limit=1`,
  );
  if (!resp.ok) return false;
  const technician = Array.isArray(data) ? data[0] : data?.[0];
  if (!technician) return false;
  const status = String(technician.status || "").toLowerCase();
  const isApprovedStatus = status === "approved";
  if (!isApprovedStatus || technician.is_active === false) return false;
  try {
    await ensureRoleAssignment(userUuid, "technician", userUuid);
  } catch (error) {
    console.warn("[TECH][ROLE] Auto-assign failed", error);
    return false;
  }
  if (technician.is_approved === false) {
    await pgFetch(`/technicians?id=eq.${encodeURIComponent(technician.id)}`, {
      method: "PATCH",
      body: { is_approved: true },
      headers: { Prefer: "return=representation" },
    }).catch(() => {});
  }
  return true;
}

async function userHasRole(userUuid: string, roleName: string): Promise<boolean> {
  const role = await getRoleByName(roleName);
  if (!role) return false;
  try {
    const userRoles = await storage.getUserRoles(userUuid);
    return userRoles.some((ur) => ur.roleId === role.id);
  } catch (error) {
    console.warn("[ROLES][USER] storage failed, falling back to REST", error);
    const { resp, data } = await pgFetch(
      `/user_roles?user_id=eq.${encodeURIComponent(userUuid)}&select=id,role_id`,
    );
    if (!resp.ok) return false;
    const roles = Array.isArray(data) ? data : [];
    return roles.some((ur: any) => ur.role_id === role.id);
  }
}

async function requireRoleOrAdmin(
  req: any,
  res: any,
  roleName: string,
): Promise<{ ok: true; userUuid: string; auth: AuthContext }> {
  const auth = getAuthContext(req);
  if (!auth) {
    res.status(401).json({ message: "Unauthorized" });
    return { ok: false, userUuid: "", auth: null as any };
  }
  const userUuid = await ensureUserUuid(auth);
  if (auth.isAdmin) {
    return { ok: true, userUuid, auth };
  }
  const has = await userHasRole(userUuid, roleName);
  if (!has) {
    if (roleName === "technician") {
      const recovered = await ensureTechnicianRoleFromProfile(userUuid);
      if (recovered) {
        return { ok: true, userUuid, auth };
      }
    }
    res.status(403).json({ message: "Forbidden" });
    return { ok: false, userUuid, auth };
  }
  return { ok: true, userUuid, auth };
}

async function requireAnyRoleOrAdmin(
  req: any,
  res: any,
  roleNames: string[],
): Promise<{ ok: true; userUuid: string; auth: AuthContext }> {
  const auth = getAuthContext(req);
  if (!auth) {
    res.status(401).json({ message: "Unauthorized" });
    return { ok: false, userUuid: "", auth: null as any };
  }
  const userUuid = await ensureUserUuid(auth);
  if (auth.isAdmin) {
    return { ok: true, userUuid, auth };
  }
  for (const roleName of roleNames) {
    const has = await userHasRole(userUuid, roleName);
    if (has) {
      return { ok: true, userUuid, auth };
    }
  }
  res.status(403).json({ message: "Forbidden" });
  return { ok: false, userUuid, auth };
}

async function ensureTechnicianProfile(
  userId: string,
  updates: { status?: string; is_active?: boolean; is_available?: boolean } = {},
) {
  const { resp, data } = await pgFetch(
    `/technicians?user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (resp.ok) {
    const existing = Array.isArray(data) ? data[0] : data?.[0];
    if (existing?.id) {
      const patch: Record<string, any> = {};
      if (updates.status && existing.status !== updates.status) patch.status = updates.status;
      if (typeof updates.is_active === "boolean" && existing.is_active !== updates.is_active) {
        patch.is_active = updates.is_active;
      }
      if (typeof updates.is_available === "boolean" && existing.is_available !== updates.is_available) {
        patch.is_available = updates.is_available;
      }
      if (Object.keys(patch).length > 0) {
        const { resp: updResp, data: updData } = await pgFetch(
          `/technicians?id=eq.${encodeURIComponent(existing.id)}`,
          { method: "PATCH", body: patch, headers: { Prefer: "return=representation" } },
        );
        if (updResp.ok) {
          return Array.isArray(updData) ? updData[0] : updData;
        }
      }
      return existing;
    }
  }

  const payload = {
    user_id: userId,
    status: updates.status ?? "approved",
    is_active: updates.is_active ?? true,
    is_available: updates.is_available ?? true,
  };
  const { resp: createResp, data: createData } = await pgFetch("/technicians", {
    method: "POST",
    body: [payload],
    headers: { Prefer: "return=representation" },
  });
  if (!createResp.ok) {
    console.log("[TECH][UPSERT][FAILED]", { status: createResp.status, body: createData });
    return null;
  }
  return Array.isArray(createData) ? createData[0] : createData;
}

function getAuthContext(req: any): AuthContext | null {
  const jwtUser = (req as any).jwtUser;
  if (jwtUser) {
    return {
      userId: jwtUser.sub,
      isAdmin: jwtUser.isAdmin === true,
      email: jwtUser.email || undefined,
      phoneNumber: undefined,
    };
  }

  if (req.firebaseUser) {
    return {
      userId: req.firebaseUser.uid,
      isAdmin: req.firebaseUser.isAdmin === true,
      email: req.firebaseUser.email || undefined,
      phoneNumber: req.firebaseUser.phone_number,
    };
  }

  if (req.user?.claims?.sub) {
    // Legacy passport session (Google/Replit)
    return {
      userId: `google_${req.user.claims.sub}`,
      isAdmin: false,
      email: req.user.claims.email,
      phoneNumber: undefined,
    };
  }

  return null;
}

const resolvePushRegisterAuth = async (
  req: any,
): Promise<
  | { auth: AuthContext; method: "jwt" | "firebase" }
  | { auth: null; reason: string; hasToken: boolean }
> => {
  const decodeJwtPayload = (token: string) => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  };

  const existing = getAuthContext(req);
  if (existing) {
    const method = (req as any).jwtUser ? "jwt" : req.firebaseUser ? "firebase" : "jwt";
    return { auth: existing, method };
  }

  const authHeader = req.headers.authorization;
  const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1]?.trim();
  if (!token) {
    return { auth: null, reason: "missing_token", hasToken: false };
  }

  const jwtPayload = verifyJWT(token);
  if (jwtPayload) {
    (req as any).jwtUser = jwtPayload;
    return {
      auth: {
        userId: jwtPayload.sub,
        isAdmin: jwtPayload.isAdmin === true,
        email: jwtPayload.email || undefined,
        phoneNumber: undefined,
      },
      method: "jwt",
    };
  }

  const appPayload = decodeJwtPayload(token);
  if (appPayload?.iss === "cyclecare-app" && appPayload?.aud === "cyclecare-users") {
    const now = Math.floor(Date.now() / 1000);
    const reason = appPayload.exp && appPayload.exp < now ? "token_expired" : "invalid_token";
    return { auth: null, reason, hasToken: true };
  }

  const firebaseAuth = await initializeFirebaseAdmin();
  if (!firebaseAuth) {
    return { auth: null, reason: "firebase_not_configured", hasToken: true };
  }
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    req.firebaseUser = decoded;
    return {
      auth: {
        userId: decoded.uid,
        isAdmin: decoded.admin === true,
        email: decoded.email || undefined,
        phoneNumber: (decoded as any).phone_number || undefined,
      },
      method: "firebase",
    };
  } catch (error) {
    console.warn("[PUSH][REGISTER][AUTH] Firebase token verification failed", {
      message: (error as any)?.message,
    });
  }

  return { auth: null, reason: "invalid_token", hasToken: true };
};

async function ensureUserUuid(auth: AuthContext): Promise<string> {
  const uuidRegex = /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$/;
  const providerId = auth.userId;
  const providerHint = auth.userId?.startsWith("apple_")
    ? "apple"
    : auth.phoneNumber
    ? "phone"
    : auth.email
    ? "firebase"
    : "app";

  const lookupByProvider = await pgFetch(
    `/users?auth_provider_id=eq.${encodeURIComponent(providerId)}&select=id,auth_provider_id&limit=1`,
  );
  if (lookupByProvider.resp.ok) {
    const existing = Array.isArray(lookupByProvider.data)
      ? lookupByProvider.data[0]
      : lookupByProvider.data?.[0];
    if (existing?.id) {
      return existing.id;
    }
  }

  const lookupById = await pgFetch(
    `/users?id=eq.${encodeURIComponent(providerId)}&select=id,auth_provider_id&limit=1`,
  );
  if (lookupById.resp.ok) {
    const existing = Array.isArray(lookupById.data)
      ? lookupById.data[0]
      : lookupById.data?.[0];
    if (existing?.id) {
      if (!existing.auth_provider_id) {
        const patch: Record<string, any> = {
          auth_provider_id: providerId,
          auth_provider: providerHint,
        };
        if (auth.email) patch.email = auth.email;
        if (auth.phoneNumber) patch.phone = auth.phoneNumber;
        if (auth.isAdmin) patch.is_admin = true;

        await pgFetch(`/users?id=eq.${encodeURIComponent(existing.id)}`, {
          method: "PATCH",
          body: patch,
          headers: { Prefer: "return=representation" },
        }).catch(() => {});
      }
      return existing.id;
    }
  }

  const createPayload: Record<string, any> = {
    auth_provider: providerHint,
    auth_provider_id: providerId,
    email: auth.email || null,
    phone: auth.phoneNumber || null,
    first_name: null,
    last_name: null,
    profile_image_url: null,
    is_admin: auth.isAdmin === true,
    is_technician: false,
  };
  Object.keys(createPayload).forEach((key) => {
    if (createPayload[key] === null || createPayload[key] === undefined) {
      delete createPayload[key];
    }
  });
  if (uuidRegex.test(providerId)) {
    createPayload.id = providerId;
  }

  const { resp: createResp, data: createData } = await pgFetch("/users", {
    method: "POST",
    body: [createPayload],
    headers: { Prefer: "return=representation" },
  });

  if (!createResp.ok) {
    console.log("[USER][CREATE] Failed", { status: createResp.status, body: createData });
    throw new AppError({
      code: "SERVER_ERROR",
      status: createResp.status || 500,
      message: "Failed to resolve user",
    });
  }

  const created = Array.isArray(createData) ? createData[0] : createData;
  if (!created?.id) {
    throw new AppError({
      code: "SERVER_ERROR",
      status: 500,
      message: "Failed to resolve user",
    });
  }
  return created.id;
}

function getGuestToken(req: any): string | null {
  const header = req.headers["x-guest-token"];
  if (typeof header === "string") return header;
  if (Array.isArray(header) && header.length > 0) return header[0];
  return null;
}

async function ensureGuestUserId(guestToken?: string | null): Promise<string> {
  const token = guestToken || `guest_${randomUUID()}`;
  const { resp, data } = await pgFetch(
    `/users?auth_provider_id=eq.${encodeURIComponent(token)}&select=id&limit=1`,
  );
  if (resp.ok) {
    const existing = Array.isArray(data) ? data[0] : data?.[0];
    if (existing?.id) return existing.id;
  }

  const createPayload: Record<string, any> = {
    auth_provider: "guest",
    auth_provider_id: token,
    first_name: "Guest",
    last_name: null,
    email: null,
    phone: null,
    profile_image_url: null,
    is_admin: false,
    is_technician: false,
  };
  Object.keys(createPayload).forEach((key) => {
    if (createPayload[key] === null || createPayload[key] === undefined) {
      delete createPayload[key];
    }
  });

  const { resp: createResp, data: createData } = await pgFetch("/users", {
    method: "POST",
    body: [
      createPayload,
    ],
    headers: { Prefer: "return=representation" },
  });

  if (!createResp.ok) {
    console.log("[GUEST][CREATE] Failed", { status: createResp.status, body: createData });
    throw new AppError({
      code: "SERVER_ERROR",
      status: createResp.status || 500,
      message: "Failed to resolve guest user",
    });
  }

  const created = Array.isArray(createData) ? createData[0] : createData;
  if (!created?.id) {
    throw new AppError({
      code: "SERVER_ERROR",
      status: 500,
      message: "Failed to resolve guest user",
    });
  }
  return created.id;
}

export async function registerRoutes(app: Express): Promise<void> {
  // Firebase Auth + Twilio OTP for phone authentication
  // IMPORTANT: Must be registered BEFORE Google Auth so Firebase middleware runs on all /api routes
  await setupFirebaseAuth(app);
  // Auth middleware - Google OAuth (direct, no Replit)
  await setupGoogleAuth(app);

  // PUBLIC ROUTES (no authentication required)
  // Upload route for technician documents - uploads to Supabase Storage
  app.post(
    "/api/public/technicians/upload",
    upload.fields([
      { name: "profileImage", maxCount: 1 },
      { name: "nationalIdFile", maxCount: 1 },
      { name: "commercialFile", maxCount: 1 },
      { name: "certifications", maxCount: 10 },
    ]),
    async (req: any, res) => {
      try {
        console.log("[API] Technician upload request received");

        // Helper function to upload file to Supabase Storage
        // Uses admin client (service-role) for private bucket access
        const uploadToSupabase = async (
          file: Express.Multer.File | undefined,
          folder: string
        ): Promise<string | undefined> => {
          if (!file) return undefined;

          const allowedMimeTypes = new Set([
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "application/pdf",
          ]);
          const maxFileSize = 5 * 1024 * 1024;
          if (!allowedMimeTypes.has(file.mimetype)) {
            throw new AppError({
              code: "VALIDATION_ERROR",
              status: 400,
              message: `Unsupported file type: ${file.mimetype}`,
            });
          }
          if (file.size > maxFileSize) {
            throw new AppError({
              code: "VALIDATION_ERROR",
              status: 400,
              message: "File too large (max 5MB)",
            });
          }

          const timestamp = Date.now();
          const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
          const fileName = `${folder}/${timestamp}-${safeName}`;
          const publicUrl = await uploadBufferToStorage({
            file,
            path: fileName,
          });
          return publicUrl;
        };

        // Text fields
        const formData = req.body;

        const publicTechnicianSchema = z.object({
          email: z.string().email(),
          name: z.string().min(2),
          phoneNumber: z.string().min(10),
          experienceYears: z.coerce.number().min(0),
          location: z.string().optional(),
        });

        const data = validateSchema(publicTechnicianSchema, formData, req);

        // First create the technician record
        const technician = await storage.createPublicTechnicianApplication(data);

        // Then upload files and save document records
        const files = req.files || {};
        
        // Upload profile image
        if (files.profileImage?.[0]) {
          const profileUrl = await uploadToSupabase(files.profileImage[0], "profile");
          if (profileUrl) {
            await storage.addTechnicianDocument({
              technicianId: technician.id,
              documentType: "profile_image",
              fileName: files.profileImage[0].originalname,
              fileUrl: profileUrl,
              fileSize: files.profileImage[0].size,
            });
          }
        }

        // Upload national ID
        if (files.nationalIdFile?.[0]) {
          const nationalIdUrl = await uploadToSupabase(files.nationalIdFile[0], "national-id");
          if (nationalIdUrl) {
            await storage.addTechnicianDocument({
              technicianId: technician.id,
              documentType: "national_id",
              fileName: files.nationalIdFile[0].originalname,
              fileUrl: nationalIdUrl,
              fileSize: files.nationalIdFile[0].size,
            });
          }
        }

        // Upload commercial register
        if (files.commercialFile?.[0]) {
          const commercialUrl = await uploadToSupabase(files.commercialFile[0], "commercial");
          if (commercialUrl) {
            await storage.addTechnicianDocument({
              technicianId: technician.id,
              documentType: "commercial_register",
              fileName: files.commercialFile[0].originalname,
              fileUrl: commercialUrl,
              fileSize: files.commercialFile[0].size,
            });
          }
        }

        // Upload certifications
        if (files.certifications?.length > 0) {
          for (const certFile of files.certifications) {
            const certUrl = await uploadToSupabase(certFile, "certifications");
            if (certUrl) {
              await storage.addTechnicianDocument({
                technicianId: technician.id,
                documentType: "certification",
                fileName: certFile.originalname,
                fileUrl: certUrl,
                fileSize: certFile.size,
              });
            }
          }
        }

        return res.status(201).json({
          message: "Application submitted successfully",
          technicianId: technician.id,
        });
      } catch (error: any) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("Upload error:", error);
        return res
          .status(500)
          .json({ message: error.message || "Failed to submit application" });
      }
    },
  );

  // AUTHENTICATED ROUTES

  app.post("/api/auth/apple-native", async (req, res) => {
    try {
      const { identityToken, email, fullName } = req.body || {};
      if (!identityToken) {
        return res.status(400).json({ message: "IDENTITY_TOKEN_REQUIRED" });
      }

      console.log("[APPLE][AUTH][REQUEST]", {
        hasIdentityToken: true,
        emailProvided: Boolean(email),
        hasFullName: Boolean(fullName?.firstName || fullName?.lastName),
        expectedAudiences: APPLE_BUNDLE_IDS,
      });

      const payload = await verifyAppleIdentityToken(identityToken);
      const sub = payload.sub as string | undefined;
      if (!sub) {
        return res.status(400).json({ message: "INVALID_TOKEN" });
      }

      const firstName = (fullName?.firstName || (payload as any)?.given_name || "").trim();
      const lastName = (fullName?.lastName || (payload as any)?.family_name || "").trim();
      const emailValue = (payload.email as string) || email || null;

      const token = signJWT({
        sub: `apple_${sub}`,
        email: emailValue || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        profileImageUrl: null,
        isAdmin: false,
      });

      return res.json({
        token,
        user: {
          id: `apple_${sub}`,
          email: emailValue,
          name: `${firstName} ${lastName}`.trim(),
        },
      });
    } catch (error: any) {
      console.error("[APPLE][AUTH][ERROR]", {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
      });
      return res
        .status(400)
        .json({ message: "APPLE_AUTH_FAILED", detail: error?.message || "Invalid Apple identity token" });
    }
  });

  // Auth route - Get current user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { userId, isAdmin, phoneNumber } = auth;

      // Try to get user from database
      let user = await storage.getUser(userId);
      
      if (user) {
        // Return existing user with admin status
        res.json({ ...user, isAdmin: user.isAdmin || isAdmin });
      } else if (phoneNumber) {
        // For phone auth users not in database, return minimal info
        res.json({
          id: userId,
          phoneNumber,
          isAdmin,
          firstName: null,
          lastName: null,
          email: null,
        });
      } else {
        return res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User Profile routes
  app.get("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { phoneNumber } = auth;
      const userUuid = await ensureUserUuid(auth);
      const jwtUser = (req as any).jwtUser;
      const firebaseUser = req.firebaseUser;
      let user: any | null = null;
      try {
        user = await storage.getUser(userUuid);
      } catch (error: any) {
        console.error("[PROFILE][DB][FETCH_FAILED]", { message: error?.message });
        user = await fetchUserRest(userUuid);
      }

      if (!user) {
        const providerHint = jwtUser ? "google" : phoneNumber ? "phone" : auth.email ? "firebase" : "app";
        const avatarFallback = jwtUser?.profileImageUrl || firebaseUser?.picture || null;
        try {
          user = await storage.upsertUser({
            id: userUuid,
            email: auth.email || null,
            phone: phoneNumber || null,
            firstName: jwtUser?.firstName || null,
            lastName: jwtUser?.lastName || null,
            authProvider: providerHint,
            authProviderId: auth.userId,
            profileImageUrl: avatarFallback,
            avatarUrl: avatarFallback,
            isAdmin: auth.isAdmin === true,
          });
        } catch (error: any) {
          console.error("[PROFILE][DB][UPSERT_FAILED]", { message: error?.message });
          try {
            user = await upsertUserRest({
              id: userUuid,
              email: auth.email || null,
              phone: phoneNumber || null,
              first_name: jwtUser?.firstName || null,
              last_name: jwtUser?.lastName || null,
              auth_provider: providerHint,
              auth_provider_id: auth.userId,
              profile_image_url: avatarFallback,
              avatar_url: avatarFallback,
              is_admin: auth.isAdmin === true,
            });
          } catch (restError: any) {
            console.error("[PROFILE][REST][UPSERT_FAILED]", { message: restError?.message });
          }
        }
      }
      
      if (user) {
        if (phoneNumber && !user.phone) {
          try {
            user = await storage.upsertUser({ id: userUuid, phone: phoneNumber });
          } catch (error) {
            console.warn("[PROFILE] Failed to persist phone number", error);
            try {
              user = await updateUserRest(userUuid, { phone: phoneNumber });
            } catch (restError: any) {
              console.warn("[PROFILE][REST] Failed to persist phone number", restError?.message);
            }
          }
        }
        res.json({
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
          email: user.email ?? null,
          phone: phoneNumber || user.phone || null,
          profileImageUrl: user.avatarUrl || user.profileImageUrl || null,
          avatarUrl: user.avatarUrl || null,
        });
      } else {
        res.json({
          firstName: null,
          lastName: null,
          email: null,
          phone: phoneNumber || null,
          profileImageUrl: null,
          avatarUrl: null,
        });
      }
    } catch (error: any) {
      console.error("[PROFILE][FETCH][ERROR]", {
        message: error?.message,
        stack: error?.stack,
      });
      const auth = getAuthContext(req);
      return res.status(200).json({
        firstName: null,
        lastName: null,
        email: auth?.email || null,
        phone: auth?.phoneNumber || null,
        profileImageUrl: null,
        avatarUrl: null,
      });
    }
  });

  app.post("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { phoneNumber, isAdmin } = auth;
      const userUuid = await ensureUserUuid(auth);

      const { firstName, lastName, email, profileImageUrl, avatarUrl, phone } = req.body;
      const resolvedAvatar = avatarUrl ?? profileImageUrl;
      const resolvedPhone = phoneNumber || phone || null;

      // Check if user exists
      let user: any | null = null;
      try {
        user = await storage.getUser(userUuid);
      } catch (error: any) {
        console.error("[PROFILE][DB][FETCH_FAILED]", { message: error?.message });
        user = await fetchUserRest(userUuid);
      }
      
      if (user) {
        // Update existing user using upsert
        try {
          user = await storage.upsertUser({
            id: userUuid,
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            email: email || user.email,
            phone: resolvedPhone ?? user.phone,
            profileImageUrl: resolvedAvatar ?? user.profileImageUrl,
            avatarUrl: resolvedAvatar ?? user.avatarUrl,
          });
        } catch (error: any) {
          console.error("[PROFILE][DB][UPDATE_FAILED]", { message: error?.message });
          const updatePayload: Record<string, any> = {};
          if (firstName) updatePayload.first_name = firstName;
          if (lastName) updatePayload.last_name = lastName;
          if (email) updatePayload.email = email;
          if (resolvedPhone) updatePayload.phone = resolvedPhone;
          if (resolvedAvatar) {
            updatePayload.profile_image_url = resolvedAvatar;
            updatePayload.avatar_url = resolvedAvatar;
          }
          if (Object.keys(updatePayload).length > 0) {
            user = await updateUserRest(userUuid, updatePayload);
          }
        }
      } else {
        const jwtUser = (req as any).jwtUser;
        const providerHint = jwtUser ? "google" : phoneNumber ? "phone" : auth.email ? "firebase" : "app";
        // Create new user
        try {
          user = await storage.createUser({
            id: userUuid,
            firstName: firstName || jwtUser?.firstName || null,
            lastName: lastName || jwtUser?.lastName || null,
            email: email || auth.email || `${auth.userId}@phone.user`,
            phone: resolvedPhone,
            authProvider: providerHint,
            authProviderId: auth.userId,
            isAdmin,
            profileImageUrl: resolvedAvatar || null,
            avatarUrl: resolvedAvatar || null,
          });
        } catch (error: any) {
          console.error("[PROFILE][DB][CREATE_FAILED]", { message: error?.message });
          user = await upsertUserRest({
            id: userUuid,
            first_name: firstName || jwtUser?.firstName || null,
            last_name: lastName || jwtUser?.lastName || null,
            email: email || auth.email || `${auth.userId}@phone.user`,
            phone: resolvedPhone,
            auth_provider: providerHint,
            auth_provider_id: auth.userId,
            is_admin: isAdmin,
            profile_image_url: resolvedAvatar || null,
            avatar_url: resolvedAvatar || null,
          });
        }
      }

      res.json({
        message: "Profile updated successfully",
        user: {
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
          email: user?.email ?? null,
          phone: resolvedPhone,
          profileImageUrl: user?.avatarUrl || user?.profileImageUrl || null,
          avatarUrl: user?.avatarUrl || null,
        },
      });
    } catch (error: any) {
      console.error("[PROFILE][UPDATE][ERROR]", {
        message: error?.message,
        stack: error?.stack,
      });
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/user/profile/avatar", isAuthenticated, profilePhotoUpload, handleProfileAvatarUpload);
  app.post("/api/user/profile/photo", isAuthenticated, profilePhotoUpload, handleProfileAvatarUpload);

  // Strava OAuth
  const handleStravaConnect = async (req: any, res: any) => {
    try {
      ensureStravaConfig();
      let auth = getAuthContext(req);
      if (!auth) {
        const bodyToken = typeof req.body?.token === "string" ? req.body.token.trim() : "";
        if (bodyToken) {
          try {
            auth = await resolveAuthFromToken(bodyToken);
          } catch (error: any) {
            console.error("[STRAVA][CONNECT] Body token verification failed", { message: error?.message });
          }
        }
      }
      if (!auth) {
        const cookieToken = getCookieValue(req.headers.cookie, STRAVA_CONNECT_COOKIE);
        if (cookieToken) {
          try {
            auth = await resolveAuthFromToken(cookieToken);
          } catch (error: any) {
            console.error("[STRAVA][CONNECT] Token verification failed", { message: error?.message });
          }
        }
      }
      if (!auth) {
        clearStravaConnectCookie(res);
        return res.redirect("/auth/login");
      }
      const secret = process.env.SESSION_SECRET;
      if (!secret) {
        console.error("[STRAVA][CONNECT] Missing SESSION_SECRET");
        return res.status(500).json({ message: "Server misconfiguration" });
      }
      const userUuid = await ensureUserUuid(auth);
      const state = buildStravaState(userUuid, Date.now(), secret);
      const params = new URLSearchParams({
        client_id: String(STRAVA_CLIENT_ID),
        response_type: "code",
        redirect_uri: String(STRAVA_REDIRECT_URI),
        scope: "read,activity:read_all",
        approval_prompt: "force",
        state,
      });
      const url = `${STRAVA_AUTHORIZE_URL}?${params.toString()}`;
      clearStravaConnectCookie(res);
      return res.redirect(url);
    } catch (error: any) {
      console.error("[STRAVA][CONNECT] Error:", { message: error?.message, stack: error?.stack });
      return res.status(500).json({ message: "Failed to start Strava connection" });
    }
  };

  app.get("/api/strava/connect", handleStravaConnect);
  app.post("/api/strava/connect", handleStravaConnect);

  app.get("/api/strava/callback", async (req, res) => {
    try {
      ensureStravaConfig();
      const secret = process.env.SESSION_SECRET;
      if (!secret) {
        console.error("[STRAVA][CALLBACK] Missing SESSION_SECRET");
        return res.status(500).json({ message: "Server misconfiguration" });
      }
      const { code, state, error } = req.query || {};
      if (error) {
        console.warn("[STRAVA][CALLBACK] Denied:", error);
        return res.redirect("/bike-log?strava=denied");
      }
      if (!code || !state) {
        return res.status(400).json({ message: "Invalid Strava callback" });
      }
      const parsed = parseStravaState(String(state), secret);
      if (!parsed?.userId || !parsed?.ts) {
        return res.status(400).json({ message: "Invalid Strava state" });
      }
      if (Date.now() - parsed.ts > 15 * 60 * 1000) {
        return res.status(400).json({ message: "Strava state expired" });
      }

      const tokenResp = await fetch(STRAVA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok) {
        console.error("[STRAVA][CALLBACK] Token exchange failed", {
          status: tokenResp.status,
          body: tokenData,
        });
        return res.status(500).json({ message: "Failed to connect Strava" });
      }

      const expiresAt = computeExpiresAt(tokenData);
      await upsertStravaAccount({
        user_id: parsed.userId,
        athlete_id: tokenData?.athlete?.id || null,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
      });

      return res.redirect("/bike-log");
    } catch (error: any) {
      console.error("[STRAVA][CALLBACK] Error:", { message: error?.message, stack: error?.stack });
      return res.status(500).json({ message: "Failed to connect Strava" });
    }
  });

  app.get("/api/strava/activities", isAuthenticated, async (req: any, res) => {
    try {
      ensureStravaConfig();
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);

      let account = await getStravaAccount(userUuid);
      if (!account) {
        return res.status(404).json({
          code: "STRAVA_NOT_CONNECTED",
          message: "Strava account is not connected",
        });
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      let refreshedDuringFetch = false;
      const expiresAt = Number(account.expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds + 60) {
        console.warn("[STRAVA][TOKEN][EXPIRED]", {
          userId: userUuid,
          athleteId: account.athlete_id,
          expiresAt,
          accessToken: maskToken(account.access_token),
        });
        const refreshed = await refreshStravaAccount(account, userUuid);
        if (!refreshed?.account) {
          console.warn("[STRAVA][TOKEN][REFRESH_FAILED]", {
            userId: userUuid,
            athleteId: account.athlete_id,
            status: refreshed?.error?.status,
            code: refreshed?.error?.code,
          });
          return res.status(200).json(
            buildTemporaryStravaResponse(
              "refresh_failed",
              "Strava token refresh failed. Retrying will be attempted automatically.",
            ),
          );
        }
        console.info("[STRAVA][TOKEN][REFRESHED]", {
          userId: userUuid,
          athleteId: refreshed.account?.athlete_id,
          accessToken: maskToken(refreshed.account?.access_token),
        });
        account = refreshed.account;
        refreshedDuringFetch = true;
      }

      const fetchActivities = async (token: string) => {
        try {
          const resp = await fetch(`${STRAVA_ACTIVITIES_URL}?per_page=200`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await resp.json().catch(() => []);
          return { resp, data, error: null };
        } catch (error: any) {
          return { resp: null, data: null, error };
        }
      };

      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const fetchWithRetry = async (token: string) => {
        let result = await fetchActivities(token);
        if (result.error || !result.resp || result.resp.status >= 500) {
          await wait(250);
          result = await fetchActivities(token);
        }
        return result;
      };

      let { resp: activitiesResp, data: activitiesData, error: activitiesError } =
        await fetchWithRetry(account.access_token);
      if (activitiesError || !activitiesResp) {
        console.error("[STRAVA][ACTIVITIES] Network error", { message: activitiesError?.message });
        return res.status(200).json(buildTemporaryStravaResponse());
      }
      if (activitiesResp.status === 401 || activitiesResp.status === 403) {
        const tokenExpired = Number.isFinite(expiresAt) ? nowSeconds > expiresAt : false;
        if (!tokenExpired) {
          console.warn("[STRAVA][UNAUTHORIZED]", {
            userId: userUuid,
            athleteId: account.athlete_id,
            status: activitiesResp.status,
            accessToken: maskToken(account.access_token),
          });
          return res.status(200).json(
            buildTemporaryStravaResponse(
              "unauthorized",
              "Strava authorization scope is missing or revoked. Reconnect required.",
            ),
          );
        }
        console.warn("[STRAVA][TOKEN][EXPIRED]", {
          userId: userUuid,
          athleteId: account.athlete_id,
          status: activitiesResp.status,
          accessToken: maskToken(account.access_token),
        });
        const refreshed = await refreshStravaAccount(account, userUuid);
        if (!refreshed?.account) {
          console.warn("[STRAVA][TOKEN][REFRESH_FAILED]", {
            userId: userUuid,
            athleteId: account.athlete_id,
            status: refreshed?.error?.status,
            code: refreshed?.error?.code,
          });
          return res.status(200).json(
            buildTemporaryStravaResponse(
              "refresh_failed",
              "Strava token refresh failed. Retrying will be attempted automatically.",
            ),
          );
        }
        console.info("[STRAVA][TOKEN][REFRESHED]", {
          userId: userUuid,
          athleteId: refreshed.account?.athlete_id,
          accessToken: maskToken(refreshed.account?.access_token),
        });
        account = refreshed.account;
        refreshedDuringFetch = true;
        const retryToken = refreshed.account?.access_token;
        if (!retryToken) {
          console.warn("[STRAVA][ACTIVITIES][RETRY_TOKEN_MISSING]", {
            userId: userUuid,
            athleteId: refreshed.account?.athlete_id,
          });
          return res.status(200).json(
            buildTemporaryStravaResponse(
              "refresh_failed",
              "Strava token refresh failed. Retrying will be attempted automatically.",
            ),
          );
        }
        console.info("[STRAVA][ACTIVITIES][RETRY_TOKEN]", {
          userId: userUuid,
          athleteId: refreshed.account?.athlete_id,
          accessToken: maskToken(retryToken),
        });
        const retry = await fetchWithRetry(retryToken);
        activitiesResp = retry.resp;
        activitiesData = retry.data;
        activitiesError = retry.error;
        if (!activitiesError && activitiesResp?.ok) {
          console.info("[STRAVA][ACTIVITIES][RETRY_OK]", {
            userId: userUuid,
            athleteId: account.athlete_id,
          });
        } else {
          console.warn("[STRAVA][ACTIVITIES][RETRY_FAILED]", {
            userId: userUuid,
            athleteId: account.athlete_id,
            status: activitiesResp?.status,
            error: activitiesError?.message,
          });
        }
      }
      if (activitiesError || !activitiesResp) {
        console.error("[STRAVA][ACTIVITIES] Network error", { message: activitiesError?.message });
        return res.status(200).json(
          refreshedDuringFetch
            ? buildTemporaryStravaResponse(
                "retry_failed",
                "Strava fetch failed after refresh. Retrying will be attempted automatically.",
              )
            : buildTemporaryStravaResponse(),
        );
      }
      if (activitiesResp.status === 401 || activitiesResp.status === 403) {
        return res.status(200).json(
          buildTemporaryStravaResponse(
            "token_invalid",
            "Strava token invalid after refresh. Retrying will be attempted automatically.",
          ),
        );
      }
      if (!activitiesResp.ok) {
        console.error("[STRAVA][ACTIVITIES] Failed", { status: activitiesResp.status, body: activitiesData });
        return res.status(200).json(
          refreshedDuringFetch
            ? buildTemporaryStravaResponse(
                "retry_failed",
                "Strava fetch failed after refresh. Retrying will be attempted automatically.",
              )
            : buildTemporaryStravaResponse(),
        );
      }

      const rides = (Array.isArray(activitiesData) ? activitiesData : []).filter(
        (activity: any) => activity?.type === "Ride",
      );
      const rideCount = rides.length;
      const totalDistanceKm = Number(
        (rides.reduce((sum, ride) => sum + Number(ride?.distance || 0), 0) / 1000).toFixed(1),
      );

      const lastRide = rides.reduce((latest: any, current: any) => {
        if (!latest) return current;
        const latestDate = new Date(latest.start_date || 0).getTime();
        const currentDate = new Date(current.start_date || 0).getTime();
        return currentDate > latestDate ? current : latest;
      }, null as any);

      const lastServiceAt = await getLastMaintenanceDate(userUuid);
      const distanceSinceLastServiceMeters = rides.reduce((sum, ride) => {
        if (!lastServiceAt) return sum + Number(ride?.distance || 0);
        const rideDate = new Date(ride.start_date || 0).getTime();
        const serviceDate = new Date(lastServiceAt).getTime();
        if (Number.isNaN(rideDate) || Number.isNaN(serviceDate)) return sum;
        if (rideDate >= serviceDate) {
          return sum + Number(ride?.distance || 0);
        }
        return sum;
      }, 0);
      const distanceSinceLastServiceKm = Number((distanceSinceLastServiceMeters / 1000).toFixed(1));

      const serviceIntervalKm = 150;
      const remainingKm = Number((serviceIntervalKm - distanceSinceLastServiceKm).toFixed(1));
      const maintenanceStatus =
        remainingKm <= 0 ? "OVERDUE" : remainingKm < 30 ? "NEAR" : "OK";

      await maybeCreateMaintenanceNotification(userUuid, maintenanceStatus, remainingKm, getRequestLang(req));

      return res.json({
        connected: true,
        rideCount,
        totalDistanceKm,
        lastRide: lastRide
          ? {
              name: lastRide.name,
              distanceKm: Number((Number(lastRide.distance || 0) / 1000).toFixed(1)),
              startDate: lastRide.start_date,
            }
          : null,
        lastServiceAt,
        distanceSinceLastServiceKm,
        remainingKm,
        maintenanceStatus,
        serviceIntervalKm,
      });
    } catch (error: any) {
      console.error("[STRAVA][ACTIVITIES] Error:", { message: error?.message, stack: error?.stack });
      return res.status(500).json({ message: "Failed to fetch Strava activities" });
    }
  });

  app.post("/api/support/tickets", upload.single("attachment"), async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      let userUuid: string | null = null;
      if (auth) {
        try {
          userUuid = await ensureUserUuid(auth);
        } catch (error) {
          console.error("[Support] Failed to resolve user ID; using guest ID", error);
        }
      }
      if (!userUuid) {
        userUuid = randomUUID();
      }
      const getText = (value: any) => {
        if (typeof value === "string") return value.trim();
        if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
        return "";
      };

      const rawBody = req.body || {};
      const type = getText(rawBody.type) || getText(rawBody.category) || getText(rawBody.categoryLabel);
      const category = getText(rawBody.category) || getText(rawBody.categoryLabel);
      const message = getText(rawBody.message) || getText(rawBody.description);

      if (!type || !category || !message) {
        return res.status(400).json({ message: "type, category, and message are required" });
      }

      const userName = getText(rawBody.userName) || null;
      const emailRaw = getText(rawBody.email);
      const userEmail = emailRaw || auth?.email || null;

      let screenshotUrl: string | null = null;
      const attachmentFile = (req as any).file as Express.Multer.File | undefined;
      if (attachmentFile && attachmentFile.mimetype?.startsWith("image/")) {
        try {
          const timestamp = Date.now();
          const safeName = attachmentFile.originalname
            ? attachmentFile.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")
            : `screenshot_${timestamp}.jpg`;
          const path = `support-tickets/${userUuid}/${timestamp}-${safeName}`;
          screenshotUrl = await uploadBufferToStorage({ file: attachmentFile, path });
        } catch (error) {
          console.error("[Support] Screenshot upload failed; continuing without it", error);
        }
      }

      const now = new Date();
      const ticketNumber = `SUP-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = {
        user_id: userUuid,
        user_email: userEmail,
        user_name: userName,
        type,
        category,
        message,
        screenshot_url: screenshotUrl,
        ticket_number: ticketNumber,
      };

      const { resp, data } = await pgFetch("/support_tickets", {
        method: "POST",
        body: [payload],
        headers: { Prefer: "return=representation" },
      });

      if (!resp.ok) {
        console.error("[Support] Failed to create ticket", { status: resp.status, body: data });
        return res.status(500).json({ message: "Failed to submit support ticket" });
      }

      const ticketId = Array.isArray(data) ? data[0]?.id : data?.[0]?.id;
      res.status(202).json({ success: true, ticketId, ticketNumber });
    } catch (error) {
      console.error("Error creating support ticket:", error);
      res.status(500).json({ message: "Failed to submit support ticket" });
    }
  });

  app.get("/api/support/tickets", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const { resp, data } = await pgFetch(
        `/support_tickets?user_id=eq.${encodeURIComponent(userUuid)}&order=created_at.desc`,
      );
      if (!resp.ok) {
        console.log("[SUPPORT][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      const tickets = Array.isArray(data) ? data : [];
      const withReplies = await attachSupportReplies(tickets);
      res.json(withReplies);
    } catch (error) {
      console.error("[SUPPORT][LIST] Error:", error);
      res.json([]);
    }
  });

  app.post("/api/support/tickets/:id/replies", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) {
        return res.status(400).json({ message: "message is required" });
      }

      const { resp: ticketResp, data: ticketData } = await pgFetch(
        `/support_tickets?id=eq.${encodeURIComponent(req.params.id)}&limit=1`,
      );
      if (!ticketResp.ok) {
        console.log("[SUPPORT][REPLY][FETCH_FAILED]", { status: ticketResp.status, body: ticketData });
        return res.status(404).json({ message: "Ticket not found" });
      }
      const ticket = Array.isArray(ticketData) ? ticketData[0] : ticketData?.[0];
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }
      if (ticket.user_id !== userUuid) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const replyPayload = {
        ticket_id: req.params.id,
        sender_id: userUuid,
        sender_role: "user",
        message,
      };
      const { resp: replyResp, data: replyData } = await pgFetch("/support_ticket_replies", {
        method: "POST",
        body: [replyPayload],
        headers: { Prefer: "return=representation" },
      });
      if (!replyResp.ok) {
        console.log("[SUPPORT][REPLY][STORE_FAILED]", { status: replyResp.status, body: replyData });
        return res.status(500).json({ message: "Failed to store reply" });
      }

      const now = new Date().toISOString();
      await pgFetch(`/support_tickets?id=eq.${encodeURIComponent(req.params.id)}`, {
        method: "PATCH",
        body: { status: "open", updated_at: now },
        headers: { Prefer: "return=representation" },
      }).catch(() => {});

      const reply = Array.isArray(replyData) ? replyData[0] : replyData;
      res.status(201).json(normalizeSupportReplyRow(reply));
    } catch (error) {
      console.error("[SUPPORT][REPLY] Error:", error);
      res.status(500).json({ message: "Failed to send reply" });
    }
  });

  // Bike routes
  app.get("/api/bikes", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      console.log("[BIKES][GET][USER]", { uuid: userUuid, externalId: auth.userId });

      const { resp, data } = await pgFetch(
        `/bikes?user_id=eq.${encodeURIComponent(userUuid)}&order=created_at.desc`,
      );

      if (!resp.ok) {
        console.log("[BIKES][GET][FAILED]", { status: resp.status, body: data });
        throw new AppError({
          code: "SERVER_ERROR",
          status: resp.status || 500,
          message: "Failed to fetch bikes",
        });
      }

      const bikes = Array.isArray(data) ? data : [];
      console.log("[BIKES][GET][RESULT]", { count: bikes.length });
      res.json(bikes);
    } catch (error) {
      console.error("Error fetching bikes:", error);
      res.status(500).json({ message: "Failed to fetch bikes" });
    }
  });

  app.get("/api/bikes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      console.log("[USER][RESOLVED]", { externalId: auth.userId, uuid: userUuid });
      const bike = await storage.getBike(req.params.id);
      if (!bike) {
        return res.status(404).json({ message: "Bike not found" });
      }
      // Verify ownership
      if (bike.userId !== userUuid) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(bike);
    } catch (error) {
      console.error("Error fetching bike:", error);
      res.status(500).json({ message: "Failed to fetch bike" });
    }
  });

  app.post("/api/bikes", isAuthenticated, async (req: any, res) => {
    console.log("[BIKES][STEP 1] Route entry", { path: req.path, method: req.method, contentType: req.headers["content-type"] });
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        console.log("[BIKES][STEP 2] Unauthorized");
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userUuid = await ensureUserUuid(auth);

      // TEMP: Direct Supabase REST reachability test (remove after diagnosis)
      try {
        const restUrl = `${process.env.SUPABASE_URL}/rest/v1/bikes?select=id&limit=1`;
        const restHeaders: any = {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        };
        const resp = await fetch(restUrl, { headers: restHeaders });
        const text = await resp.text();
        const preview = text.slice(0, 100);
        if (resp.ok) {
          console.log("[SUPABASE][REST] OK", { status: resp.status, bodyPreview: preview });
        } else {
          console.log("[SUPABASE][REST] FAILED", { status: resp.status, bodyPreview: preview });
        }
      } catch (restErr: any) {
        console.log("[SUPABASE][REST] FAILED", { error: restErr?.message || String(restErr) });
      }

      console.log("[BIKES][STEP 3] Raw body", { bodyKeys: Object.keys(req.body || {}) });
      const bikeData = validateSchema(insertBikeSchema.omit({ userId: true }), req.body, req);
      console.log("[BIKES][STEP 4] Validated data", { bikeId: bikeData.bikeId, brand: bikeData.brand, model: bikeData.model });

      // No file upload in this route; log presence just in case
      console.log("[BIKES][STEP 5] Files check", { hasFile: !!req.file, fileKeys: req.file ? Object.keys(req.file) : [], hasFiles: !!req.files });

      console.log("[BIKES][STEP 6] Before DB insert (PostgREST)");
      const { resp, data } = await pgFetch("/bikes", {
        method: "POST",
        body: [{
          user_id: userUuid,
          bike_id: bikeData.bikeId,
          brand: bikeData.brand,
          model: bikeData.model,
          year: bikeData.year,
          total_distance: bikeData.totalDistance ?? bikeData.total_distance ?? 0,
          image_url: bikeData.imageUrl ?? bikeData.image_url ?? null,
        }],
      });
      if (!resp.ok) {
        console.log("[BIKES][STEP 7] Insert failed", { status: resp.status, body: data });
        throw new AppError({
          code: "SERVER_ERROR",
          status: resp.status || 500,
          message: "Failed to create bike",
        });
      }
      const created = Array.isArray(data) ? data[0] : data;
      console.log("[BIKES][STEP 7] Insert success", { id: created?.id, userId: userUuid });
      res.status(201).json(created);
    } catch (error) {
      console.error("[BIKES][ERROR] create bike failed", { error: error?.message });
      const handled = handleRouteError(error, req, res);
      if (handled) return handled;
      const appErr = new AppError({
        code: "SERVER_ERROR",
        status: 500,
        message: "Failed to create bike",
      });
      return errorHandler(appErr, req, res, () => {});
    }
  });

  app.patch("/api/bikes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      console.log("[BIKES][PATCH][USER]", { uuid: userUuid, externalId: auth.userId });

      const { resp: existingResp, data: existingData } = await pgFetch(
        `/bikes?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(userUuid)}&select=*`,
      );
      const existingBike = Array.isArray(existingData) ? existingData[0] : existingData?.[0];
      if (!existingResp.ok || !existingBike) {
        return res.status(404).json({ code: "BIKE_NOT_FOUND", message: "Bike not found" });
      }

      const updateBody: any = {};
      if (req.body.brand !== undefined) updateBody.brand = req.body.brand;
      if (req.body.model !== undefined) updateBody.model = req.body.model;
      if (req.body.year !== undefined) updateBody.year = req.body.year;
      if (req.body.totalDistance !== undefined) updateBody.total_distance = req.body.totalDistance;
      if (req.body.imageUrl !== undefined) updateBody.image_url = req.body.imageUrl;

      const { resp: updateResp, data: updateData } = await pgFetch(
        `/bikes?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(userUuid)}`,
        {
          method: "PATCH",
          body: updateBody,
          // @ts-ignore
          headers: { Prefer: "return=representation" },
        } as any,
      );

      if (!updateResp.ok) {
        console.log("[BIKES][PATCH][FAILED]", { status: updateResp.status, body: updateData });
        throw new AppError({
          code: "SERVER_ERROR",
          status: updateResp.status || 500,
          message: "Failed to update bike",
        });
      }

      const updated = Array.isArray(updateData) ? updateData[0] : updateData?.[0] || { ...existingBike, ...updateBody };
      console.log("[BIKES][PATCH][RESULT]", { id: updated?.id });
      res.json(updated);
    } catch (error) {
      console.error("Error updating bike:", error);
      res.status(500).json({ message: "Failed to update bike" });
    }
  });

  app.delete("/api/bikes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const bike = await storage.getBike(req.params.id);
      if (!bike) {
        return res.status(404).json({ message: "Bike not found" });
      }
      // Verify ownership
      if (bike.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteBike(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting bike:", error);
      res.status(500).json({ message: "Failed to delete bike" });
    }
  });

  // Bike photo upload endpoint
  app.post(
    "/api/bikes/:id/photo",
    isAuthenticated,
    bikePhotoUpload,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        const userUuid = auth ? await ensureUserUuid(auth) : null;
        console.log("[Bike Photo] Upload request - userUuid:", userUuid, "bikeId:", req.params.id);
        console.log("[Bike Photo] Auth info - user:", !!req.user, "firebaseUser:", !!req.firebaseUser);
        
        if (!userUuid) {
          console.log("[Bike Photo] No userUuid - returning 401");
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { resp: bikeResp, data: bikeData } = await pgFetch(
          `/bikes?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(userUuid)}&select=*`,
        );
        const bike = Array.isArray(bikeData) ? bikeData[0] : bikeData?.[0];
        if (!bikeResp.ok || !bike) {
          console.log("[Bike Photo] Bike not found or not owned", { status: bikeResp.status });
          return res.status(404).json({ message: "Bike not found" });
        }

        const file = req.file as Express.Multer.File;
        if (!file) {
          console.log("[Bike Photo] No file in request");
          return res.status(400).json({ message: "No photo uploaded" });
        }
        console.log("[Bike Photo] File received:", file.originalname, file.size, "bytes");

        const timestamp = Date.now();
        const fileExtension = file.originalname.split('.').pop() || 'jpg';
        const sanitizedName = `bike_${timestamp}.${fileExtension}`;
        const fileName = `bike-photos/${bike.id}/${sanitizedName}`;
        console.log("[Bike Photo] Sanitized filename:", fileName);

        let imageUrl: string;
        try {
          imageUrl = await uploadToStorageRest({ file, path: fileName });
        } catch (e: any) {
          return res.status(500).json({ code: "STORAGE_UPLOAD_FAILED", message: "Failed to upload bike photo" });
        }

        const { resp: updateResp, data: updateData } = await pgFetch(
          `/bikes?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(userUuid)}`,
          {
            method: "PATCH",
            body: { image_url: imageUrl },
            // @ts-ignore
            headers: { Prefer: "return=representation" },
          } as any,
        );

        if (!updateResp.ok) {
          console.log("[Bike Photo] Update failed", { status: updateResp.status, body: updateData });
          return res.status(500).json({ message: "Failed to update bike photo" });
        }

        const updatedBike = Array.isArray(updateData) ? updateData[0] : updateData?.[0];

        console.log(`[Bike Photo] Uploaded for bike ${bike.id}: ${imageUrl}`);
        res.json({ 
          success: true, 
          imageUrl,
          bike: updatedBike 
        });
      } catch (error: any) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("[Bike Photo] Error:", error);
        res.status(500).json({ 
          message: "Failed to upload bike photo",
          error: error.message || String(error)
        });
      }
    }
  );

  // Get bike photos
  app.get("/api/bikes/:id/photos", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      const userId = auth?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const bike = await storage.getBike(req.params.id);
      if (!bike) {
        return res.status(404).json({ message: "Bike not found" });
      }
      if (bike.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Return the bike's imageUrl as the photo
      res.json({ 
        photos: bike.imageUrl ? [{ url: bike.imageUrl }] : [] 
      });
    } catch (error) {
      console.error("[Bike Photos] Error:", error);
      res.status(500).json({ message: "Failed to fetch bike photos" });
    }
  });

  // Maintenance records routes
  app.get(
    "/api/bikes/:id/maintenance",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);

        // Verify bike ownership
        const { resp: bikeResp, data: bikeData } = await pgFetch(
          `/bikes?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(userUuid)}&select=id`,
        );
        const bike = Array.isArray(bikeData) ? bikeData[0] : bikeData?.[0];
        if (!bikeResp.ok || !bike) {
          return res.status(404).json({ message: "Bike not found" });
        }

        const { resp: recordsResp, data: recordsData } = await pgFetch(
          `/maintenance_records?bike_id=eq.${encodeURIComponent(req.params.id)}&select=*`,
        );

        if (!recordsResp.ok) {
          console.log("[MAINTENANCE][GET][FAILED]", { status: recordsResp.status, body: recordsData });
          // If table missing or schema error, return empty array
          return res.json([]);
        }

        const records = Array.isArray(recordsData) ? recordsData : [];
        res.json(records);
      } catch (error) {
        console.error("Error fetching maintenance records:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch maintenance records" });
      }
    },
  );

  app.post("/api/maintenance", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const recordData = validateSchema(insertMaintenanceRecordSchema, req.body, req);

      // Verify bike ownership
      const bike = await storage.getBike(recordData.bikeId);
      if (!bike) {
        return res.status(404).json({ message: "Bike not found" });
      }

      // Only the bike owner can create maintenance records
      if (bike.userId !== userId) {
        return res.status(403).json({
          message: "Forbidden - only bike owner can create maintenance records",
        });
      }

      // If a technician is specified, verify they have completed work for this owner
      if (recordData.technicianId) {
        const technician = await storage.getTechnicianById(
          recordData.technicianId,
        );
        if (!technician) {
          return res.status(400).json({ message: "Invalid technician" });
        }

        // Verify the technician has a completed service request for this owner
        const technicianRequests = await storage.getTechnicianServiceRequests(
          recordData.technicianId,
        );
        const hasCompletedWork = technicianRequests.some(
          (req) => req.userId === userId && req.status === "completed",
        );

        if (!hasCompletedWork) {
          return res
            .status(400)
            .json({ message: "Technician has no completed service for you" });
        }
      }

      const record = await storage.createMaintenanceRecord(recordData);
      res.status(201).json(record);
    } catch (error) {
      const handled = handleRouteError(error, req, res);
      if (handled) return handled;
      console.error("Error creating maintenance record:", error);
      res.status(500).json({ message: "Failed to create maintenance record" });
    }
  });

  // Technician routes
  app.get("/api/technicians", async (req, res) => {
    try {
      const { resp, data } = await pgFetch("/technicians?status=eq.approved&is_active=eq.true&is_available=eq.true&order=created_at.desc");
      if (!resp.ok) {
        console.log("[TECH][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      res.json(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching technicians:", error);
      res.status(500).json({ message: "Failed to fetch technicians" });
    }
  });

  // Technician apply (PostgREST + Storage REST)
  app.post(
    "/api/technicians/apply",
    upload.fields([
      { name: "profileImage", maxCount: 1 },
      { name: "nationalIdFile", maxCount: 1 },
      { name: "commercialFile", maxCount: 1 },
      { name: "certifications", maxCount: 10 },
      // Backward-compatible field for older clients.
      { name: "documents", maxCount: 10 },
    ]),
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        const guestToken = getGuestToken(req);
        const userUuid = auth ? await ensureUserUuid(auth) : await ensureGuestUserId(guestToken);
        console.log("[TECH][APPLY][USER]", {
          uuid: userUuid,
          externalId: auth?.userId || "guest",
        });

        const lang = getRequestLang(req);
        let user: any | null = null;
        try {
          user = await storage.getUser(userUuid);
        } catch (error: any) {
          console.error("[TECH][APPLY][USER_FETCH_FAILED]", { message: error?.message });
          user = await fetchUserRest(userUuid);
        }
        const requestFullName = (req.body.full_name || req.body.fullName || req.body.name || "").trim();
        const fullName =
          requestFullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

        const fileGroups = (req.files || {}) as Record<string, Express.Multer.File[]>;
        const profileImageFile = fileGroups.profileImage?.[0];
        const nationalIdFile = fileGroups.nationalIdFile?.[0];
        const commercialFile = fileGroups.commercialFile?.[0];
        const certificationFiles = fileGroups.certifications || [];
        const legacyDocuments = fileGroups.documents || [];

        const errors: Record<string, string> = {};
        const allowedImageTypes = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];
        const allowedDocTypes = [...allowedImageTypes, "application/pdf"];
        const maxSize = 5 * 1024 * 1024;
        const legacyProfileImage = legacyDocuments.find((file) =>
          allowedImageTypes.includes(file.mimetype),
        );

        if (!fullName) {
          errors.name = lang === "ar" ? "الاسم الكامل مطلوب" : "Full name is required";
        }

        const phoneNumber = (req.body.phone_number || req.body.phoneNumber || "").trim();
        if (!phoneNumber) {
          errors.phone_number = lang === "ar" ? "رقم الجوال مطلوب" : "Phone number is required";
        }

        const nationalAddressRaw = (req.body.national_address || req.body.nationalAddress || "")
          .toString()
          .trim()
          .toUpperCase();
        const nationalAddressPattern = /^[A-Z]{4}\d{4}$/;
        if (!nationalAddressRaw) {
          errors.national_address =
            lang === "ar" ? "العنوان الوطني مطلوب" : "National address is required";
        } else if (!nationalAddressPattern.test(nationalAddressRaw)) {
          errors.national_address =
            lang === "ar"
              ? "العنوان الوطني يجب أن يكون 4 أحرف متبوعة بـ 4 أرقام (مثال: ABCD1234)"
              : "National address must be 4 letters followed by 4 numbers (e.g. ABCD1234)";
        }

        const hasProfileImage = Boolean(
          user?.profileImageUrl || profileImageFile || legacyProfileImage,
        );
        if (!hasProfileImage) {
          errors.profile_image =
            lang === "ar" ? "صورة الملف الشخصي مطلوبة" : "Personal profile image is required";
        }

        const yearsRaw = req.body.years_of_experience || req.body.yearsOfExperience;
        if (yearsRaw !== undefined && `${yearsRaw}`.trim() !== "") {
          const parsedYears = Number(yearsRaw);
          if (!Number.isFinite(parsedYears) || parsedYears < 0) {
            errors.years_of_experience =
              lang === "ar" ? "سنوات الخبرة يجب أن تكون رقمًا صالحًا" : "Years of experience must be valid";
          }
        }

        if (profileImageFile) {
          if (!allowedImageTypes.includes(profileImageFile.mimetype)) {
            errors.profile_image =
              lang === "ar" ? "صورة الملف الشخصي يجب أن تكون صورة فقط" : "Profile image must be an image file";
          }
          if (profileImageFile.size > maxSize) {
            errors.profile_image =
              lang === "ar" ? "صورة الملف الشخصي كبيرة جدًا (حد أقصى 5 ميجابايت)" : "Profile image is too large (max 5MB)";
          }
        }

        const optionalFiles = [nationalIdFile, commercialFile, ...certificationFiles, ...legacyDocuments].filter(
          Boolean,
        ) as Express.Multer.File[];
        if (optionalFiles.length > 0) {
          for (const file of optionalFiles) {
            if (!allowedDocTypes.includes(file.mimetype)) {
              errors.documents =
                lang === "ar" ? "صيغة الملف غير مدعومة" : "Unsupported file type";
              break;
            }
            if (file.size > maxSize) {
              errors.documents =
                lang === "ar" ? "حجم الملف كبير جدًا (حد أقصى 5 ميجابايت)" : "File is too large (max 5MB)";
              break;
            }
          }
        }

        if (Object.keys(errors).length > 0) {
          return res.status(400).json({ fieldErrors: errors });
        }

        const { resp: existingResp, data: existingData } = await pgFetch(
          `/technicians?user_id=eq.${encodeURIComponent(userUuid)}&select=id,status,is_active&limit=1`,
        );
        if (existingResp.ok) {
          const existing = Array.isArray(existingData) ? existingData[0] : existingData?.[0];
          if (existing?.id) {
            const status = String(existing.status || "").toLowerCase();
            if (status === "rejected") {
              await pgFetch(`/technician_documents?technician_id=eq.${encodeURIComponent(existing.id)}`, {
                method: "DELETE",
              }).catch((error) => {
                console.error("[TECH][APPLY][CLEANUP][DOCS_FAILED]", {
                  technicianId: existing.id,
                  message: error?.message,
                });
              });
              await pgFetch(`/technician_locations?technician_id=eq.${encodeURIComponent(existing.id)}`, {
                method: "DELETE",
              }).catch((error) => {
                console.error("[TECH][APPLY][CLEANUP][LOC_FAILED]", {
                  technicianId: existing.id,
                  message: error?.message,
                });
              });
              await pgFetch(`/technicians?id=eq.${encodeURIComponent(existing.id)}`, {
                method: "DELETE",
              }).catch((error) => {
                console.error("[TECH][APPLY][CLEANUP][TECH_FAILED]", {
                  technicianId: existing.id,
                  message: error?.message,
                });
              });
            } else {
              return res.status(409).json({
                code: "TECH_APPLICATION_EXISTS",
                message:
                  lang === "ar"
                    ? "يوجد طلب فني قائم بالفعل. يرجى انتظار رد الإدارة."
                    : "A technician application already exists. Please wait for admin review.",
              });
            }
          }
        }

        const techPayload: Record<string, any> = {
          user_id: userUuid,
          phone_number: phoneNumber,
          national_address: nationalAddressRaw,
          status: "pending",
          is_active: false,
          is_available: false,
        };

        const nationalId = (req.body.national_id || req.body.nationalId || "").trim();
        if (nationalId) {
          techPayload.national_id = nationalId;
        }

        const iban = (req.body.iban || "").trim();
        if (iban) {
          techPayload.iban = iban;
        }

        const commercialRegister = (req.body.commercial_register || req.body.commercialRegister || "").trim();
        if (commercialRegister) {
          techPayload.commercial_register = commercialRegister;
        }

        if (yearsRaw !== undefined && `${yearsRaw}`.trim() !== "") {
          const parsedYears = Number(yearsRaw);
          if (Number.isFinite(parsedYears)) {
            techPayload.years_of_experience = parsedYears;
          }
        }

        const { resp: createResp, data: createData } = await pgFetch("/technicians", {
          method: "POST",
          body: [techPayload],
          headers: { Prefer: "return=representation" },
        });
        if (!createResp.ok) {
          console.error("[TECH][APPLY][FAILED]", { status: createResp.status, body: createData });
          const duplicate =
            createResp.status === 409 ||
            createData?.code === "23505" ||
            `${createData?.message || ""}`.toLowerCase().includes("duplicate");
          if (duplicate) {
            throw new AppError({
              code: "VALIDATION_ERROR",
              status: 409,
              message:
                lang === "ar"
                  ? "يوجد طلب فني قائم بالفعل. يرجى انتظار رد الإدارة."
                  : "A technician application already exists. Please wait for admin review.",
            });
          }
          throw new AppError({
            code: "TECH_APPLY_FAILED",
            status: createResp.status || 500,
            message: "Failed to submit technician application",
          });
        }
        const technician = Array.isArray(createData) ? createData[0] : createData;

        const uploadEntries: Array<{ file: Express.Multer.File; documentType: string }> = [];
        if (profileImageFile) {
          uploadEntries.push({ file: profileImageFile, documentType: "profile_image" });
        }
        if (nationalIdFile) {
          uploadEntries.push({ file: nationalIdFile, documentType: "national_id" });
        }
        if (commercialFile) {
          uploadEntries.push({ file: commercialFile, documentType: "commercial_register" });
        }
        if (certificationFiles.length > 0) {
          for (const file of certificationFiles) {
            uploadEntries.push({ file, documentType: "certification" });
          }
        }
        if (legacyDocuments.length > 0) {
          const legacyProfileFallback = !profileImageFile ? legacyProfileImage : undefined;
          if (legacyProfileFallback) {
            uploadEntries.push({ file: legacyProfileFallback, documentType: "profile_image" });
          }
          for (const file of legacyDocuments) {
            if (legacyProfileFallback && file === legacyProfileFallback) continue;
            uploadEntries.push({ file, documentType: "other" });
          }
        }

        const docInserts: any[] = [];
        for (const entry of uploadEntries) {
          const { file, documentType } = entry;
          const timestamp = Date.now();
          const safeName = file.originalname.replace(/\s+/g, "_");
          const fileName = `technicians/${technician.id}/${timestamp}-${safeName}`;
          let fileUrl: string;
          try {
            fileUrl = await uploadToStorageRest({ file, path: fileName });
          } catch (uploadError: any) {
            console.error("[TECH][APPLY][UPLOAD_FAILED]", {
              technicianId: technician.id,
              file: safeName,
              error: uploadError?.message || "Upload failed",
            });
            await pgFetch(`/technicians?id=eq.${encodeURIComponent(technician.id)}`, {
              method: "DELETE",
            }).catch(() => {});
            throw new AppError({
              code: "STORAGE_UPLOAD_FAILED",
              status: 500,
              message: "Failed to upload technician documents",
            });
          }
          console.log("[TECH][APPLY][UPLOAD]", {
            technicianId: technician.id,
            file: safeName,
            documentType,
          });
          docInserts.push({
            technician_id: technician.id,
            document_type: documentType,
            file_name: file.originalname,
            file_url: fileUrl,
            file_size: file.size,
          });
        }

        if (docInserts.length > 0) {
          await pgFetch("/technician_documents", {
            method: "POST",
            body: docInserts,
            headers: { Prefer: "return=representation" },
          });
        }

        console.log("[TECH][APPLY][OK]", { id: technician.id });
        res.status(201).json({ technicianId: technician.id, status: "pending" });
      } catch (error) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("[TECH][APPLY] Error:", {
          message: (error as any)?.message,
          stack: (error as any)?.stack,
        });
        res.status(500).json({ message: "Failed to submit application" });
      }
    },
  );

  app.get("/api/technicians/me", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      let { resp, data } = await pgFetch(`/technicians?user_id=eq.${encodeURIComponent(userUuid)}`);
      if (!resp.ok) {
        console.log("[TECH][ME][FAILED]", { status: resp.status, body: data });
        return res.json(null);
      }
      let technician = Array.isArray(data) ? data[0] : data?.[0] || null;

      if (!technician) {
        const guestToken = getGuestToken(req);
        if (guestToken) {
          const guestUserId = await ensureGuestUserId(guestToken);
          const { resp: guestResp, data: guestData } = await pgFetch(
            `/technicians?user_id=eq.${encodeURIComponent(guestUserId)}&limit=1`,
          );
          if (guestResp.ok) {
            const guestTechnician = Array.isArray(guestData) ? guestData[0] : guestData?.[0];
            if (guestTechnician?.id) {
              const { resp: linkResp, data: linkData } = await pgFetch(
                `/technicians?id=eq.${encodeURIComponent(guestTechnician.id)}`,
                {
                  method: "PATCH",
                  body: { user_id: userUuid },
                  headers: { Prefer: "return=representation" },
                },
              );
              if (linkResp.ok) {
                technician = Array.isArray(linkData) ? linkData[0] : linkData?.[0];
                try {
                  await ensureRoleAssignment(userUuid, "technician", userUuid);
                  await pgFetch(`/users?id=eq.${encodeURIComponent(userUuid)}`, {
                    method: "PATCH",
                    body: { is_technician: true },
                    headers: { Prefer: "return=representation" },
                  }).catch(() => {});
                } catch (error) {
                  console.warn("[TECH][LINK] Failed to assign role", error);
                }
              } else {
                console.warn("[TECH][LINK] Failed to relink guest technician", { status: linkResp.status });
              }
            }
          }
        }
      }

      res.json(technician || null);
    } catch (error) {
      console.error("Error fetching technician:", error);
      res.status(500).json({ message: "Failed to fetch technician" });
    }
  });

  app.patch(
    "/api/technicians/me/availability",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const guard = await requireRoleOrAdmin(req, res, "technician");
        if (!guard.ok) return;
        const { userUuid } = guard;
        const desired = req.body.is_available;
        console.info("[TECH][AVAIL][REQUEST]", {
          authUserId: guard.auth.userId,
          internalUserId: userUuid,
          desired,
        });
        if (typeof desired !== "boolean") {
          return res.status(400).json({ fieldErrors: { is_available: "Required boolean" } });
        }
        const { resp, data } = await pgFetch(`/technicians?user_id=eq.${encodeURIComponent(userUuid)}`, { headers: { Accept: "application/json" } });
        if (!resp.ok) {
          console.log("[TECH][AVAIL][FETCH][FAILED]", { status: resp.status, body: data });
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(data) ? data[0] : data?.[0];
        if (!technician) return res.status(404).json({ message: "Technician not found" });
        console.info("[TECH][AVAIL][TECH]", {
          technicianId: technician.id,
          technicianUserId: technician.user_id,
          status: technician.status,
          isActive: technician.is_active,
          isAvailable: technician.is_available,
        });
        const status = technician.status;
        const isApprovedStatus = status === "approved";
        if (!isApprovedStatus || technician.is_active === false) {
          return res.status(403).json({ message: "Technician not active" });
        }
        const patch: Record<string, any> = {
          is_available: desired,
        };
        if (desired && (technician.is_active === null || technician.is_active === undefined)) {
          patch.is_active = true;
        }
        const { resp: updResp, data: updData } = await pgFetch(`/technicians?id=eq.${encodeURIComponent(technician.id)}`, {
          method: "PATCH",
          body: patch,
          headers: { Prefer: "return=representation" },
        });
        if (!updResp.ok) {
          console.log("[TECH][AVAIL][UPDATE][FAILED]", { status: updResp.status, body: updData });
          return res.status(500).json({ message: "Failed to update availability" });
        }
        const updatedRecords = Array.isArray(updData) ? updData : updData ? [updData] : [];
        console.info("[TECH][AVAIL][UPDATE]", {
          rowsAffected: updatedRecords.length,
          technicianId: technician.id,
        });
        if (updatedRecords.length === 0) {
          const lang = getRequestLang(req);
          return res.status(500).json({
            code: "TECH_STATUS_UPDATE_FAILED",
            message: lang === "ar" ? "تعذر تحديث حالة الفني" : "Failed to update technician status",
          });
        }
        const updated = updatedRecords[0];
        res.json(updated);
      } catch (error) {
        console.error("[TECH][AVAIL] Error:", error);
        res.status(500).json({ message: "Failed to update availability" });
      }
    },
  );

  // Online/Offline status toggle (mirrors availability, technician role only)
  app.patch(
    "/api/technicians/me/status",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const guard = await requireRoleOrAdmin(req, res, "technician");
        if (!guard.ok) return;
        const { userUuid } = guard;
        const online = req.body.online;
        console.info("[TECH][STATUS][REQUEST]", {
          authUserId: guard.auth.userId,
          internalUserId: userUuid,
          online,
        });
        if (typeof online !== "boolean") {
          return res.status(400).json({ fieldErrors: { online: "Required boolean" } });
        }
        const { resp, data } = await pgFetch(`/technicians?user_id=eq.${encodeURIComponent(userUuid)}`, {
          headers: { Accept: "application/json" },
        });
        if (!resp.ok) {
          console.log("[TECH][STATUS][FETCH][FAILED]", { status: resp.status, body: data });
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(data) ? data[0] : data?.[0];
        if (!technician) return res.status(404).json({ message: "Technician not found" });
        console.info("[TECH][STATUS][TECH]", {
          technicianId: technician.id,
          technicianUserId: technician.user_id,
          status: technician.status,
          isActive: technician.is_active,
          isAvailable: technician.is_available,
        });
        const status = technician.status;
        const isApprovedStatus = status === "approved";
        if ((!isApprovedStatus || technician.is_active === false) && !guard.auth.isAdmin) {
          return res.status(403).json({ message: "Technician not active" });
        }
        const patch: Record<string, any> = {
          is_available: online,
        };
        if (online && (technician.is_active === null || technician.is_active === undefined)) {
          patch.is_active = true;
        }
        const { resp: updResp, data: updData } = await pgFetch(
          `/technicians?id=eq.${encodeURIComponent(technician.id)}`,
          {
            method: "PATCH",
            body: patch,
            headers: { Prefer: "return=representation" },
          },
        );
        if (!updResp.ok) {
          console.log("[TECH][STATUS][UPDATE][FAILED]", { status: updResp.status, body: updData });
          return res.status(500).json({ message: "Failed to update status" });
        }
        const updatedRecords = Array.isArray(updData) ? updData : updData ? [updData] : [];
        console.info("[TECH][STATUS][UPDATE]", {
          rowsAffected: updatedRecords.length,
          technicianId: technician.id,
        });
        if (updatedRecords.length === 0) {
          const lang = getRequestLang(req);
          return res.status(500).json({
            code: "TECH_STATUS_UPDATE_FAILED",
            message: lang === "ar" ? "تعذر تحديث حالة الفني" : "Failed to update technician status",
          });
        }
        if (!online) {
          // Remove live location when offline
          await pgFetch(`/technician_locations?technician_id=eq.${encodeURIComponent(technician.id)}`, {
            method: "DELETE",
          });
        }
        const updated = updatedRecords[0];
        if (online) {
          await upsertTechnicianLocation(
            technician.id,
            Number(technician.latitude) || DEFAULT_LAT,
            Number(technician.longitude) || DEFAULT_LNG,
          );
        }
        res.json(updated);
      } catch (error) {
        console.error("[TECH][STATUS] Error:", error);
        res.status(500).json({ message: "Failed to update status" });
      }
    },
  );

  // Technician live location update (online only)
  app.post("/api/technicians/location", isAuthenticated, async (req: any, res) => {
    try {
      const guard = await requireRoleOrAdmin(req, res, "technician");
      if (!guard.ok) return;
      const { userUuid } = guard;
      console.info("[TECH][LOC][REQUEST]", {
        authUserId: guard.auth.userId,
        internalUserId: userUuid,
      });
      const { lat, lng } = req.body;
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res.status(400).json({ message: "lat and lng are required numbers" });
      }
      const { resp, data } = await pgFetch(`/technicians?user_id=eq.${encodeURIComponent(userUuid)}`);
      if (!resp.ok) {
        console.log("[TECH][LOC][FETCH][FAILED]", { status: resp.status, body: data });
        return res.status(404).json({ message: "Technician not found" });
      }
      const technician = Array.isArray(data) ? data[0] : data?.[0];
      if (!technician) return res.status(404).json({ message: "Technician not found" });
      console.info("[TECH][LOC][TECH]", {
        technicianId: technician.id,
        technicianUserId: technician.user_id,
        status: technician.status,
        isActive: technician.is_active,
      });
      if (technician.status !== "approved" || technician.is_active === false || technician.is_available !== true) {
        return res.status(403).json({ message: "Technician is offline" });
      }
      // Upsert location
      const upsertBody = {
        technician_id: technician.id,
        latitude,
        longitude,
        last_updated: new Date().toISOString(),
      };
      const { resp: updResp, data: updData } = await pgFetch(
        `/technician_locations?technician_id=eq.${encodeURIComponent(technician.id)}`,
        {
          method: "PATCH",
          body: upsertBody,
          headers: { Prefer: "return=representation" },
        },
      );
      if (updResp.status === 404 || updResp.status === 0 || updResp.status === 204) {
        // If not existing, insert
        await pgFetch("/technician_locations", {
          method: "POST",
          body: upsertBody,
          headers: { Prefer: "return=representation" },
        });
        console.info("[TECH][LOC][UPSERT]", { action: "insert", technicianId: technician.id });
      } else {
        const updatedRows = Array.isArray(updData) ? updData.length : updData ? 1 : 0;
        console.info("[TECH][LOC][UPSERT]", { action: "update", rowsAffected: updatedRows, technicianId: technician.id });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[TECH][LOC] Error:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  // Nearby technicians endpoint (online only)
  app.get("/api/technicians/nearby", async (req: any, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ message: "lat and lng are required numbers" });
      }

      const techFilter =
        "/technicians?status=eq.approved&is_active=eq.true&is_available=eq.true&select=*,user:users(first_name,last_name)";
      console.info("[TECH][NEARBY][QUERY]", { filter: techFilter, lat, lng });
      const { resp: techResp, data: techData } = await pgFetch(techFilter);
      if (!techResp.ok) {
        console.log("[TECH][NEARBY][TECH_FETCH][FAILED]", { status: techResp.status, body: techData });
        if (ENABLE_MOCK_TECHNICIAN) {
          const mockDistance = 1.2;
          const pricePreview = computePricing({
            distanceKm: mockDistance,
            serviceBase: 150,
            serviceName: "Maintenance",
          });
          const mockTech = {
            id: "mock-tech-1",
            name: "فني تجريبي",
            photo_url: "/assets/mock-tech.png",
            rating: 4.8,
            reviewCount: 120,
            is_available: true,
            status: "online",
            distanceKm: mockDistance,
            etaMinutes: 10,
            isMock: true,
            pricePreview,
            lastUpdated: new Date().toISOString(),
            latitude: lat,
            longitude: lng,
          };
          return res.json([mockTech]);
        }
        return res.json([]);
      }
      const onlineTechs = Array.isArray(techData) ? techData : [];
      if (onlineTechs.length === 0 && ENABLE_MOCK_TECHNICIAN) {
        return res.json([buildMockTech(lat, lng)]);
      }

      const { resp: locResp, data: locData } = await pgFetch(`/technician_locations`);
      const locations = locResp.ok && Array.isArray(locData) ? locData : [];
      const locMap = new Map<string, any>();
      locations.forEach((l: any) => {
        if (l?.technician_id) locMap.set(l.technician_id, l);
      });

      // Auto-heal: ensure every online technician has a location row
      const ensured: any[] = [];
      for (const tech of onlineTechs) {
        if (!locMap.has(tech.id)) {
          const { latitude, longitude } = await upsertTechnicianLocation(
            tech.id,
            Number(tech.latitude) || DEFAULT_LAT,
            Number(tech.longitude) || DEFAULT_LNG,
          );
          const stub = {
            technician_id: tech.id,
            latitude,
            longitude,
            last_updated: new Date().toISOString(),
          };
          locMap.set(tech.id, stub);
          ensured.push(stub);
        }
      }
      const enriched = onlineTechs
        .map((tech: any) => {
          const loc = locMap.get(tech.id);
          if (!loc) return null;
          const user = tech.user;
          const nameFromUser = user
            ? [user.first_name, user.last_name].filter(Boolean).join(" ")
            : "";
          const resolvedName = tech.name || tech.full_name || nameFromUser || null;
          const distanceKm = haversineKm(lat, lng, Number(loc.latitude), Number(loc.longitude));
          const etaMinutes = Math.round((distanceKm / 30) * 60); // assume 30km/h
          const pricePreview = computePricing({
            distanceKm,
            serviceBase: 150, // periodic maintenance default
            serviceName: "Maintenance",
          });
          return {
            ...tech,
            name: resolvedName,
            distanceKm: Number(distanceKm.toFixed(2)),
            etaMinutes,
            lastUpdated: loc.last_updated,
            latitude: loc.latitude,
            longitude: loc.longitude,
            pricePreview,
            isAvailable: tech.is_available ?? tech.isAvailable ?? true,
            is_available: tech.is_available ?? tech.isAvailable ?? true,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (a.distanceKm || 0) - (b.distanceKm || 0));

      if (enriched.length > 0 || !ENABLE_MOCK_TECHNICIAN) {
        return res.json(enriched);
      }

      // Mock technician fallback
      const mockDistance = 1.2;
      const pricePreview = computePricing({
        distanceKm: mockDistance,
        serviceBase: 150,
        serviceName: "Maintenance",
      });
      const mockTech = {
        id: "mock-tech-1",
        name: "فني تجريبي",
        photo_url: "/assets/mock-tech.png",
        rating: 4.8,
        reviewCount: 120,
        is_available: true,
        status: "online",
        distanceKm: mockDistance,
        etaMinutes: 10,
        isMock: true,
        pricePreview,
        lastUpdated: new Date().toISOString(),
        latitude: lat,
        longitude: lng,
      };

      res.json([mockTech]);
    } catch (error) {
      console.error("[TECH][NEARBY] Error:", error);
      res.status(500).json({ message: "Failed to fetch nearby technicians" });
    }
  });

  // Pricing quote (centralized engine)
  app.post("/api/pricing/quote", async (req: any, res) => {
    try {
      const { serviceBase, serviceId, serviceName, distanceKm, parts, installAccessory, installSpare } = req.body || {};
      const breakdown = computePricing({
        serviceBase: serviceBase ? Number(serviceBase) : undefined,
        serviceId,
        serviceName,
        distanceKm: distanceKm !== undefined ? Number(distanceKm) : undefined,
        parts: Array.isArray(parts)
          ? parts.map((p) => ({
              id: p.id,
              name: p.name,
              quantity: Number(p.quantity) || 0,
              unitPrice: Number(p.unitPrice) || 0,
            }))
          : [],
        installAccessory: !!installAccessory,
        installSpare: !!installSpare,
      });
      res.json(breakdown);
    } catch (error) {
      console.error("[PRICING][QUOTE] Error:", error);
      res.status(500).json({ message: "Failed to compute pricing" });
    }
  });

  // Mock payment + order creation (Phase D)
  app.post("/api/orders/mock-checkout", async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      const guestToken = getGuestToken(req);
      const userUuid = auth ? await ensureUserUuid(auth) : await ensureGuestUserId(guestToken);
      const { serviceRequestId, technicianId, breakdown, paymentMethod, discountCode } = req.body || {};
      if (!serviceRequestId || !technicianId || !breakdown) {
        return res.status(400).json({ message: "serviceRequestId, technicianId, and breakdown are required" });
      }

      // Verify service request ownership
      const { resp: srResp, data: srData } = await pgFetch(
        `/service_requests?id=eq.${encodeURIComponent(serviceRequestId)}`,
      );
      if (!srResp.ok || !Array.isArray(srData) || srData.length === 0) {
        return res.status(404).json({ message: "Service request not found" });
      }
      const sr = srData[0];
      const srUserId = sr.user_id || sr.userId;
      const isOwner = srUserId && (srUserId === userUuid || (auth && srUserId === auth.userId));
      const isAdmin = auth?.isAdmin === true;
      const allowMockBypass = ALLOW_MOCK_CHECKOUT_BYPASS;
      if (!allowMockBypass && !ALLOW_ALL_BOOKINGS && !isOwner && !isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!isOwner && !isAdmin) {
        console.warn("[ORDERS][MOCK_CHECKOUT] Ownership mismatch, allowing mock checkout", {
          serviceRequestId,
          srUserId,
          userUuid,
        });
      }

      const baseSubtotal = Number(breakdown?.subtotal || 0);
      const taxRate = Number(breakdown?.vatRate || 15);
      const baseTaxAmount = Number(breakdown?.vat || (baseSubtotal * taxRate) / 100);
      const baseTotal = Number(breakdown?.total || baseSubtotal + baseTaxAmount);

      let subtotal = baseSubtotal;
      let taxAmount = baseTaxAmount;
      let total = baseTotal;
      let appliedDiscount: any = null;

      const normalizedDiscountCode = normalizeDiscountCodeInput(discountCode);
      if (normalizedDiscountCode) {
        const discount = await fetchDiscountCodeByValue(normalizedDiscountCode);
        const validation = validateDiscountCode(discount);
        if (!validation.ok) {
          return respondDiscountInvalid(req, res, {
            source: "mock_checkout",
            code: normalizedDiscountCode,
            reason: validation.reason,
          });
        }
        const discountAmount = computeDiscountAmount(baseSubtotal, discount);
        const applied = applyDiscountToTotals({
          subtotal: baseSubtotal,
          taxRate,
          discountAmount,
        });
        subtotal = applied.discountedSubtotal;
        taxAmount = applied.taxAmount;
        total = applied.total;
        appliedDiscount = {
          code: normalizedDiscountCode,
          discountType: discount?.discountType ?? discount?.discount_type ?? null,
          discountValue: discount?.discountValue ?? discount?.discount_value ?? null,
          discountAmount,
          discountId: discount?.id ?? null,
          raw: discount,
        };
      }

      const commissionRate = 25;
      const appCommissionAmount = Number((total * (commissionRate / 100)).toFixed(2));
      const technicianNetAmount = Number((total - appCommissionAmount).toFixed(2));

      const orderUserId = srUserId || userUuid;
      const orderItems = Array.isArray(breakdown?.parts?.items)
        ? breakdown.parts.items
        : [];
      const breakdownWithDiscount = appliedDiscount
        ? {
            ...breakdown,
            discount: {
              code: appliedDiscount.code,
              discountType: appliedDiscount.discountType,
              discountValue: appliedDiscount.discountValue,
              discountAmount: appliedDiscount.discountAmount,
            },
            subtotal,
            vat: taxAmount,
            total,
          }
        : breakdown;
      const orderPayload = {
        userId: orderUserId,
        orderNumber: buildOrderNumber(),
        subtotal: subtotal.toString(),
        taxRate: taxRate.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        deliveryType: "delivery",
        paymentMethod: paymentMethod || "mock",
        paymentStatus: "completed",
        status: "confirmed",
        items: orderItems,
        serviceRequestId,
        technicianId,
        commissionRate: commissionRate.toString(),
        appCommissionAmount: appCommissionAmount.toString(),
        technicianNetAmount: technicianNetAmount.toString(),
        breakdownJson: breakdownWithDiscount,
      };

      // Validate and create
      const validated = validateSchema(insertOrderSchema, orderPayload as any, req);
      let order;
      try {
        order = await storage.createOrder(validated as any);
      } catch (error) {
        const restPayload: Record<string, any> = {
          user_id: validated.userId,
          order_number: validated.orderNumber,
          subtotal: validated.subtotal,
          tax_rate: validated.taxRate,
          tax_amount: validated.taxAmount,
          total: validated.total,
          delivery_type: validated.deliveryType,
          delivery_address: validated.deliveryAddress,
          delivery_option: validated.deliveryOption,
          payment_method: validated.paymentMethod,
          payment_status: validated.paymentStatus,
          items: validated.items,
          tracking_steps: validated.trackingSteps,
          status: validated.status,
          notes: validated.notes,
        };
        Object.keys(restPayload).forEach((key) => {
          if (restPayload[key] === undefined) delete restPayload[key];
        });

        const { resp: createResp, data: createData } = await pgFetch("/orders", {
          method: "POST",
          body: [restPayload],
          headers: { Prefer: "return=representation" },
        });
        if (!createResp.ok) {
          const { resp: lookupResp, data: lookupData } = await pgFetch(
            `/orders?order_number=eq.${encodeURIComponent(validated.orderNumber)}&limit=1`,
          );
          if (lookupResp.ok) {
            const existing = Array.isArray(lookupData) ? lookupData[0] : lookupData?.[0];
            if (existing) {
              order = existing;
            }
          }
          if (!order) {
            throw error;
          }
        } else {
          order = Array.isArray(createData) ? createData[0] : createData;
        }
      }

      // Optional: mark payment as mock succeeded
      await pgFetch("/payments", {
        method: "POST",
        body: {
          service_request_id: serviceRequestId,
          amount: total,
          currency: "SAR",
          method: "mock",
          status: "succeeded",
          provider_reference: "mock-payment",
          metadata: { mock: true },
          initiated_by: userUuid,
          is_mock: true,
        },
        headers: { Prefer: "return=representation" },
      }).catch(() => {});

      const invoiceNumber = buildInvoiceNumber();
      const invoiceData = validateSchema(insertInvoiceSchema, {
        invoiceNumber,
        userId: orderUserId,
        serviceRequestId,
        subtotal,
        taxRate,
        taxAmount,
        total,
        status: "paid",
        issuedDate: new Date(),
        paidDate: new Date(),
        items: orderItems,
      }, req);

      let invoice;
      try {
        invoice = await storage.createInvoice(invoiceData);
      } catch (error) {
        const restPayload: Record<string, any> = {
          invoice_number: invoiceData.invoiceNumber,
          user_id: invoiceData.userId,
          service_request_id: invoiceData.serviceRequestId,
          subtotal: invoiceData.subtotal,
          tax_rate: invoiceData.taxRate,
          tax_amount: invoiceData.taxAmount,
          total: invoiceData.total,
          description: invoiceData.description,
          items: invoiceData.items,
          status: invoiceData.status,
          issued_date: invoiceData.issuedDate,
          due_date: invoiceData.dueDate,
          paid_date: invoiceData.paidDate,
        };
        Object.keys(restPayload).forEach((key) => {
          if (restPayload[key] === undefined) delete restPayload[key];
        });

        const { resp: createResp, data: createData } = await pgFetch("/invoices", {
          method: "POST",
          body: [restPayload],
          headers: { Prefer: "return=representation" },
        });
        if (!createResp.ok) {
          const { resp: lookupResp, data: lookupData } = await pgFetch(
            `/invoices?invoice_number=eq.${encodeURIComponent(invoiceData.invoiceNumber)}&limit=1`,
          );
          if (lookupResp.ok) {
            const existing = Array.isArray(lookupData) ? lookupData[0] : lookupData?.[0];
            if (existing) {
              invoice = existing;
            }
          }
          if (!invoice) {
            throw error;
          }
        } else {
          invoice = Array.isArray(createData) ? createData[0] : createData;
        }
      }

      if (appliedDiscount?.raw) {
        await incrementDiscountUsage(appliedDiscount.raw);
      }

      let updatedRequest = sr;
      const paymentStatus = "payment_completed";
      let shouldNotifyPayment = false;
      if (serviceRequestId) {
        const allowedPaymentStatuses = new Set([
          "awaiting_payment",
          "pending",
          "assigned",
          "assigned_to_technician",
          "payment_completed",
        ]);
        const currentStatus = String(sr?.status || "");
        if (!allowedPaymentStatuses.has(currentStatus)) {
          console.log("[PAYMENT][GATE][STATUS_SKIP]", { serviceRequestId, currentStatus });
        }
        shouldNotifyPayment = allowedPaymentStatuses.has(currentStatus) && currentStatus !== "payment_completed";
        if (allowedPaymentStatuses.has(currentStatus)) {
          const createdAt = sr?.created_at ?? sr?.createdAt ?? new Date().toISOString();
          const trackingSteps = normalizeTrackingSteps(
            sr?.tracking_steps ?? sr?.trackingSteps,
            paymentStatus,
            createdAt,
          );
          const { resp: srUpdateResp, data: srUpdateData } = await pgFetch(
            `/service_requests?id=eq.${encodeURIComponent(serviceRequestId)}`,
            {
              method: "PATCH",
              body: {
                status: paymentStatus,
                technician_id: technicianId,
                tracking_steps: trackingSteps,
              },
              headers: { Prefer: "return=representation" },
            },
          );
          if (srUpdateResp.ok) {
            updatedRequest = Array.isArray(srUpdateData) ? srUpdateData[0] : srUpdateData;
          } else {
            console.warn("[ORDERS][MOCK_CHECKOUT][REQUEST_UPDATE_FAILED]", {
              status: srUpdateResp.status,
              body: srUpdateData,
            });
          }
        }
      }

      if (orderUserId && serviceRequestId && shouldNotifyPayment) {
        await triggerSystemNotification(
          "payment_completed",
          { userId: orderUserId, orderId: serviceRequestId, extraData: { orderNumber: updatedRequest?.order_number ?? null } },
          getRequestLang(req),
        );
      }

      if (technicianId && orderUserId && serviceRequestId && shouldNotifyPayment) {
        await triggerSystemNotification(
          "TECHNICIAN_ASSIGNED",
          { userId: orderUserId, orderId: serviceRequestId, technicianId, extraData: { orderNumber: updatedRequest?.order_number ?? null } },
          getRequestLang(req),
        );
        const { resp: techResp, data: techData } = await pgFetch(
          `/technicians?id=eq.${encodeURIComponent(technicianId)}&select=id,user_id`,
        );
        if (techResp.ok) {
          const tech = Array.isArray(techData) ? techData[0] : techData?.[0];
          const techUserId = tech?.user_id ?? tech?.userId;
          if (techUserId) {
            const lang = getRequestLang(req);
            const isArabic = lang === "ar";
            const serviceLabel = sr?.service_type || sr?.serviceType || (isArabic ? "خدمة" : "service");
            const locationLabel = sr?.location || (isArabic ? "موقع العميل" : "customer location");
            await createNotification({
              userId: techUserId,
              role: "technician",
              title: isArabic ? "طلب جديد" : "New request",
              message: isArabic
                ? `طلب جديد للخدمة (${serviceLabel}) في ${locationLabel}.`
                : `New ${serviceLabel} request at ${locationLabel}.`,
              emoji: "🆕",
              type: "technician_update",
              entityType: "service_request",
              entityId: serviceRequestId,
              activityType: "technician_route",
              activityId: serviceRequestId,
              activityState: "assigned",
            });
          }
        }
      }

      res.status(201).json({ order, invoice, commissionRate, appCommissionAmount, technicianNetAmount });
    } catch (error) {
      const handled = handleRouteError(error, req, res);
      if (handled) return handled;
      console.error("[ORDERS][MOCK_CHECKOUT] Error:", error);
      res.status(500).json({ message: "Failed to complete mock checkout" });
    }
  });

  // Shop mock checkout (products)
  app.post("/api/shop/mock-checkout", async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      const guestToken = getGuestToken(req);
      const userUuid = auth ? await ensureUserUuid(auth) : await ensureGuestUserId(guestToken);
      const {
        items,
        deliveryOption,
        deliveryAddress,
        paymentMethod,
        deliveryLat,
        deliveryLng,
        deliveryDistanceKm,
        discountCode,
      } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items are required" });
      }

      const normalizedItems = items.map((item: any) => {
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0);
        const total = Number(item.total ?? unitPrice * quantity);
        return {
          partId: item.partId || item.part_id || null,
          name: item.name,
          quantity,
          unitPrice,
          total,
        };
      });

      const option = deliveryOption === "delivery_installation" ? "delivery_installation" : "pickup";
      const isDelivery = option === "delivery_installation";
      if (isDelivery && !deliveryAddress) {
        return res.status(400).json({ message: "deliveryAddress is required" });
      }

      const totalQuantity = normalizedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      const itemsSubtotal = normalizedItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);

      const baseLat = DEFAULT_LAT;
      const baseLng = DEFAULT_LNG;
      const parsedLat = Number(deliveryLat);
      const parsedLng = Number(deliveryLng);
      const providedDistance = Number(deliveryDistanceKm);
      const distanceKm = isDelivery
        ? Number.isFinite(providedDistance)
          ? providedDistance
          : Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
          ? haversineKm(baseLat, baseLng, parsedLat, parsedLng)
          : 0
        : 0;

      const deliveryConfig = { base: 10, perKm: 2, min: 10, max: 60 };
      const deliveryRaw = deliveryConfig.base + distanceKm * deliveryConfig.perKm;
      const deliveryFee = isDelivery
        ? Number(Math.min(Math.max(deliveryRaw, deliveryConfig.min), deliveryConfig.max).toFixed(2))
        : 0;
      const installFeePerItem = 30;
      const installFee = isDelivery
        ? Number((totalQuantity * installFeePerItem).toFixed(2))
        : 0;

      const orderItems = [...normalizedItems];
      if (deliveryFee > 0) {
        orderItems.push({
          partId: null,
          name: "Delivery fee",
          quantity: 1,
          unitPrice: deliveryFee,
          total: deliveryFee,
          isFee: true,
          feeType: "delivery",
        });
      }
      if (installFee > 0) {
        orderItems.push({
          partId: null,
          name: "Installation fee",
          quantity: totalQuantity || 1,
          unitPrice: installFeePerItem,
          total: installFee,
          isFee: true,
          feeType: "installation",
        });
      }

      const baseSubtotal = Number((itemsSubtotal + deliveryFee + installFee).toFixed(2));
      const safeTaxRate = 15;
      const baseTaxAmount = Number(((baseSubtotal * safeTaxRate) / 100).toFixed(2));
      const baseTotal = Number((baseSubtotal + baseTaxAmount).toFixed(2));

      let safeSubtotal = baseSubtotal;
      let safeTaxAmount = baseTaxAmount;
      let safeTotal = baseTotal;
      let appliedDiscount: any = null;

      const normalizedDiscountCode = normalizeDiscountCodeInput(discountCode);
      if (normalizedDiscountCode) {
        const discount = await fetchDiscountCodeByValue(normalizedDiscountCode);
        const validation = validateDiscountCode(discount);
        if (!validation.ok) {
          return respondDiscountInvalid(req, res, {
            source: "shop_checkout",
            code: normalizedDiscountCode,
            reason: validation.reason,
          });
        }
        const discountAmount = computeDiscountAmount(baseSubtotal, discount);
        const applied = applyDiscountToTotals({
          subtotal: baseSubtotal,
          taxRate: safeTaxRate,
          discountAmount,
        });
        safeSubtotal = applied.discountedSubtotal;
        safeTaxAmount = applied.taxAmount;
        safeTotal = applied.total;
        appliedDiscount = {
          code: normalizedDiscountCode,
          discountType: discount?.discountType ?? discount?.discount_type ?? null,
          discountValue: discount?.discountValue ?? discount?.discount_value ?? null,
          discountAmount,
          discountId: discount?.id ?? null,
          raw: discount,
        };
      }

      if (appliedDiscount?.discountAmount) {
        orderItems.push({
          partId: null,
          name: `Discount (${appliedDiscount.code})`,
          quantity: 1,
          unitPrice: Number(-Math.abs(appliedDiscount.discountAmount)),
          total: Number(-Math.abs(appliedDiscount.discountAmount)),
          isDiscount: true,
          feeType: "discount",
        });
      }

      const trackingSteps = buildShopTrackingSteps(option);

      const orderData = validateSchema(insertOrderSchema, {
        userId: userUuid,
        orderNumber: buildOrderNumber(),
        subtotal: safeSubtotal.toString(),
        taxRate: safeTaxRate.toString(),
        taxAmount: safeTaxAmount.toString(),
        total: safeTotal.toString(),
        deliveryType: isDelivery ? "delivery" : "pickup",
        deliveryAddress: isDelivery ? deliveryAddress : null,
        deliveryOption: option,
        paymentMethod: paymentMethod || "mock",
        paymentStatus: "completed",
        status: "confirmed",
        items: orderItems,
        trackingSteps,
      }, req);

      let order;
      let resolvedOrderData = orderData;
      try {
        order = await storage.createOrder(orderData);
      } catch (error: any) {
        let lastError = error;
        const message = error?.message || "";
        if (message.includes("delivery_option") || message.includes("tracking_steps") || message.includes("column")) {
          const { deliveryOption, trackingSteps, ...fallback } = orderData as any;
          resolvedOrderData = fallback;
          try {
            order = await storage.createOrder(resolvedOrderData);
          } catch (storageError) {
            lastError = storageError;
          }
        }

        if (!order) {
          const restPayload: Record<string, any> = {
            user_id: resolvedOrderData.userId,
            order_number: resolvedOrderData.orderNumber,
            subtotal: resolvedOrderData.subtotal,
            tax_rate: resolvedOrderData.taxRate,
            tax_amount: resolvedOrderData.taxAmount,
            total: resolvedOrderData.total,
            delivery_type: resolvedOrderData.deliveryType,
            delivery_address: resolvedOrderData.deliveryAddress,
            delivery_option: resolvedOrderData.deliveryOption,
            payment_method: resolvedOrderData.paymentMethod,
            payment_status: resolvedOrderData.paymentStatus,
            items: resolvedOrderData.items,
            tracking_steps: resolvedOrderData.trackingSteps,
            status: resolvedOrderData.status,
            notes: resolvedOrderData.notes,
          };
          Object.keys(restPayload).forEach((key) => {
            if (restPayload[key] === undefined) delete restPayload[key];
          });

          let { resp: createResp, data: createData } = await pgFetch("/orders", {
            method: "POST",
            body: [restPayload],
            headers: { Prefer: "return=representation" },
          });
          if (!createResp.ok) {
            const message = typeof createData?.message === "string" ? createData.message : "";
            if (message.includes("delivery_option") || message.includes("tracking_steps")) {
              const retryPayload = { ...restPayload };
              delete retryPayload.delivery_option;
              delete retryPayload.tracking_steps;
              ({ resp: createResp, data: createData } = await pgFetch("/orders", {
                method: "POST",
                body: [retryPayload],
                headers: { Prefer: "return=representation" },
              }));
            }
          }
          if (!createResp.ok) {
            const { resp: lookupResp, data: lookupData } = await pgFetch(
              `/orders?order_number=eq.${encodeURIComponent(resolvedOrderData.orderNumber)}&limit=1`,
            );
            if (lookupResp.ok) {
              const existing = Array.isArray(lookupData) ? lookupData[0] : lookupData?.[0];
              if (existing) {
                order = existing;
              }
            }
            if (!order) {
              throw lastError;
            }
          } else {
            order = Array.isArray(createData) ? createData[0] : createData;
          }
        }
      }
      let invoice: any = null;
      if (order?.id) {
        try {
          const { resp: existingResp, data: existingData } = await pgFetch(
            `/invoices?order_id=eq.${encodeURIComponent(order.id)}&limit=1`,
          );
          if (existingResp.ok) {
            const existing = Array.isArray(existingData) ? existingData[0] : existingData?.[0];
            if (existing) {
              invoice = existing;
            }
          }
        } catch {
          // ignore lookup errors
        }

        if (!invoice) {
          const invoiceNumber = buildInvoiceNumber();
          const invoiceData = validateSchema(insertInvoiceSchema, {
            invoiceNumber,
            userId: userUuid,
            orderId: order.id,
            subtotal: safeSubtotal,
            taxRate: safeTaxRate,
            taxAmount: safeTaxAmount,
            total: safeTotal,
            status: "paid",
            issuedDate: new Date(),
            paidDate: new Date(),
            items: orderItems.map((item: any) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          }, req);

          try {
            invoice = await storage.createInvoice(invoiceData as any);
          } catch (error) {
            const restPayload: Record<string, any> = {
              invoice_number: invoiceData.invoiceNumber,
              user_id: invoiceData.userId,
              order_id: invoiceData.orderId,
              subtotal: invoiceData.subtotal,
              tax_rate: invoiceData.taxRate,
              tax_amount: invoiceData.taxAmount,
              total: invoiceData.total,
              description: invoiceData.description,
              items: invoiceData.items,
              status: invoiceData.status,
              issued_date: invoiceData.issuedDate,
              due_date: invoiceData.dueDate,
              paid_date: invoiceData.paidDate,
            };
            Object.keys(restPayload).forEach((key) => {
              if (restPayload[key] === undefined) delete restPayload[key];
            });

            let { resp: invResp, data: invData } = await pgFetch("/invoices", {
              method: "POST",
              body: [restPayload],
              headers: { Prefer: "return=representation" },
            });
            if (!invResp.ok) {
              const message = typeof invData?.message === "string" ? invData.message : "";
              if (message.includes("order_id")) {
                const retryPayload = { ...restPayload };
                delete retryPayload.order_id;
                ({ resp: invResp, data: invData } = await pgFetch("/invoices", {
                  method: "POST",
                  body: [retryPayload],
                  headers: { Prefer: "return=representation" },
                }));
              }
            }
            if (invResp.ok) {
              invoice = Array.isArray(invData) ? invData[0] : invData;
            }
          }
        }
      }

      const enrichedOrder = invoice
        ? {
            ...order,
            invoiceId: invoice.id ?? invoice.invoice_id,
            invoiceNumber: invoice.invoice_number ?? invoice.invoiceNumber,
            invoiceStatus: invoice.status,
          }
        : order;

      if (appliedDiscount?.raw) {
        await incrementDiscountUsage(appliedDiscount.raw);
      }

      res.status(201).json(enrichedOrder);
    } catch (error) {
      const handled = handleRouteError(error, req, res);
      if (handled) return handled;
      console.error("[SHOP][MOCK_CHECKOUT] Error:", error);
      res.status(500).json({ message: "Failed to complete checkout" });
    }
  });


  // Transactional technician registration with documents
  app.post(
    "/api/technicians/register",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userId = await ensureUserUuid(auth);
        const { technicianData, documents } = req.body;
        const safeDocuments: any[] = Array.isArray(documents) ? documents : [];

        // Validate technician data
        const validatedTechnicianData = validateSchema(
          insertTechnicianSchema.omit({ userId: true }),
          technicianData,
          req,
        );

        // Validate documents array
        // Validate each document
        const documentSchema = z.object({
          documentType: z.enum([
            "national_id",
            "commercial_register",
            "certification",
          ]),
          fileUrl: z.string().min(1),
        });

        for (const doc of safeDocuments) {
          try {
            validateSchema(documentSchema, doc, req);

            // Validate base64 data URL format
            if (!doc.fileUrl.startsWith("data:")) {
              return res.status(400).json({
                message: `Document ${doc.documentType} must be a valid data URL`,
                documentType: doc.documentType,
              });
            }

            // Extract MIME type from data URL
            const mimeMatch = doc.fileUrl.match(/^data:([^;]+);/);
            if (!mimeMatch) {
              return res.status(400).json({
                message: `Document ${doc.documentType} has invalid format`,
                documentType: doc.documentType,
              });
            }

            const mimeType = mimeMatch[1];
            const allowedMimeTypes = [
              "image/jpeg",
              "image/jpg",
              "image/png",
              "image/gif",
              "image/webp",
              "application/pdf",
            ];

            if (!allowedMimeTypes.includes(mimeType)) {
              return res.status(400).json({
                message: `Document ${doc.documentType} type ${mimeType} not allowed. Allowed: images and PDF`,
                documentType: doc.documentType,
              });
            }

            // Extract base64 content (after "base64,")
            const base64Match = doc.fileUrl.match(/^data:[^;]+;base64,(.+)$/);
            if (!base64Match) {
              return res.status(400).json({
                message: `Document ${doc.documentType} must be base64 encoded`,
                documentType: doc.documentType,
              });
            }

            // Validate file size by decoding the base64 content
            const base64Content = base64Match[1];
            try {
              // Decode base64 to get actual file size
              const buffer = Buffer.from(base64Content, "base64");
              const actualSize = buffer.byteLength;

              if (actualSize > 5 * 1024 * 1024) {
                return res.status(400).json({
                  message: `Document ${doc.documentType} exceeds 5MB limit (${(actualSize / 1024 / 1024).toFixed(2)}MB)`,
                  documentType: doc.documentType,
                });
              }
            } catch (decodeError) {
              return res.status(400).json({
                message: `Document ${doc.documentType} has invalid base64 encoding`,
                documentType: doc.documentType,
              });
            }
          } catch (error) {
            return res.status(400).json({
              message: `Invalid document: ${doc.documentType}`,
              documentType: doc.documentType,
            });
          }
        }

        // Create technician
        const technician = await storage.createTechnician({
          ...validatedTechnicianData,
          userId,
        });

        // Upload documents - if any fails, rollback all changes
        const uploadedDocuments: string[] = [];
        try {
          if (safeDocuments.length > 0) {
            for (const doc of safeDocuments) {
              const createdDoc = await storage.addTechnicianDocument({
                technicianId: technician.id,
                documentType: doc.documentType,
                fileUrl: doc.fileUrl,
                fileName: doc.fileName || `${doc.documentType}_${Date.now()}`,
              });
              uploadedDocuments.push(createdDoc.id);
            }
          }
        } catch (docError) {
          // Rollback: delete all uploaded documents and the technician
          try {
            for (const docId of uploadedDocuments) {
              await storage.deleteTechnicianDocument(docId);
            }
            await storage.rejectTechnician(technician.id);
          } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
          }

          console.error(
            "Document upload failed, technician and documents deleted:",
            docError,
          );
          return res.status(500).json({
            message: "Failed to upload documents. Registration cancelled.",
            error:
              docError instanceof Error ? docError.message : "Unknown error",
          });
        }

        const sanitized = {
          ...technician,
          nationalId: null,
          iban: null,
          commercialRegister: null,
          phoneNumber: null,
        };

        res.status(201).json(sanitized);
      } catch (error) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("Error registering technician:", error);
        res.status(500).json({ message: "Failed to register technician" });
      }
    },
  );

  app.post("/api/technicians", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userId = await ensureUserUuid(auth);
      const technicianData = validateSchema(
        insertTechnicianSchema.omit({ userId: true }),
        req.body,
        req,
      );
      const technician = await storage.createTechnician({
        ...technicianData,
        userId,
      });

      const sanitized = {
        ...technician,
        nationalId: null,
        iban: null,
        commercialRegister: null,
        phoneNumber: null,
      };

      res.status(201).json(sanitized);
    } catch (error) {
      const handled = handleRouteError(error, req, res);
      if (handled) return handled;
      console.error("Error creating technician:", error);
      res.status(500).json({ message: "Failed to create technician" });
    }
  });

  app.patch("/api/technicians/:id", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const existingTechnician = await storage.getTechnicianById(req.params.id);
      if (!existingTechnician) {
        return res.status(404).json({ message: "Technician not found" });
      }

      // Verify ownership - only the technician can update their own profile
      if (existingTechnician.userId !== userUuid) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const technician = await storage.updateTechnician(
        req.params.id,
        req.body,
      );

      const sanitized = {
        ...technician,
        nationalId: null,
        iban: null,
        commercialRegister: null,
        phoneNumber: null,
      };

      res.json(sanitized);
    } catch (error) {
      console.error("Error updating technician:", error);
      res.status(500).json({ message: "Failed to update technician" });
    }
  });

  app.post(
    "/api/technicians/:id/documents",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        const technicianId = req.params.id;

        const existingTechnician =
          await storage.getTechnicianById(technicianId);
        if (!existingTechnician) {
          return res.status(404).json({ message: "Technician not found" });
        }

        // Verify ownership - only the technician can upload their own documents
        if (existingTechnician.userId !== userUuid) {
          return res.status(403).json({ message: "Forbidden" });
        }

        const { documentType, fileName, fileUrl, fileSize } = req.body;
        if (!documentType || !fileName || !fileUrl) {
          return res.status(400).json({
            message: "documentType, fileName, and fileUrl are required",
          });
        }

        const document = await storage.addTechnicianDocument({
          technicianId,
          documentType,
          fileName,
          fileUrl,
          fileSize: fileSize || null,
        });

        res.status(201).json(document);
      } catch (error) {
        console.error("Error adding technician document:", error);
        res.status(500).json({ message: "Failed to add document" });
      }
    },
  );

  app.get(
    "/api/technicians/:id/documents",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        const technicianId = req.params.id;

        const existingTechnician =
          await storage.getTechnicianById(technicianId);
        if (!existingTechnician) {
          return res.status(404).json({ message: "Technician not found" });
        }

        // Allow access for: 1) The technician themselves, 2) Admins
        const isOwner = existingTechnician.userId === userUuid;
        const user = await storage.getUser(userUuid);
        const isAdmin = user?.isAdmin || false;

        if (!isOwner && !isAdmin) {
          return res.status(403).json({ message: "Forbidden" });
        }

        const documents = await storage.getTechnicianDocuments(technicianId);
        res.json(documents);
      } catch (error) {
        console.error("Error fetching technician documents:", error);
        res.status(500).json({ message: "Failed to fetch documents" });
      }
    },
  );

  // Service request routes
  app.get("/api/service-requests", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      let rows: any[] = [];
      let needsFallback = false;
      try {
        const { resp, data } = await pgFetch(
          `/service_requests?user_id=eq.${encodeURIComponent(userUuid)}&order=created_at.desc`,
        );
        if (!resp.ok) {
          console.warn("[SERVICE_REQUESTS][LIST][FAILED]", { status: resp.status, body: data });
          needsFallback = true;
        } else {
          rows = Array.isArray(data) ? data : [];
        }
      } catch (error) {
        console.warn("[SERVICE_REQUESTS][LIST][ERROR]", error);
        needsFallback = true;
      }

      if (needsFallback) {
        try {
          rows = await storage.getUserServiceRequests(userUuid);
        } catch (error) {
          console.error("Error fetching service requests:", error);
          return res.json([]);
        }
      }

      const requests = Array.isArray(rows) ? rows.map(normalizeServiceRequestRow) : [];
      res.json(requests);
    } catch (error) {
      console.error("Error fetching service requests:", error);
      res.json([]);
    }
  });

  app.get(
    "/api/service-requests/technician",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        const { resp, data } = await pgFetch(
          `/technicians?user_id=eq.${encodeURIComponent(userUuid)}&select=id,status,is_active`,
        );
        if (!resp.ok) {
          console.log("[TECH][REQUESTS][TECH_FETCH][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        const technician = Array.isArray(data) ? data[0] : data?.[0];
        const status = technician?.status;
        const isApprovedStatus = status === "approved";
        if (!technician || !isApprovedStatus || technician.is_active !== true) {
          return res.json([]);
        }
        const requests = await storage.getTechnicianServiceRequests(technician.id);
        res.json(Array.isArray(requests) ? requests : []);
      } catch (error) {
        console.error("Error fetching technician service requests:", error);
        res.json([]);
      }
    },
  );

  app.get("/api/technician/orders", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const { resp, data } = await pgFetch(
        `/technicians?user_id=eq.${encodeURIComponent(userUuid)}&select=id,status,is_active`,
      );
      if (!resp.ok) {
        console.log("[TECH][ORDERS][TECH_FETCH][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      const technician = Array.isArray(data) ? data[0] : data?.[0];
      const status = technician?.status;
      const isApprovedStatus = status === "approved";
      if (!technician || !isApprovedStatus || technician.is_active !== true) {
        return res.json([]);
      }
      const statusFilter = "payment_completed,assigned_to_technician,assigned,pending,accepted,in_progress,created,on_the_way,working,completed";
      console.log("[TECH][ORDERS][FETCH]", {
        technicianId: technician.id,
        statusFilter,
      });
      const { resp: reqResp, data: reqData } = await pgFetch(
        `/service_requests?technician_id=eq.${encodeURIComponent(technician.id)}&status=in.(${statusFilter})&order=created_at.desc`,
      );
      if (!reqResp.ok) {
        console.log("[TECH][ORDERS][FETCH][FAILED]", { status: reqResp.status, body: reqData });
        return res.json([]);
      }
      const safeRequests = Array.isArray(reqData) ? reqData : [];
      const requestIds = safeRequests.map((request) => request.id).filter(Boolean);
      const bikeIds = safeRequests
        .map((request) => request.bike_id ?? request.bikeId)
        .filter(Boolean);
      let invoiceByRequestId = new Map<string, any>();
      if (requestIds.length > 0) {
        const ids = requestIds.map((id) => encodeURIComponent(id)).join(",");
        const { resp: invResp, data: invData } = await pgFetch(
          `/invoices?service_request_id=in.(${ids})`,
        );
        if (invResp.ok) {
          const invoices = Array.isArray(invData) ? invData.map(normalizeInvoiceRow) : [];
          invoiceByRequestId = new Map(
            invoices.map((invoice) => [invoice.serviceRequestId, invoice]),
          );
        }
      }
      let bikeById = new Map<string, any>();
      if (bikeIds.length > 0) {
        const ids = bikeIds.map((id) => encodeURIComponent(id)).join(",");
        const { resp: bikeResp, data: bikeData } = await pgFetch(
          `/bikes?id=in.(${ids})`,
        );
        if (bikeResp.ok) {
          const bikes = Array.isArray(bikeData) ? bikeData.map(normalizeBikeRow) : [];
          bikeById = new Map(bikes.map((bike) => [bike.id, bike]));
        }
      }
      const defaultCommissionRate = 25;
      const enriched = safeRequests.map((request: any) => {
        const invoice = request.id ? invoiceByRequestId.get(request.id) : null;
        const order = null;
        const normalized = normalizeServiceRequestRow(request);
        const bikeId = normalized.bikeId ?? request.bike_id ?? request.bikeId;
        const bike = bikeId ? bikeById.get(bikeId) : null;
        const rawNet = order?.technician_net_amount ?? order?.technicianNetAmount ?? null;
        const netNumeric = Number(rawNet);
        const invoiceSubtotalRaw = invoice?.subtotal ?? invoice?.subtotal_amount ?? null;
        const invoiceTaxRaw = invoice?.taxAmount ?? invoice?.tax_amount ?? null;
        const invoiceTotalRaw = invoice?.total;
        const invoiceSubtotal = Number(invoiceSubtotalRaw);
        const invoiceTax = Number(invoiceTaxRaw);
        const invoiceTotal = Number(invoiceTotalRaw);
        const commissionRate = Number(order?.commission_rate ?? order?.commissionRate ?? defaultCommissionRate);
        const hasSubtotal = invoiceSubtotalRaw !== null && invoiceSubtotalRaw !== undefined && invoiceSubtotalRaw !== "";
        const hasInvoiceTotal = invoiceTotalRaw !== null && invoiceTotalRaw !== undefined && invoiceTotalRaw !== "";
        const baseAmount =
          hasSubtotal && Number.isFinite(invoiceSubtotal)
            ? invoiceSubtotal
            : hasInvoiceTotal && Number.isFinite(invoiceTotal) && Number.isFinite(invoiceTax)
            ? Number((invoiceTotal - invoiceTax).toFixed(2))
            : null;
        const fallbackNet =
          baseAmount !== null && Number.isFinite(baseAmount) && Number.isFinite(commissionRate)
            ? Number((baseAmount * (1 - commissionRate / 100)).toFixed(2))
            : null;
        return {
          ...request,
          ...normalized,
          bike,
          invoiceNumber: invoice?.invoiceNumber ?? null,
          invoiceStatus: invoice?.status ?? null,
          invoiceTotal: invoice?.total ?? null,
          technicianNetAmount: Number.isFinite(netNumeric) && netNumeric > 0 ? netNumeric : fallbackNet,
          commissionRate: Number.isFinite(commissionRate) ? commissionRate : defaultCommissionRate,
          invoice,
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching technician orders:", error);
      res.json([]);
    }
  });

  app.post(
    "/api/technician/orders/:id/accept",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        const { resp: techResp, data: techData } = await pgFetch(
          `/technicians?user_id=eq.${encodeURIComponent(userUuid)}&select=id,status,is_active`,
        );
        if (!techResp.ok) {
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(techData) ? techData[0] : techData?.[0];
        if (!technician || technician.status !== "approved" || technician.is_active !== true) {
          return res.status(403).json({ message: "Technician not active" });
        }
        const orderId = req.params.id;
        const { resp: srResp, data: srData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(orderId)}&limit=1`,
        );
        if (!srResp.ok || !Array.isArray(srData) || srData.length === 0) {
          return res.status(404).json({ message: "Service request not found" });
        }
        const request = srData[0];
        if (request.status === "completed") {
          return res.status(409).json({ message: "Order already completed" });
        }
        if (request.status === "awaiting_payment") {
          return res.status(409).json({ message: "Payment required before accepting order" });
        }
        const assignedTech = request.technician_id ?? request.technicianId;
        if (assignedTech && assignedTech !== technician.id) {
          return res.status(403).json({ message: "Order assigned to another technician" });
        }
        if (request.status === "accepted") {
          return res.json(request);
        }
        const createdAt = request.created_at ?? request.createdAt ?? new Date().toISOString();
        const trackingSteps = normalizeTrackingSteps(
          request.tracking_steps ?? request.trackingSteps,
          "accepted",
          createdAt,
        );
        const payload = {
          status: "accepted",
          accepted_at: new Date().toISOString(),
          technician_id: technician.id,
          tracking_steps: trackingSteps,
        };
        const { resp: updResp, data: updData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(orderId)}`,
          { method: "PATCH", body: payload, headers: { Prefer: "return=representation" } },
        );
        if (!updResp.ok) {
          return res.status(500).json({ message: "Failed to accept order" });
        }
        const updated = Array.isArray(updData) ? updData[0] : updData;
        const requestUserId = request.user_id ?? request.userId;
        if (requestUserId) {
          await triggerSystemNotification("accepted", { userId: requestUserId, orderId }, getRequestLang(req));
        }
        console.log("[TECH][ORDER][ACCEPT]", {
          technicianId: technician.id,
          orderId,
        });
        res.json({
          ...updated,
          clientMessage: "تم قبول طلبك بواسطة الفني",
        });
      } catch (error) {
        console.error("[TECH][ORDER][ACCEPT] Error:", error);
        res.status(500).json({ message: "Failed to accept order" });
      }
    },
  );

  app.post(
    "/api/technician/orders/:id/reject",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        const { resp: techResp, data: techData } = await pgFetch(
          `/technicians?user_id=eq.${encodeURIComponent(userUuid)}&select=id,status,is_active`,
        );
        if (!techResp.ok) {
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(techData) ? techData[0] : techData?.[0];
        if (!technician || technician.status !== "approved" || technician.is_active !== true) {
          return res.status(403).json({ message: "Technician not active" });
        }
        const orderId = req.params.id;
        const { resp: srResp, data: srData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(orderId)}&limit=1`,
        );
        if (!srResp.ok || !Array.isArray(srData) || srData.length === 0) {
          return res.status(404).json({ message: "Service request not found" });
        }
        const request = srData[0];
        if (request.status === "completed") {
          return res.status(409).json({ message: "Order already completed" });
        }
        if (request.status === "awaiting_payment") {
          return res.status(409).json({ message: "Payment required before rejecting order" });
        }
        const assignedTech = request.technician_id ?? request.technicianId;
        if (assignedTech && assignedTech !== technician.id) {
          return res.status(403).json({ message: "Order assigned to another technician" });
        }
        if (request.status === "rejected_by_technician") {
          return res.json(request);
        }
        const createdAt = request.created_at ?? request.createdAt ?? new Date().toISOString();
        const trackingSteps = normalizeTrackingSteps(
          request.tracking_steps ?? request.trackingSteps,
          "rejected_by_technician",
          createdAt,
        );
        const payload = {
          status: "rejected_by_technician",
          rejected_at: new Date().toISOString(),
          technician_id: null,
          tracking_steps: trackingSteps,
        };
        const { resp: updResp, data: updData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(orderId)}`,
          { method: "PATCH", body: payload, headers: { Prefer: "return=representation" } },
        );
        if (!updResp.ok) {
          return res.status(500).json({ message: "Failed to reject order" });
        }
        const updated = Array.isArray(updData) ? updData[0] : updData;
        const requestUserId = request.user_id ?? request.userId;
        if (requestUserId) {
          await triggerSystemNotification("rejected_by_technician", { userId: requestUserId, orderId }, getRequestLang(req));
        }
        console.log("[TECH][ORDER][REJECT]", {
          technicianId: technician.id,
          orderId,
        });
        res.json(updated);
      } catch (error) {
        console.error("[TECH][ORDER][REJECT] Error:", error);
        res.status(500).json({ message: "Failed to reject order" });
      }
    },
  );

  app.patch(
    "/api/service-requests/:id/status",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        const { resp: techResp, data: techData } = await pgFetch(
          `/technicians?user_id=eq.${encodeURIComponent(userUuid)}&select=id,status,is_active`,
        );
        if (!techResp.ok) {
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(techData) ? techData[0] : techData?.[0];
        if (!technician || technician.status !== "approved" || technician.is_active !== true) {
          return res.status(403).json({ message: "Technician not active" });
        }
        const orderId = req.params.id;
        const nextStatus = String(req.body?.status || "");
        const allowedStatuses = ["on_the_way", "working", "in_progress"];
        if (!allowedStatuses.includes(nextStatus)) {
          return res.status(400).json({ message: "Invalid status transition" });
        }
        const { resp: srResp, data: srData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(orderId)}&limit=1`,
        );
        if (!srResp.ok || !Array.isArray(srData) || srData.length === 0) {
          return res.status(404).json({ message: "Service request not found" });
        }
        const request = srData[0];
        if (request.status === "completed") {
          return res.status(409).json({ message: "Order already completed" });
        }
        if (["awaiting_payment", "payment_completed", "assigned", "assigned_to_technician"].includes(request.status)) {
          return res.status(409).json({ message: "Order not yet started by technician" });
        }
        const assignedTech = request.technician_id ?? request.technicianId;
        if (!assignedTech || assignedTech !== technician.id) {
          return res.status(403).json({ message: "Order not assigned to technician" });
        }
        if (request.status === nextStatus) {
          return res.json(request);
        }
        const createdAt = request.created_at ?? request.createdAt ?? new Date().toISOString();
        const trackingSteps = normalizeTrackingSteps(
          request.tracking_steps ?? request.trackingSteps,
          nextStatus,
          createdAt,
        );
        const payload = {
          status: nextStatus,
          tracking_steps: trackingSteps,
        };
        const { resp: updResp, data: updData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(orderId)}`,
          { method: "PATCH", body: payload, headers: { Prefer: "return=representation" } },
        );
        if (!updResp.ok) {
          return res.status(500).json({ message: "Failed to update status" });
        }
        const updated = Array.isArray(updData) ? updData[0] : updData;
        const requestUserId = request.user_id ?? request.userId;
        if (requestUserId) {
          await triggerSystemNotification(nextStatus, { userId: requestUserId, orderId }, getRequestLang(req));
        }
        console.log("[TECH][ORDER][STATUS_CHANGE]", {
          technicianId: technician.id,
          orderId,
          status: nextStatus,
        });
        res.json(updated);
      } catch (error) {
        console.error("[TECH][ORDER][STATUS_CHANGE] Error:", error);
        res.status(500).json({ message: "Failed to update status" });
      }
    },
  );

  app.post(
    "/api/technician/orders/:id/complete",
    isAuthenticated,
    bikePhotoUpload,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        const { resp: techResp, data: techData } = await pgFetch(
          `/technicians?user_id=eq.${encodeURIComponent(userUuid)}&select=id,status,is_active`,
        );
        if (!techResp.ok) {
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(techData) ? techData[0] : techData?.[0];
        if (!technician || technician.status !== "approved" || technician.is_active !== true) {
          return res.status(403).json({ message: "Technician not active" });
        }
        const orderId = req.params.id;
        const { resp: srResp, data: srData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(orderId)}&limit=1`,
        );
        if (!srResp.ok || !Array.isArray(srData) || srData.length === 0) {
          return res.status(404).json({ message: "Service request not found" });
        }
        const request = srData[0];
        if (request.status === "completed") {
          return res.json(request);
        }
        if (["awaiting_payment", "payment_completed", "assigned", "assigned_to_technician"].includes(request.status)) {
          return res.status(409).json({ message: "Order not ready to complete" });
        }
        const assignedTech = request.technician_id ?? request.technicianId;
        if (!assignedTech || assignedTech !== technician.id) {
          return res.status(403).json({ message: "Order not assigned to technician" });
        }
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) {
          return res.status(400).json({ message: "Completion photo required" });
        }
        const bucket = process.env.SUPABASE_COMPLETIONS_BUCKET || "service-completions";
        const timestamp = Date.now();
        const extension = file.originalname.split(".").pop() || "jpg";
        const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
        const path = `order-completions/${orderId}/${timestamp}.${safeExtension}`;

        let imageUrl: string | null = null;
        let imageUploaded = false;
        let imageUploadError: string | null = null;

        try {
          await ensureStorageBucket(bucket, { public: true });
          imageUrl = await uploadToStorageRest({
            file,
            path,
            bucket,
          });
          imageUploaded = true;
        } catch (uploadError: any) {
          imageUploadError = uploadError?.message || "Image upload failed";
          console.error("[TECH][ORDER][COMPLETE][UPLOAD_FAILED]", {
            orderId,
            bucket,
            path,
            error: imageUploadError,
          });
        }

        const createdAt = request.created_at ?? request.createdAt ?? new Date().toISOString();
        const trackingSteps = normalizeTrackingSteps(
          request.tracking_steps ?? request.trackingSteps,
          "completed",
          createdAt,
        );
        const payload: Record<string, any> = {
          status: "completed",
          completed_at: new Date().toISOString(),
          tracking_steps: trackingSteps,
        };
        if (imageUrl) {
          payload.completed_image_url = imageUrl;
        }
        const { resp: updResp, data: updData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(orderId)}`,
          { method: "PATCH", body: payload, headers: { Prefer: "return=representation" } },
        );
        if (!updResp.ok) {
          return res.status(500).json({ message: "Failed to complete order" });
        }
        const updated = Array.isArray(updData) ? updData[0] : updData;
        const requestNotes = typeof request?.notes === "string" ? request.notes : "";
        const shopOrderMatch = requestNotes.match(/SHOP_ORDER_ID:\s*([a-zA-Z0-9-]+)/i);
        if (shopOrderMatch?.[1]) {
          const shopOrderId = shopOrderMatch[1];
          try {
            const { resp: shopResp, data: shopData } = await pgFetch(
              `/orders?id=eq.${encodeURIComponent(shopOrderId)}&limit=1`,
            );
            if (shopResp.ok) {
              const shopOrder = Array.isArray(shopData) ? shopData[0] : shopData?.[0];
              const currentSteps = Array.isArray(shopOrder?.tracking_steps)
                ? shopOrder.tracking_steps
                : typeof shopOrder?.tracking_steps === "string"
                ? parseJsonValue(shopOrder.tracking_steps)
                : null;
              const completedSteps = Array.isArray(currentSteps)
                ? currentSteps.map((step: any) => ({
                    ...step,
                    status: "done",
                    timestamp: step?.timestamp || new Date().toISOString(),
                  }))
                : undefined;
              const patchBody: Record<string, any> = { status: "completed" };
              if (completedSteps) {
                patchBody.tracking_steps = completedSteps;
              }
              const { resp: patchResp, data: patchData } = await pgFetch(
                `/orders?id=eq.${encodeURIComponent(shopOrderId)}`,
                { method: "PATCH", body: patchBody, headers: { Prefer: "return=representation" } },
              );
              if (!patchResp.ok) {
                console.error("[SHOP][ORDER][COMPLETE][FAILED]", {
                  orderId: shopOrderId,
                  status: patchResp.status,
                  body: patchData,
                });
              }
            }
          } catch (error) {
            console.error("[SHOP][ORDER][COMPLETE][ERROR]", {
              orderId: shopOrderMatch[1],
              error,
            });
          }
        }
        const requestUserId = request.user_id ?? request.userId;
        if (requestUserId) {
          await triggerSystemNotification("completed", { userId: requestUserId, orderId }, getRequestLang(req));
        }
        console.log("[TECH][ORDER][COMPLETE]", {
          technicianId: technician.id,
          orderId,
        });
        res.json({
          ...(updated || {}),
          completed: true,
          imageUploaded,
          imageUrl,
          imageUploadError,
        });
      } catch (error) {
        console.error("[TECH][ORDER][COMPLETE] Error:", error);
        res.status(500).json({ message: "Failed to complete order" });
      }
    },
  );

  app.post("/api/service-requests", async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      const guestToken = getGuestToken(req);
      const userId = auth ? await ensureUserUuid(auth) : await ensureGuestUserId(guestToken);
      const body = req.body || {};
      const technicianId = body.technicianId;
      const requestedTechnicianId = typeof technicianId === "string" ? technicianId.trim() : "";
      const resolvedTechnicianId = isMockTechnicianId(requestedTechnicianId) ? null : requestedTechnicianId || null;
      const requestedBikeId = typeof body.bikeId === "string" ? body.bikeId.trim() : "";

      const latitudeRaw = body.latitude;
      const longitudeRaw = body.longitude;
      const latitude =
        latitudeRaw !== undefined && latitudeRaw !== null && `${latitudeRaw}`.trim() !== ""
          ? `${latitudeRaw}`.trim()
          : undefined;
      const longitude =
        longitudeRaw !== undefined && longitudeRaw !== null && `${longitudeRaw}`.trim() !== ""
          ? `${longitudeRaw}`.trim()
          : undefined;

      // Basic field-level validation before Zod to return clear errors
      const lang = getRequestLang(req);
      const fieldErrors: { field: string; message: string }[] = [];
      if (!requestedTechnicianId) {
        fieldErrors.push({ field: "technicianId", message: "يجب اختيار فني" });
      }
      if (!body.serviceType || `${body.serviceType}`.trim() === "") {
        fieldErrors.push({ field: "serviceType", message: "يجب اختيار نوع الخدمة" });
      }
      if (latitude === undefined || longitude === undefined) {
        fieldErrors.push({ field: "location", message: "يرجى تحديد الموقع" });
      }
      let resolvedBikeId: string | null = null;
      if (requestedBikeId) {
        const { resp: bikeResp, data: bikeData } = await pgFetch(
          `/bikes?id=eq.${encodeURIComponent(requestedBikeId)}&user_id=eq.${encodeURIComponent(userId)}&select=id`,
        );
        if (!bikeResp.ok) {
          console.warn("[SERVICE_REQUEST][BIKE][LOOKUP_FAILED]", { status: bikeResp.status, body: bikeData });
          fieldErrors.push({
            field: "bikeId",
            message: lang === "ar" ? "تعذر التحقق من الدراجة" : "Failed to validate bike",
          });
        } else {
          const bikeRow = Array.isArray(bikeData) ? bikeData[0] : bikeData?.[0];
          if (!bikeRow?.id) {
            fieldErrors.push({
              field: "bikeId",
              message: lang === "ar" ? "يرجى اختيار دراجة صحيحة" : "Invalid bike selection",
            });
          } else {
            resolvedBikeId = bikeRow.id;
          }
        }
      }

      if (fieldErrors.length) {
        return res
          .status(400)
          .json(normalizeErrorBody(400, { code: "VALIDATION_ERROR", errors: fieldErrors }, lang));
      }

      // Only pass known fields to schema to avoid validation errors
      const isShopDelivery = body.serviceType === "delivery_installation";
      const paymentCompleted =
        isShopDelivery ||
        body.paymentCompleted === true ||
        body.payment_completed === true ||
        body.paymentStatus === "completed" ||
        body.payment_status === "completed";
      if (!paymentCompleted) {
        console.log("[PAYMENT][GATE][CREATE]", {
          userId,
          technicianId: requestedTechnicianId,
        });
      }
      const safePayload: any = {
        serviceType: body.serviceType || "maintenance",
        technicianId: requestedTechnicianId,
        notes: body.notes,
        latitude,
        longitude,
        location: body.location || "Riyadh",
        status: paymentCompleted ? (body.status || "pending") : "awaiting_payment",
      };
      if (resolvedBikeId) safePayload.bikeId = resolvedBikeId;

      console.log("[SERVICE_REQUEST][CREATE][PAYLOAD]", {
        body,
        safePayload,
        userId,
      });

      let requestData;
      try {
        requestData = validateSchema(
          insertServiceRequestSchema.omit({ userId: true }),
          safePayload,
          req,
        );
      } catch (err: any) {
        console.error("[SERVICE_REQUEST][VALIDATION_FAILED]", {
          errors: err?.issues || err?.errors || err?.message,
          safePayload,
        });
        throw err;
      }

      // Technicians location update skipped here to keep service request creation fully local/non-blocking
      const technicianForRequest = paymentCompleted
        ? resolvedTechnicianId ?? requestData.technicianId ?? null
        : null;
      const payload = {
        user_id: userId,
        technician_id: technicianForRequest,
        service_type: requestData.serviceType,
        status: requestData.status,
        location: requestData.location,
        latitude: requestData.latitude,
        longitude: requestData.longitude,
        notes: requestData.notes,
        bike_id: resolvedBikeId ?? ((requestData as any).bikeId || null),
      };

      const createdAtIso = new Date().toISOString();
      const trackingSteps = normalizeTrackingSteps(
        body.trackingSteps ?? body.tracking_steps,
        requestData.status,
        createdAtIso,
      );
      const route = normalizeRoute(body.route ?? body.route_data ?? body.route_json, requestData.location);
      const providedOrderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
      const orderNumber = providedOrderNumber || buildOrderNumber();

      const { resp, data } = await pgFetch("/service_requests", {
        method: "POST",
        body: [payload],
        headers: { Prefer: "return=representation" },
      });

      if (!resp.ok) {
        console.error("[SERVICE_REQUEST][CREATE][REST_FAIL]", { status: resp.status, body: data });
        return res.status(resp.status || 500).json({
          message: "Failed to create service request",
          detail: data?.message || "Service request insert failed",
          fieldErrors: data?.errors || data?.issues,
        });
      }

      const created = Array.isArray(data) ? data[0] : data;
      const createdOrderId = created?.id ?? null;
      if (createdOrderId && userId) {
        await triggerSystemNotification(
          "ORDER_CREATED",
          {
            userId,
            orderId: createdOrderId,
            technicianId: created?.technician_id ?? created?.technicianId ?? null,
          },
          lang,
        );
      }

      const patchPayload: Record<string, any> = {};
      if (trackingSteps) {
        patchPayload.tracking_steps = trackingSteps;
      }
      if (route) {
        patchPayload.route = route;
      }
      if (orderNumber) {
        patchPayload.order_number = orderNumber;
      }

      if (created?.id && Object.keys(patchPayload).length > 0) {
        const { resp: patchResp, data: patchData } = await pgFetch(
          `/service_requests?id=eq.${encodeURIComponent(created.id)}`,
          {
            method: "PATCH",
            body: patchPayload,
            headers: { Prefer: "return=representation" },
          },
        );

        if (patchResp.ok) {
          const patched = Array.isArray(patchData) ? patchData[0] : patchData;
          const technicianIdForNotify = patched?.technician_id ?? patched?.technicianId;
          if (paymentCompleted && technicianIdForNotify) {
            if (userId) {
              const orderId = patched?.id ?? created?.id ?? null;
              if (orderId) {
                await triggerSystemNotification("TECHNICIAN_ASSIGNED", {
                  userId,
                  orderId,
                  technicianId: technicianIdForNotify,
                }, lang);
              }
            }
            const { resp: techResp, data: techData } = await pgFetch(
              `/technicians?id=eq.${encodeURIComponent(technicianIdForNotify)}&select=id,user_id`,
            );
            if (techResp.ok) {
              const tech = Array.isArray(techData) ? techData[0] : techData?.[0];
              const techUserId = tech?.user_id ?? tech?.userId;
              if (techUserId) {
                const isArabic = lang === "ar";
                const serviceLabel = requestData?.serviceType || (isArabic ? "خدمة" : "service");
                const locationLabel = requestData?.location || (isArabic ? "موقع العميل" : "customer location");
                await createNotification({
                  userId: techUserId,
                  role: "technician",
                  title: isArabic ? "طلب جديد" : "New request",
                  message: isArabic
                    ? `طلب جديد للخدمة (${serviceLabel}) في ${locationLabel}.`
                    : `New ${serviceLabel} request at ${locationLabel}.`,
                  emoji: "🆕",
                  type: "technician_update",
                  entityType: "service_request",
                  entityId: patched?.id ?? created?.id ?? null,
                  activityType: "technician_route",
                  activityId: patched?.id ?? created?.id ?? null,
                  activityState: "assigned",
                });
              }
            }
          }
          res.status(201).json(patched || created);
          return;
        }

        console.log("[SERVICE_REQUEST][TRACKING][WARN]", {
          status: patchResp.status,
          body: patchData,
        });
      }

      const technicianIdForNotify = created?.technician_id ?? created?.technicianId;
      if (paymentCompleted && technicianIdForNotify) {
        if (userId && created?.id) {
          await triggerSystemNotification("TECHNICIAN_ASSIGNED", {
            userId,
            orderId: created.id,
            technicianId: technicianIdForNotify,
          }, lang);
        }
        const { resp: techResp, data: techData } = await pgFetch(
          `/technicians?id=eq.${encodeURIComponent(technicianIdForNotify)}&select=id,user_id`,
        );
        if (techResp.ok) {
          const tech = Array.isArray(techData) ? techData[0] : techData?.[0];
          const techUserId = tech?.user_id ?? tech?.userId;
          if (techUserId) {
            const isArabic = lang === "ar";
            const serviceLabel = requestData?.serviceType || (isArabic ? "خدمة" : "service");
            const locationLabel = requestData?.location || (isArabic ? "موقع العميل" : "customer location");
            await createNotification({
              userId: techUserId,
              role: "technician",
              title: isArabic ? "طلب جديد" : "New request",
              message: isArabic
                ? `طلب جديد للخدمة (${serviceLabel}) في ${locationLabel}.`
                : `New ${serviceLabel} request at ${locationLabel}.`,
              emoji: "🆕",
              type: "technician_update",
              entityType: "service_request",
              entityId: created?.id ?? null,
              activityType: "technician_route",
              activityId: created?.id ?? null,
              activityState: "assigned",
            });
          }
        }
      }
      res.status(201).json(created);
    } catch (error) {
      const handled = handleRouteError(error, req, res);
      if (handled) return handled;
      console.error("Error creating service request:", error);
      res.status(400).json({
        message: "Failed to create service request",
        detail: (error as any)?.message,
        fieldErrors: (error as any)?.issues || undefined,
      });
    }
  });

  app.patch(
    "/api/service-requests/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        const existingRequest = await storage.getServiceRequest(req.params.id);
        if (!existingRequest) {
          return res.status(404).json({ message: "Service request not found" });
        }

        // Check if user owns the request or is the assigned technician
        const technician = await storage.getTechnician(userUuid);
        const isOwner = existingRequest.userId === userUuid;
        const isTechnician =
          technician && existingRequest.technicianId === technician.id;

        if (!isOwner && !isTechnician) {
          return res.status(403).json({ message: "Forbidden" });
        }

        if (existingRequest.status === "completed" && req.body?.status && req.body.status !== "completed") {
          return res.status(409).json({ message: "Order already completed" });
        }

        if (isTechnician && typeof req.body?.status === "string") {
          const nextStatus = req.body.status;
          const action =
            nextStatus === "accepted"
              ? "ACCEPT"
              : nextStatus === "rejected"
              ? "REJECT"
              : nextStatus === "completed"
              ? "COMPLETE"
              : "UPDATE";
          console.log(`[TECH][ORDERS][${action}]`, {
            technicianId: technician?.id,
            orderId: req.params.id,
            nextStatus,
          });
        }

        const nextStatus = typeof req.body?.status === "string" ? req.body.status : null;
        const nextTechnicianId =
          typeof req.body?.technicianId === "string"
            ? req.body.technicianId
            : typeof req.body?.technician_id === "string"
            ? req.body.technician_id
            : null;
        if (nextStatus && ["accepted", "assigned", "assigned_to_technician"].includes(nextStatus)) {
          const paymentCompleted = await isPaymentCompletedForRequest(req.params.id);
          if (!paymentCompleted) {
            console.log("[PAYMENT][GATE][STATUS_BLOCKED]", { orderId: req.params.id, nextStatus });
            return res.status(409).json({ message: "Payment required before confirming the order" });
          }
        }
        const technicianChanged =
          nextTechnicianId && nextTechnicianId !== existingRequest.technicianId;

        const request = await storage.updateServiceRequest(
          req.params.id,
          req.body,
        );

        if (nextStatus) {
          const createdAt = existingRequest.createdAt ?? new Date().toISOString();
          const trackingSteps = normalizeTrackingSteps(
            (existingRequest as any)?.trackingSteps ?? (existingRequest as any)?.tracking_steps,
            nextStatus,
            createdAt,
          );
          await pgFetch(
            `/service_requests?id=eq.${encodeURIComponent(req.params.id)}`,
            { method: "PATCH", body: { tracking_steps: trackingSteps } },
          ).catch(() => {});
        }

        if (technicianChanged) {
          const paymentCompleted = await isPaymentCompletedForRequest(req.params.id);
          if (!paymentCompleted) {
            console.log("[PAYMENT][GATE][ASSIGN_BLOCKED]", { orderId: req.params.id });
            return res.status(409).json({ message: "Payment required before assigning technician" });
          }
          const { resp: techResp, data: techData } = await pgFetch(
            `/technicians?id=eq.${encodeURIComponent(nextTechnicianId)}&select=id,user_id`,
          );
          if (techResp.ok) {
            const tech = Array.isArray(techData) ? techData[0] : techData?.[0];
            const techUserId = tech?.user_id ?? tech?.userId;
            if (techUserId) {
              const lang = getRequestLang(req);
              const requestUserId = existingRequest.userId;
              if (requestUserId) {
                await triggerSystemNotification(
                  "TECHNICIAN_ASSIGNED",
                  { userId: requestUserId, orderId: req.params.id, technicianId: nextTechnicianId },
                  lang,
                );
              }
              const isArabic = lang === "ar";
              const serviceLabel = existingRequest.serviceType || (isArabic ? "خدمة" : "service");
              const locationLabel = existingRequest.location || (isArabic ? "موقع العميل" : "customer location");
              await createNotification({
                userId: techUserId,
                role: "technician",
                title: isArabic ? "طلب جديد" : "New request",
                message: isArabic
                  ? `طلب جديد للخدمة (${serviceLabel}) في ${locationLabel}.`
                  : `New ${serviceLabel} request at ${locationLabel}.`,
                emoji: "🆕",
                type: "technician_update",
                entityType: "service_request",
                entityId: req.params.id,
                activityType: "technician_route",
                activityId: req.params.id,
                activityState: "assigned",
              });
            }
          }
        }

        if (nextStatus && nextStatus !== existingRequest.status && existingRequest.userId) {
          await triggerSystemNotification(
            nextStatus,
            { userId: existingRequest.userId, orderId: req.params.id },
            getRequestLang(req),
          );
        }

        res.json(request);
      } catch (error) {
        console.error("Error updating service request:", error);
        res.status(500).json({ message: "Failed to update service request" });
      }
    },
  );

  // Notifications
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const { resp, data } = await pgFetch(
        `/notifications?user_id=eq.${encodeURIComponent(userUuid)}&order=created_at.desc`,
      );
      if (!resp.ok) {
        console.warn("[NOTIFICATIONS][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      const notifications = Array.isArray(data) ? data.map(normalizeNotificationRow) : [];
      res.json(notifications);
    } catch (error) {
      console.error("[NOTIFICATIONS][LIST] Error:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const now = new Date().toISOString();
      const { resp, data } = await pgFetch(
        `/notifications?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(userUuid)}`,
        { method: "PATCH", body: { read_at: now }, headers: { Prefer: "return=representation" } },
      );
      if (!resp.ok) {
        return res.status(resp.status || 500).json({ message: "Failed to update notification" });
      }
      const updated = Array.isArray(data) ? data[0] : data;
      res.json(normalizeNotificationRow(updated || {}));
    } catch (error) {
      console.error("[NOTIFICATIONS][READ] Error:", error);
      res.status(500).json({ message: "Failed to update notification" });
    }
  });

  app.post("/api/notifications/mark-read", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const now = new Date().toISOString();
      const { resp } = await pgFetch(
        `/notifications?user_id=eq.${encodeURIComponent(userUuid)}&read_at=is.null`,
        { method: "PATCH", body: { read_at: now } },
      );
      if (!resp.ok) {
        return res.status(resp.status || 500).json({ message: "Failed to update notifications" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[NOTIFICATIONS][MARK_READ] Error:", error);
      res.status(500).json({ message: "Failed to update notifications" });
    }
  });

  app.post("/api/devices/register", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const bodyUserId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (bodyUserId && bodyUserId !== userUuid) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const rawToken = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const rawType = typeof req.body?.tokenType === "string" ? req.body.tokenType.trim() : "";
      const rawPlatform = typeof req.body?.platform === "string" ? req.body.platform.trim() : "";
      const rawDeviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
      const rawAppVersion = typeof req.body?.appVersion === "string" ? req.body.appVersion.trim() : "";
      const rawEnv = typeof req.body?.environment === "string" ? req.body.environment.trim() : "";
      const rawRole = typeof req.body?.role === "string" ? req.body.role.trim() : "";

      if (!rawToken || !rawType) {
        return res.status(400).json({ message: "token and tokenType are required" });
      }

      const tokenType = rawType === "fcm" || rawType === "apns" ? rawType : null;
      if (!tokenType) {
        return res.status(400).json({ message: "tokenType must be 'fcm' or 'apns'" });
      }

      const role = await resolvePushRole({ userId: userUuid, auth, requestedRole: rawRole });
      const row = await registerDeviceToken({
        userId: userUuid,
        token: rawToken,
        tokenType,
        role,
        platform: rawPlatform || null,
        deviceId: rawDeviceId || null,
        appVersion: rawAppVersion || null,
        environment: rawEnv || null,
      });

      if (!row) {
        return res.status(500).json({ message: "Failed to register device" });
      }

      console.log("[DEVICES][REGISTER][SUCCESS]", {
        userId: userUuid,
        tokenType,
        role,
        platform: rawPlatform || null,
        deviceId: rawDeviceId || null,
        environment: rawEnv || null,
      });
      res.json(row);
    } catch (error) {
      console.error("[DEVICES][REGISTER] Error:", error);
      res.status(500).json({ message: "Failed to register device" });
    }
  });

  app.post("/api/notifications/send", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const isInternal = INTERNAL_NOTIFICATION_KEY
        ? req.headers["x-internal-key"] === INTERNAL_NOTIFICATION_KEY
        : false;
      if (!isInternal && auth?.isAdmin !== true) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const payload = req.body || {};
      const userId = typeof payload.userId === "string" ? payload.userId : userUuid;
      const title = typeof payload.title === "string" ? payload.title : "";
      const message = typeof payload.body === "string" ? payload.body : payload.message || "";
      if (!userId || !title || !message) {
        return res.status(400).json({ message: "userId, title, and body are required" });
      }

      const created = await createNotification({
        userId,
        role: payload.role || null,
        title,
        message,
        emoji: payload.emoji || null,
        type: payload.type || null,
        entityType: payload.entityType || null,
        entityId: payload.entityId || null,
        activityType: payload.activityType || null,
        activityId: payload.activityId || null,
        activityState: payload.activityState || null,
        liveActivityPayload: payload.liveActivityPayload || null,
        state: "created",
      });

      res.json(created || { success: false });
    } catch (error) {
      console.error("[NOTIFICATIONS][SEND] Error:", error);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  app.post("/api/live-activities/register", async (req: any, res) => {
    try {
      if (!LIVE_ACTIVITIES_ENABLED) {
        return res.status(503).json({ message: "Live Activities disabled" });
      }
      const resolved = await resolvePushRegisterAuth(req);
      if (!resolved || !("auth" in resolved) || !resolved.auth) {
        const reason = (resolved as any)?.reason || "unauthorized";
        const hasToken = Boolean((resolved as any)?.hasToken);
        console.log("[LIVE_ACTIVITY][REGISTER][AUTH] Unauthorized", { reason, hasToken });
        return res.status(401).json({ message: "Unauthorized", reason });
      }
      const userUuid = await ensureUserUuid(resolved.auth);
      const orderId = typeof req.body?.orderId === "string"
        ? req.body.orderId.trim()
        : typeof req.body?.requestId === "string"
        ? req.body.requestId.trim()
        : "";
      const orderNumber = typeof req.body?.orderNumber === "string" ? req.body.orderNumber.trim() : "";
      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const activityId = typeof req.body?.activityId === "string" ? req.body.activityId.trim() : "";
      const environment = typeof req.body?.environment === "string" ? req.body.environment.trim() : "";
      if (!orderId || !token) {
        return res.status(400).json({ message: "orderId and token are required" });
      }

      const row = await registerLiveActivityToken({
        userId: userUuid,
        orderId,
        orderNumber: orderNumber || null,
        token,
        activityId: activityId || null,
        environment: environment || null,
      });

      if (!row) {
        return res.status(500).json({ message: "Failed to register live activity token" });
      }

      console.log("[LIVE_ACTIVITY][REGISTER][SUCCESS]", {
        userId: userUuid,
        orderId,
        activityId: activityId || null,
        environment: environment || null,
      });
      res.json(row);
    } catch (error) {
      console.error("[LIVE_ACTIVITY][REGISTER] Error:", error);
      res.status(500).json({ message: "Failed to register live activity token" });
    }
  });

  app.post("/api/live-activities/update", isAuthenticated, async (req: any, res) => {
    try {
      if (!LIVE_ACTIVITIES_ENABLED) {
        return res.status(503).json({ message: "Live Activities disabled" });
      }
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const isInternal = INTERNAL_NOTIFICATION_KEY
        ? req.headers["x-internal-key"] === INTERNAL_NOTIFICATION_KEY
        : false;
      if (!isInternal && auth?.isAdmin !== true) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const orderId = typeof req.body?.orderId === "string"
        ? req.body.orderId.trim()
        : typeof req.body?.requestId === "string"
        ? req.body.requestId.trim()
        : "";
      const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
      if (!orderId || !status) {
        return res.status(400).json({ message: "orderId and status are required" });
      }

      const title = typeof req.body?.title === "string" ? req.body.title : null;
      const subtitle = typeof req.body?.subtitle === "string" ? req.body.subtitle : null;
      const message = typeof req.body?.message === "string"
        ? req.body.message
        : typeof req.body?.body === "string"
        ? req.body.body
        : null;
      const technicianName =
        typeof req.body?.technicianName === "string" ? req.body.technicianName : null;
      const etaMinutes = Number.isFinite(req.body?.etaMinutes)
        ? Number(req.body?.etaMinutes)
        : null;
      const result = await sendLiveActivityUpdate({
        orderId,
        status,
        title,
        message,
        subtitle,
        technicianName,
        etaMinutes,
        lang: getRequestLang(req),
      });
      res.json(result);
    } catch (error) {
      console.error("[LIVE_ACTIVITY][UPDATE] Error:", error);
      res.status(500).json({ message: "Failed to update live activity" });
    }
  });

  app.post("/api/live-activities/end", isAuthenticated, async (req: any, res) => {
    try {
      if (!LIVE_ACTIVITIES_ENABLED) {
        return res.status(503).json({ message: "Live Activities disabled" });
      }
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const isInternal = INTERNAL_NOTIFICATION_KEY
        ? req.headers["x-internal-key"] === INTERNAL_NOTIFICATION_KEY
        : false;
      if (!isInternal && auth?.isAdmin !== true) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const orderId = typeof req.body?.orderId === "string"
        ? req.body.orderId.trim()
        : typeof req.body?.requestId === "string"
        ? req.body.requestId.trim()
        : "";
      const status = typeof req.body?.status === "string" ? req.body.status.trim() : "completed";
      if (!orderId) {
        return res.status(400).json({ message: "orderId is required" });
      }

      const title = typeof req.body?.title === "string" ? req.body.title : null;
      const subtitle = typeof req.body?.subtitle === "string" ? req.body.subtitle : null;
      const message = typeof req.body?.message === "string"
        ? req.body.message
        : typeof req.body?.body === "string"
        ? req.body.body
        : null;
      const technicianName =
        typeof req.body?.technicianName === "string" ? req.body.technicianName : null;
      const etaMinutes = Number.isFinite(req.body?.etaMinutes)
        ? Number(req.body?.etaMinutes)
        : null;
      const result = await sendLiveActivityUpdate({
        orderId,
        status,
        title,
        message,
        subtitle,
        technicianName,
        etaMinutes,
        lang: getRequestLang(req),
      });
      res.json(result);
    } catch (error) {
      console.error("[LIVE_ACTIVITY][END] Error:", error);
      res.status(500).json({ message: "Failed to end live activity" });
    }
  });

  app.post("/api/push/register", async (req: any, res) => {
    try {
      // Any authenticated user can register their device token; no admin check here.
      const resolved = await resolvePushRegisterAuth(req);
      if (!resolved || !("auth" in resolved) || !resolved.auth) {
        const reason = (resolved as any)?.reason || "unauthorized";
        const hasToken = Boolean((resolved as any)?.hasToken);
        console.log("[PUSH][REGISTER][AUTH] Unauthorized", {
          reason,
          hasToken,
          authError: (req as any)?.authError || null,
        });
        return res.status(401).json({ message: "Unauthorized", reason });
      }
      console.log("[PUSH][REGISTER][AUTH]", { method: resolved.method, userId: resolved.auth.userId });
      const userUuid = await ensureUserUuid(resolved.auth);
      const rawToken = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const rawType = typeof req.body?.tokenType === "string" ? req.body.tokenType.trim() : "";
      const rawPlatform = typeof req.body?.platform === "string" ? req.body.platform.trim() : "";
      const rawDeviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
      const rawAppVersion = typeof req.body?.appVersion === "string" ? req.body.appVersion.trim() : "";
      const rawEnv = typeof req.body?.environment === "string" ? req.body.environment.trim() : "";
      const rawRole = typeof req.body?.role === "string" ? req.body.role.trim() : "";

      if (!rawToken || !rawType) {
        return res.status(400).json({ message: "token and tokenType are required" });
      }

      const tokenType = rawType === "fcm" || rawType === "apns" ? rawType : null;
      if (!tokenType) {
        return res.status(400).json({ message: "tokenType must be 'fcm' or 'apns'" });
      }

      const role = await resolvePushRole({ userId: userUuid, auth: resolved.auth, requestedRole: rawRole });
      const row = await registerDeviceToken({
        userId: userUuid,
        token: rawToken,
        tokenType,
        role,
        platform: rawPlatform || null,
        deviceId: rawDeviceId || null,
        appVersion: rawAppVersion || null,
        environment: rawEnv || null,
      });

      if (!row) {
        console.warn("[PUSH][REGISTER][FAILED]", { userId: userUuid });
        return res.status(500).json({ message: "Failed to register push token" });
      }

      console.log("[PUSH][REGISTER][SUCCESS]", {
        userId: userUuid,
        tokenType,
        role,
        platform: rawPlatform || null,
        deviceId: rawDeviceId || null,
        environment: rawEnv || null,
        bundleId: process.env.APNS_BUNDLE_ID || null,
      });
      res.json(row);
    } catch (error) {
      console.error("[PUSH][REGISTER] Error:", error);
      res.status(500).json({ message: "Failed to register push token" });
    }
  });

  app.post("/api/push/unregister", async (req: any, res) => {
    try {
      const resolved = await resolvePushRegisterAuth(req);
      if (!resolved || !("auth" in resolved) || !resolved.auth) {
        const reason = (resolved as any)?.reason || "unauthorized";
        const hasToken = Boolean((resolved as any)?.hasToken);
        console.log("[PUSH][UNREGISTER][AUTH] Unauthorized", { reason, hasToken });
        return res.status(401).json({ message: "Unauthorized", reason });
      }
      const userUuid = await ensureUserUuid(resolved.auth);
      const rawDeviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
      const rawPlatform = typeof req.body?.platform === "string" ? req.body.platform.trim() : "";
      const rawTokenType = typeof req.body?.tokenType === "string" ? req.body.tokenType.trim() : "";
      const rawToken = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      if (!rawDeviceId && !rawToken) {
        return res.status(400).json({ message: "deviceId or token is required" });
      }

      const filters = [
        `user_id=eq.${encodeURIComponent(userUuid)}`,
        rawDeviceId ? `device_id=eq.${encodeURIComponent(rawDeviceId)}` : null,
        rawPlatform ? `platform=eq.${encodeURIComponent(rawPlatform)}` : null,
        rawTokenType ? `token_type=eq.${encodeURIComponent(rawTokenType)}` : null,
        rawToken ? `token=eq.${encodeURIComponent(rawToken)}` : null,
      ].filter(Boolean);

      const { resp, data } = await pgFetch(`/push_tokens?${filters.join("&")}`, {
        method: "PATCH",
        body: { is_active: false, updated_at: new Date().toISOString() },
        headers: { Prefer: "return=representation" },
      });
      if (!resp.ok) {
        console.log("[PUSH][UNREGISTER][FAILED]", { status: resp.status, body: data });
        return res.status(500).json({ message: "Failed to unregister push token" });
      }
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      console.log("[PUSH][UNREGISTER][SUCCESS]", {
        userId: userUuid,
        count: rows.length,
        deviceId: rawDeviceId || null,
      });
      res.json({ success: true, count: rows.length });
    } catch (error) {
      console.error("[PUSH][UNREGISTER] Error:", error);
      res.status(500).json({ message: "Failed to unregister push token" });
    }
  });

  app.get("/api/technician-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const orderId = typeof req.query?.orderId === "string" ? req.query.orderId : null;
      const filter = orderId
        ? `/technician_reviews?user_id=eq.${encodeURIComponent(userUuid)}&order_id=eq.${encodeURIComponent(orderId)}`
        : `/technician_reviews?user_id=eq.${encodeURIComponent(userUuid)}`;
      const { resp, data } = await pgFetch(filter);
      if (!resp.ok) {
        return res.json([]);
      }
      res.json(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("[REVIEWS][LIST] Error:", error);
      res.json([]);
    }
  });

  app.post("/api/technician-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const { orderId, rating, comment } = req.body || {};
      const numericRating = Number(rating);
      if (!orderId || !Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ message: "Invalid rating payload" });
      }
      const { resp: srResp, data: srData } = await pgFetch(
        `/service_requests?id=eq.${encodeURIComponent(orderId)}&limit=1`,
      );
      if (!srResp.ok || !Array.isArray(srData) || srData.length === 0) {
        return res.status(404).json({ message: "Service request not found" });
      }
      const request = srData[0];
      const requestUserId = request.user_id ?? request.userId;
      const technicianId = request.technician_id ?? request.technicianId;
      if (!technicianId) {
        return res.status(400).json({ message: "No technician assigned" });
      }
      if (requestUserId !== userUuid) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (request.status !== "completed") {
        return res.status(400).json({ message: "Order not completed" });
      }
      const payload = {
        technician_id: technicianId,
        order_id: orderId,
        user_id: userUuid,
        rating: numericRating,
        comment: comment || null,
      };
      const { resp: reviewResp, data: reviewData } = await pgFetch(
        `/technician_reviews?on_conflict=order_id,user_id`,
        {
          method: "POST",
          body: [payload],
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        },
      );
      if (!reviewResp.ok) {
        return res.status(500).json({ message: "Failed to save review" });
      }
      const saved = Array.isArray(reviewData) ? reviewData[0] : reviewData;
      const { resp: listResp, data: listData } = await pgFetch(
        `/technician_reviews?technician_id=eq.${encodeURIComponent(technicianId)}&select=rating`,
      );
      if (listResp.ok && Array.isArray(listData) && listData.length > 0) {
        const total = listData.reduce((sum: number, row: any) => sum + Number(row.rating || 0), 0);
        const count = listData.length;
        const avg = Number((total / count).toFixed(2));
        await pgFetch(`/technicians?id=eq.${encodeURIComponent(technicianId)}`, {
          method: "PATCH",
          body: { rating: avg, review_count: count },
          headers: { Prefer: "return=representation" },
        }).catch(() => {});
      }
      res.status(201).json(saved);
    } catch (error) {
      console.error("[REVIEWS][CREATE] Error:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // Support tickets (admin/support)
  app.get("/api/admin/support-tickets", isAuthenticated, async (req, res) => {
    const guard = await requireAnyRoleOrAdmin(req, res, ["support", "project_manager"]);
    if (!guard.ok) return;
    try {
      const { resp, data } = await pgFetch("/support_tickets?order=created_at.desc");
      if (!resp.ok) {
        console.log("[ADMIN][SUPPORT][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      const tickets = Array.isArray(data) ? data : [];
      const withReplies = await attachSupportReplies(tickets);
      res.json(withReplies);
    } catch (error) {
      console.error("[ADMIN][SUPPORT][LIST] Error:", error);
      res.json([]);
    }
  });

  app.patch("/api/admin/support-tickets/:id/status", isAuthenticated, async (req, res) => {
    const guard = await requireAnyRoleOrAdmin(req, res, ["support", "project_manager"]);
    if (!guard.ok) return;
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (!["open", "replied", "closed"].includes(status)) {
      return res.status(400).json({ message: "status must be open, replied, or closed" });
    }
    try {
      const { resp, data } = await pgFetch(
        `/support_tickets?id=eq.${encodeURIComponent(req.params.id)}`,
        {
          method: "PATCH",
          body: { status, updated_at: new Date().toISOString() },
          headers: { Prefer: "return=representation" },
        },
      );
      if (!resp.ok) {
        console.log("[ADMIN][SUPPORT][STATUS][FAILED]", { status: resp.status, body: data });
        return res.status(404).json({ message: "Ticket not found" });
      }
      const updated = Array.isArray(data) ? data[0] : data;
      res.json(updated);
    } catch (error) {
      console.error("[ADMIN][SUPPORT][STATUS] Error:", error);
      res.status(500).json({ message: "Failed to update ticket status" });
    }
  });

  app.post("/api/admin/support-tickets/:id/reply", isAuthenticated, async (req, res) => {
    const guard = await requireAnyRoleOrAdmin(req, res, ["support", "project_manager"]);
    if (!guard.ok) return;
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }
    try {
      const { userUuid } = guard;
      const now = new Date().toISOString();
      const replyPayload = {
        ticket_id: req.params.id,
        sender_id: userUuid,
        sender_role: "admin",
        message,
      };
      const { resp: replyResp, data: replyData } = await pgFetch("/support_ticket_replies", {
        method: "POST",
        body: [replyPayload],
        headers: { Prefer: "return=representation" },
      });
      if (!replyResp.ok) {
        console.log("[ADMIN][SUPPORT][REPLY][STORE_FAILED]", { status: replyResp.status, body: replyData });
        return res.status(500).json({ message: "Failed to store reply" });
      }
      const payload = {
        reply_message: message,
        replied_at: now,
        replied_by: userUuid,
        status: "replied",
        updated_at: now,
      };
      const { resp, data } = await pgFetch(
        `/support_tickets?id=eq.${encodeURIComponent(req.params.id)}`,
        { method: "PATCH", body: payload, headers: { Prefer: "return=representation" } },
      );
      if (!resp.ok) {
        console.log("[ADMIN][SUPPORT][REPLY][FAILED]", { status: resp.status, body: data });
        return res.status(404).json({ message: "Ticket not found" });
      }
      const updated = Array.isArray(data) ? data[0] : data;
      res.json(updated);
    } catch (error) {
      console.error("[ADMIN][SUPPORT][REPLY] Error:", error);
      res.status(500).json({ message: "Failed to reply to ticket" });
    }
  });

  app.post("/api/admin/notifications/broadcast", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const lang = getRequestLang(req);
      const rawTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const rawMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const rawEmoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim() : "";
      const rawType = typeof req.body?.type === "string" ? req.body.type.trim() : "";
      const rawTarget = typeof req.body?.target === "string" ? req.body.target.trim() : "";

      if (!rawMessage) {
        return res.status(400).json({ message: "message is required" });
      }

      const title = rawTitle || (lang === "ar" ? "إشعار من الإدارة" : "Admin notification");
      const emoji = rawEmoji || "📣";
      const type = rawType || "admin_broadcast";
      const target = rawTarget === "technicians" || rawTarget === "riders" ? rawTarget : "all";
      const auth = getAuthContext(req);
      const sentBy = auth ? await ensureUserUuid(auth) : null;
      const sentAt = new Date().toISOString();

      let userIds: string[] = [];
      if (target === "technicians") {
        const { resp: techResp, data: techData } = await pgFetch(
          "/technicians?select=user_id&status=eq.approved&is_active=eq.true",
        );
        if (!techResp.ok) {
          return res.status(techResp.status || 500).json({ message: "Failed to load technicians" });
        }
        userIds = (Array.isArray(techData) ? techData : [])
          .map((row) => row?.user_id)
          .filter(Boolean);
      } else {
        const { resp: usersResp, data: usersData } = await pgFetch("/users?select=id");
        if (!usersResp.ok) {
          return res.status(usersResp.status || 500).json({ message: "Failed to load users" });
        }
        const users = Array.isArray(usersData) ? usersData : [];
        userIds = users.map((user) => user?.id).filter(Boolean);

        if (target === "riders") {
          const { resp: techResp, data: techData } = await pgFetch("/technicians?select=user_id");
          if (!techResp.ok) {
            return res.status(techResp.status || 500).json({ message: "Failed to load technicians" });
          }
          const technicianIds = new Set(
            (Array.isArray(techData) ? techData : []).map((row) => row?.user_id).filter(Boolean),
          );
          userIds = userIds.filter((id) => !technicianIds.has(id));
        }
      }

      if (userIds.length === 0) {
        return res.json({ sent: 0 });
      }

      await pgFetch("/notification_logs", {
        method: "POST",
        body: [
          {
            title,
            body: rawMessage,
            target,
            sent_by: sentBy,
            sent_at: sentAt,
            status: "sent",
          },
        ],
        headers: { Prefer: "return=representation" },
      }).catch((error) => {
        console.warn("[NOTIFICATIONS][LOG][FAILED]", error);
      });

      const resolvedRole =
        target === "technicians" ? "technician" : target === "riders" ? "customer" : null;
      let sent = 0;

      for (const userId of userIds) {
        const created = await createNotification({
          userId,
          role: resolvedRole,
          title,
          message: rawMessage,
          emoji,
          type: "admin",
          entityType: "broadcast",
          state: "created",
        });
        if (created) {
          sent += 1;
        }
      }

      res.json({ sent });
    } catch (error) {
      console.error("[NOTIFICATIONS][BROADCAST] Error:", error);
      res.status(500).json({ message: "Failed to broadcast notifications" });
    }
  });

  app.get("/api/admin/notifications/logs", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { resp, data } = await pgFetch("/notification_logs?order=sent_at.desc&limit=50");
      if (!resp.ok) {
        console.warn("[NOTIFICATIONS][LOG][LIST_FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      const logs = Array.isArray(data) ? data.map(normalizeNotificationLogRow) : [];
      res.json(logs);
    } catch (error) {
      console.error("[NOTIFICATIONS][LOG][LIST] Error:", error);
      res.json([]);
    }
  });

  // Parts routes
  app.get("/api/parts", async (req, res) => {
    try {
      const { category } = req.query;
      const filter = category ? `?category=eq.${encodeURIComponent(category as string)}` : "";
      const { resp, data } = await pgFetch(`/parts${filter}`);
      if (!resp.ok) {
        console.log("[PARTS][GET][FAILED]", { status: resp.status, body: data });
        return res.status(500).json({ message: "Failed to fetch parts" });
      }
      res.json(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching parts:", error);
      res.status(500).json({ message: "Failed to fetch parts" });
    }
  });

  app.get("/api/admin/parts", isAuthenticated, async (req, res) => {
    const guard = await requireAnyRoleOrAdmin(req, res, ["sales"]);
    if (!guard.ok) return;
    try {
      const { resp, data } = await pgFetch("/parts?order=created_at.desc");
      if (!resp.ok) {
        console.log("[ADMIN][PARTS][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      res.json(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("[ADMIN][PARTS][LIST] Error:", error);
      res.json([]);
    }
  });

  // Admin Parts Management with Image Upload
  app.post(
    "/api/admin/parts",
    isAuthenticated,
    partImageUpload,
    async (req: any, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["sales"]);
      if (!guard.ok) return;
      try {
        console.log("[ADMIN][PARTS][CREATE] start");
        
        const rawName = req.body.name;
        const rawNameEn = req.body.nameEn || req.body.name_en || req.body.name;
        const rawPrice = req.body.price;

        // Parse part data from form
        const partData = {
          name: rawName,
          nameEn: rawNameEn,
          category: req.body.category,
          price: rawPrice !== undefined && rawPrice !== null ? String(rawPrice) : rawPrice,
          inStock: req.body.inStock === "true" || req.body.inStock === true || req.body.inStock === "True",
          imageUrl: null as string | null,
        };

        // Upload image to Supabase if provided (REST)
        const file = req.file as Express.Multer.File;
        if (file) {
          // Sanitize filename - remove spaces and special characters
          const timestamp = Date.now();
          const fileExtension = file.originalname.split('.').pop() || 'jpg';
          const sanitizedName = `part_${timestamp}.${fileExtension}`;
          const fileName = `part-images/${sanitizedName}`;

          partData.imageUrl = await uploadToStorageRest({
            file,
            path: fileName,
          });
          console.log("[ADMIN][PARTS][CREATE][UPLOAD] ok", { url: partData.imageUrl });
        }

        const validatedData = validateSchema(insertPartSchema, partData, req);
        const payload = {
          name: validatedData.name,
          name_en: validatedData.nameEn,
          category: validatedData.category,
          price: validatedData.price,
          in_stock: validatedData.inStock,
          image_url: validatedData.imageUrl,
        };

        const { resp, data } = await pgFetch("/parts", {
          method: "POST",
          body: [payload],
          headers: { Prefer: "return=representation" },
        });

        if (!resp.ok) {
          console.log("[ADMIN][PARTS][CREATE][FAILED]", { status: resp.status, body: data });
          throw new AppError({
            code: "SERVER_ERROR",
            status: resp.status || 500,
            message: "Failed to create part",
          });
        }

        const created = Array.isArray(data) ? data[0] : data;
        console.log("[ADMIN][PARTS][CREATE][OK]", { id: created?.id });
        res.status(201).json(created);
      } catch (error) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("[ADMIN][PARTS][CREATE] Error:", error);
        res.status(500).json({ message: "Failed to create part" });
      }
    }
  );

  // Upload image for existing part
  app.post(
    "/api/admin/parts/:id/image",
    isAuthenticated,
    partImageUpload,
    async (req: any, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["sales"]);
      if (!guard.ok) return;
      try {
        const partId = req.params.id;
        const file = req.file as Express.Multer.File;
        
        if (!file) {
          return res.status(400).json({ message: "No image uploaded" });
        }

        const { resp: partResp, data: partData } = await pgFetch(`/parts?id=eq.${encodeURIComponent(partId)}&select=id`);
        const existingPart = Array.isArray(partData) ? partData[0] : partData?.[0];
        if (!partResp.ok || !existingPart) {
          return res.status(404).json({ message: "Part not found" });
        }

        // Upload to Supabase (REST)
        const timestamp = Date.now();
        const fileExtension = file.originalname.split('.').pop() || 'jpg';
        const sanitizedName = `part_${timestamp}.${fileExtension}`;
        const fileName = `part-images/${partId}/${sanitizedName}`;

        const imageUrl = await uploadToStorageRest({
          file,
          path: fileName,
        });

        const { resp: updateResp, data: updateData } = await pgFetch(
          `/parts?id=eq.${encodeURIComponent(partId)}`,
          { method: "PATCH", body: { image_url: imageUrl }, headers: { Prefer: "return=representation" } },
        );
        if (!updateResp.ok) {
          console.log("[ADMIN][PARTS][IMAGE][FAILED]", { status: updateResp.status, body: updateData });
          return res.status(500).json({ message: "Failed to upload image" });
        }

        const updatedPart = Array.isArray(updateData) ? updateData[0] : updateData?.[0];

        console.log(`[ADMIN][PARTS] Image uploaded for part ${partId}: ${imageUrl}`);
        res.json({ 
          success: true, 
          imageUrl,
          part: updatedPart 
        });
      } catch (error) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("[ADMIN][PARTS][IMAGE] Error:", error);
        res.status(500).json({ message: "Failed to upload part image" });
      }
    }
  );

  // Update part
  app.patch(
    "/api/admin/parts/:id",
    isAuthenticated,
    async (req: any, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["sales"]);
      if (!guard.ok) return;
      try {
        const partId = req.params.id;
        const { resp: partResp, data: partData } = await pgFetch(`/parts?id=eq.${encodeURIComponent(partId)}&select=id`);
        const existingPart = Array.isArray(partData) ? partData[0] : partData?.[0];
        if (!partResp.ok || !existingPart) {
          return res.status(404).json({ message: "Part not found" });
        }

        const patchBody: any = {};
        if (req.body.name !== undefined) patchBody.name = req.body.name;
        if (req.body.nameEn !== undefined) patchBody.name_en = req.body.nameEn;
        if (req.body.category !== undefined) patchBody.category = req.body.category;
        if (req.body.price !== undefined) patchBody.price = req.body.price;
        if (req.body.inStock !== undefined) {
          const v = req.body.inStock;
          patchBody.in_stock = v === true || v === "true" || v === "True";
        }
        if (req.body.isActive !== undefined) {
          const v = req.body.isActive;
          patchBody.is_active = v === true || v === "true" || v === "True";
        }

        const { resp: updateResp, data: updateData } = await pgFetch(
          `/parts?id=eq.${encodeURIComponent(partId)}`,
          { method: "PATCH", body: patchBody, headers: { Prefer: "return=representation" } },
        );
        if (!updateResp.ok) {
          console.log("[ADMIN][PARTS][PATCH][FAILED]", { status: updateResp.status, body: updateData });
          return res.status(500).json({ message: "Failed to update part" });
        }
        const updatedPart = Array.isArray(updateData) ? updateData[0] : updateData?.[0];
        res.json(updatedPart);
      } catch (error) {
        console.error("[ADMIN][PARTS][PATCH] Error:", error);
        res.status(500).json({ message: "Failed to update part" });
      }
    }
  );

  // Delete part
  app.delete(
    "/api/admin/parts/:id",
    isAuthenticated,
    async (req: any, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["sales"]);
      if (!guard.ok) return;
      try {
        const partId = req.params.id;
        const { resp: delResp, data: delData } = await pgFetch(
          `/parts?id=eq.${encodeURIComponent(partId)}`,
          { method: "DELETE" },
        );
        if (!delResp.ok) {
          console.log("[ADMIN][PARTS][DELETE][FAILED]", { status: delResp.status, body: delData });
          return res.status(500).json({ message: "Failed to delete part" });
        }
        res.status(204).send();
      } catch (error) {
        console.error("[ADMIN][PARTS][DELETE] Error:", error);
        res.status(500).json({ message: "Failed to delete part" });
      }
    }
  );

  // Admin routes - Protected with role-aware guards
  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    const guard = await requireAnyRoleOrAdmin(req, res, ["project_manager"]);
    if (!guard.ok) return;
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching all users:", error);
      try {
        const { resp, data } = await pgFetch("/users?order=created_at.desc");
        if (!resp.ok) {
          console.log("[ADMIN][USERS][LIST][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        const rows = Array.isArray(data) ? data : [];
        res.json(rows.map(normalizeUserRow));
      } catch (fallbackError) {
        console.error("[ADMIN][USERS][LIST] Fallback failed:", fallbackError);
        res.json([]);
      }
    }
  });

  app.get("/api/roles/me", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const roles = await loadRolesFromDb();
      const roleById = new Map(roles.map((role) => [role.id, role.name]));
      let userRoleIds: string[] = [];
      try {
        const storageRoles = await storage.getUserRoles(userUuid);
        userRoleIds = storageRoles.map((item) => item.roleId);
      } catch (error) {
        const { resp, data } = await pgFetch(
          `/user_roles?user_id=eq.${encodeURIComponent(userUuid)}&select=role_id`,
        );
        if (resp.ok) {
          userRoleIds = (Array.isArray(data) ? data : []).map((row: any) => row.role_id);
        }
      }
      const roleNames = userRoleIds
        .map((id) => roleById.get(id))
        .filter((name): name is string => !!name);
      res.json({ isAdmin: auth.isAdmin === true, roles: roleNames });
    } catch (error) {
      console.error("[ROLES][ME] Error:", error);
      res.json({ isAdmin: false, roles: [] });
    }
  });

  app.get("/api/admin/bikes", isAuthenticated, async (req, res) => {
    const guard = await requireAnyRoleOrAdmin(req, res, ["project_manager"]);
    if (!guard.ok) return;
    try {
      const { resp, data } = await pgFetch("/bikes?order=created_at.desc");
      if (!resp.ok) {
        console.log("[ADMIN][BIKES][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      const bikes = Array.isArray(data) ? data.map(normalizeBikeRow) : [];
      const userIds = bikes.map((bike) => bike.userId).filter(Boolean);
      let usersById = new Map<string, any>();
      if (userIds.length > 0) {
        const ids = userIds.map((id) => encodeURIComponent(id)).join(",");
        const { resp: userResp, data: userData } = await pgFetch(`/users?id=in.(${ids})`);
        if (userResp.ok) {
          const users = Array.isArray(userData) ? userData.map(normalizeUserRow) : [];
          usersById = new Map(users.map((user) => [user.id, user]));
        }
      }
      const enriched = bikes.map((bike) => {
        const owner = bike.userId ? usersById.get(bike.userId) : null;
        return {
          ...bike,
          ownerName: buildUserDisplayName(owner),
          ownerEmail: owner?.email ?? null,
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching all bikes:", error);
      res.status(500).json({ message: "Failed to fetch bikes" });
    }
  });

  app.get(
    "/api/admin/technicians",
    isAuthenticated,
    async (req, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["project_manager"]);
      if (!guard.ok) return;
      try {
        const { resp, data } = await pgFetch("/technicians?select=*,user:users(email,first_name,last_name)&order=created_at.desc");
      if (!resp.ok) {
        console.log("[ADMIN][TECH][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      res.json(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching all technicians:", error);
      res.json([]);
    }
  },
);

  app.get(
    "/api/admin/technicians/locations",
    isAuthenticated,
    async (req, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["project_manager"]);
      if (!guard.ok) return;
      try {
        const techFilter =
          "/technicians?status=eq.approved&is_active=eq.true&is_available=eq.true&select=id,user_id,phone_number,location,latitude,longitude,rating,review_count,user:users(email,first_name,last_name)";
        console.info("[ADMIN][TECH][LOC][QUERY]", { filter: techFilter });
        const { resp: techResp, data: techData } = await pgFetch(techFilter);
        if (!techResp.ok) {
          console.log("[ADMIN][TECH][LOC][FAILED]", { status: techResp.status, body: techData });
          return res.json([]);
        }
        const technicians = Array.isArray(techData) ? techData : [];
        const techIds = technicians.map((tech: any) => tech?.id).filter(Boolean);

        let locations: any[] = [];
        if (techIds.length > 0) {
          const ids = techIds.map((id: string) => encodeURIComponent(id)).join(",");
          const { resp: locResp, data: locData } = await pgFetch(
            `/technician_locations?technician_id=in.(${ids})`,
          );
          if (locResp.ok && Array.isArray(locData)) {
            locations = locData;
          }
        }

        const locMap = new Map<string, any>();
        locations.forEach((loc: any) => {
          if (loc?.technician_id) locMap.set(loc.technician_id, loc);
        });

        const result = technicians
          .map((tech: any) => {
            const user = tech.user;
            const nameFromUser = user
              ? [user.first_name, user.last_name].filter(Boolean).join(" ")
              : "";
            const resolvedName = tech.name || tech.full_name || nameFromUser || null;
            const loc = locMap.get(tech.id);
            const latitude = Number(loc?.latitude ?? tech.latitude);
            const longitude = Number(loc?.longitude ?? tech.longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              return null;
            }
            return {
              id: tech.id,
              name: resolvedName,
              email: user?.email ?? null,
              phoneNumber: tech.phone_number ?? tech.phoneNumber ?? null,
              rating: tech.rating ?? null,
              reviewCount: tech.review_count ?? tech.reviewCount ?? null,
              latitude,
              longitude,
              lastUpdated: loc?.last_updated ?? null,
            };
          })
          .filter(Boolean);

        res.json(result);
      } catch (error) {
        console.error("[ADMIN][TECH][LOC] Error:", error);
        res.json([]);
      }
    },
  );

  app.get(
    "/api/admin/technicians/pending",
    isAuthenticated,
    async (_req, res) => {
      const guard = await requireAnyRoleOrAdmin(_req, res, ["project_manager"]);
      if (!guard.ok) return;
      try {
        const { resp, data } = await pgFetch("/technicians?status=eq.pending&order=created_at.desc&select=*,user:users(email,first_name,last_name)");
      if (!resp.ok) {
        console.log("[ADMIN][TECH][PENDING][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      res.json(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching pending technicians:", error);
      res.json([]);
    }
  },
);

  app.post(
    "/api/admin/technicians/:id/approve",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const assignerId = await ensureUserUuid(auth);
        const techId = req.params.id;
        console.log("[ADMIN][TECH][APPROVE]", { techId });
        const { resp: fetchResp, data: fetchData } = await pgFetch(
          `/technicians?id=eq.${encodeURIComponent(techId)}&limit=1`,
        );
        if (!fetchResp.ok) {
          console.log("[ADMIN][TECH][APPROVE][FETCH_FAILED]", { status: fetchResp.status, body: fetchData });
          return res.status(404).json({ message: "Technician not found" });
        }
        const existing = Array.isArray(fetchData) ? fetchData[0] : fetchData?.[0];
        if (!existing) {
          return res.status(404).json({ message: "Technician not found" });
        }

        let technician = existing;
        if (existing.status !== "approved" || existing.is_active !== true) {
          const { resp, data } = await pgFetch(`/technicians?id=eq.${encodeURIComponent(techId)}`, {
            method: "PATCH",
            body: { status: "approved", is_active: true },
            headers: { Prefer: "return=representation" },
          });
          if (!resp.ok) {
            console.log("[ADMIN][TECH][APPROVE][FAILED]", { status: resp.status, body: data });
            return res.status(404).json({ message: "Technician not found" });
          }
          technician = Array.isArray(data) ? data[0] : data;
        }

        // Flag user as technician
        if (technician?.user_id) {
          await ensureRoleAssignment(technician.user_id, "technician", assignerId);
          await ensureTechnicianProfile(technician.user_id, {
            status: "approved",
            is_active: true,
            is_available: true,
          });
          await pgFetch(`/users?id=eq.${encodeURIComponent(technician.user_id)}`, {
            method: "PATCH",
            body: { is_technician: true },
          });
        }
        res.json(technician);
      } catch (error) {
        console.error("Error approving technician:", error);
        res.status(500).json({ message: "Failed to approve technician" });
      }
    },
  );

  app.delete(
    "/api/admin/technicians/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const techId = req.params.id;
        console.log("[ADMIN][TECH][DELETE]", { techId });
        const { resp: techResp, data: techData } = await pgFetch(
          `/technicians?id=eq.${encodeURIComponent(techId)}&select=id,user_id&limit=1`,
        );
        if (!techResp.ok) {
          console.log("[ADMIN][TECH][DELETE][FETCH_FAILED]", { status: techResp.status, body: techData });
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(techData) ? techData[0] : techData?.[0];
        if (!technician?.id) {
          return res.status(404).json({ message: "Technician not found" });
        }

        await pgFetch(`/technician_documents?technician_id=eq.${encodeURIComponent(techId)}`, {
          method: "DELETE",
        }).catch((error) => {
          console.error("[ADMIN][TECH][DELETE][DOCS_FAILED]", { techId, message: error?.message });
        });

        await pgFetch(`/technician_locations?technician_id=eq.${encodeURIComponent(techId)}`, {
          method: "DELETE",
        }).catch((error) => {
          console.error("[ADMIN][TECH][DELETE][LOC_FAILED]", { techId, message: error?.message });
        });

        const { resp: delResp, data: delData } = await pgFetch(
          `/technicians?id=eq.${encodeURIComponent(techId)}`,
          { method: "DELETE" },
        );
        if (!delResp.ok) {
          console.log("[ADMIN][TECH][DELETE][FAILED]", { status: delResp.status, body: delData });
          return res.status(500).json({ message: "Failed to delete technician" });
        }

        const deletedAt = new Date().toISOString();
        if (technician.user_id) {
          await pgFetch(`/users?id=eq.${encodeURIComponent(technician.user_id)}`, {
            method: "PATCH",
            body: { is_technician: false, technician_removed_at: deletedAt },
            headers: { Prefer: "return=representation" },
          }).catch((error) => {
            console.error("[ADMIN][TECH][DELETE][USER_UPDATE_FAILED]", {
              userId: technician.user_id,
              message: error?.message,
            });
          });

          try {
            const role = await getRoleByName("technician");
            if (role?.id) {
              await pgFetch(
                `/user_roles?user_id=eq.${encodeURIComponent(technician.user_id)}&role_id=eq.${encodeURIComponent(role.id)}`,
                { method: "DELETE" },
              );
            }
          } catch (error: any) {
            console.error("[ADMIN][TECH][DELETE][ROLE_REMOVE_FAILED]", {
              userId: technician.user_id,
              message: error?.message,
            });
          }
        }

        res.json({ message: "Technician deleted successfully", deletedAt });
      } catch (error) {
        console.error("Error deleting technician:", error);
        res.status(500).json({ message: "Failed to delete technician" });
      }
    },
  );

  app.post(
    "/api/admin/technicians/:id/suspend",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const techId = req.params.id;
        console.log("[ADMIN][TECH][SUSPEND]", { techId });
        const { resp, data } = await pgFetch(`/technicians?id=eq.${encodeURIComponent(techId)}`, {
          method: "PATCH",
          body: { is_active: false },
          headers: { Prefer: "return=representation" },
        });
        if (!resp.ok) {
          console.log("[ADMIN][TECH][SUSPEND][FAILED]", { status: resp.status, body: data });
          return res.status(404).json({ message: "Technician not found" });
        }
        res.json(Array.isArray(data) ? data[0] : data);
      } catch (error) {
        console.error("[ADMIN][TECH][SUSPEND] Error:", error);
        res.status(500).json({ message: "Failed to suspend technician" });
      }
    },
  );

  app.post(
    "/api/admin/technicians/:id/reactivate",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const techId = req.params.id;
        console.log("[ADMIN][TECH][REACTIVATE]", { techId });
        const { resp, data } = await pgFetch(`/technicians?id=eq.${encodeURIComponent(techId)}`, {
          method: "PATCH",
          body: { is_active: true },
          headers: { Prefer: "return=representation" },
        });
        if (!resp.ok) {
          console.log("[ADMIN][TECH][REACTIVATE][FAILED]", { status: resp.status, body: data });
          return res.status(404).json({ message: "Technician not found" });
        }
        res.json(Array.isArray(data) ? data[0] : data);
      } catch (error) {
        console.error("[ADMIN][TECH][REACTIVATE] Error:", error);
        res.status(500).json({ message: "Failed to reactivate technician" });
      }
    },
  );

  app.get(
    "/api/admin/technicians/:id/documents",
    isAuthenticated,
    async (req, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["project_manager"]);
      if (!guard.ok) return;
      try {
        const { resp, data } = await pgFetch(`/technician_documents?technician_id=eq.${encodeURIComponent(req.params.id)}`);
        if (!resp.ok) {
          console.log("[ADMIN][TECH][DOCS][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        const docs = Array.isArray(data) ? data : [];
        const signedDocs = await Promise.all(
          docs.map(async (doc: any) => {
            if (!doc?.file_url) return doc;
            const signedUrl = await signStorageUrl(doc.file_url);
            return { ...doc, file_url: signedUrl, signed_url: signedUrl };
          }),
        );
        res.json(signedDocs);
      } catch (error) {
        console.error("Error fetching technician documents:", error);
        res.status(500).json({ message: "Failed to fetch documents" });
      }
    },
  );

  app.get(
    "/api/admin/technicians/:id",
    isAuthenticated,
    async (req, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["project_manager"]);
      if (!guard.ok) return;
      try {
        const techId = req.params.id;
        const { resp, data } = await pgFetch(`/technicians?id=eq.${encodeURIComponent(techId)}&select=*,user:users(email,first_name,last_name)`);
        if (!resp.ok) {
          console.log("[ADMIN][TECH][DETAIL][FAILED]", { status: resp.status, body: data });
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(data) ? data[0] : data;
        if (!technician) {
          return res.status(404).json({ message: "Technician not found" });
        }
        const safeDocs = await (async () => {
          const { resp: docsResp, data: docsData } = await pgFetch(`/technician_documents?technician_id=eq.${encodeURIComponent(techId)}`);
          if (!docsResp.ok || !Array.isArray(docsData)) return [];
          const signed = await Promise.all(
            docsData.map(async (doc: any) => {
              if (!doc?.file_url) return doc;
              const signedUrl = await signStorageUrl(doc.file_url);
              return { ...doc, file_url: signedUrl, signed_url: signedUrl };
            }),
          );
          return signed;
        })();

        const performance = await (async () => {
          try {
            const { resp: srResp, data: srData } = await pgFetch(`/service_requests?technician_id=eq.${encodeURIComponent(techId)}&select=status,rating`);
            if (!srResp.ok || !Array.isArray(srData)) return { total_completed_requests: 0, average_rating: 0, total_reviews: 0 };
            const completed = srData.filter((r: any) => r.status === "completed");
            const ratings = completed.map((r: any) => Number(r.rating)).filter((n: number) => !Number.isNaN(n));
            const avg = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;
            return { total_completed_requests: completed.length, average_rating: Number(avg.toFixed(2)), total_reviews: ratings.length };
          } catch {
            return { total_completed_requests: 0, average_rating: 0, total_reviews: 0 };
          }
        })();

        const financial = await (async () => {
          try {
            const { resp: invResp, data: invData } = await pgFetch(`/invoices?technician_id=eq.${encodeURIComponent(techId)}&select=total,issued_date`);
            if (!invResp.ok || !Array.isArray(invData)) return { total_invoices: 0, total_earnings: 0, last_invoice_date: null };
            const totalEarnings = invData.reduce((sum: number, inv: any) => sum + (Number(inv.total) || 0), 0);
            const lastDate = invData
              .map((inv: any) => inv.issued_date ? new Date(inv.issued_date) : null)
              .filter(Boolean)
              .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] || null;
            return { total_invoices: invData.length, total_earnings: totalEarnings, last_invoice_date: lastDate };
          } catch {
            return { total_invoices: 0, total_earnings: 0, last_invoice_date: null };
          }
        })();

        res.json({ technician, documents: safeDocs, performance, financial });
      } catch (error) {
        console.error("[ADMIN][TECH][DETAIL] Error:", error);
        res.status(500).json({ message: "Failed to fetch technician" });
      }
    },
  );

  app.get(
    "/api/admin/service-requests",
    isAuthenticated,
    async (req, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["project_manager"]);
      if (!guard.ok) return;
      try {
        const { resp, data } = await pgFetch("/service_requests?order=created_at.desc");
        if (!resp.ok) {
          console.log("[ADMIN][SERVICE_REQUESTS][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        const requests = Array.isArray(data) ? data.map(normalizeServiceRequestRow) : [];
        const requestIds = requests.map((request) => request.id).filter(Boolean);
        const userIdSet = new Set(requests.map((request) => request.userId).filter(Boolean));
        const technicianIds = requests.map((request) => request.technicianId).filter(Boolean);

        let technicianRows: any[] = [];
        if (technicianIds.length > 0) {
          const techIds = technicianIds.map((id) => encodeURIComponent(id)).join(",");
          const { resp: techResp, data: techData } = await pgFetch(
            `/technicians?id=in.(${techIds})`,
          );
          if (techResp.ok) {
            technicianRows = Array.isArray(techData) ? techData : [];
            technicianRows.forEach((tech) => {
              const userId = tech.user_id ?? tech.userId;
              if (userId) userIdSet.add(userId);
            });
          }
        }

        const userIds = Array.from(userIdSet);
        let usersById = new Map<string, any>();
        if (userIds.length > 0) {
          const ids = userIds.map((id) => encodeURIComponent(id)).join(",");
          const { resp: userResp, data: userData } = await pgFetch(`/users?id=in.(${ids})`);
          if (userResp.ok) {
            const users = Array.isArray(userData) ? userData.map(normalizeUserRow) : [];
            usersById = new Map(users.map((user) => [user.id, user]));
          }
        }

        const technicianById = new Map(
          technicianRows.map((tech) => [tech.id, tech]),
        );

        let invoiceByRequestId = new Map<string, any>();
        if (requestIds.length > 0) {
          const ids = requestIds.map((id) => encodeURIComponent(id)).join(",");
          const { resp: invResp, data: invData } = await pgFetch(
            `/invoices?service_request_id=in.(${ids})`,
          );
          if (invResp.ok) {
            const invoices = Array.isArray(invData) ? invData.map(normalizeInvoiceRow) : [];
            invoiceByRequestId = new Map(
              invoices.map((invoice) => [invoice.serviceRequestId, invoice]),
            );
          }
        }

        const enriched = requests.map((request) => {
          const customer = request.userId ? usersById.get(request.userId) : null;
          const technician = request.technicianId ? technicianById.get(request.technicianId) : null;
          const technicianUserId = technician?.user_id ?? technician?.userId ?? null;
          const technicianUser = technicianUserId ? usersById.get(technicianUserId) : null;
          const invoice = request.id ? invoiceByRequestId.get(request.id) : null;
          const isMockTechnician =
            typeof request.technicianId === "string" &&
            request.technicianId.toLowerCase().startsWith("mock-");
          const technicianName =
            buildUserDisplayName(technicianUser) ||
            (isMockTechnician ? "Mock Technician" : null);
          return {
            ...request,
            orderNumber: request.orderNumber,
            orderType: "service",
            customerName: buildUserDisplayName(customer),
            customerEmail: customer?.email ?? null,
            technicianName,
            isMockTechnician,
            invoiceId: invoice?.id ?? null,
            invoiceNumber: invoice?.invoiceNumber ?? null,
            invoiceStatus: invoice?.status ?? null,
            invoiceTotal: invoice?.total ?? null,
            total: Number(invoice?.total ?? request.estimatedCost ?? 0),
            invoice,
          };
        });

        res.json(enriched);
      } catch (error) {
        console.error("Error fetching all service requests:", error);
        res.status(500).json({ message: "Failed to fetch service requests" });
      }
    },
  );

  app.patch(
    "/api/admin/users/:id/admin",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const { isAdmin: adminStatus } = req.body;
        if (typeof adminStatus !== "boolean") {
          return res.status(400).json({ message: "isAdmin must be a boolean" });
        }
        const user = await storage.updateUserAdmin(req.params.id, adminStatus);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json(user);
      } catch (error) {
        console.error("Error updating user admin status:", error);
        res.status(500).json({ message: "Failed to update user admin status" });
      }
    },
  );

  // Roles Management API
  app.get("/api/admin/roles", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      await ensureDefaultRoles();
      const { resp, data } = await pgFetch("/roles?order=created_at.desc");
      if (!resp.ok) {
        console.log("[ADMIN][ROLES][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      res.json(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("[ADMIN][ROLES][LIST] Error:", error);
      res.json([]);
    }
  });

  app.get(
    "/api/admin/user-roles",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      try {
        const { resp, data } = await pgFetch("/user_roles");
        if (!resp.ok) {
          console.log("[ADMIN][USER_ROLES][LIST][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        res.json(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("[ADMIN][USER_ROLES][LIST] Error:", error);
        res.json([]);
      }
    },
  );

  app.post(
    "/api/admin/user-roles",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const assignerId = await ensureUserUuid(auth);
        const { userId, roleId } = req.body;

        if (!userId || !roleId) {
          return res
            .status(400)
            .json({ message: "userId and roleId are required" });
        }

        await ensureDefaultRoles();
        const roles = await loadRolesFromDb();
        const roleName = roles.find((role) => role.id === roleId)?.name;

        const payload = [{
          user_id: userId,
          role_id: roleId,
          assigned_by: assignerId,
        }];

        const { resp, data } = await pgFetch("/user_roles", {
          method: "POST",
          body: payload,
          headers: { Prefer: "return=representation" },
        });

        if (resp.status === 409) {
          return res.status(409).json({ message: "User already has this role assigned" });
        }

        if (!resp.ok) {
          console.log("[ADMIN][USER_ROLES][CREATE][FAILED]", { status: resp.status, body: data });
          throw new AppError({
            code: "USER_ROLE_CREATE_FAILED",
            status: resp.status || 500,
            message: "Failed to assign user role",
          });
        }

        const created = Array.isArray(data) ? data[0] : data;

        if (roleName === "technician") {
          await ensureTechnicianProfile(userId, {
            status: "approved",
            is_active: true,
            is_available: true,
          });
          await pgFetch(`/users?id=eq.${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: { is_technician: true },
            headers: { Prefer: "return=representation" },
          });
        }

        res.status(201).json(created);
      } catch (error: any) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("[ADMIN][USER_ROLES][CREATE] Error:", error);
        res.status(500).json({ message: "Failed to assign user role" });
      }
    },
  );

  app.delete(
    "/api/admin/user-roles/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const { resp, data } = await pgFetch(
          `/user_roles?id=eq.${encodeURIComponent(req.params.id)}`,
          { method: "DELETE" },
        );
        if (!resp.ok) {
          console.log("[ADMIN][USER_ROLES][DELETE][FAILED]", { status: resp.status, body: data });
          return res.status(500).json({ message: "Failed to remove user role" });
        }
        res.status(204).send();
      } catch (error) {
        console.error("[ADMIN][USER_ROLES][DELETE] Error:", error);
        res.status(500).json({ message: "Failed to remove user role" });
      }
    },
  );

  // Admin-only: enable mock technician mode (assign technician role)
  app.post(
    "/api/admin/enable-technician-mode",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const assignerId = await ensureUserUuid(auth);
        const { userId } = req.body;
        if (!userId) {
          return res.status(400).json({ message: "userId is required" });
        }
        await ensureRoleAssignment(userId, "technician", assignerId);
        // Backward compatibility flag
        await pgFetch(`/users?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          body: { is_technician: true },
          headers: { Prefer: "return=representation" },
        });
        await ensureTechnicianProfile(userId, {
          status: "approved",
          is_active: true,
          is_available: true,
        });
        res.json({ message: "Technician mode enabled", userId });
      } catch (error) {
        console.error("[ADMIN][MOCK_TECH] Error:", error);
        res.status(500).json({ message: "Failed to enable technician mode" });
      }
    },
  );

  app.get(
    "/api/admin/users/:userId/roles",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const roles = await storage.getUserRoles(req.params.userId);
        res.json(roles);
      } catch (error) {
        console.error("Error fetching user roles:", error);
        res.status(500).json({ message: "Failed to fetch user roles" });
      }
    },
  );

  // Invoice routes - Admin only
  app.get("/api/admin/invoices", isAuthenticated, async (req, res) => {
    const guard = await requireAnyRoleOrAdmin(req, res, ["sales", "project_manager"]);
    if (!guard.ok) return;
    try {
      const invoices = await storage.getAllInvoices();
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      try {
        const { resp, data } = await pgFetch("/invoices?order=created_at.desc");
        if (!resp.ok) {
          console.log("[ADMIN][INVOICES][LIST][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        const rows = Array.isArray(data) ? data : [];
        res.json(rows.map(normalizeInvoiceRow));
      } catch (fallbackError) {
        console.error("[ADMIN][INVOICES][LIST] Fallback failed:", fallbackError);
        res.json([]);
      }
    }
  });

  app.get("/api/invoices", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const invoices = await storage.getUserInvoices(userId);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching user invoices:", error);
      res.status(500).json({ message: "Failed to fetch user invoices" });
    }
  });

  app.get("/api/invoices/:id", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      // Verify ownership or admin
      const user = await storage.getUser(userId);
      if (invoice.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  app.post(
    "/api/admin/invoices",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const invoiceData = validateSchema(insertInvoiceSchema, req.body, req);

        // Enforce 15% VAT rate (mandated by Saudi Arabia)
        const subtotal = Number(invoiceData.subtotal);
        const taxRate = 15.0; // Fixed 15% VAT
        const taxAmount = (subtotal * taxRate) / 100;
        const total = subtotal + taxAmount;

        const invoice = await storage.createInvoice({
          ...invoiceData,
          taxRate: taxRate.toString(),
          taxAmount: taxAmount.toString(),
          total: total.toString(),
        } as any);

        res.status(201).json(invoice);
      } catch (error) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("Error creating invoice:", error);
        res.status(500).json({ message: "Failed to create invoice" });
      }
    },
  );

  app.patch(
    "/api/admin/invoices/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const invoice = await storage.updateInvoice(req.params.id, req.body);
        res.json(invoice);
      } catch (error) {
        console.error("Error updating invoice:", error);
        res.status(500).json({ message: "Failed to update invoice" });
      }
    },
  );

  app.delete(
    "/api/admin/invoices/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        await storage.deleteInvoice(req.params.id);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting invoice:", error);
        res.status(500).json({ message: "Failed to delete invoice" });
      }
    },
  );

  // Orders API routes
  app.get("/api/shop/orders", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      let orders: any[] = [];
      const { resp, data } = await pgFetch(
        `/orders?user_id=eq.${encodeURIComponent(userUuid)}&order=created_at.desc`,
      );
      if (resp.ok) {
        orders = Array.isArray(data) ? data.map(normalizeOrderRow) : [];
      } else {
        orders = await storage.getUserOrders(userUuid);
      }

      const orderIds = orders.map((order) => order.id).filter(Boolean);
      let invoiceByOrderId = new Map<string, any>();
      if (orderIds.length > 0) {
        const { resp: invResp, data: invData } = await pgFetch(
          `/invoices?order_id=in.(${orderIds.map((id) => encodeURIComponent(id)).join(",")})`,
        );
        if (invResp.ok && Array.isArray(invData)) {
          invoiceByOrderId = new Map(
            invData.map((invoice: any) => [invoice.order_id ?? invoice.orderId, invoice]),
          );
        }
      }

      const enriched = orders.map((order) => {
        const invoice = invoiceByOrderId.get(order.id);
        if (!invoice) return order;
        return {
          ...order,
          invoiceId: invoice.id ?? invoice.invoice_id,
          invoiceNumber: invoice.invoice_number ?? invoice.invoiceNumber,
          invoiceStatus: invoice.status,
        };
      });

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching shop orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.post("/api/orders", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const orderData = validateSchema(insertOrderSchema, {
        ...req.body,
        orderNumber: req.body?.orderNumber || buildOrderNumber(),
        userId,
      }, req);

      const order = await storage.createOrder(orderData);
      res.status(201).json(order);
    } catch (error) {
      const handled = handleRouteError(error, req, res);
      if (handled) return handled;
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.get("/api/orders", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);

      const { resp: srResp, data: srData } = await pgFetch(
        `/service_requests?user_id=eq.${encodeURIComponent(userUuid)}&order=created_at.desc`,
      );
      if (!srResp.ok) {
        console.error("[ORDERS][AGG][SERVICE_REQUESTS][FAILED]", {
          status: srResp.status,
          body: srData,
        });
        return res.status(500).json({ message: "Failed to fetch service requests" });
      }

      const { resp: invResp, data: invData } = await pgFetch(
        `/invoices?user_id=eq.${encodeURIComponent(userUuid)}&order=created_at.desc`,
      );
      if (!invResp.ok) {
        console.error("[ORDERS][AGG][INVOICES][FAILED]", {
          status: invResp.status,
          body: invData,
        });
      }

      const serviceRequests = Array.isArray(srData) ? srData : [];
      const invoices = Array.isArray(invData) ? invData : [];
      const invoiceByRequest = new Map<string, any>();
      invoices.forEach((invoice: any) => {
        const key = invoice.service_request_id || invoice.serviceRequestId;
        if (key) {
          invoiceByRequest.set(key, invoice);
        }
      });

      const technicianIds = serviceRequests
        .map((request: any) => request.technician_id || request.technicianId)
        .filter(Boolean);
      const technicianById = new Map<string, any>();
      if (technicianIds.length > 0) {
        const techIds = technicianIds.map((id: string) => encodeURIComponent(id)).join(",");
        const { resp: techResp, data: techData } = await pgFetch(
          `/technicians?id=in.(${techIds})&select=id,rating,review_count,user:users(first_name,last_name)`,
        );
        if (techResp.ok && Array.isArray(techData)) {
          techData.forEach((tech: any) => {
            const user = tech.user;
            const nameFromUser = user
              ? [user.first_name, user.last_name].filter(Boolean).join(" ")
              : null;
            technicianById.set(tech.id, {
              ...tech,
              displayName: tech.name || tech.full_name || nameFromUser || null,
            });
          });
        }
      }

      const orders = serviceRequests.map((request: any) => {
        const requestId = request.id;
        const invoice = requestId ? invoiceByRequest.get(requestId) : undefined;
        const createdAt = request.created_at || request.createdAt || new Date().toISOString();
        const trackingSteps = normalizeTrackingSteps(
          request.tracking_steps ?? request.trackingSteps,
          request.status,
          createdAt,
        );
        const route = normalizeRoute(
          request.route ?? request.route_data ?? request.routeData,
          request.location,
        );
        const technicianId = request.technician_id || request.technicianId || null;
        const technician = technicianId ? technicianById.get(technicianId) : null;

        return {
          id: requestId,
          serviceRequestId: requestId,
          invoiceId: invoice?.id ?? null,
          orderNumber:
            request.order_number ||
            request.orderNumber ||
            buildServiceOrderNumber(requestId, createdAt),
          invoiceNumber: invoice?.invoice_number || invoice?.invoiceNumber || null,
          invoiceStatus: invoice?.status ?? null,
          status: request.status || "pending",
          serviceType: request.service_type || request.serviceType,
          location: request.location,
          latitude: request.latitude,
          longitude: request.longitude,
          notes: request.notes,
          technicianId,
          technicianName: technician?.displayName ?? null,
          technicianRating: Number(technician?.rating ?? 0) || null,
          technicianReviewCount: Number(technician?.review_count ?? 0) || null,
          trackingSteps,
          route,
          subtotal: Number(invoice?.subtotal ?? request.estimated_cost ?? 0),
          taxRate: Number(invoice?.tax_rate ?? invoice?.taxRate ?? 15),
          taxAmount: Number(invoice?.tax_amount ?? invoice?.taxAmount ?? 0),
          total: Number(invoice?.total ?? request.estimated_cost ?? 0),
          items: invoice?.items ?? [],
          createdAt,
          updatedAt: request.updated_at || request.updatedAt || createdAt,
          invoice,
          serviceRequest: request,
        };
      });

      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const order = await storage.getOrder(req.params.id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user?.isAdmin) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.patch("/api/orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const order = await storage.getOrder(req.params.id);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user?.isAdmin) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const updatedOrder = await storage.updateOrder(req.params.id, req.body);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  app.delete("/api/orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const order = await storage.getOrder(req.params.id);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user?.isAdmin) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      await storage.deleteOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ message: "Failed to delete order" });
    }
  });

  // Admin Orders API
  app.get("/api/admin/orders", isAuthenticated, async (req, res) => {
    const guard = await requireAnyRoleOrAdmin(req, res, ["sales"]);
    if (!guard.ok) return;
    try {
      let rawOrders: any[] = [];
      try {
        rawOrders = await storage.getAllOrders();
      } catch (error) {
        console.error("Error fetching all orders:", error);
        const { resp, data } = await pgFetch("/orders?order=created_at.desc");
        if (!resp.ok) {
          console.log("[ADMIN][ORDERS][LIST][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        rawOrders = Array.isArray(data) ? data : [];
      }

      const orders = Array.isArray(rawOrders) ? rawOrders.map(normalizeOrderRow) : [];
      const orderIds = orders.map((order) => order.id).filter(Boolean);
      const userIds = orders.map((order) => order.userId).filter(Boolean);

      let invoiceByOrderId = new Map<string, any>();
      if (orderIds.length > 0) {
        const ids = orderIds.map((id) => encodeURIComponent(id)).join(",");
        const { resp: invResp, data: invData } = await pgFetch(
          `/invoices?order_id=in.(${ids})`,
        );
        if (invResp.ok) {
          const invoices = Array.isArray(invData) ? invData.map(normalizeInvoiceRow) : [];
          invoiceByOrderId = new Map(
            invoices.map((invoice) => [invoice.orderId, invoice]),
          );
        }
      }

      let usersById = new Map<string, any>();
      if (userIds.length > 0) {
        const ids = userIds.map((id) => encodeURIComponent(id)).join(",");
        const { resp: userResp, data: userData } = await pgFetch(`/users?id=in.(${ids})`);
        if (userResp.ok) {
          const users = Array.isArray(userData) ? userData.map(normalizeUserRow) : [];
          usersById = new Map(users.map((user) => [user.id, user]));
        }
      }

      const enriched = orders.map((order) => {
        const customer = order.userId ? usersById.get(order.userId) : null;
        const invoice = order.id ? invoiceByOrderId.get(order.id) : null;
        return {
          ...order,
          orderType: "shop",
          customerName: buildUserDisplayName(customer),
          customerEmail: customer?.email ?? null,
          technicianName: null,
          invoiceId: invoice?.id ?? null,
          invoiceNumber: invoice?.invoiceNumber ?? null,
          invoiceStatus: invoice?.status ?? null,
          invoiceTotal: invoice?.total ?? null,
          invoice,
        };
      });

      res.json(enriched);
    } catch (error) {
      console.error("[ADMIN][ORDERS][LIST] Error:", error);
      res.json([]);
    }
  });

  app.post("/api/discount-codes/validate", async (req, res) => {
    try {
      const { code, subtotal, taxRate } = req.body || {};
      const normalized = normalizeDiscountCodeInput(code);
      if (!normalized) {
        return respondDiscountInvalid(req, res, { source: "validate", reason: "missing" });
      }
      const discount = await fetchDiscountCodeByValue(normalized);
      const validation = validateDiscountCode(discount);
      if (!validation.ok) {
        return respondDiscountInvalid(req, res, {
          source: "validate",
          code: normalized,
          reason: validation.reason,
        });
      }
      const baseSubtotal = Number(subtotal ?? 0);
      const rate = Number(taxRate ?? 15);
      const discountAmount = computeDiscountAmount(baseSubtotal, discount);
      const applied = applyDiscountToTotals({
        subtotal: baseSubtotal,
        taxRate: rate,
        discountAmount,
      });
      res.json({
        valid: true,
        code: normalized,
        discountType: discount?.discountType ?? discount?.discount_type ?? null,
        discountValue: discount?.discountValue ?? discount?.discount_value ?? null,
        discountAmount,
        originalSubtotal: baseSubtotal,
        discountedSubtotal: applied.discountedSubtotal,
        taxRate: applied.taxRate,
        taxAmount: applied.taxAmount,
        total: applied.total,
      });
    } catch (error) {
      console.error("[DISCOUNT][VALIDATE] Error:", error);
      const lang = getRequestLang(req);
      res.status(500).json(normalizeErrorBody(500, { code: "SERVER_ERROR" }, lang));
    }
  });

  // Discount Code routes - Admin only
  app.get(
    "/api/admin/discount-codes",
    isAuthenticated,
    async (req, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["marketing", "sales"]);
      if (!guard.ok) return;
      try {
        const codes = await storage.getAllDiscountCodes();
        res.json(codes);
      } catch (error) {
        console.error("Error fetching discount codes:", error);
        try {
          const { resp, data } = await pgFetch("/discount_codes?order=created_at.desc");
          if (!resp.ok) {
            console.log("[ADMIN][DISCOUNT][LIST][FAILED]", { status: resp.status, body: data });
            return res.json([]);
          }
          const rows = Array.isArray(data) ? data : [];
          res.json(rows.map(normalizeDiscountCodeRow));
        } catch (fallbackError) {
          console.error("[ADMIN][DISCOUNT][LIST] Fallback failed:", fallbackError);
          res.json([]);
        }
      }
    },
  );

  app.post(
    "/api/admin/discount-codes",
    isAuthenticated,
    async (req: any, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["marketing", "sales"]);
      if (!guard.ok) return;
      const payload = req.body || {};
      const normalizedCode = normalizeDiscountCodeInput(payload.code);
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const createdBy = await ensureUserUuid(auth);
      let codeData: InsertDiscountCode;
      try {
        codeData = validateSchema(insertDiscountCodeSchema, { ...payload, code: normalizedCode, createdBy }, req);
      } catch (error) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("Error validating discount code:", error);
        return res.status(500).json({ message: "Failed to create discount code" });
      }

      try {
        const code = await storage.createDiscountCode(codeData);
        return res.status(201).json(code);
      } catch (error) {
        console.error("Error creating discount code:", error);
      }

      try {
        const expiresAtRaw = codeData.expiresAt ?? payload.expiresAt ?? null;
        const expiresAt = expiresAtRaw instanceof Date ? expiresAtRaw.toISOString() : expiresAtRaw;
        const { resp, data } = await pgFetch("/discount_codes", {
          method: "POST",
          body: [
            {
              code: normalizedCode,
              discount_type: codeData.discountType ?? payload.discountType,
              discount_value: codeData.discountValue ?? payload.discountValue,
              max_uses: codeData.maxUses ?? payload.maxUses ?? null,
              is_active: codeData.isActive ?? payload.isActive ?? true,
              expires_at: expiresAt ?? null,
              created_by: createdBy,
            },
          ],
          headers: { Prefer: "return=representation" },
        });
        if (!resp.ok) {
          console.log("[ADMIN][DISCOUNT][CREATE][FAILED]", { status: resp.status, body: data });
          return res.status(500).json({ message: "Failed to create discount code" });
        }
        const row = Array.isArray(data) ? data[0] : data?.[0];
        return res.status(201).json(row ? normalizeDiscountCodeRow(row) : { success: true });
      } catch (fallbackError) {
        console.error("[ADMIN][DISCOUNT][CREATE][FALLBACK_FAILED]", fallbackError);
        return res.status(500).json({ message: "Failed to create discount code" });
      }
    },
  );

  app.patch(
    "/api/admin/discount-codes/:id",
    isAuthenticated,
    async (req, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["marketing", "sales"]);
      if (!guard.ok) return;
      try {
        const code = await storage.updateDiscountCode(req.params.id, req.body);
        res.json(code);
      } catch (error) {
        console.error("Error updating discount code:", error);
        try {
          const payload = req.body || {};
          const normalizedCode = payload.code ? normalizeDiscountCodeInput(payload.code) : undefined;
          const updatePayload: Record<string, any> = {
            code: normalizedCode,
            discount_type: payload.discountType ?? payload.discount_type,
            discount_value: payload.discountValue ?? payload.discount_value,
            max_uses: payload.maxUses ?? payload.max_uses,
            expires_at: payload.expiresAt ?? payload.expires_at,
            is_active: payload.isActive ?? payload.is_active,
          };
          Object.keys(updatePayload).forEach((key) => {
            if (updatePayload[key] === undefined) delete updatePayload[key];
          });
          const { resp, data } = await pgFetch(
            `/discount_codes?id=eq.${encodeURIComponent(req.params.id)}`,
            {
              method: "PATCH",
              body: updatePayload,
              headers: { Prefer: "return=representation" },
            },
          );
          if (!resp.ok) {
            console.log("[ADMIN][DISCOUNT][UPDATE][FAILED]", { status: resp.status, body: data });
            return res.status(500).json({ message: "Failed to update discount code" });
          }
          const row = Array.isArray(data) ? data[0] : data;
          return res.json(row ? normalizeDiscountCodeRow(row) : { success: true });
        } catch (fallbackError) {
          console.error("[ADMIN][DISCOUNT][UPDATE][FALLBACK_FAILED]", fallbackError);
          res.status(500).json({ message: "Failed to update discount code" });
        }
      }
    },
  );

  app.delete(
    "/api/admin/discount-codes/:id",
    isAuthenticated,
    async (req, res) => {
      const guard = await requireAnyRoleOrAdmin(req, res, ["marketing", "sales"]);
      if (!guard.ok) return;
      try {
        await storage.deleteDiscountCode(req.params.id);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting discount code:", error);
        try {
          const { resp, data } = await pgFetch(
            `/discount_codes?id=eq.${encodeURIComponent(req.params.id)}`,
            { method: "DELETE" },
          );
          if (!resp.ok) {
            console.log("[ADMIN][DISCOUNT][DELETE][FAILED]", { status: resp.status, body: data });
            return res.status(500).json({ message: "Failed to delete discount code" });
          }
          res.status(204).send();
        } catch (fallbackError) {
          console.error("[ADMIN][DISCOUNT][DELETE][FALLBACK_FAILED]", fallbackError);
          res.status(500).json({ message: "Failed to delete discount code" });
        }
      }
    },
  );

  // Payment routes - TODO: Implement payment processing with actual providers
  app.post("/api/payments", isAuthenticated, async (req: any, res) => {
    try {
      const { method, amount, currency, serviceRequestId } = req.body;
      
      // Get user ID
      const userId = req.firebaseUser?.uid || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Validate payment method
      const validMethods = ["apple_pay", "mada", "tabby", "tamara", "credit_card", "bank_transfer"];
      if (!validMethods.includes(method)) {
        return res.status(400).json({ error: "Invalid payment method" });
      }

      console.log(`[Payment] Processing ${method} payment for user ${userId}, amount: ${amount}`);

      // TODO: Route to actual payment provider based on method
      // apple_pay -> Apple Pay SDK
      // mada -> Mada API
      // tabby -> Tabby API
      // tamara -> Tamara API
      // credit_card -> Stripe
      // bank_transfer -> Manual bank details

      res.status(201).json({
        success: true,
        paymentId: `payment_${Date.now()}`,
        method,
        amount,
        status: "pending",
      });
    } catch (error) {
      console.error("[Payment] Error processing payment:", error);
      res.status(500).json({ error: "Failed to process payment" });
    }
  });

  // Auth session endpoint is handled in googleAuth.ts

  return;
}

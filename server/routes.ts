import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupGoogleAuth } from "./googleAuth";
import { setupFirebaseAuth, isAuthenticated, isAdmin } from "./firebaseMiddleware";
import { validateSchema, handleRouteError, AppError, errorHandler, getRequestLang, normalizeErrorBody } from "./errors";
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
import { uploadBufferToStorage } from "./supabaseClient";
import { pgFetch } from "./postgrest";
import { uploadToStorageRest } from "./storageRest";
import type { Role } from "@shared/schema";
import { computePricing } from "./pricingEngine";

const ENABLE_MOCK_TECHNICIAN = true; // TEMP: toggle off in production when real techs are ready
const DEFAULT_LAT = 24.7136;
const DEFAULT_LNG = 46.6753;

const upload = multer({
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB to accommodate large mobile photos/HEIC
    fieldSize: 20 * 1024 * 1024,
    files: 1,
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
    const { resp } = await pgFetch(
      `/technician_locations?technician_id=eq.${encodeURIComponent(technicianId)}`,
      {
        method: "PATCH",
        body: payload,
        headers: { Prefer: "return=representation" },
      },
    );
    if (resp.status === 404 || resp.status === 0) {
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

// Role helpers (primary source: roles + user_roles)
let roleCache: { byName: Record<string, Role>; lastFetched?: number } = {
  byName: {},
};

async function getRoleByName(name: string): Promise<Role | undefined> {
  const now = Date.now();
  const cacheHit =
    roleCache.byName[name] && roleCache.lastFetched && now - roleCache.lastFetched < 5 * 60 * 1000;
  if (cacheHit) return roleCache.byName[name];

  const roles = await storage.getAllRoles();
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
    role = await storage.createRole({ name: roleName as any, description: `${roleName} role` });
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
    throw err;
  }
}

async function userHasRole(userUuid: string, roleName: string): Promise<boolean> {
  const role = await getRoleByName(roleName);
  if (!role) return false;
  const userRoles = await storage.getUserRoles(userUuid);
  return userRoles.some((ur) => ur.roleId === role.id);
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
    res.status(403).json({ message: "Forbidden" });
    return { ok: false, userUuid, auth };
  }
  return { ok: true, userUuid, auth };
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

async function ensureUserUuid(auth: AuthContext): Promise<string> {
  const uuidRegex = /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$/;
  if (uuidRegex.test(auth.userId)) {
    return auth.userId;
  }

  const providerId = auth.userId;

  // Lookup existing user by auth_provider_id
  const { resp: lookupResp, data: lookupData } = await pgFetch(
    `/users?auth_provider_id=eq.${encodeURIComponent(providerId)}&select=id&limit=1`,
  );
  if (lookupResp.ok) {
    const existing = Array.isArray(lookupData) ? lookupData[0] : lookupData?.[0];
    if (existing?.id) {
      return existing.id;
    }
  } else {
    console.log("[USER][LOOKUP] Failed", { status: lookupResp.status, body: lookupData });
  }

  // Create new user record
  const { resp: createResp, data: createData } = await pgFetch("/users", {
    method: "POST",
    body: [
      {
        auth_provider: "google",
        auth_provider_id: providerId,
        email: auth.email || null,
        first_name: null,
        last_name: null,
        profile_image_url: null,
        is_admin: auth.isAdmin === true,
        is_technician: false,
      },
    ],
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

export async function registerRoutes(app: Express): Promise<Server> {
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
          
          const timestamp = Date.now();
          const fileName = `${folder}/${timestamp}-${file.originalname}`;
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

  // Auth route - Get current user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { userId, isAdmin, phoneNumber } = auth;

      // Try to get user from database
      const user = await storage.getUser(userId);
      
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
      const { userId, phoneNumber } = auth;

      const user = await storage.getUser(userId);
      
      if (user) {
        res.json({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: phoneNumber || null,
          profileImageUrl: user.profileImageUrl || null,
        });
      } else {
        res.json({
          firstName: null,
          lastName: null,
          email: null,
          phone: phoneNumber || null,
          profileImageUrl: null,
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { userId, phoneNumber, isAdmin } = auth;

      const { firstName, lastName, email, profileImageUrl } = req.body;

      // Check if user exists
      let user = await storage.getUser(userId);
      
      if (user) {
        // Update existing user using upsert
        user = await storage.upsertUser({
          id: userId,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          email: email || user.email,
          profileImageUrl: profileImageUrl ?? user.profileImageUrl,
        });
      } else {
        // Create new user
        user = await storage.createUser({
          id: userId,
          firstName,
          lastName,
          email: email || `${userId}@phone.user`,
          isAdmin,
          profileImageUrl: profileImageUrl || null,
        });
      }

      res.json({
        message: "Profile updated successfully",
        user: {
          firstName: user?.firstName,
          lastName: user?.lastName,
          email: user?.email,
          phone: phoneNumber || null,
          profileImageUrl: user?.profileImageUrl || null,
        },
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/user/profile/photo", isAuthenticated, profilePhotoUpload, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ message: "No photo uploaded" });
      }

      const ext = file.originalname.split(".").pop() || "jpg";
      const path = `profile/${auth.userId}-${Date.now()}.${ext}`;
      const publicUrl = await uploadBufferToStorage({ file, path });
      if (!publicUrl) {
        return res.status(500).json({ code: "PROFILE_UPLOAD_FAILED", message: "Failed to upload profile image" });
      }

      const user = await storage.upsertUser({
        id: auth.userId,
        profileImageUrl: publicUrl,
      });

      res.json({ imageUrl: user.profileImageUrl || publicUrl });
    } catch (error) {
      console.error("Error uploading profile photo:", error);
      res.status(500).json({ message: "Failed to upload profile photo" });
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
    isAuthenticated,
    upload.array("documents"),
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const userUuid = await ensureUserUuid(auth);
        console.log("[TECH][APPLY][USER]", { uuid: userUuid, externalId: auth.userId });

        const files: Express.Multer.File[] = req.files || [];
        const errors: Record<string, string> = {};
        const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
        const maxSize = 5 * 1024 * 1024;

        if (!req.body.phone_number && !req.body.phoneNumber) {
          errors.phone_number = "Required";
        }
        if (!req.body.years_of_experience && !req.body.yearsOfExperience) {
          errors.years_of_experience = "Required";
        }
        if (!req.body.national_address && !req.body.nationalAddress) {
          errors.national_address = "Required";
        }
        if (!files || files.length === 0) {
          errors.documents = "At least one document is required";
        }

        for (const file of files) {
          if (!allowedTypes.includes(file.mimetype)) {
            errors.documents = "Invalid file type";
            break;
          }
          if (file.size > maxSize) {
            errors.documents = "File too large (max 5MB)";
            break;
          }
        }

        if (Object.keys(errors).length > 0) {
          return res.status(400).json({ fieldErrors: errors });
        }

        const techPayload = {
          user_id: userUuid,
          phone_number: req.body.phone_number || req.body.phoneNumber,
          years_of_experience: Number(req.body.years_of_experience || req.body.yearsOfExperience),
          national_address: req.body.national_address || req.body.nationalAddress,
          status: "pending",
          is_active: false,
          is_available: false,
        };

        const { resp: createResp, data: createData } = await pgFetch("/technicians", {
          method: "POST",
          body: [techPayload],
          headers: { Prefer: "return=representation" },
        });
        if (!createResp.ok) {
          console.log("[TECH][APPLY][FAILED]", { status: createResp.status, body: createData });
          throw new AppError({
            code: "TECH_APPLY_FAILED",
            status: createResp.status || 500,
            message: "Failed to submit technician application",
          });
        }
        const technician = Array.isArray(createData) ? createData[0] : createData;

        const docInserts: any[] = [];
        for (const file of files) {
          const timestamp = Date.now();
          const safeName = file.originalname.replace(/\s+/g, "_");
          const fileName = `technicians/${technician.id}/${timestamp}-${safeName}`;
          const fileUrl = await uploadToStorageRest({ file, path: fileName });
          console.log("[TECH][APPLY][UPLOAD]", { technicianId: technician.id, file: safeName });
          docInserts.push({
            technician_id: technician.id,
            document_type: (req.body.documentType as string) || "other",
            file_name: file.originalname,
            file_url: fileUrl,
            file_size: file.size,
            mime_type: file.mimetype,
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
        console.error("[TECH][APPLY] Error:", error);
        res.status(500).json({ message: "Failed to submit application" });
      }
    },
  );

  app.get("/api/technicians/me", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const { resp, data } = await pgFetch(`/technicians?user_id=eq.${encodeURIComponent(userUuid)}`);
      if (!resp.ok) {
        console.log("[TECH][ME][FAILED]", { status: resp.status, body: data });
        return res.json(null);
      }
      const technician = Array.isArray(data) ? data[0] : data?.[0] || null;
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
        if (technician.status !== "approved" || technician.is_active === false) {
          return res.status(403).json({ message: "Technician not active" });
        }
        const { resp: updResp, data: updData } = await pgFetch(`/technicians?id=eq.${encodeURIComponent(technician.id)}`, {
          method: "PATCH",
          body: { is_available: desired, status: desired ? "online" : "offline" },
          headers: { Prefer: "return=representation" },
        });
        if (!updResp.ok) {
          console.log("[TECH][AVAIL][UPDATE][FAILED]", { status: updResp.status, body: updData });
          return res.status(500).json({ message: "Failed to update availability" });
        }
        const updated = Array.isArray(updData) ? updData[0] : updData;
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
        if (technician.status !== "approved" && !guard.auth.isAdmin) {
          return res.status(403).json({ message: "Technician not active" });
        }
        const { resp: updResp, data: updData } = await pgFetch(
          `/technicians?id=eq.${encodeURIComponent(technician.id)}`,
          {
            method: "PATCH",
            body: { status: online ? "online" : "offline", is_available: online },
            headers: { Prefer: "return=representation" },
          },
        );
        if (!updResp.ok) {
          console.log("[TECH][STATUS][UPDATE][FAILED]", { status: updResp.status, body: updData });
          return res.status(500).json({ message: "Failed to update status" });
        }
        if (!online) {
          // Remove live location when offline
          await pgFetch(`/technician_locations?technician_id=eq.${encodeURIComponent(technician.id)}`, {
            method: "DELETE",
          });
        }
        const updated = Array.isArray(updData) ? updData[0] : updData;
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
      if (technician.status !== "online") {
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
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[TECH][LOC] Error:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  // Nearby technicians endpoint (online only)
  app.get("/api/technicians/nearby", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ message: "lat and lng are required numbers" });
      }

      const { resp: techResp, data: techData } = await pgFetch(`/technicians?status=eq.online&is_available=eq.true`);
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
          const distanceKm = haversineKm(lat, lng, Number(loc.latitude), Number(loc.longitude));
          const etaMinutes = Math.round((distanceKm / 30) * 60); // assume 30km/h
          const pricePreview = computePricing({
            distanceKm,
            serviceBase: 150, // periodic maintenance default
            serviceName: "Maintenance",
          });
          return {
            ...tech,
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
  app.post("/api/pricing/quote", isAuthenticated, async (req: any, res) => {
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
  app.post("/api/orders/mock-checkout", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const userUuid = await ensureUserUuid(auth);
      const { serviceRequestId, technicianId, breakdown, paymentMethod } = req.body || {};
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
      if (sr.user_id !== userUuid && !auth.isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const subtotal = Number(breakdown?.subtotal || 0);
      const taxRate = Number(breakdown?.vatRate || 15);
      const taxAmount = Number(breakdown?.vat || (subtotal * taxRate) / 100);
      const total = Number(breakdown?.total || subtotal + taxAmount);

      const commissionRate = 25;
      const appCommissionAmount = Number((total * (commissionRate / 100)).toFixed(2));
      const technicianNetAmount = Number((total - appCommissionAmount).toFixed(2));

      const orderPayload = {
        userId: userUuid,
        orderNumber: `ORD-${Date.now()}`,
        subtotal: subtotal.toString(),
        taxRate: taxRate.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        deliveryType: "delivery",
        paymentMethod: paymentMethod || "mock",
        paymentStatus: "completed",
        status: "confirmed",
        items: breakdown?.parts?.items || [],
        serviceRequestId,
        technicianId,
        commissionRate: commissionRate.toString(),
        appCommissionAmount: appCommissionAmount.toString(),
        technicianNetAmount: technicianNetAmount.toString(),
        breakdownJson: breakdown,
      };

      // Validate and create
      const validated = validateSchema(insertOrderSchema, orderPayload as any, req);
      const order = await storage.createOrder(validated as any);

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

      res.status(201).json({ order, commissionRate, appCommissionAmount, technicianNetAmount });
    } catch (error) {
      const handled = handleRouteError(error, req, res);
      if (handled) return handled;
      console.error("[ORDERS][MOCK_CHECKOUT] Error:", error);
      res.status(500).json({ message: "Failed to complete mock checkout" });
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
        const { userId } = auth;
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
      const { userId } = auth;
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
      const { userId } = auth;
      const existingTechnician = await storage.getTechnicianById(req.params.id);
      if (!existingTechnician) {
        return res.status(404).json({ message: "Technician not found" });
      }

      // Verify ownership - only the technician can update their own profile
      if (existingTechnician.userId !== userId) {
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
        const { userId } = auth;
        const technicianId = req.params.id;

        const existingTechnician =
          await storage.getTechnicianById(technicianId);
        if (!existingTechnician) {
          return res.status(404).json({ message: "Technician not found" });
        }

        // Verify ownership - only the technician can upload their own documents
        if (existingTechnician.userId !== userId) {
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
        const { userId } = auth;
        const technicianId = req.params.id;

        const existingTechnician =
          await storage.getTechnicianById(technicianId);
        if (!existingTechnician) {
          return res.status(404).json({ message: "Technician not found" });
        }

        // Allow access for: 1) The technician themselves, 2) Admins
        const isOwner = existingTechnician.userId === userId;
        const user = await storage.getUser(userId);
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
      const { userId } = auth;
      const requests = await storage.getUserServiceRequests(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching service requests:", error);
      res.status(500).json({ message: "Failed to fetch service requests" });
    }
  });

  app.get(
    "/api/service-requests/technician",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const auth = getAuthContext(req);
        if (!auth) return res.status(401).json({ message: "Unauthorized" });
        const { userId } = auth;
        const technician = await storage.getTechnician(userId);
        if (!technician) {
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

  app.post("/api/service-requests", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const body = req.body || {};
      const technicianId = body.technicianId;

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
      if (!technicianId || `${technicianId}`.trim() === "") {
        fieldErrors.push({ field: "technicianId", message: "يجب اختيار فني" });
      }
      if (!body.serviceType || `${body.serviceType}`.trim() === "") {
        fieldErrors.push({ field: "serviceType", message: "يجب اختيار نوع الخدمة" });
      }
      if (latitude === undefined || longitude === undefined) {
        fieldErrors.push({ field: "location", message: "يرجى تحديد الموقع" });
      }
      if (fieldErrors.length) {
        return res
          .status(400)
          .json(normalizeErrorBody(400, { code: "VALIDATION_ERROR", errors: fieldErrors }, lang));
      }

      // Only pass known fields to schema to avoid validation errors
      const safePayload: any = {
        serviceType: body.serviceType || "maintenance",
        technicianId: technicianId,
        notes: body.notes,
        latitude,
        longitude,
        location: body.location || "Riyadh",
        status: body.status || "pending",
      };
      if (body.bikeId) safePayload.bikeId = body.bikeId;

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
      const request = await storage.createServiceRequest({
        ...requestData,
        userId,
      });
      res.status(201).json(request);
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
        const { userId } = auth;
        const existingRequest = await storage.getServiceRequest(req.params.id);
        if (!existingRequest) {
          return res.status(404).json({ message: "Service request not found" });
        }

        // Check if user owns the request or is the assigned technician
        const technician = await storage.getTechnician(userId);
        const isOwner = existingRequest.userId === userId;
        const isTechnician =
          technician && existingRequest.technicianId === technician.id;

        if (!isOwner && !isTechnician) {
          return res.status(403).json({ message: "Forbidden" });
        }

        const request = await storage.updateServiceRequest(
          req.params.id,
          req.body,
        );
        res.json(request);
      } catch (error) {
        console.error("Error updating service request:", error);
        res.status(500).json({ message: "Failed to update service request" });
      }
    },
  );

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

  app.get("/api/admin/parts", isAuthenticated, isAdmin, async (_req, res) => {
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
    isAdmin,
    upload.single("image"),
    async (req: any, res) => {
      try {
        console.log("[ADMIN][PARTS][CREATE] start");
        
        // Parse part data from form
        const partData = {
          name: req.body.name,
          nameEn: req.body.nameEn,
          category: req.body.category,
          price: req.body.price,
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
    isAdmin,
    upload.single("image"),
    async (req: any, res) => {
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
    isAdmin,
    async (req: any, res) => {
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
    isAdmin,
    async (req: any, res) => {
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

  // Admin routes - Protected with isAdmin middleware
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/bikes", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { resp, data } = await pgFetch("/bikes?order=created_at.desc");
      if (!resp.ok) {
        console.log("[ADMIN][BIKES][LIST][FAILED]", { status: resp.status, body: data });
        return res.json([]);
      }
      res.json(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching all bikes:", error);
      res.status(500).json({ message: "Failed to fetch bikes" });
    }
  });

  app.get(
    "/api/admin/technicians",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
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
    "/api/admin/technicians/pending",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
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
        const techId = req.params.id;
        console.log("[ADMIN][TECH][APPROVE]", { techId });
        const { resp, data } = await pgFetch(`/technicians?id=eq.${encodeURIComponent(techId)}`, {
          method: "PATCH",
          body: { status: "approved", is_active: true },
          headers: { Prefer: "return=representation" },
        });
        if (!resp.ok) {
          console.log("[ADMIN][TECH][APPROVE][FAILED]", { status: resp.status, body: data });
          return res.status(404).json({ message: "Technician not found" });
        }
        const technician = Array.isArray(data) ? data[0] : data;
        // Flag user as technician
        if (technician?.user_id) {
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
        console.log("[ADMIN][TECH][REJECT]", { techId });
        const { resp, data } = await pgFetch(`/technicians?id=eq.${encodeURIComponent(techId)}`, {
          method: "PATCH",
          body: { status: "rejected", is_active: false },
          headers: { Prefer: "return=representation" },
        });
        if (!resp.ok) {
          console.log("[ADMIN][TECH][REJECT][FAILED]", { status: resp.status, body: data });
          return res.status(404).json({ message: "Technician not found" });
        }
        res.json({ message: "Technician rejected successfully" });
      } catch (error) {
        console.error("Error rejecting technician:", error);
        res.status(500).json({ message: "Failed to reject technician" });
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
    isAdmin,
    async (req, res) => {
      try {
        const { resp, data } = await pgFetch(`/technician_documents?technician_id=eq.${encodeURIComponent(req.params.id)}`);
        if (!resp.ok) {
          console.log("[ADMIN][TECH][DOCS][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        res.json(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching technician documents:", error);
        res.status(500).json({ message: "Failed to fetch documents" });
      }
    },
  );

  app.get(
    "/api/admin/technicians/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
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
          return docsResp.ok && Array.isArray(docsData) ? docsData : [];
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
    isAdmin,
    async (req, res) => {
      try {
        const { resp, data } = await pgFetch("/service_requests?order=created_at.desc");
        if (!resp.ok) {
          console.log("[ADMIN][SERVICE_REQUESTS][FAILED]", { status: resp.status, body: data });
          return res.json([]);
        }
        res.json(Array.isArray(data) ? data : []);
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
  app.get("/api/admin/invoices", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const invoices = await storage.getAllInvoices();
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
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
  app.post("/api/orders", isAuthenticated, async (req: any, res) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const { userId } = auth;
      const orderData = validateSchema(insertOrderSchema, {
        ...req.body,
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
      const { userId } = auth;
      const orders = await storage.getUserOrders(userId);
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
  app.get("/api/admin/orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching all orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Discount Code routes - Admin only
  app.get(
    "/api/admin/discount-codes",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const codes = await storage.getAllDiscountCodes();
        res.json(codes);
      } catch (error) {
        console.error("Error fetching discount codes:", error);
        res.status(500).json({ message: "Failed to fetch discount codes" });
      }
    },
  );

  app.post(
    "/api/admin/discount-codes",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const codeData = validateSchema(insertDiscountCodeSchema, req.body, req);
        const auth = getAuthContext(req);
        const createdBy = auth?.userId;
        const code = await storage.createDiscountCode({
          ...codeData,
          createdBy,
        });
        res.status(201).json(code);
      } catch (error) {
        const handled = handleRouteError(error, req, res);
        if (handled) return handled;
        console.error("Error creating discount code:", error);
        res.status(500).json({ message: "Failed to create discount code" });
      }
    },
  );

  app.patch(
    "/api/admin/discount-codes/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const code = await storage.updateDiscountCode(req.params.id, req.body);
        res.json(code);
      } catch (error) {
        console.error("Error updating discount code:", error);
        res.status(500).json({ message: "Failed to update discount code" });
      }
    },
  );

  app.delete(
    "/api/admin/discount-codes/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        await storage.deleteDiscountCode(req.params.id);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting discount code:", error);
        res.status(500).json({ message: "Failed to delete discount code" });
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

  const httpServer = createServer(app);

  return httpServer;
}

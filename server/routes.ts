import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupGoogleAuth } from "./googleAuth";
import { setupFirebaseAuth, isAuthenticated, isAdmin } from "./firebaseMiddleware";
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
import { supabase, supabaseAdmin } from "./supabaseClient";

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // حجم 5MB
  storage: multer.memoryStorage(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware - Google OAuth (direct, no Replit)
  await setupGoogleAuth(app);
  // Firebase Auth + Twilio OTP for phone authentication
  await setupFirebaseAuth(app);

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
          
          const storageClient = supabaseAdmin || supabase;
          const timestamp = Date.now();
          const fileName = `${folder}/${timestamp}-${file.originalname}`;
          
          const { data, error } = await storageClient.storage
            .from("technician-docs")
            .upload(fileName, file.buffer, {
              contentType: file.mimetype,
              upsert: false,
            });
          
          if (error) {
            console.error("Supabase upload error:", error);
            throw new Error(`Error uploading to Supabase: ${error.message}`);
          }
          
          // Get public URL
          const { data: urlData } = storageClient.storage
            .from("technician-docs")
            .getPublicUrl(fileName);
          
          return urlData.publicUrl;
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

        const data = publicTechnicianSchema.parse(formData);

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
      // Support both Google Auth (req.user) and Firebase/Phone Auth (req.firebaseUser)
      let userId: string;
      let isAdmin = false;
      let phoneNumber: string | undefined;
      
      if (req.firebaseUser) {
        // Firebase or Phone auth
        userId = req.firebaseUser.uid;
        isAdmin = req.firebaseUser.isAdmin === true;
        phoneNumber = req.firebaseUser.phone_number;
      } else if (req.user?.claims?.sub) {
        // Google auth - user ID format is google_${sub}
        userId = `google_${req.user.claims.sub}`;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }

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
      let userId: string;
      let phoneNumber: string | undefined;
      
      if (req.firebaseUser) {
        userId = req.firebaseUser.uid;
        phoneNumber = req.firebaseUser.phone_number;
      } else if (req.user?.claims?.sub) {
        // Google auth - user ID format is google_${sub}
        userId = `google_${req.user.claims.sub}`;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      
      if (user) {
        res.json({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: phoneNumber || null,
        });
      } else {
        res.json({
          firstName: null,
          lastName: null,
          email: null,
          phone: phoneNumber || null,
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      let userId: string;
      let phoneNumber: string | undefined;
      let isAdmin = false;
      
      if (req.firebaseUser) {
        userId = req.firebaseUser.uid;
        phoneNumber = req.firebaseUser.phone_number;
        isAdmin = req.firebaseUser.isAdmin === true;
      } else if (req.user?.claims?.sub) {
        userId = req.user.claims.sub;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { firstName, lastName, email } = req.body;

      // Check if user exists
      let user = await storage.getUser(userId);
      
      if (user) {
        // Update existing user using upsert
        user = await storage.upsertUser({
          id: userId,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          email: email || user.email,
        });
      } else {
        // Create new user
        user = await storage.createUser({
          id: userId,
          firstName,
          lastName,
          email: email || `${userId}@phone.user`,
          isAdmin,
        });
      }

      res.json({
        message: "Profile updated successfully",
        user: {
          firstName: user?.firstName,
          lastName: user?.lastName,
          email: user?.email,
          phone: phoneNumber || null,
        },
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Bike routes
  app.get("/api/bikes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bikes = await storage.getUserBikes(userId);
      res.json(bikes);
    } catch (error) {
      console.error("Error fetching bikes:", error);
      res.status(500).json({ message: "Failed to fetch bikes" });
    }
  });

  app.get("/api/bikes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bike = await storage.getBike(req.params.id);
      if (!bike) {
        return res.status(404).json({ message: "Bike not found" });
      }
      // Verify ownership
      if (bike.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(bike);
    } catch (error) {
      console.error("Error fetching bike:", error);
      res.status(500).json({ message: "Failed to fetch bike" });
    }
  });

  app.post("/api/bikes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bikeData = insertBikeSchema.omit({ userId: true }).parse(req.body);
      const bike = await storage.createBike({ ...bikeData, userId });
      res.status(201).json(bike);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid bike data", errors: error.errors });
      }
      console.error("Error creating bike:", error);
      res.status(500).json({ message: "Failed to create bike" });
    }
  });

  app.patch("/api/bikes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const existingBike = await storage.getBike(req.params.id);
      if (!existingBike) {
        return res.status(404).json({ message: "Bike not found" });
      }
      // Verify ownership
      if (existingBike.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const bike = await storage.updateBike(req.params.id, req.body);
      res.json(bike);
    } catch (error) {
      console.error("Error updating bike:", error);
      res.status(500).json({ message: "Failed to update bike" });
    }
  });

  app.delete("/api/bikes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
    upload.single("photo"),
    async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub || req.firebaseUser?.uid;
        console.log("[Bike Photo] Upload request - userId:", userId, "bikeId:", req.params.id);
        console.log("[Bike Photo] Auth info - user:", !!req.user, "firebaseUser:", !!req.firebaseUser);
        
        if (!userId) {
          console.log("[Bike Photo] No userId - returning 401");
          return res.status(401).json({ message: "Unauthorized" });
        }

        const bike = await storage.getBike(req.params.id);
        if (!bike) {
          console.log("[Bike Photo] Bike not found:", req.params.id);
          return res.status(404).json({ message: "Bike not found" });
        }
        console.log("[Bike Photo] Bike found - bike.userId:", bike.userId, "request userId:", userId);
        
        if (bike.userId !== userId) {
          console.log("[Bike Photo] Ownership mismatch - bike.userId:", bike.userId, "userId:", userId);
          return res.status(403).json({ message: "Forbidden" });
        }

        const file = req.file as Express.Multer.File;
        if (!file) {
          console.log("[Bike Photo] No file in request");
          return res.status(400).json({ message: "No photo uploaded" });
        }
        console.log("[Bike Photo] File received:", file.originalname, file.size, "bytes");

        // Upload to Supabase Storage (use admin client for private bucket)
        const storageClient = supabaseAdmin || supabase;
        console.log("[Bike Photo] Using admin client:", !!supabaseAdmin);
        
        // Sanitize filename - remove spaces and special characters
        const timestamp = Date.now();
        const fileExtension = file.originalname.split('.').pop() || 'jpg';
        const sanitizedName = `bike_${timestamp}.${fileExtension}`;
        const fileName = `bike-photos/${bike.id}/${sanitizedName}`;
        console.log("[Bike Photo] Sanitized filename:", fileName);

        const { data, error } = await storageClient.storage
          .from("technician-docs")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (error) {
          console.error("[Bike Photo] Supabase upload error:", JSON.stringify(error, null, 2));
          return res.status(500).json({ 
            message: "Failed to upload photo", 
            error: error.message || String(error),
            details: error
          });
        }

        // Get public URL
        const { data: urlData } = storageClient.storage
          .from("technician-docs")
          .getPublicUrl(fileName);

        // Update bike with new image URL
        const updatedBike = await storage.updateBike(bike.id, {
          imageUrl: urlData.publicUrl,
        });

        console.log(`[Bike Photo] Uploaded for bike ${bike.id}: ${urlData.publicUrl}`);
        res.json({ 
          success: true, 
          imageUrl: urlData.publicUrl,
          bike: updatedBike 
        });
      } catch (error: any) {
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
      const userId = req.user?.claims?.sub || req.firebaseUser?.uid;
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
        const userId = req.user.claims.sub;
        const bike = await storage.getBike(req.params.id);
        if (!bike) {
          return res.status(404).json({ message: "Bike not found" });
        }
        // Verify ownership
        if (bike.userId !== userId) {
          return res.status(403).json({ message: "Forbidden" });
        }
        const records = await storage.getBikeMaintenanceRecords(req.params.id);
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
      const userId = req.user.claims.sub;
      const recordData = insertMaintenanceRecordSchema.parse(req.body);

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
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid maintenance record data",
          errors: error.errors,
        });
      }
      console.error("Error creating maintenance record:", error);
      res.status(500).json({ message: "Failed to create maintenance record" });
    }
  });

  // Technician routes
  app.get("/api/technicians", async (req, res) => {
    try {
      const technicians = await storage.getAllTechnicians();
      res.json(technicians);
    } catch (error) {
      console.error("Error fetching technicians:", error);
      res.status(500).json({ message: "Failed to fetch technicians" });
    }
  });

  app.get("/api/technicians/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const technician = await storage.getTechnician(userId);
      res.json(technician);
    } catch (error) {
      console.error("Error fetching technician:", error);
      res.status(500).json({ message: "Failed to fetch technician" });
    }
  });

  // Transactional technician registration with documents
  app.post(
    "/api/technicians/register",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { technicianData, documents } = req.body;

        // Validate technician data
        const validatedTechnicianData = insertTechnicianSchema
          .omit({ userId: true })
          .parse(technicianData);

        // Validate documents array
        if (!Array.isArray(documents)) {
          return res
            .status(400)
            .json({ message: "Documents must be an array" });
        }

        // Validate each document
        const documentSchema = z.object({
          documentType: z.enum([
            "national_id",
            "commercial_register",
            "certification",
          ]),
          fileUrl: z.string().min(1),
        });

        for (const doc of documents) {
          try {
            documentSchema.parse(doc);

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
          if (documents.length > 0) {
            for (const doc of documents) {
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
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Error registering technician:", error);
        res.status(500).json({ message: "Failed to register technician" });
      }
    },
  );

  app.post("/api/technicians", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const technicianData = insertTechnicianSchema
        .omit({ userId: true })
        .parse(req.body);
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
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid technician data", errors: error.errors });
      }
      console.error("Error creating technician:", error);
      res.status(500).json({ message: "Failed to create technician" });
    }
  });

  app.patch("/api/technicians/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
        const userId = req.user.claims.sub;
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
        const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
        const userId = req.user.claims.sub;
        const technician = await storage.getTechnician(userId);

        if (!technician) {
          return res.status(404).json({ message: "Technician not found" });
        }

        const requests = await storage.getTechnicianServiceRequests(
          technician.id,
        );
        res.json(requests);
      } catch (error) {
        console.error("Error fetching technician service requests:", error);
        res.status(500).json({ message: "Failed to fetch service requests" });
      }
    },
  );

  app.post("/api/service-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestData = insertServiceRequestSchema
        .omit({ userId: true })
        .parse(req.body);
      const request = await storage.createServiceRequest({
        ...requestData,
        userId,
      });
      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid service request data",
          errors: error.errors,
        });
      }
      console.error("Error creating service request:", error);
      res.status(500).json({ message: "Failed to create service request" });
    }
  });

  app.patch(
    "/api/service-requests/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
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
      const parts = category
        ? await storage.getPartsByCategory(category as string)
        : await storage.getAllParts();
      res.json(parts);
    } catch (error) {
      console.error("Error fetching parts:", error);
      res.status(500).json({ message: "Failed to fetch parts" });
    }
  });

  app.post("/api/parts", isAuthenticated, async (req: any, res) => {
    try {
      const partData = insertPartSchema.parse(req.body);
      const part = await storage.createPart(partData);
      res.status(201).json(part);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid part data", errors: error.errors });
      }
      console.error("Error creating part:", error);
      res.status(500).json({ message: "Failed to create part" });
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
        console.log("[Admin Parts] Creating new part with image");
        
        // Parse part data from form
        const partData = {
          name: req.body.name,
          nameEn: req.body.nameEn,
          category: req.body.category,
          price: req.body.price,
          inStock: req.body.inStock === "true" || req.body.inStock === true,
          imageUrl: null as string | null,
        };

        // Upload image to Supabase if provided (use admin client)
        const storageClient = supabaseAdmin || supabase;
        const file = req.file as Express.Multer.File;
        if (file) {
          // Sanitize filename - remove spaces and special characters
          const timestamp = Date.now();
          const fileExtension = file.originalname.split('.').pop() || 'jpg';
          const sanitizedName = `part_${timestamp}.${fileExtension}`;
          const fileName = `part-images/${sanitizedName}`;

          const { data, error } = await storageClient.storage
            .from("technician-docs")
            .upload(fileName, file.buffer, {
              contentType: file.mimetype,
              upsert: false,
            });

          if (error) {
            console.error("[Admin Parts] Supabase upload error:", error);
          } else {
            const { data: urlData } = storageClient.storage
              .from("technician-docs")
              .getPublicUrl(fileName);
            partData.imageUrl = urlData.publicUrl;
            console.log("[Admin Parts] Image uploaded:", urlData.publicUrl);
          }
        }

        const validatedData = insertPartSchema.parse(partData);
        const part = await storage.createPart(validatedData);
        
        console.log("[Admin Parts] Part created:", part.id);
        res.status(201).json(part);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid part data", errors: error.errors });
        }
        console.error("[Admin Parts] Error creating part:", error);
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

        // Check if part exists
        const existingPart = await storage.getPart(partId);
        if (!existingPart) {
          return res.status(404).json({ message: "Part not found" });
        }

        // Upload to Supabase (use admin client)
        const storageClient = supabaseAdmin || supabase;
        // Sanitize filename - remove spaces and special characters
        const timestamp = Date.now();
        const fileExtension = file.originalname.split('.').pop() || 'jpg';
        const sanitizedName = `part_${timestamp}.${fileExtension}`;
        const fileName = `part-images/${partId}/${sanitizedName}`;

        const { data, error } = await storageClient.storage
          .from("technician-docs")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (error) {
          console.error("[Admin Parts] Supabase upload error:", error);
          return res.status(500).json({ message: "Failed to upload image" });
        }

        // Get public URL
        const { data: urlData } = storageClient.storage
          .from("technician-docs")
          .getPublicUrl(fileName);

        // Update part with new image URL
        const updatedPart = await storage.updatePart(partId, {
          imageUrl: urlData.publicUrl,
        });

        console.log(`[Admin Parts] Image uploaded for part ${partId}: ${urlData.publicUrl}`);
        res.json({ 
          success: true, 
          imageUrl: urlData.publicUrl,
          part: updatedPart 
        });
      } catch (error) {
        console.error("[Admin Parts] Error uploading image:", error);
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
        const existingPart = await storage.getPart(partId);
        
        if (!existingPart) {
          return res.status(404).json({ message: "Part not found" });
        }

        const updatedPart = await storage.updatePart(partId, req.body);
        res.json(updatedPart);
      } catch (error) {
        console.error("[Admin Parts] Error updating part:", error);
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
        const existingPart = await storage.getPart(partId);
        
        if (!existingPart) {
          return res.status(404).json({ message: "Part not found" });
        }

        await storage.deletePart(partId);
        res.status(204).send();
      } catch (error) {
        console.error("[Admin Parts] Error deleting part:", error);
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
      const bikes = await storage.getAllBikes();
      res.json(bikes);
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
        const technicians = await storage.getAllTechniciansForAdmin();
        res.json(technicians);
      } catch (error) {
        console.error("Error fetching all technicians:", error);
        res.status(500).json({ message: "Failed to fetch technicians" });
      }
    },
  );

  app.get(
    "/api/admin/technicians/pending",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const pendingTechnicians = await storage.getPendingTechnicians();
        res.json(pendingTechnicians);
      } catch (error) {
        console.error("Error fetching pending technicians:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch pending technicians" });
      }
    },
  );

  app.post(
    "/api/admin/technicians/:id/approve",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const technician = await storage.approveTechnician(req.params.id);
        if (!technician) {
          return res.status(404).json({ message: "Technician not found" });
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
        await storage.rejectTechnician(req.params.id);
        res.json({ message: "Technician rejected successfully" });
      } catch (error) {
        console.error("Error rejecting technician:", error);
        res.status(500).json({ message: "Failed to reject technician" });
      }
    },
  );

  app.get(
    "/api/admin/technicians/:id/documents",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const documents = await storage.getTechnicianDocuments(req.params.id);
        res.json(documents);
      } catch (error) {
        console.error("Error fetching technician documents:", error);
        res.status(500).json({ message: "Failed to fetch documents" });
      }
    },
  );

  app.get(
    "/api/admin/service-requests",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const requests = await storage.getAllServiceRequests();
        res.json(requests);
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
  app.get("/api/admin/roles", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const roles = await storage.getAllRoles();
      res.json(roles);
    } catch (error) {
      console.error("Error fetching roles:", error);
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  app.get(
    "/api/admin/user-roles",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const userRoles = await storage.getAllUserRoles();
        res.json(userRoles);
      } catch (error) {
        console.error("Error fetching user roles:", error);
        res.status(500).json({ message: "Failed to fetch user roles" });
      }
    },
  );

  app.post(
    "/api/admin/user-roles",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const assignerId = req.user.claims.sub;
        const { userId, roleId } = req.body;

        if (!userId || !roleId) {
          return res
            .status(400)
            .json({ message: "userId and roleId are required" });
        }

        const userRole = await storage.assignUserRole(
          userId,
          roleId,
          assignerId,
        );
        res.status(201).json(userRole);
      } catch (error: any) {
        console.error("Error assigning user role:", error);
        if (error.message === "User already has this role assigned") {
          return res.status(409).json({ message: error.message });
        }
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
        await storage.removeUserRole(req.params.id);
        res.status(204).send();
      } catch (error) {
        console.error("Error removing user role:", error);
        res.status(500).json({ message: "Failed to remove user role" });
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
      const userId = req.user.claims.sub;
      const invoices = await storage.getUserInvoices(userId);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching user invoices:", error);
      res.status(500).json({ message: "Failed to fetch user invoices" });
    }
  });

  app.get("/api/invoices/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
        const invoiceData = insertInvoiceSchema.parse(req.body);

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
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid invoice data", errors: error.errors });
        }
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
      const userId = req.user.claims.sub;
      const orderData = insertOrderSchema.parse({
        ...req.body,
        userId,
      });

      const order = await storage.createOrder(orderData);
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.get("/api/orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const orders = await storage.getUserOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
        const codeData = insertDiscountCodeSchema.parse(req.body);
        const code = await storage.createDiscountCode({
          ...codeData,
          createdBy: req.user.claims.sub,
        });
        res.status(201).json(code);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            message: "Invalid discount code data",
            errors: error.errors,
          });
        }
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

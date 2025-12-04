// Blueprint reference: javascript_log_in_with_replit
import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  text,
  decimal,
  boolean,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Phone session storage for OTP authentication
// Persists phone login sessions to database for server restart resilience
export const phoneSessions = pgTable(
  "phone_sessions",
  {
    token: varchar("token").primaryKey(), // session_xxx format
    userId: varchar("user_id").notNull(),
    phoneNumber: varchar("phone_number").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("IDX_phone_session_expires").on(table.expiresAt)],
);

export type PhoneSession = typeof phoneSessions.$inferSelect;
export type InsertPhoneSession = typeof phoneSessions.$inferInsert;

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isTechnician: boolean("is_technician").default(false),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Technician profiles
export const technicians = pgTable("technicians", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Contact (phoneNumber is additional to user email)
  phoneNumber: varchar("phone_number"),
  // Identity and banking (sensitive - should be encrypted in production)
  nationalId: varchar("national_id"),
  iban: varchar("iban"),
  // Experience and certification
  yearsOfExperience: integer("years_of_experience"),
  commercialRegister: varchar("commercial_register"),
  // Location
  location: varchar("location"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  // Rating and availability
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0.00"),
  reviewCount: integer("review_count").default(0),
  isAvailable: boolean("is_available").default(true),
  isApproved: boolean("is_approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTechnicianSchema = createInsertSchema(technicians).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTechnician = z.infer<typeof insertTechnicianSchema>;
export type Technician = typeof technicians.$inferSelect;

// Technician documents
export const documentTypeEnum = pgEnum("document_type", [
  "national_id",
  "commercial_register",
  "certification",
  "profile_image",
  "other",
]);

export type DocumentType = typeof documentTypeEnum.enumValues[number];

export const technicianDocuments = pgTable("technician_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").notNull().references(() => technicians.id, { onDelete: 'cascade' }),
  documentType: documentTypeEnum("document_type").notNull(),
  fileName: varchar("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"), // in bytes
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertTechnicianDocumentSchema = createInsertSchema(technicianDocuments).omit({
  id: true,
  uploadedAt: true,
});

export type InsertTechnicianDocument = z.infer<typeof insertTechnicianDocumentSchema>;
export type TechnicianDocument = typeof technicianDocuments.$inferSelect;

// Bikes
export const bikes = pgTable("bikes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  bikeId: varchar("bike_id").notNull().unique(), // BK-2024-XXXX format
  brand: varchar("brand").notNull(),
  model: varchar("model").notNull(),
  year: integer("year").notNull(),
  totalDistance: integer("total_distance").default(0), // in km
  imageUrl: varchar("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBikeSchema = createInsertSchema(bikes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBike = z.infer<typeof insertBikeSchema>;
export type Bike = typeof bikes.$inferSelect;

// Service requests
export const serviceRequests = pgTable("service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  bikeId: varchar("bike_id").references(() => bikes.id, { onDelete: 'set null' }),
  technicianId: varchar("technician_id").references(() => technicians.id, { onDelete: 'set null' }),
  serviceType: varchar("service_type").notNull(), // maintenance, repair, parts
  status: varchar("status").notNull().default("pending"), // pending, accepted, in_progress, completed, cancelled
  location: varchar("location"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  notes: text("notes"),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;

// Maintenance records
export const maintenanceRecords = pgTable("maintenance_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bikeId: varchar("bike_id").notNull().references(() => bikes.id, { onDelete: 'cascade' }),
  technicianId: varchar("technician_id").references(() => technicians.id, { onDelete: 'set null' }),
  serviceType: varchar("service_type").notNull(),
  description: text("description"),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaintenanceRecordSchema = createInsertSchema(maintenanceRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertMaintenanceRecord = z.infer<typeof insertMaintenanceRecordSchema>;
export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;

// Parts catalog
export const parts = pgTable("parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  nameEn: varchar("name_en").notNull(),
  category: varchar("category").notNull(), // tires, chains, brakes, etc.
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  inStock: boolean("in_stock").default(true),
  imageUrl: varchar("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPartSchema = createInsertSchema(parts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPart = z.infer<typeof insertPartSchema>;
export type Part = typeof parts.$inferSelect;

// Payment enums
export const paymentMethodEnum = pgEnum("payment_method", [
  "stripe_card",
  "stripe_apple_pay",
  "stc_pay",
  "bank_transfer",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
  "refunded",
]);

// Export TypeScript unions for frontend
export type PaymentMethod = typeof paymentMethodEnum.enumValues[number];
export type PaymentStatus = typeof paymentStatusEnum.enumValues[number];

// Payments table
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceRequestId: varchar("service_request_id").notNull().references(() => serviceRequests.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").notNull().default("SAR"), // SAR for Saudi Riyal
  method: paymentMethodEnum("method").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  providerReference: varchar("provider_reference"), // Stripe payment intent ID, STC Pay reference, etc.
  metadata: jsonb("metadata"), // Additional payment info (e.g., bank details for transfers)
  initiatedBy: varchar("initiated_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// User Roles
export const roleEnum = pgEnum("role_name", [
  "owner",
  "admin",
  "support",
  "technician",
  "user",
]);

export type RoleName = typeof roleEnum.enumValues[number];

export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: roleEnum("name").notNull().unique(),
  description: text("description"),
  permissions: jsonb("permissions").notNull().default('[]'), // Array of permission strings
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

// User-Role assignments
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: varchar("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  assignedBy: varchar("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => [
  unique("user_role_unique").on(table.userId, table.roleId),
  index("user_roles_user_idx").on(table.userId),
  index("user_roles_role_idx").on(table.roleId),
]);

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  assignedAt: true,
});

export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

// Invoices
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "cancelled",
]);

export type InvoiceStatus = typeof invoiceStatusEnum.enumValues[number];

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: varchar("invoice_number").notNull().unique(), // INV-2024-XXXX format
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceRequestId: varchar("service_request_id").references(() => serviceRequests.id, { onDelete: 'set null' }),
  
  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(), // المبلغ قبل الضريبة
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("15.00"), // نسبة الضريبة (15%)
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(), // مبلغ الضريبة
  total: decimal("total", { precision: 10, scale: 2 }).notNull(), // الإجمالي النهائي
  
  // Invoice details
  description: text("description"),
  items: jsonb("items").notNull().default('[]'), // Array of {name, quantity, unitPrice, total}
  
  // Status and dates
  status: invoiceStatusEnum("status").notNull().default("draft"),
  issuedDate: timestamp("issued_date"),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  subtotal: z.union([z.string(), z.number()]).transform(val => String(val)),
  taxRate: z.union([z.string(), z.number()]).optional().transform(val => val ? String(val) : undefined),
  taxAmount: z.union([z.string(), z.number()]).optional().transform(val => val ? String(val) : undefined),
  total: z.union([z.string(), z.number()]).optional().transform(val => val ? String(val) : undefined),
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Discount Codes
export const discountCodes = pgTable("discount_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull().unique(), // e.g., SUMMER2024
  discountType: varchar("discount_type").notNull(), // percentage or fixed
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(), // e.g., 20 for 20% or 50 for 50 SAR
  maxUses: integer("max_uses"), // null = unlimited
  currentUses: integer("current_uses").default(0),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDiscountCodeSchema = createInsertSchema(discountCodes).omit({
  id: true,
  currentUses: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiscountCode = z.infer<typeof insertDiscountCodeSchema>;
export type DiscountCode = typeof discountCodes.$inferSelect;

// Bike Media (photos)
export const bikeMedia = pgTable("bike_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bikeId: varchar("bike_id").notNull().references(() => bikes.id, { onDelete: 'cascade' }),
  fileName: varchar("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertBikeMediaSchema = createInsertSchema(bikeMedia).omit({
  id: true,
  uploadedAt: true,
});

export type InsertBikeMedia = z.infer<typeof insertBikeMediaSchema>;
export type BikeMedia = typeof bikeMedia.$inferSelect;

// Part/Product Media (images)
export const partMedia = pgTable("part_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partId: varchar("part_id").notNull().references(() => parts.id, { onDelete: 'cascade' }),
  fileName: varchar("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  isPrimary: boolean("is_primary").default(false),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertPartMediaSchema = createInsertSchema(partMedia).omit({
  id: true,
  uploadedAt: true,
});

export type InsertPartMedia = z.infer<typeof insertPartMediaSchema>;
export type PartMedia = typeof partMedia.$inferSelect;

// Delivery type enum
export const deliveryTypeEnum = pgEnum("delivery_type", [
  "pickup",
  "delivery",
]);

export type DeliveryType = typeof deliveryTypeEnum.enumValues[number];

// Orders table for product purchases
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  orderNumber: varchar("order_number").notNull().unique(),
  
  // Order details
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("15.00"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  
  // Delivery
  deliveryType: deliveryTypeEnum("delivery_type").notNull().default("pickup"),
  deliveryAddress: text("delivery_address"),
  
  // Payment
  paymentMethod: varchar("payment_method"), // apple_pay, mada, credit_card, etc.
  paymentStatus: varchar("payment_status").default("pending"), // pending, completed, failed
  
  // Items stored as JSONB
  items: jsonb("items").notNull().default('[]'),
  
  // Status
  status: varchar("status").notNull().default("pending"), // pending, confirmed, processing, completed, cancelled
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

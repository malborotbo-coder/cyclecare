// Blueprint reference: javascript_log_in_with_replit
import {
  users,
  type User,
  type UpsertUser,
  bikes,
  type Bike,
  type InsertBike,
  technicians,
  type Technician,
  type InsertTechnician,
  technicianDocuments,
  type TechnicianDocument,
  type InsertTechnicianDocument,
  serviceRequests,
  type ServiceRequest,
  type InsertServiceRequest,
  maintenanceRecords,
  type MaintenanceRecord,
  type InsertMaintenanceRecord,
  parts,
  type Part,
  type InsertPart,
  roles,
  type Role,
  type InsertRole,
  userRoles,
  type UserRole,
  type InsertUserRole,
  invoices,
  type Invoice,
  type InsertInvoice,
  discountCodes,
  type DiscountCode,
  type InsertDiscountCode,
  phoneSessions,
  type PhoneSession,
  type InsertPhoneSession,
  orders,
  type Order,
  type InsertOrder,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

// Extended technician type with user info for admin views
export interface TechnicianWithUser extends Technician {
  userName?: string | null;
  userEmail?: string | null;
}

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Admin operations
  getAllUsers(): Promise<User[]>;
  getAllBikes(): Promise<Bike[]>;
  getAllServiceRequests(): Promise<ServiceRequest[]>;
  updateUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined>;
  
  // Bike operations
  getUserBikes(userId: string): Promise<Bike[]>;
  getBike(id: string): Promise<Bike | undefined>;
  createBike(bike: InsertBike): Promise<Bike>;
  updateBike(id: string, bike: Partial<InsertBike>): Promise<Bike | undefined>;
  deleteBike(id: string): Promise<void>;
  
  // Technician operations
  getTechnician(userId: string): Promise<Technician | undefined>;
  getTechnicianById(id: string): Promise<Technician | undefined>;
  getAllTechnicians(): Promise<TechnicianWithUser[]>;
  getPendingTechnicians(): Promise<TechnicianWithUser[]>;
  getAllTechniciansForAdmin(): Promise<TechnicianWithUser[]>;
  createTechnician(technician: InsertTechnician): Promise<Technician>;
  updateTechnician(id: string, technician: Partial<InsertTechnician>): Promise<Technician | undefined>;
  approveTechnician(id: string): Promise<Technician | undefined>;
  rejectTechnician(id: string): Promise<void>;
  
  // Technician documents operations
  addTechnicianDocument(document: InsertTechnicianDocument): Promise<TechnicianDocument>;
  getTechnicianDocuments(technicianId: string): Promise<TechnicianDocument[]>;
  deleteTechnicianDocument(id: string): Promise<void>;
  
  // Service request operations
  getUserServiceRequests(userId: string): Promise<ServiceRequest[]>;
  getTechnicianServiceRequests(technicianId: string): Promise<ServiceRequest[]>;
  getServiceRequest(id: string): Promise<ServiceRequest | undefined>;
  createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest>;
  updateServiceRequest(id: string, request: Partial<InsertServiceRequest>): Promise<ServiceRequest | undefined>;
  
  // Maintenance record operations
  getBikeMaintenanceRecords(bikeId: string): Promise<MaintenanceRecord[]>;
  createMaintenanceRecord(record: InsertMaintenanceRecord): Promise<MaintenanceRecord>;
  
  // Parts operations
  getAllParts(): Promise<Part[]>;
  getPartsByCategory(category: string): Promise<Part[]>;
  getPart(id: string): Promise<Part | undefined>;
  createPart(part: InsertPart): Promise<Part>;
  updatePart(id: string, part: Partial<InsertPart>): Promise<Part | undefined>;
  deletePart(id: string): Promise<void>;
  
  // Roles operations
  getAllRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  
  // User-Roles operations
  getAllUserRoles(): Promise<UserRole[]>;
  getUserRoles(userId: string): Promise<UserRole[]>;
  assignUserRole(userId: string, roleId: string, assignedBy: string): Promise<UserRole>;
  removeUserRole(id: string): Promise<void>;
  
  // Invoice operations
  getAllInvoices(): Promise<Invoice[]>;
  getUserInvoices(userId: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: string): Promise<void>;

  // Discount code operations
  getAllDiscountCodes(): Promise<DiscountCode[]>;
  getDiscountCode(code: string): Promise<DiscountCode | undefined>;
  createDiscountCode(discount: InsertDiscountCode): Promise<DiscountCode>;
  updateDiscountCode(id: string, discount: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined>;
  deleteDiscountCode(id: string): Promise<void>;

  // Public technician registration
  createPublicTechnicianApplication(data: {
    email: string;
    name: string;
    phoneNumber: string;
    experienceYears: number;
    location?: string;
    nationalId?: string;
    iban?: string;
    commercialRegister?: string;
  }): Promise<Technician>;

  // Phone session operations (for OTP auth persistence)
  createPhoneSession(session: InsertPhoneSession): Promise<PhoneSession>;
  getPhoneSession(token: string): Promise<PhoneSession | undefined>;
  deletePhoneSession(token: string): Promise<void>;
  deleteExpiredPhoneSessions(): Promise<void>;

  // Order operations
  getAllOrders(): Promise<Order[]>;
  getUserOrders(userId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, order: Partial<InsertOrder>): Promise<Order | undefined>;
  deleteOrder(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Filter out undefined values to preserve existing data
    const updateData: any = { updatedAt: new Date() };
    if (userData.email !== undefined) updateData.email = userData.email;
    if (userData.firstName !== undefined) updateData.firstName = userData.firstName;
    if (userData.lastName !== undefined) updateData.lastName = userData.lastName;
    if (userData.profileImageUrl !== undefined) updateData.profileImageUrl = userData.profileImageUrl;
    if (userData.isAdmin !== undefined) updateData.isAdmin = userData.isAdmin;
    
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: updateData,
      })
      .returning();
    return user;
  }

  // Admin operations
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllBikes(): Promise<Bike[]> {
    return await db.select().from(bikes).orderBy(desc(bikes.createdAt));
  }

  async getAllServiceRequests(): Promise<ServiceRequest[]> {
    return await db.select().from(serviceRequests).orderBy(desc(serviceRequests.createdAt));
  }

  async updateUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isAdmin, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Bike operations
  async getUserBikes(userId: string): Promise<Bike[]> {
    return await db.select().from(bikes).where(eq(bikes.userId, userId)).orderBy(desc(bikes.createdAt));
  }

  async getBike(id: string): Promise<Bike | undefined> {
    const [bike] = await db.select().from(bikes).where(eq(bikes.id, id));
    return bike;
  }

  async createBike(bikeData: InsertBike): Promise<Bike> {
    const [bike] = await db.insert(bikes).values(bikeData).returning();
    return bike;
  }

  async updateBike(id: string, bikeData: Partial<InsertBike>): Promise<Bike | undefined> {
    const [bike] = await db
      .update(bikes)
      .set({ ...bikeData, updatedAt: new Date() })
      .where(eq(bikes.id, id))
      .returning();
    return bike;
  }

  async deleteBike(id: string): Promise<void> {
    await db.delete(bikes).where(eq(bikes.id, id));
  }

  // Technician operations
  async getTechnician(userId: string): Promise<Technician | undefined> {
    const [technician] = await db.select().from(technicians).where(eq(technicians.userId, userId));
    return technician;
  }

  async getTechnicianById(id: string): Promise<Technician | undefined> {
    const [technician] = await db.select().from(technicians).where(eq(technicians.id, id));
    return technician;
  }

  async getAllTechnicians(): Promise<TechnicianWithUser[]> {
    const result = await db
      .select({
        technician: technicians,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
      })
      .from(technicians)
      .leftJoin(users, eq(technicians.userId, users.id))
      .where(eq(technicians.isAvailable, true));
    
    return result.map(row => ({
      ...row.technician,
      userName: [row.userFirstName, row.userLastName].filter(Boolean).join(' ') || null,
      userEmail: row.userEmail,
      nationalId: null,
      iban: null,
      commercialRegister: null,
      phoneNumber: null,
    })) as TechnicianWithUser[];
  }

  async getAllTechniciansForAdmin(): Promise<TechnicianWithUser[]> {
    const result = await db
      .select({
        technician: technicians,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
      })
      .from(technicians)
      .leftJoin(users, eq(technicians.userId, users.id))
      .where(eq(technicians.isApproved, true))
      .orderBy(desc(technicians.createdAt));
    
    return result.map(row => ({
      ...row.technician,
      userName: [row.userFirstName, row.userLastName].filter(Boolean).join(' ') || null,
      userEmail: row.userEmail,
    })) as TechnicianWithUser[];
  }

  async createTechnician(technicianData: InsertTechnician): Promise<Technician> {
    const [technician] = await db.insert(technicians).values(technicianData).returning();
    
    // Update user to mark as technician
    await db.update(users).set({ isTechnician: true }).where(eq(users.id, technicianData.userId));
    
    return technician;
  }

  async updateTechnician(id: string, technicianData: Partial<InsertTechnician>): Promise<Technician | undefined> {
    const [technician] = await db
      .update(technicians)
      .set({ ...technicianData, updatedAt: new Date() })
      .where(eq(technicians.id, id))
      .returning();
    return technician;
  }

  async getPendingTechnicians(): Promise<TechnicianWithUser[]> {
    const result = await db
      .select({
        technician: technicians,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
      })
      .from(technicians)
      .leftJoin(users, eq(technicians.userId, users.id))
      .where(eq(technicians.isApproved, false))
      .orderBy(desc(technicians.createdAt));
    
    return result.map(row => ({
      ...row.technician,
      userName: [row.userFirstName, row.userLastName].filter(Boolean).join(' ') || null,
      userEmail: row.userEmail,
    })) as TechnicianWithUser[];
  }

  async approveTechnician(id: string): Promise<Technician | undefined> {
    const [technician] = await db
      .update(technicians)
      .set({ isApproved: true, updatedAt: new Date() })
      .where(eq(technicians.id, id))
      .returning();
    return technician;
  }

  async rejectTechnician(id: string): Promise<void> {
    // Get the technician's userId before deletion
    const technician = await db
      .select()
      .from(technicians)
      .where(eq(technicians.id, id))
      .limit(1);
    
    if (technician.length > 0) {
      const userId = technician[0].userId;
      
      // Delete all associated technician documents first (cascade)
      await db.delete(technicianDocuments).where(eq(technicianDocuments.technicianId, id));
      
      // Delete the technician
      await db.delete(technicians).where(eq(technicians.id, id));
      
      // Reset the user's isTechnician flag
      await db.update(users).set({ isTechnician: false }).where(eq(users.id, userId));
    }
  }

  // Technician documents operations
  async addTechnicianDocument(documentData: InsertTechnicianDocument): Promise<TechnicianDocument> {
    const [document] = await db.insert(technicianDocuments).values(documentData).returning();
    return document;
  }

  async getTechnicianDocuments(technicianId: string): Promise<TechnicianDocument[]> {
    return await db
      .select()
      .from(technicianDocuments)
      .where(eq(technicianDocuments.technicianId, technicianId))
      .orderBy(desc(technicianDocuments.uploadedAt));
  }

  async deleteTechnicianDocument(id: string): Promise<void> {
    await db.delete(technicianDocuments).where(eq(technicianDocuments.id, id));
  }

  // Service request operations
  async getUserServiceRequests(userId: string): Promise<ServiceRequest[]> {
    return await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.userId, userId))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async getTechnicianServiceRequests(technicianId: string): Promise<ServiceRequest[]> {
    return await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.technicianId, technicianId))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    return request;
  }

  async createServiceRequest(requestData: InsertServiceRequest): Promise<ServiceRequest> {
    const [request] = await db.insert(serviceRequests).values(requestData).returning();
    return request;
  }

  async updateServiceRequest(id: string, requestData: Partial<InsertServiceRequest>): Promise<ServiceRequest | undefined> {
    const [request] = await db
      .update(serviceRequests)
      .set({ ...requestData, updatedAt: new Date() })
      .where(eq(serviceRequests.id, id))
      .returning();
    return request;
  }

  // Maintenance record operations
  async getBikeMaintenanceRecords(bikeId: string): Promise<MaintenanceRecord[]> {
    return await db
      .select()
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.bikeId, bikeId))
      .orderBy(desc(maintenanceRecords.createdAt));
  }

  async createMaintenanceRecord(recordData: InsertMaintenanceRecord): Promise<MaintenanceRecord> {
    const [record] = await db.insert(maintenanceRecords).values(recordData).returning();
    return record;
  }

  // Parts operations
  async getAllParts(): Promise<Part[]> {
    return await db.select().from(parts).orderBy(parts.category);
  }

  async getPartsByCategory(category: string): Promise<Part[]> {
    return await db.select().from(parts).where(eq(parts.category, category));
  }

  async getPart(id: string): Promise<Part | undefined> {
    const [part] = await db.select().from(parts).where(eq(parts.id, id));
    return part;
  }

  async createPart(partData: InsertPart): Promise<Part> {
    const [part] = await db.insert(parts).values(partData).returning();
    return part;
  }

  async updatePart(id: string, partData: Partial<InsertPart>): Promise<Part | undefined> {
    const [part] = await db
      .update(parts)
      .set({ ...partData, updatedAt: new Date() })
      .where(eq(parts.id, id))
      .returning();
    return part;
  }

  async deletePart(id: string): Promise<void> {
    await db.delete(parts).where(eq(parts.id, id));
  }

  // Roles operations
  async getAllRoles(): Promise<Role[]> {
    return await db.select().from(roles).orderBy(roles.name);
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async createRole(roleData: InsertRole): Promise<Role> {
    const [role] = await db.insert(roles).values(roleData).returning();
    return role;
  }

  // User-Roles operations
  async getAllUserRoles(): Promise<UserRole[]> {
    return await db.select().from(userRoles).orderBy(desc(userRoles.assignedAt));
  }

  async getUserRoles(userId: string): Promise<UserRole[]> {
    return await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  }

  async assignUserRole(userId: string, roleId: string, assignedBy: string): Promise<UserRole> {
    // Check if this user-role combination already exists
    const existing = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
    
    if (existing.length > 0) {
      throw new Error("User already has this role assigned");
    }
    
    const [userRole] = await db
      .insert(userRoles)
      .values({ userId, roleId, assignedBy })
      .returning();
    return userRole;
  }

  async removeUserRole(id: string): Promise<void> {
    await db.delete(userRoles).where(eq(userRoles.id, id));
  }

  // Invoice operations
  async getAllInvoices(): Promise<Invoice[]> {
    return await db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getUserInvoices(userId: string): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(invoiceData: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(invoiceData as any).returning();
    return invoice;
  }

  async updateInvoice(id: string, invoiceData: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [invoice] = await db
      .update(invoices)
      .set({ ...invoiceData, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async deleteInvoice(id: string): Promise<void> {
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  // Discount code operations
  async getAllDiscountCodes(): Promise<DiscountCode[]> {
    return await db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));
  }

  async getDiscountCode(code: string): Promise<DiscountCode | undefined> {
    const [discount] = await db.select().from(discountCodes).where(eq(discountCodes.code, code));
    return discount;
  }

  async createDiscountCode(discountData: InsertDiscountCode): Promise<DiscountCode> {
    const [discount] = await db.insert(discountCodes).values(discountData).returning();
    return discount;
  }

  async updateDiscountCode(id: string, discountData: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined> {
    const [discount] = await db
      .update(discountCodes)
      .set({ ...discountData, updatedAt: new Date() })
      .where(eq(discountCodes.id, id))
      .returning();
    return discount;
  }

  async deleteDiscountCode(id: string): Promise<void> {
    await db.delete(discountCodes).where(eq(discountCodes.id, id));
  }

  // Public technician registration
  async createPublicTechnicianApplication(data: {
    email: string;
    name: string;
    phoneNumber: string;
    experienceYears: number;
    location?: string;
    nationalId?: string;
    iban?: string;
    commercialRegister?: string;
  }): Promise<Technician> {
    // Check if user exists by email
    let user = await this.getUserByEmail(data.email);
    
    // If user doesn't exist, create one
    if (!user) {
      user = await this.createUser({
        email: data.email,
        firstName: data.name,
      });
    }

    // Check if technician already exists for this user
    const existingTechnician = await this.getTechnician(user.id);
    if (existingTechnician) {
      throw new Error("A technician application already exists for this email. Please wait for admin review.");
    }

    // Create technician with isApproved = false (default)
    const technician = await this.createTechnician({
      userId: user.id,
      phoneNumber: data.phoneNumber,
      yearsOfExperience: data.experienceYears,
      location: data.location,
      nationalId: data.nationalId,
      iban: data.iban,
      commercialRegister: data.commercialRegister,
      isApproved: false,
      isAvailable: false,
    });

    return technician;
  }

  // Phone session operations (for OTP auth persistence)
  async createPhoneSession(session: InsertPhoneSession): Promise<PhoneSession> {
    const [phoneSession] = await db.insert(phoneSessions).values(session).returning();
    return phoneSession;
  }

  async getPhoneSession(token: string): Promise<PhoneSession | undefined> {
    const [session] = await db
      .select()
      .from(phoneSessions)
      .where(eq(phoneSessions.token, token));
    
    // Check if session is expired
    if (session && new Date(session.expiresAt) < new Date()) {
      await this.deletePhoneSession(token);
      return undefined;
    }
    
    return session;
  }

  async deletePhoneSession(token: string): Promise<void> {
    await db.delete(phoneSessions).where(eq(phoneSessions.token, token));
  }

  async deleteExpiredPhoneSessions(): Promise<void> {
    const { lt } = await import("drizzle-orm");
    await db.delete(phoneSessions).where(lt(phoneSessions.expiresAt, new Date()));
  }

  // Order operations
  async getAllOrders(): Promise<Order[]> {
    return await db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async createOrder(orderData: InsertOrder): Promise<Order> {
    const [order] = await db.insert(orders).values(orderData).returning();
    return order;
  }

  async updateOrder(id: string, orderData: Partial<InsertOrder>): Promise<Order | undefined> {
    const [order] = await db.update(orders).set({ ...orderData, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
    return order;
  }

  async deleteOrder(id: string): Promise<void> {
    await db.delete(orders).where(eq(orders.id, id));
  }
}

export const storage = new DatabaseStorage();

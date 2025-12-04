import { db } from "./db";
import { roles, roleEnum } from "@shared/schema";

async function seedRoles() {
  console.log("Seeding default roles...");
  
  const defaultRoles = [
    {
      name: "owner" as const,
      description: "صاحب التطبيق - كامل الصلاحيات / Application Owner - Full Access",
      permissions: [
        "manage_users",
        "manage_roles",
        "manage_technicians",
        "manage_services",
        "manage_parts",
        "manage_payments",
        "view_analytics",
        "manage_promo_codes",
        "manage_banners",
      ],
    },
    {
      name: "admin" as const,
      description: "مدير - صلاحيات إدارية / Admin - Administrative Permissions",
      permissions: [
        "manage_users",
        "manage_technicians",
        "manage_services",
        "manage_parts",
        "view_analytics",
        "manage_promo_codes",
        "manage_banners",
      ],
    },
    {
      name: "support" as const,
      description: "الدعم الفني - مساعدة المستخدمين / Support - User Assistance",
      permissions: [
        "view_users",
        "view_services",
        "manage_service_status",
        "view_technicians",
      ],
    },
    {
      name: "technician" as const,
      description: "فني - إدارة الطلبات والخدمات / Technician - Manage Requests and Services",
      permissions: [
        "view_assigned_services",
        "update_service_status",
        "view_profile",
        "update_profile",
      ],
    },
    {
      name: "user" as const,
      description: "مستخدم عادي / Regular User",
      permissions: [
        "create_service_request",
        "view_own_services",
        "manage_own_bikes",
        "view_parts",
      ],
    },
  ];

  for (const roleData of defaultRoles) {
    try {
      await db
        .insert(roles)
        .values(roleData)
        .onConflictDoNothing();
      console.log(`✓ Created/verified role: ${roleData.name}`);
    } catch (error) {
      console.error(`✗ Error creating role ${roleData.name}:`, error);
    }
  }

  console.log("✓ Roles seeding completed");
}

seedRoles()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error seeding roles:", error);
    process.exit(1);
  });

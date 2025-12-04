import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("[Supabase] Missing SUPABASE_URL");
}

if (!supabaseServiceKey) {
  console.error("[Supabase] Missing SUPABASE_SERVICE_ROLE_KEY");
}

// SERVER-ONLY: Use service role key for storage operations (bypasses RLS)
// This key is NEVER exposed to the client - only used in server/routes.ts
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Public client for read-only operations (safe for any context)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUCKET_NAME = "technician-docs";

async function ensureBucketExists() {
  if (!supabaseAdmin) {
    console.warn("[Supabase] No admin client - cannot create bucket");
    return;
  }

  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    
    if (listError) {
      console.error("[Supabase] Failed to list buckets:", listError.message);
      return;
    }

    console.log("[Supabase] Existing buckets:", buckets?.map(b => b.name).join(", ") || "none");

    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

    if (!bucketExists) {
      console.log(`[Supabase] Creating bucket: ${BUCKET_NAME}`);
      const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"],
      });

      if (createError) {
        console.error("[Supabase] Failed to create bucket:", createError.message);
      } else {
        console.log(`[Supabase] Bucket '${BUCKET_NAME}' created successfully`);
      }
    } else {
      console.log(`[Supabase] Bucket '${BUCKET_NAME}' already exists`);
    }
  } catch (err) {
    console.error("[Supabase] Error ensuring bucket:", err);
  }
}

if (supabaseAdmin) {
  console.log("[Supabase] Server initialized with service-role key for uploads");
  ensureBucketExists();
} else {
  console.warn("[Supabase] No service-role key - uploads will use anon key (may fail on private buckets)");
}

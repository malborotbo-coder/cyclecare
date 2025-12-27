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

/**
 * 🔴 IMPORTANT
 * Disable Realtime (WebSocket) completely on the server
 * Render cannot reach Supabase Realtime over IPv6
 */
const supabaseOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    enabled: false,
  },
};

// SERVER-ONLY: service role (bypasses RLS)
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, supabaseOptions)
  : null;

// Public client (no realtime)
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  supabaseOptions
);

export const BUCKET_NAME = "technician-docs";

export async function uploadBufferToStorage(params: {
  file: Express.Multer.File;
  path: string; // path inside the bucket
}) {
  const { file, path } = params;
  const client = supabaseAdmin;

  if (!client) {
    const err = new Error("[Supabase] Service role key missing - uploads are not permitted");
    console.error(err.message);
    throw err;
  }

  console.log("[Supabase] Upload start", {
    path,
    size: file.size,
    contentType: file.mimetype,
  });

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    console.error("[Supabase] Upload error", {
      path,
      message: error.message,
      name: error.name,
      statusCode: (error as any)?.statusCode,
    });
    throw error;
  }

  console.log("[Supabase] Upload success", { path, returnedPath: data?.path });

  const { data: urlData } = client.storage.from(BUCKET_NAME).getPublicUrl(path);
  return urlData.publicUrl;
}

async function ensureBucketExists() {
  if (!supabaseAdmin) {
    console.warn("[Supabase] No admin client - cannot create bucket");
    return;
  }

  try {
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();

    if (error) {
      console.error("[Supabase] Failed to list buckets:", error.message);
      return;
    }

    const exists = buckets?.some(b => b.name === BUCKET_NAME);

    if (!exists) {
      const { error: createError } =
        await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024,
          allowedMimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "application/pdf",
          ],
        });

      if (createError) {
        console.error("[Supabase] Create bucket failed:", createError.message);
      } else {
        console.log(`[Supabase] Bucket '${BUCKET_NAME}' created`);
      }
    } else {
      console.log(`[Supabase] Bucket '${BUCKET_NAME}' already exists`);
    }
  } catch (err) {
    console.error("[Supabase] ensureBucketExists error:", err);
  }
}

if (supabaseAdmin) {
  console.log("[Supabase] Server initialized (Realtime disabled)");
  ensureBucketExists();
}

export function getUploadClient() {
  if (!supabaseAdmin) {
    const err = new Error("[Supabase] Service role key missing - uploads are not permitted");
    console.error(err.message);
    throw err;
  }
  return supabaseAdmin;
}

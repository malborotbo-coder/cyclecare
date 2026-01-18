const supabaseUrl = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_BUCKET = "technician-docs";

type StorageBucketOptions = {
  public?: boolean;
};

export async function ensureStorageBucket(bucket: string, options: StorageBucketOptions = {}) {
  if (!supabaseUrl || !serviceRole) {
    throw new Error("STORAGE_CONFIG_MISSING");
  }

  const checkUrl = `${supabaseUrl}/storage/v1/bucket/${bucket}`;
  const checkResp = await fetch(checkUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      Accept: "application/json",
    },
  });
  const checkBody = await checkResp.text();

  console.log("[STORAGE][BUCKET][CHECK]", {
    bucket,
    status: checkResp.status,
    body: checkBody,
  });

  if (checkResp.ok) {
    return { exists: true, created: false };
  }

  const missingBucket =
    checkResp.status === 404 ||
    (checkResp.status === 400 && checkBody.toLowerCase().includes("bucket not found"));

  if (!missingBucket) {
    console.error("[STORAGE][BUCKET][CHECK_FAILED]", {
      bucket,
      status: checkResp.status,
      body: checkBody,
    });
    throw new Error("STORAGE_BUCKET_CHECK_FAILED");
  }

  const createUrl = `${supabaseUrl}/storage/v1/bucket`;
  const payload = {
    name: bucket,
    public: options.public ?? true,
  };

  const createResp = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const createBody = await createResp.text();

  if (!createResp.ok && createResp.status !== 409) {
    console.error("[STORAGE][BUCKET][CREATE_FAILED]", {
      bucket,
      status: createResp.status,
      body: createBody,
    });
    throw new Error("STORAGE_BUCKET_CREATE_FAILED");
  }

  console.log("[STORAGE][BUCKET][CREATE]", {
    bucket,
    status: createResp.status,
    body: createBody,
  });

  return { exists: createResp.status === 409, created: createResp.ok };
}

export async function uploadToStorageRest(params: {
  file: Express.Multer.File;
  path: string;
  bucket?: string;
}) {
  if (!supabaseUrl || !serviceRole) {
    throw new Error("STORAGE_CONFIG_MISSING");
  }
  const { file, path, bucket = DEFAULT_BUCKET } = params;
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  console.log("[STORAGE][UPLOAD][START]", {
    bucket,
    path,
    size: file.size,
    contentType: file.mimetype,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      "Content-Type": file.mimetype || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file.buffer,
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error("[STORAGE][UPLOAD][FAILED]", {
      bucket,
      path,
      status: resp.status,
      body: text,
    });
    throw new Error("STORAGE_UPLOAD_FAILED");
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  console.log("[STORAGE][UPLOAD][OK]", {
    bucket,
    path,
    status: resp.status,
    body: text,
    publicUrl,
  });
  return publicUrl;
}

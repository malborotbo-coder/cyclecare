const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_BUCKET = "technician-docs";

export async function uploadToStorageRest(params: {
  file: Express.Multer.File;
  path: string;
  bucket?: string;
}) {
  const { file, path, bucket = DEFAULT_BUCKET } = params;
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

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
    console.log("[STORAGE][UPLOAD][FAILED]", { status: resp.status, body: text });
    throw new Error("STORAGE_UPLOAD_FAILED");
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  console.log("[STORAGE][UPLOAD][OK]", { status: resp.status, path: publicUrl });
  return publicUrl;
}

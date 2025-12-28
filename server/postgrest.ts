const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function pgFetch(path: string, options: { method?: string; body?: any; headers?: Record<string,string> } = {}) {
  const url = `${supabaseUrl}/rest/v1${path}`;
  const headers: Record<string, string> = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    Accept: "application/json",
  };
  if (options.headers) {
    Object.assign(headers, options.headers);
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const method = options.method || "GET";
  console.log("[SUPABASE][REST][REQ]", { method, url, hasBody: !!options.body });

  const resp = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  console.log("[SUPABASE][REST][RES]", { method, url, status: resp.status, bodyPreview: text.slice(0, 200) });

  return { resp, data: json };
}

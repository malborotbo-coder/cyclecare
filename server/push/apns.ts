import apn from "apn";

type ApnsEnv = "development" | "production";

type SendApnsInput = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, any>;
};

type LiveActivityEvent = "update" | "end";

type LiveActivityContentState = {
  status: string;
  title: string;
  subtitle: string;
  progress: number;
  stageIndex: number;
  totalStages: number;
  timestamp: number;
  technicianName?: string | null;
  etaMinutes?: number | null;
  locale?: string;
};

type SendApnsLiveActivityInput = {
  token: string;
  event: LiveActivityEvent;
  contentState: LiveActivityContentState;
  timestamp?: number;
};

type SendApnsResult = {
  ok: boolean;
  status?: number;
  reason?: string;
  details?: any;
  env: ApnsEnv;
};

const resolveApnsEnv = (): ApnsEnv => {
  const raw = (process.env.APNS_ENV || "").toLowerCase();
  if (raw === "development" || raw === "production") return raw;
  if (raw === "sandbox") return "development";
  return process.env.NODE_ENV === "production" ? "production" : "development";
};

const normalizeApnsKey = () => {
  const raw = process.env.APNS_KEY_P8 || process.env.APNS_AUTH_KEY || "";
  if (!raw) return null;
  let key = raw.trim();
  if (!key.includes("BEGIN PRIVATE KEY")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("BEGIN PRIVATE KEY")) {
        key = decoded.trim();
      }
    } catch {
      // Keep raw key if base64 decode fails.
    }
  }
  if (!key.includes("BEGIN PRIVATE KEY")) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }
  return key;
};

let apnsProvider: { provider: apn.Provider; env: ApnsEnv; keyId: string; teamId: string } | null = null;

const getApnsProvider = (env: ApnsEnv) => {
  const keyId = process.env.APNS_KEY_ID || "";
  const teamId = process.env.APNS_TEAM_ID || "";
  const key = normalizeApnsKey();
  if (!keyId || !teamId || !key) return null;
  if (apnsProvider && apnsProvider.env === env && apnsProvider.keyId === keyId && apnsProvider.teamId === teamId) {
    return apnsProvider.provider;
  }
  if (apnsProvider) {
    apnsProvider.provider.shutdown();
  }
  const provider = new apn.Provider({
    token: {
      key,
      keyId,
      teamId,
    },
    production: env === "production",
  });
  apnsProvider = { provider, env, keyId, teamId };
  return provider;
};

export const sendApns = async (input: SendApnsInput): Promise<SendApnsResult> => {
  const env = resolveApnsEnv();
  const topic = process.env.APNS_BUNDLE_ID || "";
  const provider = getApnsProvider(env);

  if (!provider || !topic) {
    console.log("[APNS][SEND][FAILED]", {
      status: 500,
      reason: "apns_config_missing",
      token: input.token,
      env,
    });
    return { ok: false, status: 500, reason: "apns_config_missing", env };
  }

  const notification = new apn.Notification();
  notification.topic = topic;
  notification.pushType = "alert";
  notification.sound = "default";
  notification.expiry = Math.floor(Date.now() / 1000) + 3600;
  notification.alert = { title: input.title, body: input.body };
  notification.payload = {
    ...(input.data || {}),
    title: input.title,
    body: input.body,
    message: input.body,
  };

  const response = await provider.send(notification, input.token);
  if (response.failed && response.failed.length > 0) {
    const failure = response.failed[0];
    const status = typeof failure.status === "number"
      ? failure.status
      : typeof failure.response?.status === "number"
      ? failure.response.status
      : 500;
    const reason = failure.response?.reason || failure.error?.message || "apns_failed";
    console.log("[APNS][SEND][FAILED]", {
      status,
      reason,
      token: input.token,
      env,
      failed: response.failed,
    });
    return {
      ok: false,
      status,
      reason,
      env,
      details: {
        failed: response.failed,
        sent: response.sent,
      },
    };
  }

  console.log("[APNS][SEND][SUCCESS]", {
    status: 200,
    reason: null,
    token: input.token,
    env,
  });
  return {
    ok: true,
    status: 200,
    env,
    details: {
      sent: response.sent,
      failed: response.failed,
    },
  };
};

export const sendApnsLiveActivity = async (
  input: SendApnsLiveActivityInput,
): Promise<SendApnsResult> => {
  const env = resolveApnsEnv();
  const bundleId = process.env.APNS_BUNDLE_ID || "";
  const provider = getApnsProvider(env);

  if (!provider || !bundleId) {
    console.log("[APNS][LIVE_ACTIVITY][FAILED]", {
      status: 500,
      reason: "apns_config_missing",
      token: input.token,
      env,
    });
    return { ok: false, status: 500, reason: "apns_config_missing", env };
  }

  const notification = new apn.Notification();
  notification.topic = `${bundleId}.push-type.liveactivity`;
  notification.pushType = "liveactivity";
  notification.priority = 10;
  notification.expiry = Math.floor(Date.now() / 1000) + 3600;
  notification.payload = {
    aps: {
      timestamp: input.timestamp ?? Math.floor(Date.now() / 1000),
      event: input.event,
      "content-state": {
        ...input.contentState,
      },
    },
  };

  const response = await provider.send(notification, input.token);
  if (response.failed && response.failed.length > 0) {
    const failure = response.failed[0];
    const status = typeof failure.status === "number"
      ? failure.status
      : typeof failure.response?.status === "number"
      ? failure.response.status
      : 500;
    const reason = failure.response?.reason || failure.error?.message || "apns_failed";
    console.log("[APNS][LIVE_ACTIVITY][FAILED]", {
      status,
      reason,
      token: input.token,
      env,
      failed: response.failed,
    });
    return {
      ok: false,
      status,
      reason,
      env,
      details: {
        failed: response.failed,
        sent: response.sent,
      },
    };
  }

  console.log("[APNS][LIVE_ACTIVITY][SUCCESS]", {
    status: 200,
    reason: null,
    token: input.token,
    env,
  });
  return {
    ok: true,
    status: 200,
    env,
    details: {
      sent: response.sent,
      failed: response.failed,
    },
  };
};

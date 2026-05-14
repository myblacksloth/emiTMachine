import type { DashboardData, Tag } from "./types";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const jsonHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json"
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null
  ) {
    super(requestId ? `${message} (request id: ${requestId})` : message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.body instanceof FormData ? undefined : jsonHeaders);
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers
  });

  if (!response.ok) {
    let message = "The request could not be completed.";
    const requestId = response.headers.get("x-request-id");
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      message = payload.message ?? payload.error ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status, requestId);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function requestOptional<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    return await request<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

type BackendUser = {
  id: string;
  username: string;
  displayName: string;
  totpEnabled: boolean;
  passkeyCount?: number;
};

type BackendTag = Tag & { is_default?: boolean };

type BackendBucket = {
  bucket_type: "day" | "week" | "month";
  bucket_start: string;
  total_seconds: string | number;
};

type BackendSummary = {
  sessions: number;
  total_seconds: string | number;
  average_session_seconds: string | number;
  days_worked: number;
};

function secondsToMinutes(value: string | number) {
  return Math.round(Number(value) / 60);
}

function bucketLabel(value: string, bucketType: BackendBucket["bucket_type"]) {
  const date = new Date(value);
  if (bucketType === "day") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (bucketType === "week") {
    return `Week of ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function mapBuckets(buckets: BackendBucket[], type: BackendBucket["bucket_type"]) {
  return buckets
    .filter((bucket) => bucket.bucket_type === type)
    .map((bucket) => {
      const totalMinutes = secondsToMinutes(bucket.total_seconds);
      return {
        label: bucketLabel(bucket.bucket_start, type),
        totalMinutes,
        segments: [{ tagId: "all", tagName: "All tags", color: "#27b3a8", minutes: totalMinutes }]
      };
    });
}

async function fetchDashboard() {
  const [me, status, tagsPayload, reports] = await Promise.all([
    request<{ user: BackendUser }>("/api/auth/me"),
    request<{ activeSession: { id: string; started_at: string; tags: BackendTag[]; note?: string } | null }>("/api/punch/status"),
    request<{ tags: BackendTag[] }>("/api/tags"),
    request<{ summary: BackendSummary; buckets: BackendBucket[]; byTag: Array<BackendTag & { total_seconds: string | number }> }>("/api/reports/summary")
  ]);

  const presence = reports.byTag.find((tag) => tag.name.toLowerCase() === "presence");
  const smartWorking = reports.byTag.find((tag) => tag.name.toLowerCase() === "smart working");
  const totalMinutes = secondsToMinutes(reports.summary.total_seconds);
  const workedDays = Number(reports.summary.days_worked ?? 0);

  return {
    user: {
      name: me.user.displayName,
      username: me.user.username,
      totpEnabled: me.user.totpEnabled,
      passkeyCount: me.user.passkeyCount ?? 0
    },
    activeSession: status.activeSession
      ? {
          id: status.activeSession.id,
          startedAt: status.activeSession.started_at,
          tagIds: status.activeSession.tags.map((tag) => tag.id),
          note: status.activeSession.note
        }
      : null,
    tags: tagsPayload.tags,
    charts: {
      daily: mapBuckets(reports.buckets, "day"),
      weekly: mapBuckets(reports.buckets, "week"),
      monthly: mapBuckets(reports.buckets, "month")
    },
    summary: {
      totalMinutes,
      averageDailyMinutes: workedDays > 0 ? Math.round(totalMinutes / workedDays) : 0,
      workedDays,
      presenceMinutes: presence ? secondsToMinutes(presence.total_seconds) : 0,
      smartWorkingMinutes: smartWorking ? secondsToMinutes(smartWorking.total_seconds) : 0
    },
    countdowns: []
  } satisfies DashboardData;
}

export const api = {
  currentUser: () => requestOptional<{ user: BackendUser }>("/api/auth/me"),
  login: (username: string, password: string, totpCode?: string, recoveryCode?: string) =>
    request<{ requiresTotp?: boolean; user?: BackendUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, totpCode: totpCode || undefined, recoveryCode: recoveryCode || undefined })
    }),
  register: (name: string, username: string, password: string) =>
    request<{ user: BackendUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ displayName: name, username, password })
    }),
  passkeyLogin: async (username: string) => {
    const options = await request<{ publicKey: { challenge: string } }>("/api/auth/passkeys/login/options", {
      method: "POST",
      body: JSON.stringify({ username })
    });
    const credentialId = window.prompt("Enter your registered passkey credential id");
    if (!credentialId) throw new Error("Passkey login cancelled.");
    return request<{ ok: true }>("/api/auth/passkeys/login/verify", {
      method: "POST",
      body: JSON.stringify({ username, credentialId, challenge: options.publicKey.challenge })
    });
  },
  recoverAccount: (username: string, recoveryCode: string, totpCode: string, newPassword: string) =>
    request<void>("/api/auth/recover-password", {
      method: "POST",
      body: JSON.stringify({ username, recoveryCode, totpCode: totpCode || undefined, newPassword })
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  dashboard: fetchDashboard,
  clockIn: (occurredAt: string, tagIds: string[], note: string) =>
    request<{ session: unknown }>("/api/punch/in", {
      method: "POST",
      body: JSON.stringify({ occurredAt, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, tagIds, note: note || undefined })
    }).then(() => fetchDashboard()),
  clockOut: (occurredAt: string, tagIds: string[], note: string) =>
    request<{ session: unknown }>("/api/punch/out", {
      method: "POST",
      body: JSON.stringify({ occurredAt, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, note: note || undefined })
    }).then(() => fetchDashboard()),
  createTag: (name: string, color: string) =>
    request<Tag>("/api/tags", {
      method: "POST",
      body: JSON.stringify({ name, color })
    }),
  updateTag: (id: string, name: string, color: string) =>
    request<Tag>(`/api/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, color })
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/api/profile/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword })
    }),
  setupTotp: async () => {
    const result = await request<{ qrCodeDataUrl: string; secret: string }>("/api/auth/totp/setup", { method: "POST" });
    return { qrCodeUrl: result.qrCodeDataUrl, secretLabel: result.secret };
  },
  confirmTotp: (code: string) =>
    request<void>("/api/auth/totp/verify", {
      method: "POST",
      body: JSON.stringify({ code })
    }),
  registerPasskey: async (label: string) => {
    const options = await request<{ publicKey: { challenge: string } }>("/api/auth/passkeys/register/options", {
      method: "POST",
      body: JSON.stringify({ label })
    });
    const credentialId = window.prompt("Save this development credential id for future passkey login", options.publicKey.challenge);
    if (!credentialId) throw new Error("Passkey registration cancelled.");
    return request<void>("/api/auth/passkeys/register/verify", {
      method: "POST",
      body: JSON.stringify({ label, credentialId, publicKey: credentialId, challenge: options.publicKey.challenge })
    });
  },
  generateRecoveryCodes: () =>
    request<{ codes: string[] }>("/api/auth/recovery/codes", { method: "POST" }),
  exportCsvUrl: `${apiBaseUrl}/api/csv/export`,
  importCsv: async (file: File) => {
    const csv = await file.text();
    const preview = await request<{ validRows: number; invalidRows: number }>("/api/csv/import/preview", {
      method: "POST",
      body: JSON.stringify({ csv })
    });
    if (preview.invalidRows > 0) {
      return { importedRows: 0, invalidRows: preview.invalidRows };
    }
    const imported = await request<{ importedEvents: number }>("/api/csv/import", {
      method: "POST",
      body: JSON.stringify({ csv })
    });
    return { importedRows: imported.importedEvents, invalidRows: 0 };
  }
};

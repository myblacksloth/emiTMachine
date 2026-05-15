import type { ActivitySession, Countdown, DashboardData, Tag } from "./types";

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
  recoveryCodeCount?: number;
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

type BackendSession = {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_timezone: string;
  end_timezone: string | null;
  note: string | null;
  duration_seconds: string | number | null;
  tags: BackendTag[];
};

type BackendCountdown = {
  id: string;
  title: string;
  targetAt: string;
  targetTimezone: string;
  linkedToCurrentSession: boolean;
  status: Countdown["status"];
};

type PublicKeyCredentialDescriptorJSON = Omit<PublicKeyCredentialDescriptor, "id"> & {
  id: string;
};

type PublicKeyCredentialRequestOptionsJSON = Omit<PublicKeyCredentialRequestOptions, "allowCredentials" | "challenge"> & {
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  challenge: string;
};

type PublicKeyCredentialCreationOptionsJSON = Omit<PublicKeyCredentialCreationOptions, "challenge" | "excludeCredentials" | "user"> & {
  challenge: string;
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
};

type RegistrationResponseJSON = {
  id: string;
  rawId: string;
  response: {
    attestationObject: string;
    clientDataJSON: string;
    transports?: string[];
    publicKey?: string;
    publicKeyAlgorithm?: number;
  };
  type: PublicKeyCredential["type"];
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  authenticatorAttachment?: AuthenticatorAttachment | null;
};

type AuthenticationResponseJSON = {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle: string | null;
  };
  type: PublicKeyCredential["type"];
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  authenticatorAttachment?: AuthenticatorAttachment | null;
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

function mapSession(session: BackendSession): ActivitySession {
  return {
    id: session.id,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    startTimezone: session.start_timezone,
    endTimezone: session.end_timezone,
    note: session.note ?? "",
    durationMinutes: session.duration_seconds === null ? null : secondsToMinutes(session.duration_seconds),
    tagIds: session.tags.map((tag) => tag.id),
    tags: session.tags
  };
}

function mapCountdown(countdown: BackendCountdown): Countdown {
  return {
    id: countdown.id,
    title: countdown.title,
    targetAt: countdown.targetAt,
    targetTimezone: countdown.targetTimezone,
    linkedToCurrentSession: countdown.linkedToCurrentSession,
    status: countdown.status
  };
}

function base64urlToArrayBuffer(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function mapCredentialDescriptors(credentials?: PublicKeyCredentialDescriptorJSON[]) {
  return credentials?.map((credential) => ({
    ...credential,
    id: base64urlToArrayBuffer(credential.id)
  }));
}

function toCredentialCreationOptions(options: PublicKeyCredentialCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToArrayBuffer(options.user.id)
    },
    excludeCredentials: mapCredentialDescriptors(options.excludeCredentials)
  };
}

function toCredentialRequestOptions(options: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    allowCredentials: mapCredentialDescriptors(options.allowCredentials)
  };
}

function passkeyEnvironmentWarning() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!window.isSecureContext) {
    return "Passkeys require HTTPS or localhost. Open this app in a secure context before using a passkey.";
  }
  if (!("PublicKeyCredential" in window) || !navigator.credentials) {
    return "This browser does not support passkeys. Use a current browser with WebAuthn support.";
  }
  return null;
}

function assertPasskeysAvailable() {
  const warning = passkeyEnvironmentWarning();
  if (warning) {
    throw new Error(warning);
  }
}

function webAuthnErrorMessage(error: unknown, action: "login" | "registration") {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : "Passkey operation failed.";
  }

  if (error.name === "NotAllowedError") {
    return "Passkey operation was canceled or timed out.";
  }
  if (error.name === "InvalidStateError" && action === "registration") {
    return "This authenticator is already registered for the account.";
  }
  if (error.name === "SecurityError") {
    return "Passkey operation is blocked for this origin. Use the configured HTTPS or localhost address.";
  }
  if (error.name === "NotSupportedError") {
    return "This authenticator or browser does not support the requested passkey options.";
  }
  if (error.name === "AbortError") {
    return "Passkey operation was interrupted. Try again.";
  }
  return error.message || "Passkey operation failed.";
}

async function createPasskey(options: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON> {
  assertPasskeysAvailable();
  try {
    const credential = await navigator.credentials.create({
      publicKey: toCredentialCreationOptions(options)
    });
    if (!(credential instanceof PublicKeyCredential)) {
      throw new Error("The browser did not return a passkey credential.");
    }
    const response = credential.response as AuthenticatorAttestationResponse & {
      getPublicKey?: () => ArrayBuffer | null;
      getPublicKeyAlgorithm?: () => number;
      getTransports?: () => string[];
    };
    const publicKey = response.getPublicKey?.();

    return {
      id: credential.id,
      rawId: arrayBufferToBase64url(credential.rawId),
      response: {
        attestationObject: arrayBufferToBase64url(response.attestationObject),
        clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
        transports: response.getTransports?.(),
        publicKey: publicKey ? arrayBufferToBase64url(publicKey) : undefined,
        publicKeyAlgorithm: response.getPublicKeyAlgorithm?.()
      },
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment
    };
  } catch (error) {
    throw new Error(webAuthnErrorMessage(error, "registration"));
  }
}

async function getPasskey(options: PublicKeyCredentialRequestOptionsJSON): Promise<AuthenticationResponseJSON> {
  assertPasskeysAvailable();
  try {
    const credential = await navigator.credentials.get({
      publicKey: toCredentialRequestOptions(options)
    });
    if (!(credential instanceof PublicKeyCredential)) {
      throw new Error("The browser did not return a passkey credential.");
    }
    const response = credential.response as AuthenticatorAssertionResponse;

    return {
      id: credential.id,
      rawId: arrayBufferToBase64url(credential.rawId),
      response: {
        authenticatorData: arrayBufferToBase64url(response.authenticatorData),
        clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
        signature: arrayBufferToBase64url(response.signature),
        userHandle: response.userHandle ? arrayBufferToBase64url(response.userHandle) : null
      },
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment
    };
  } catch (error) {
    throw new Error(webAuthnErrorMessage(error, "login"));
  }
}

async function fetchDashboard() {
  const [me, status, tagsPayload, reports, countdownsPayload] = await Promise.all([
    request<{ user: BackendUser }>("/api/auth/me"),
    request<{ activeSession: { id: string; started_at: string; tags: BackendTag[]; note?: string } | null }>("/api/punch/status"),
    request<{ tags: BackendTag[] }>("/api/tags"),
    request<{ summary: BackendSummary; buckets: BackendBucket[]; byTag: Array<BackendTag & { total_seconds: string | number }> }>("/api/reports/summary"),
    request<{ countdowns: BackendCountdown[] }>("/api/countdowns")
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
      passkeyCount: me.user.passkeyCount ?? 0,
      recoveryCodeCount: me.user.recoveryCodeCount ?? 0
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
    countdowns: countdownsPayload.countdowns.map(mapCountdown)
  } satisfies DashboardData;
}

export const api = {
  passkeyEnvironmentWarning,
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
    const options = await request<PublicKeyCredentialRequestOptionsJSON>(
      "/api/auth/passkeys/login/options",
      { method: "POST", body: JSON.stringify({ username }) }
    );
    const response = await getPasskey(options);
    return request<{ ok: true }>("/api/auth/passkeys/login/verify", {
      method: "POST",
      body: JSON.stringify({ username, response })
    });
  },
  recoverAccount: (username: string, recoveryCode: string, totpCode: string, newPassword: string) =>
    request<void>("/api/auth/recover-password", {
      method: "POST",
      body: JSON.stringify({ username, recoveryCode, totpCode: totpCode || undefined, newPassword })
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  dashboard: fetchDashboard,
  activities: () =>
    request<{ sessions: BackendSession[] }>("/api/reports/sessions?limit=100")
      .then((payload) => payload.sessions.map(mapSession)),
  createActivity: (input: {
    startedAt: string;
    endedAt: string | null;
    startTimezone: string;
    endTimezone: string | null;
    note: string;
    tagIds: string[];
    reason: string;
  }) =>
    request<{ session: BackendSession }>("/api/reports/sessions", {
      method: "POST",
      body: JSON.stringify(input)
    }).then((payload) => mapSession(payload.session)),
  updateActivity: (id: string, input: {
    startedAt: string;
    endedAt: string | null;
    startTimezone: string;
    endTimezone: string | null;
    note: string;
    tagIds: string[];
    reason: string;
  }) =>
    request<{ session: BackendSession }>(`/api/reports/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }).then((payload) => mapSession(payload.session)),
  deleteActivity: (id: string) => request<void>(`/api/reports/sessions/${id}`, { method: "DELETE" }),
  createCountdown: (title: string, targetAt: string, linkToCurrentSession: boolean) =>
    request<{ countdown: BackendCountdown }>("/api/countdowns", {
      method: "POST",
      body: JSON.stringify({
        title,
        targetAt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        linkToCurrentSession
      })
    }).then((payload) => mapCountdown(payload.countdown)),
  completeCountdown: (id: string) =>
    request<void>(`/api/countdowns/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" })
    }),
  deleteCountdown: (id: string) => request<void>(`/api/countdowns/${id}`, { method: "DELETE" }),
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
    const options = await request<PublicKeyCredentialCreationOptionsJSON>(
      "/api/auth/passkeys/register/options",
      { method: "POST", body: JSON.stringify({ label }) }
    );
    const response = await createPasskey(options);
    return request<void>("/api/auth/passkeys/register/verify", {
      method: "POST",
      body: JSON.stringify({ label, response })
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

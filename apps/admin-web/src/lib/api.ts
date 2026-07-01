import type {
  Account,
  AccountStatus,
  AdminUser,
  ChatMessage,
  ChatSummary,
  EventLogDetail,
  EventLogItem,
  ParametersResponse,
  SecurityInfo,
  SettingItem,
} from "@lynchpin-whatsapp-gateway/shared-types";

export interface HealthResponse {
  status: string;
}
export interface ReadyResponse {
  status: string;
  checks: Record<string, string>;
}

export interface EventsPage {
  events: EventLogItem[];
  total: number;
  limit: number;
  offset: number;
  event_types: string[];
}

export interface EventsQuery {
  limit?: number;
  offset?: number;
  event_type?: string;
  status?: string;
}

export interface ReadingDay {
  start: number;
  end: number;
  reversed: boolean;
}
export interface ReadingSchedule {
  timezone: string;
  days: {
    mon: ReadingDay;
    tue: ReadingDay;
    wed: ReadingDay;
    thu: ReadingDay;
    fri: ReadingDay;
    sat: ReadingDay;
    sun: ReadingDay;
  };
}

/** On an expired/absent session, bounce to the login screen (except auth calls). */
function onUnauthorized(path: string): void {
  if (path.startsWith("/api/auth/")) return;
  if (typeof window !== "undefined" && window.location.pathname !== "/") {
    window.location.assign("/");
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (res.status === 401) onUnauthorized(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // Only declare a JSON content-type when a body is actually sent; Fastify
  // rejects an empty body that claims application/json (400).
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) onUnauthorized(path);
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `${path} -> ${res.status}`);
  }
  return json;
}

function eventsQueryString(q: EventsQuery): string {
  const p = new URLSearchParams();
  if (q.limit != null) p.set("limit", String(q.limit));
  if (q.offset != null) p.set("offset", String(q.offset));
  if (q.event_type) p.set("event_type", q.event_type);
  if (q.status) p.set("status", q.status);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => getJson<HealthResponse>("/health"),
  ready: () => getJson<ReadyResponse>("/ready"),

  listAccounts: () =>
    getJson<{ accounts: Account[] }>("/api/accounts").then((r) => r.accounts),
  accountStatus: (id: string) =>
    getJson<{ account: AccountStatus }>(`/api/accounts/${id}/status`).then(
      (r) => r.account,
    ),
  createAccount: (input: { external_account_id: string; name: string }) =>
    send<{ account: Account }>("/api/accounts", "POST", input).then(
      (r) => r.account,
    ),
  connectQr: (id: string) =>
    send<{ account: AccountStatus }>(`/api/accounts/${id}/connect/qr`, "POST"),
  connectCode: (id: string, phone_number: string) =>
    send<{ account: AccountStatus; pairing_code: string | null }>(
      `/api/accounts/${id}/connect/code`,
      "POST",
      { phone_number },
    ),
  disconnect: (id: string, logout: boolean) =>
    send(`/api/accounts/${id}/disconnect`, "POST", { logout }),
  reconnect: (id: string) => send(`/api/accounts/${id}/reconnect`, "POST"),
  deleteAccount: (id: string) => send(`/api/accounts/${id}`, "DELETE"),

  listChats: (id: string) =>
    getJson<{ chats: ChatSummary[] }>(`/api/accounts/${id}/chats`).then(
      (r) => r.chats,
    ),
  listMessages: (id: string, chatId: string) =>
    getJson<{ messages: ChatMessage[] }>(
      `/api/accounts/${id}/chats/${encodeURIComponent(chatId)}/messages`,
    ).then((r) => r.messages),
  /** URL of a message's media attachment (image/video/audio/document). */
  mediaUrl: (id: string, messageId: string) =>
    `/api/accounts/${id}/media/${messageId}`,
  sendChatMessage: (id: string, chatId: string, text: string) =>
    send("/api/messages/send", "POST", {
      request_id: crypto.randomUUID(),
      gateway_account_id: id,
      chat_id: chatId,
      type: "text",
      text,
    }),

  listEvents: (q: EventsQuery = {}) =>
    getJson<EventsPage>(`/api/events${eventsQueryString(q)}`),
  getEvent: (id: string) =>
    getJson<{ event: EventLogDetail }>(`/api/events/${id}`).then((r) => r.event),
  redeliverEvent: (id: string) =>
    send<{ success: boolean }>(`/api/events/${id}/redeliver`, "POST"),

  parameters: () => getJson<ParametersResponse>("/api/parameters"),
  updateParameter: (key: string, value: string | number | boolean) =>
    send<{ settings: SettingItem[] }>("/api/parameters", "PUT", {
      key,
      value,
    }).then((r) => r.settings),

  // Auth + security
  login: (username: string, password: string) =>
    send<{ user: AdminUser }>("/api/auth/login", "POST", { username, password }),
  logout: () => send("/api/auth/logout", "POST"),
  me: () =>
    getJson<{ user: AdminUser }>("/api/auth/me").then((r) => r.user),
  changePassword: (current_password: string, new_password: string) =>
    send("/api/auth/change-password", "POST", {
      current_password,
      new_password,
    }),
  security: () =>
    getJson<{ security: SecurityInfo }>("/api/security").then((r) => r.security),
  rotateApiKey: () =>
    send<{ api_key: string }>("/api/security/rotate-api-key", "POST").then(
      (r) => r.api_key,
    ),

  getSchedule: (id: string) =>
    getJson<{ schedule: ReadingSchedule }>(
      `/api/accounts/${id}/schedule`,
    ).then((r) => r.schedule),
  saveSchedule: (id: string, schedule: ReadingSchedule) =>
    send<{ schedule: ReadingSchedule }>(
      `/api/accounts/${id}/schedule`,
      "PUT",
      schedule,
    ).then((r) => r.schedule),
};

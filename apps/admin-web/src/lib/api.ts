import type {
  Account,
  AccountStatus,
  EventLogItem,
} from "@lynchpin-whatsapp-gateway/shared-types";

export interface HealthResponse {
  status: string;
}
export interface ReadyResponse {
  status: string;
  checks: Record<string, string>;
}
export type Parameters = Record<string, string | number | boolean | null>;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
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
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `${path} -> ${res.status}`);
  }
  return json;
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

  listEvents: () =>
    getJson<{ events: EventLogItem[] }>("/api/events").then((r) => r.events),
  parameters: () =>
    getJson<{ parameters: Parameters }>("/api/parameters").then(
      (r) => r.parameters,
    ),
};

export type SigmaCustomer = {
  id: string | number;
  name?: string;
  username?: string;
  password?: string;
  phone?: string;
  email?: string;
  status?: string | number | boolean;
  dueDate?: string;
  screens?: number;
  notes?: string;
  packageName?: string;
  serverName?: string;
  dns?: string;
  m3uUrl?: string;
};

export type CreateSigmaCustomerInput = {
  name: string;
  username: string;
  password?: string;
  phone?: string;
  email?: string;
  screens?: number;
  dueDate?: string;
  packageId?: string | number;
  notes?: string;
};

export type SigmaConfig = {
  url: string;
  token?: string | null;
  username?: string;
  password?: string;
};

type SigmaResponse = { status: number; payload: unknown };
type SigmaRecord = Record<string, unknown>;

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function asRecord(value: unknown): SigmaRecord {
  return value && typeof value === "object" ? (value as SigmaRecord) : {};
}

function getString(record: SigmaRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return undefined;
}

function describeHttpError(status: number, endpoint?: string) {
  const route = endpoint ? ` na rota ${endpoint}` : "";
  if (status === 401 || status === 403) {
    return new Error(`O painel Sigma recusou a autenticação${route} (${status}). Verifique se o token tem permissão de revendedor.`);
  }
  if (status === 404) return new Error(`O painel Sigma não encontrou a rota${route} (404).`);
  return new Error(`O painel Sigma respondeu com erro ${status}${route}.`);
}

function getHeaders(config: SigmaConfig, token?: string): Headers {
  const headers = new Headers({ Accept: "application/json, text/plain, */*", "Content-Type": "application/json" });
  const effectiveToken = token?.trim() || config.token?.trim();
  if (effectiveToken) {
    const rawToken = effectiveToken.replace(/^Bearer\s+/i, "");
    headers.set("Authorization", `Bearer ${rawToken}`);
    headers.set("X-API-Key", rawToken);
  }
  return headers;
}

async function request(config: SigmaConfig, endpoint: string, init: RequestInit = {}, token?: string): Promise<SigmaResponse> {
  const response = await fetch(`${cleanUrl(config.url)}${endpoint}`, {
    ...init,
    headers: getHeaders(config, token),
  });
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}

function payloadError(status: number, payload: unknown, endpoint?: string) {
  const record = asRecord(payload);
  const message = getString(record, "message", "error", "detail");
  return new Error(message || describeHttpError(status, endpoint).message);
}

function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const source = asRecord(payload);
  for (const key of ["customers", "clients", "users", "data", "results", "items"]) {
    const value = source[key];
    if (Array.isArray(value)) return value;
    const nested = unwrapList(value);
    if (nested.length) return nested;
  }
  return [];
}

function normalizeCustomer(row: unknown): SigmaCustomer {
  const item = asRecord(row);
  const id = item.id ?? item.customer_id ?? item.customerId ?? item.user_id ?? item.username;
  return {
    id: (typeof id === "string" || typeof id === "number") ? id : String(id ?? ""),
    name: getString(item, "name", "customer_name", "full_name", "display_name"),
    username: getString(item, "username", "user", "login"),
    password: getString(item, "password", "pass"),
    phone: getString(item, "phone", "whatsapp", "mobile"),
    email: getString(item, "email"),
    status: item.status as string | number | boolean | undefined,
    dueDate: getString(item, "dueDate", "due_date", "expiration_date", "expires_at"),
    screens: Number(item.screens ?? item.connections ?? item.connections_count ?? 1),
    notes: getString(item, "notes"),
    packageName: getString(item, "packageName", "package_name") || getString(asRecord(item.package), "name"),
    serverName: getString(item, "serverName", "server_name"),
    dns: getString(item, "dns", "streaming_dns", "host"),
    m3uUrl: getString(item, "m3uUrl", "m3u_url", "m3u"),
  };
}

function isActiveStatus(status?: string | number | boolean) {
  if (typeof status === "boolean") return status;
  if (typeof status === "number") return status === 1;
  if (typeof status !== "string") return true;
  return ["active", "enabled", "online", "1", "true", "ativo"].includes(status.toLowerCase());
}

export async function sigmaLogin(url: string, username: string, password: string): Promise<string> {
  const config: SigmaConfig = { url, username, password };
  let lastError: Error | null = null;
  for (const path of ["/api/login", "/api/auth/login", "/login"]) {
    const response = await request(config, path, { method: "POST", body: JSON.stringify({ username, user: username, email: username, password }) });
    if (response.status === 404) continue;
    if (response.status < 200 || response.status >= 300) { lastError = payloadError(response.status, response.payload, path); continue; }
    const data = asRecord(response.payload);
    const nested = asRecord(data.data ?? data.result ?? data.user);
    const token = getString(data, "token", "access_token", "auth_token", "api_token") || getString(nested, "token", "access_token", "api_token");
    if (token) return token;
    lastError = new Error("O painel Sigma não devolveu um token de autenticação.");
  }
  throw lastError ?? new Error("Não foi possível localizar a rota de login do painel Sigma.");
}

export async function ensureSigmaToken(config: SigmaConfig): Promise<string> {
  if (config.token?.trim()) return config.token.trim();
  if (config.username?.trim() && config.password?.trim()) return sigmaLogin(config.url, config.username, config.password);
  throw new Error("Configure o token ou o usuário e a senha do painel Sigma.");
}

export async function listSigmaCustomers(config: SigmaConfig, existingToken?: string): Promise<SigmaCustomer[]> {
  const token = existingToken?.trim() || await ensureSigmaToken(config);
  const errors: string[] = [];
  for (const endpoint of ["/api/reseller-api/v1/customers", "/api/resellers/customers", "/api/customers"]) {
    const response = await request(config, endpoint, { method: "GET" }, token);
    if (response.status >= 200 && response.status < 300) return unwrapList(response.payload).map(normalizeCustomer).filter((item) => item.id !== "");
    if (response.status !== 404) errors.push(`${endpoint} -> ${payloadError(response.status, response.payload, endpoint).message}`);
  }
  throw new Error(`Não consegui listar os clientes do painel Sigma. ${errors.join(" • ") || "Nenhuma rota de clientes respondeu."}`);
}

export async function fetchSigmaPanelDetails(config: SigmaConfig, existingToken?: string) {
  const token = existingToken?.trim() || await ensureSigmaToken(config);
  let serverName: string | null = null;
  let dns: string | null = null;
  const packages: string[] = [];
  let credits: number | null = null;
  for (const endpoint of ["/api/profile", "/api/reseller", "/api/packages"]) {
    const response = await request(config, endpoint, { method: "GET" }, token);
    if (response.status < 200 || response.status >= 300) continue;
    const data = asRecord(asRecord(response.payload).data ?? response.payload);
    serverName ||= getString(data, "server_name", "serverName", "name") ?? null;
    dns ||= getString(data, "dns", "streaming_dns", "host") ?? null;
    if (credits == null && typeof data.credits === "number") credits = data.credits;
    for (const item of unwrapList(response.payload)) {
      const name = typeof item === "string" ? item : getString(asRecord(item), "name");
      if (name) packages.push(name);
    }
  }
  return { serverName, dns, packages, credits };
}

export async function createSigmaCustomer(config: SigmaConfig, input: CreateSigmaCustomerInput) {
  const token = await ensureSigmaToken(config);
  const response = await request(config, "/api/customers", { method: "POST", body: JSON.stringify(input) }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, "/api/customers");
  return normalizeCustomer(asRecord(response.payload).customer ?? asRecord(response.payload).data ?? response.payload);
}

export async function updateSigmaCustomer(config: SigmaConfig, ref: { id?: string | number; username?: string }, input: Partial<CreateSigmaCustomerInput> & { status?: string }) {
  const token = await ensureSigmaToken(config);
  const id = encodeURIComponent(String(ref.id ?? ref.username));
  const endpoint = `/api/customers/${id}`;
  const response = await request(config, endpoint, { method: "PUT", body: JSON.stringify(input) }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, endpoint);
  return response.payload;
}

export async function deleteSigmaCustomer(config: SigmaConfig, ref: { id?: string | number; username?: string }) {
  const token = await ensureSigmaToken(config);
  const id = encodeURIComponent(String(ref.id ?? ref.username));
  const endpoint = `/api/customers/${id}`;
  const response = await request(config, endpoint, { method: "DELETE" }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, endpoint);
  return response.payload;
}

export async function renewSigmaCustomer(config: SigmaConfig, ref: { id?: string | number; username?: string }, months: number) {
  const token = await ensureSigmaToken(config);
  const id = encodeURIComponent(String(ref.id ?? ref.username));
  const endpoint = `/api/customers/${id}/renew`;
  const response = await request(config, endpoint, { method: "POST", body: JSON.stringify({ months }) }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, endpoint);
  return response.payload;
}

export async function toggleSigmaCustomerStatus(config: SigmaConfig, ref: { id?: string | number; username?: string }, status: string) {
  const token = await ensureSigmaToken(config);
  const id = encodeURIComponent(String(ref.id ?? ref.username));
  const endpoint = `/api/customers/${id}/status`;
  const response = await request(config, endpoint, { method: "PATCH", body: JSON.stringify({ status }) }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, endpoint);
  return response.payload;
}

export { isActiveStatus };

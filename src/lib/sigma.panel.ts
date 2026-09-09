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

type SigmaResponse = {
  status: number;
  payload: unknown;
};

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function describeHttpError(status: number, endpoint?: string) {
  const route = endpoint ? ` na rota ${endpoint}` : "";
  if (status === 401 || status === 403) {
    return new Error(`O painel Sigma recusou a autenticação${route} (403). O login foi aceito, mas esta rota pode exigir permissão de revendedor, token próprio ou liberação de IP.`);
  }
  if (status === 404) return new Error(`O painel Sigma não encontrou a rota${route} (404).`);
  return new Error(`O painel Sigma respondeu com erro ${status}${route}.`);
}

function getHeaders(config: SigmaConfig, token?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
  };
  const effectiveToken = token?.trim() || config.token?.trim();
  if (effectiveToken) {
    headers.Authorization = effectiveToken.toLowerCase().startsWith("bearer ")
      ? effectiveToken
      : `Bearer ${effectiveToken}`;
    headers["X-API-Key"] = effectiveToken.replace(/^Bearer\s+/i, "");
  }
  return headers;
}

async function request(config: SigmaConfig, endpoint: string, init: RequestInit = {}, token?: string): Promise<SigmaResponse> {
  const response = await fetch(`${cleanUrl(config.url)}${endpoint}`, {
    ...init,
    headers: { ...getHeaders(config, token), ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

function payloadError(status: number, payload: unknown, endpoint?: string) {
  if (typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string") {
    return new Error(payload.message);
  }
  return describeHttpError(status, endpoint);
}

function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const source = payload as Record<string, unknown>;
  for (const key of ["customers", "clients", "users", "data", "results", "items"]) {
    if (Array.isArray(source[key])) return source[key];
    if (source[key] && typeof source[key] === "object") {
      const nested = unwrapList(source[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function normalizeCustomer(row: unknown): SigmaCustomer {
  const item = asRecord(row);
  const id = item.id ?? item.customer_id ?? item.customerId ?? item.user_id ?? item.username;
  return {
    id,
    name: item.name ?? item.customer_name ?? item.full_name ?? item.display_name,
    username: item.username ?? item.user ?? item.login,
    password: item.password ?? item.pass,
    phone: item.phone ?? item.whatsapp ?? item.mobile,
    email: item.email,
    status: item.status ?? item.state ?? item.enabled,
    dueDate: item.dueDate ?? item.due_date ?? item.expiration_date ?? item.expires_at,
    screens: Number(item.screens ?? item.connections ?? item.connections_count ?? 1),
    notes: item.notes,
    packageName: item.packageName ?? item.package_name ?? asRecord(item.package).name,
    serverName: item.serverName ?? item.server_name,
    dns: item.dns ?? item.streaming_dns ?? item.host,
    m3uUrl: item.m3uUrl ?? item.m3u_url ?? item.m3u,
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
  const paths = ["/api/login", "/api/auth/login", "/login"];
  let lastError: Error | null = null;
  for (const path of paths) {
    const response = await request(config, path, {
      method: "POST",
      body: JSON.stringify({ username, user: username, email: username, password }),
    });
    if (response.status === 404) continue;
    if (response.status < 200 || response.status >= 300) {
      lastError = payloadError(response.status, response.payload, path);
      continue;
    }
    const data = asRecord(response.payload);
    const nested = asRecord(data.data ?? data.result);
    const token = data.token ?? data.access_token ?? data.auth_token ?? data.api_token ?? nested.token ?? nested.access_token ?? nested.api_token;
    if (token) return String(token);
    lastError = new Error("O painel Sigma respondeu, mas não devolveu um token de autenticação válido.");
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
  const endpoints = [
    "/api/reseller-api/v1/customers",
    "/api/resellers/customers",
    "/api/customers",
  ];
  const errors: string[] = [];
  for (const endpoint of endpoints) {
    const response = await request(config, endpoint, { method: "GET" }, token);
    if (response.status >= 200 && response.status < 300) {
      const rows = unwrapList(response.payload).map(normalizeCustomer).filter((item) => item.id != null);
      return rows;
    }
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
    if (response.status === 404 || response.status < 200 || response.status >= 300) continue;
    const data = asRecord(asRecord(response.payload).data ?? response.payload);
    serverName ||= data.server_name ?? data.serverName ?? data.name ?? null;
    dns ||= data.dns ?? data.streaming_dns ?? data.host ?? null;
    if (credits == null && data.credits != null) credits = Number(data.credits);
    for (const item of unwrapList(response.payload)) {
      const name = typeof item === "string" ? item : asRecord(item).name;
      if (name) packages.push(String(name));
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
  const response = await request(config, `/api/customers/${id}`, { method: "PUT", body: JSON.stringify(input) }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, `/api/customers/${id}`);
  return response.payload;
}

export async function deleteSigmaCustomer(config: SigmaConfig, ref: { id?: string | number; username?: string }) {
  const token = await ensureSigmaToken(config);
  const id = encodeURIComponent(String(ref.id ?? ref.username));
  const response = await request(config, `/api/customers/${id}`, { method: "DELETE" }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, `/api/customers/${id}`);
  return response.payload;
}

export async function renewSigmaCustomer(config: SigmaConfig, ref: { id?: string | number; username?: string }, months: number) {
  const token = await ensureSigmaToken(config);
  const id = encodeURIComponent(String(ref.id ?? ref.username));
  const response = await request(config, `/api/customers/${id}/renew`, { method: "POST", body: JSON.stringify({ months }) }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, `/api/customers/${id}/renew`);
  return response.payload;
}

export async function toggleSigmaCustomerStatus(config: SigmaConfig, ref: { id?: string | number; username?: string }, status: string) {
  const token = await ensureSigmaToken(config);
  const id = encodeURIComponent(String(ref.id ?? ref.username));
  const response = await request(config, `/api/customers/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
  if (response.status < 200 || response.status >= 300) throw payloadError(response.status, response.payload, `/api/customers/${id}/status`);
  return response.payload;
}

export { isActiveStatus };

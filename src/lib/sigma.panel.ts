import type { SigmaConfig } from "./sigma.panel";

export type SigmaCustomer = {
  id: string | number;
  name?: string;
  username?: string;
  password?: string;
  phone?: string;
  email?: string;
  status?: string;
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

function cleanUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function safeError(status: number) {
  if (status === 401 || status === 403) return new Error("O painel Sigma recusou a autenticação (403). Verifique usuário, senha, token e restrições de IP/firewall.");
  if (status === 404) return new Error("O painel Sigma não encontrou esta rota (404).");
  return new Error(`O painel Sigma respondeu com erro ${status}.`);
}

function getHeaders(config: SigmaConfig, token?: string) {
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  const effectiveToken = token || config.token?.trim();
  if (effectiveToken) headers.Authorization = effectiveToken.toLowerCase().startsWith("bearer ") ? effectiveToken : `Bearer ${effectiveToken}`;
  return headers;
}

async function request(config: SigmaConfig, endpoint: string, init: RequestInit = {}, token?: string) {
  const response = await fetch(`${cleanUrl(config.url)}${endpoint}`, { ...init, headers: { ...getHeaders(config, token), ...(init.headers ?? {}) } });
  const text = await response.text();
  if (!response.ok) throw safeError(response.status);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

function unwrapList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["customers", "clients", "data", "results", "items"]) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function normalizeCustomer(row: any): SigmaCustomer {
  return {
    id: row.id ?? row.customer_id ?? row.customerId ?? row.username,
    name: row.name ?? row.customer_name ?? row.full_name,
    username: row.username ?? row.user,
    password: row.password ?? row.pass,
    phone: row.phone ?? row.whatsapp,
    email: row.email,
    status: row.status ?? row.state,
    dueDate: row.dueDate ?? row.due_date ?? row.expiration_date ?? row.expires_at,
    screens: Number(row.screens ?? row.connections ?? row.connections_count ?? 1),
    notes: row.notes,
    packageName: row.packageName ?? row.package_name ?? row.package?.name,
    serverName: row.serverName ?? row.server_name,
    dns: row.dns ?? row.host,
    m3uUrl: row.m3uUrl ?? row.m3u_url ?? row.m3u,
  };
}

export async function sigmaLogin(url: string, username: string, password: string): Promise<string> {
  const config: SigmaConfig = { url, username, password };
  const result = await request(config, "/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
  const token = result?.token ?? result?.access_token ?? result?.data?.token ?? result?.data?.access_token;
  if (!token) throw new Error("O painel Sigma não devolveu um token de autenticação válido.");
  return String(token);
}

export async function ensureSigmaToken(config: SigmaConfig): Promise<string> {
  if (config.token?.trim()) return config.token.trim();
  if (config.username?.trim() && config.password?.trim()) return sigmaLogin(config.url, config.username, config.password);
  throw new Error("Configure o token ou o usuário e a senha do painel Sigma.");
}

export async function listSigmaCustomers(config: SigmaConfig): Promise<SigmaCustomer[]> {
  const token = await ensureSigmaToken(config);
  for (const endpoint of ["/api/customers", "/api/reseller-api/v1/customers", "/api/resellers/customers"]) {
    try {
      const payload = await request(config, endpoint, { method: "GET" }, token);
      const rows = unwrapList(payload);
      if (rows.length || Array.isArray(payload)) return rows.map(normalizeCustomer).filter((item) => item.id != null);
    } catch (error) {
      if (error instanceof Error && /403|autenticação/.test(error.message)) throw error;
    }
  }
  throw new Error("Não foi possível listar os clientes no painel Sigma. A rota de clientes disponível nesta instalação não retornou dados.");
}

export async function fetchSigmaPanelDetails(config: SigmaConfig) {
  const token = await ensureSigmaToken(config);
  let serverName: string | null = null;
  let dns: string | null = null;
  const packages: string[] = [];
  let credits: number | null = null;
  for (const endpoint of ["/api/profile", "/api/reseller", "/api/packages"]) {
    try {
      const payload = await request(config, endpoint, { method: "GET" }, token);
      const data = payload?.data ?? payload;
      serverName ||= data?.server_name ?? data?.serverName ?? data?.name ?? null;
      dns ||= data?.dns ?? data?.streaming_dns ?? data?.host ?? null;
      credits ??= data?.credits == null ? null : Number(data.credits);
      for (const item of unwrapList(payload)) if (typeof item === "string") packages.push(item); else if (item?.name) packages.push(String(item.name));
    } catch (error) {
      if (error instanceof Error && /403|autenticação/.test(error.message)) throw error;
    }
  }
  return { serverName, dns, packages, credits };
}

export async function createSigmaCustomer(config: SigmaConfig, input: CreateSigmaCustomerInput) {
  const payload = await request(config, "/api/customers", { method: "POST", body: JSON.stringify(input) }, await ensureSigmaToken(config));
  return normalizeCustomer(payload?.customer ?? payload?.data ?? payload);
}

export async function updateSigmaCustomer(config: SigmaConfig, ref: { id?: string | number; username?: string }, input: Partial<CreateSigmaCustomerInput> & { status?: string }) {
  return request(config, `/api/customers/${encodeURIComponent(String(ref.id ?? ref.username))}`, { method: "PUT", body: JSON.stringify(input) }, await ensureSigmaToken(config));
}

export async function deleteSigmaCustomer(config: SigmaConfig, ref: { id?: string | number; username?: string }) {
  return request(config, `/api/customers/${encodeURIComponent(String(ref.id ?? ref.username))}`, { method: "DELETE" }, await ensureSigmaToken(config));
}

export async function renewSigmaCustomer(config: SigmaConfig, ref: { id?: string | number; username?: string }, months: number) {
  return request(config, `/api/customers/${encodeURIComponent(String(ref.id ?? ref.username))}/renew`, { method: "POST", body: JSON.stringify({ months }) }, await ensureSigmaToken(config));
}

export async function toggleSigmaCustomerStatus(config: SigmaConfig, ref: { id?: string | number; username?: string }, status: string) {
  return request(config, `/api/customers/${encodeURIComponent(String(ref.id ?? ref.username))}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, await ensureSigmaToken(config));
}

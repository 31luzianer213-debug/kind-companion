/**
 * Cliente HTTP do painel IPTV Sigma (somente servidor).
 * Reconstruído do zero com arquitetura adaptativa, suporte a ciclo de vida
 * completo (criar, listar, renovar, bloquear e remover clientes) e diagnósticos claros.
 */

export type SigmaConfig = {
  url: string;
  token?: string | null;
  username?: string | null;
  password?: string | null;
};

export type SigmaCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  username: string | null;
  password: string | null;
  screens: number | null;
  /** Data de vencimento normalizada para YYYY-MM-DD */
  dueDate: string | null;
  /** Status normalizado: 'active' | 'inactive' | 'expired' | 'suspended' */
  status: string | null;
  packageId?: string | number | null;
};

export type CreateSigmaCustomerInput = {
  name: string;
  username: string;
  password?: string | null;
  phone?: string | null;
  email?: string | null;
  screens?: number | null;
  dueDate?: string | null;
  packageId?: string | number | null;
  notes?: string | null;
};

const REQUEST_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 8_000;

export function normalizeBaseUrl(url: string): string {
  let base = (url ?? "").trim();
  if (!base) throw new Error("Informe o endereço do painel IPTV.");
  // Remove fragmento (#/...) e queries
  const hashIdx = base.indexOf("#");
  if (hashIdx >= 0) base = base.slice(0, hashIdx);
  const qIdx = base.indexOf("?");
  if (qIdx >= 0) base = base.slice(0, qIdx);
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/+$/, "");
  // Remove sufixos de páginas comuns coladas por engano
  base = base.replace(/\/(#\/)?(sign-in|signin|login|logout|dashboard|painel|admin)(\/.*)?$/i, "");
  return base.replace(/\/+$/, "");
}

export function isSigmaConfigured(config?: SigmaConfig | null): boolean {
  return Boolean(
    config &&
      config.url?.trim() &&
      (config.token?.trim() ||
        (config.username?.trim() && config.password?.trim())),
  );
}

type HttpResult = {
  ok: boolean;
  status: number;
  payload: any;
  text: string;
  headers: Headers;
};

async function requestJson(
  base: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return { ok: response.ok, status: response.status, payload, text, headers: response.headers };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`O painel demorou mais de ${Math.round(timeoutMs / 1000)}s para responder (${url}).`);
    }
    throw new Error(`Não foi possível conectar ao painel em ${base}. Verifique a URL.`);
  } finally {
    clearTimeout(timer);
  }
}

function withAuth(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token.trim()}`);
  }
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return { ...init, headers };
}

/** Procura token em headers ou no corpo JSON */
function readToken(payload: any, headers: Headers): string | null {
  const headerValue = headers.get("authorization") ?? headers.get("x-auth-token") ?? headers.get("token");
  if (headerValue) {
    const cleaned = headerValue.replace(/^Bearer\s+/i, "").trim();
    if (cleaned.length > 5) return cleaned;
  }
  if (!payload) return null;

  if (typeof payload === "string" && payload.length > 20 && !payload.includes(" ")) {
    return payload.trim();
  }

  const scan = (value: any, depth: number): string | null => {
    if (!value || typeof value !== "object" || depth > 4) return null;
    for (const [key, val] of Object.entries(value)) {
      if (
        typeof val === "string" &&
        /^(token|access_token|jwt|bearer_token|auth_token|id_token)$/i.test(key) &&
        val.trim().length > 5
      ) {
        return val.trim();
      }
    }
    for (const val of Object.values(value)) {
      const found = scan(val, depth + 1);
      if (found) return found;
    }
    return null;
  };

  return scan(payload, 0);
}

const LOGIN_ENDPOINTS = [
  "/api/login",
  "/api/auth/login",
  "/api/v1/login",
  "/api/v1/auth/login",
  "/api/sign-in",
  "/api/signin",
  "/api/session",
  "/api/sessions",
  "/api/token",
  "/api/auth",
  "/api/authenticate",
];

/** Realiza login no painel Sigma e devolve o token de acesso. */
export async function sigmaLogin(url: string, username: string, password: string): Promise<string> {
  const base = normalizeBaseUrl(url);
  const user = (username ?? "").trim();
  const pass = (password ?? "").trim();
  if (!user || !pass) throw new Error("Informe o usuário e a senha do painel.");

  const bodies: Array<Record<string, string>> = [
    { username: user, password: pass },
    { email: user, password: pass },
    { login: user, password: pass },
    { user: user, password: pass },
    { username: user, pass: pass },
  ];

  const attempts: string[] = [];
  for (const endpoint of LOGIN_ENDPOINTS) {
    for (const body of bodies) {
      let result: HttpResult;
      try {
        result = await requestJson(
          base,
          endpoint,
          { method: "POST", body: JSON.stringify(body) },
          LOGIN_TIMEOUT_MS,
        );
      } catch (error) {
        attempts.push(error instanceof Error ? error.message : "erro de conexão");
        continue;
      }
      if (result.ok) {
        const token = readToken(result.payload, result.headers);
        if (token) return token;
        attempts.push(`${endpoint} respondeu OK mas sem token legível`);
        continue;
      }
      attempts.push(`${endpoint} → ${result.status}`);
    }
  }

  const authErrors = attempts.filter((a) => /401|403|422/.test(a)).length;
  const notFound = attempts.filter((a) => /404|405/.test(a)).length;
  if (attempts.length > 0 && authErrors === attempts.length) {
    throw new Error("Usuário ou senha do painel Sigma incorretos.");
  }
  if (attempts.length > 0 && notFound === attempts.length) {
    throw new Error(
      `Não encontrei uma API de login em ${base}. Confira se o endereço é o painel de revenda correto (ex.: https://painel.sigma.st).`,
    );
  }
  const sample = attempts.slice(0, 4).join(" • ");
  throw new Error(`Não foi possível autenticar no painel Sigma (${sample || "sem resposta"}).`);
}

/** Garante que tenhamos um token válido para as requisições. */
export async function ensureSigmaToken(config: SigmaConfig): Promise<string> {
  if (config.token?.trim()) return config.token.trim();
  if (config.username?.trim() && config.password?.trim()) {
    return await sigmaLogin(config.url, config.username, config.password);
  }
  throw new Error("Informe o usuário e a senha do painel Sigma.");
}

/** Faz uma chamada autenticada; se receber 401, tenta refazer login uma vez. */
async function authorizedRequest(
  config: SigmaConfig,
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<HttpResult> {
  const base = normalizeBaseUrl(config.url);
  let token =
    config.token?.trim() ||
    (await sigmaLogin(config.url, config.username ?? "", config.password ?? ""));
  let result = await requestJson(base, path, withAuth(token, init), timeoutMs);

  const canRelogin = Boolean(config.username?.trim() && config.password?.trim());
  if (!result.ok && (result.status === 401 || result.status === 403) && canRelogin) {
    token = await sigmaLogin(config.url, config.username ?? "", config.password ?? "");
    result = await requestJson(base, path, withAuth(token, init), timeoutMs);
  }
  return result;
}

// ============================================================
// Utilitários de mapeamento e parsing de dados do painel
// ============================================================

function pickField(obj: any, aliases: string[]): any {
  if (!obj || typeof obj !== "object") return null;
  for (const alias of aliases) {
    const value = alias.split(".").reduce<any>((acc, part) => (acc == null ? acc : acc[part]), obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function extractRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["data", "customers", "clients", "users", "items", "results", "list", "rows"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.data)) return value.data;
    }
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function parseDate(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const fromSeconds = new Date(value > 1_000_000_000_000 ? value : value * 1000);
    if (!Number.isNaN(fromSeconds.getTime())) return fromSeconds.toISOString().slice(0, 10);
    return null;
  }
  const text = String(value).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (br) return `${br[3]}-${(br[2] ?? "").padStart(2, "0")}-${(br[1] ?? "").padStart(2, "0")}`;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeStatus(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "active" : "inactive";
  const status = String(value).toLowerCase().trim();
  if (["active", "ativo", "enabled", "on", "1", "yes"].includes(status)) return "active";
  if (["expired", "expirado", "vencido"].includes(status)) return "expired";
  if (["suspended", "suspendido", "blocked", "bloqueado"].includes(status)) return "suspended";
  if (["inactive", "desativado", "disabled", "off", "0", "no", "cancelled", "cancelado"].includes(status)) {
    return "inactive";
  }
  return status;
}

function mapCustomer(raw: any): SigmaCustomer | null {
  const id = pickField(raw, ["id", "uuid", "customer_id", "client_id", "user_id", "uid"]);
  if (id === null) return null;
  const screensValue = Number(
    pickField(raw, ["connections", "screens", "max_connections", "connection_limit", "devices"]) ?? 0,
  );
  return {
    id: String(id),
    name: String(
      pickField(raw, ["name", "full_name", "customer_name", "display_name", "note", "username"]) ??
        "Cliente do painel",
    ),
    phone: pickField(raw, ["whatsapp", "phone", "telephone", "mobile", "contact"]),
    email: pickField(raw, ["email", "mail"]),
    username: String(pickField(raw, ["username", "user", "login", "uname", "iptv_username"]) ?? ""),
    password: String(pickField(raw, ["password", "pass", "passwd", "iptv_password"]) ?? ""),
    screens: Number.isFinite(screensValue) && screensValue > 0 ? screensValue : null,
    dueDate: parseDate(
      pickField(raw, ["expiration_date", "expiry_date", "expiration", "exp_date", "due_date", "expires_at", "expires", "valid_until"]),
    ),
    status: normalizeStatus(pickField(raw, ["status", "state", "is_active", "isActive"])),
    packageId: pickField(raw, ["package_id", "packageId", "plan_id", "plan"]),
  };
}

// ============================================================
// Métodos de Gerenciamento do Painel Sigma
// ============================================================

const LIST_ENDPOINTS = [
  "/api/customers",
  "/api/clients",
  "/api/users",
  "/api/user/list",
  "/api/subscribers",
  "/api/subresellers",
  "/api/members",
];

/** Lista todos os clientes cadastrados no painel Sigma. */
export async function listSigmaCustomers(config: SigmaConfig): Promise<SigmaCustomer[]> {
  const attempts: string[] = [];
  for (const endpoint of LIST_ENDPOINTS) {
    let result: HttpResult;
    try {
      result = await authorizedRequest(config, endpoint, { method: "GET" });
    } catch (error) {
      attempts.push(`${endpoint} -> ${error instanceof Error ? error.message : "erro"}`);
      continue;
    }
    if (!result.ok) {
      attempts.push(`${endpoint} -> ${result.status}`);
      continue;
    }
    const firstPage = extractRows(result.payload);
    if (firstPage.length === 0) {
      attempts.push(`${endpoint} -> lista vazia`);
      continue;
    }

    const customers: SigmaCustomer[] = [];
    const seenIds = new Set<string>();
    const pushRows = (rows: any[]) => {
      for (const row of rows) {
        const mapped = mapCustomer(row);
        if (mapped && !seenIds.has(mapped.id)) {
          seenIds.add(mapped.id);
          customers.push(mapped);
        }
      }
    };
    pushRows(firstPage);

    // Próximas páginas se houver paginação
    for (let page = 2; page <= 50; page++) {
      const separator = endpoint.includes("?") ? "&" : "?";
      let next: HttpResult;
      try {
        next = await authorizedRequest(config, `${endpoint}${separator}page=${page}&per_page=100`, { method: "GET" });
      } catch {
        break;
      }
      if (!next.ok) break;
      const rows = extractRows(next.payload);
      if (rows.length === 0) break;
      pushRows(rows);
      if (rows.length < 100) break;
    }
    return customers;
  }

  if (attempts.every((a) => /401|403/.test(a))) {
    throw new Error("Usuário ou senha do painel Sigma sem permissão para listar clientes.");
  }
  throw new Error(
    `Não consegui listar os clientes do painel. Respostas: ${attempts.slice(0, 4).join(" • ") || "nenhuma"}.`,
  );
}

/** Cria um novo cliente / linha no painel Sigma. */
export async function createSigmaCustomer(
  config: SigmaConfig,
  input: CreateSigmaCustomerInput,
): Promise<{ id: string; username: string; password: string; raw?: any }> {
  const username = input.username.trim();
  const password = (input.password ?? "").trim() || Math.random().toString(36).slice(-8);
  const name = input.name.trim();
  const phone = input.phone ? input.phone.replace(/\D/g, "") : null;
  const screens = input.screens && input.screens > 0 ? input.screens : 1;
  const dueDate = input.dueDate ? parseDate(input.dueDate) : null;

  const candidateEndpoints = [
    "/api/customers",
    "/api/clients",
    "/api/users",
    "/api/customer/create",
    "/api/client/create",
    "/api/user/create",
    "/api/user/add",
    "/api/subscribers",
  ];

  // Variantes de payload aceitas por diferentes builds do Sigma
  const payloadBodies = [
    {
      username,
      password,
      name,
      phone: phone ?? "",
      email: input.email ?? "",
      screens,
      max_connections: screens,
      connections: screens,
      due_date: dueDate ?? "",
      expiration_date: dueDate ?? "",
      exp_date: dueDate ?? "",
      status: "active",
      notes: input.notes ?? "",
      ...(input.packageId ? { package_id: input.packageId } : {}),
    },
    {
      user: username,
      pass: password,
      name,
      contact: phone ?? "",
      connections: screens,
      expires_at: dueDate ?? "",
      is_active: 1,
    },
  ];

  const attempts: string[] = [];
  for (const endpoint of candidateEndpoints) {
    for (const body of payloadBodies) {
      let result: HttpResult;
      try {
        result = await authorizedRequest(config, endpoint, {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch (error) {
        attempts.push(`${endpoint} -> ${error instanceof Error ? error.message : "erro"}`);
        continue;
      }

      if (result.ok) {
        const payload = result.payload;
        const createdId =
          pickField(payload, [
            "id",
            "uuid",
            "customer_id",
            "client_id",
            "user_id",
            "data.id",
            "data.customer_id",
            "result.id",
          ]) ?? username;

        return {
          id: String(createdId),
          username,
          password,
          raw: payload,
        };
      }

      const errorMsg =
        result.payload?.message ||
        result.payload?.error ||
        result.payload?.msg ||
        result.text?.slice(0, 80);
      attempts.push(`${endpoint} (${result.status}): ${errorMsg || "falha"}`);
    }
  }

  const sample = attempts.slice(0, 3).join(" • ");
  throw new Error(`Falha ao criar cliente no painel Sigma. Respostas: ${sample}`);
}

/** Remove (exclui) uma linha/cliente do painel Sigma. */
export async function deleteSigmaCustomer(
  config: SigmaConfig,
  ref: { id?: string | null; username?: string | null },
): Promise<void> {
  const id = ref.id ? String(ref.id).trim() : "";
  const username = ref.username ? String(ref.username).trim() : "";
  if (!id && !username) {
    throw new Error("Identificador ou usuário do cliente não fornecido.");
  }

  const deleteAttempts: Array<{ method: string; path: string; body?: any }> = [];

  // Estratégia DELETE HTTP
  if (id) {
    deleteAttempts.push({ method: "DELETE", path: `/api/customers/${id}` });
    deleteAttempts.push({ method: "DELETE", path: `/api/clients/${id}` });
    deleteAttempts.push({ method: "DELETE", path: `/api/users/${id}` });
    deleteAttempts.push({ method: "DELETE", path: `/api/user/${id}` });
  }

  // Estratégia POST de exclusão
  if (id) {
    deleteAttempts.push({ method: "POST", path: `/api/customers/${id}/delete` });
    deleteAttempts.push({ method: "POST", path: `/api/clients/${id}/delete` });
    deleteAttempts.push({ method: "POST", path: `/api/users/${id}/delete` });
    deleteAttempts.push({ method: "POST", path: `/api/customer/delete`, body: { id } });
    deleteAttempts.push({ method: "POST", path: `/api/client/delete`, body: { id } });
    deleteAttempts.push({ method: "POST", path: `/api/user/delete`, body: { id } });
  }
  if (username) {
    deleteAttempts.push({ method: "POST", path: `/api/customer/delete`, body: { username } });
    deleteAttempts.push({ method: "POST", path: `/api/client/delete`, body: { username } });
    deleteAttempts.push({ method: "POST", path: `/api/user/delete`, body: { username } });
    deleteAttempts.push({ method: "POST", path: `/api/users/remove`, body: { username } });
  }

  const attempts: string[] = [];
  for (const { method, path, body } of deleteAttempts) {
    let result: HttpResult;
    try {
      result = await authorizedRequest(config, path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      attempts.push(`${method} ${path} -> erro de conexão`);
      continue;
    }
    if (result.ok || result.status === 204) return;
    attempts.push(`${method} ${path} -> ${result.status}`);
  }

  throw new Error(`Não foi possível remover no painel Sigma. Respostas: ${attempts.slice(0, 3).join(" • ")}`);
}

/** Renova a linha do cliente no painel Sigma. */
export async function renewSigmaCustomer(
  config: SigmaConfig,
  ref: { id?: string | null; username?: string | null },
  months = 1,
): Promise<void> {
  const id = ref?.id ? String(ref.id).trim() : "";
  const username = ref?.username ? String(ref.username).trim() : "";
  if (!id && !username) {
    throw new Error("Cliente sem vínculo com o painel (falta o id ou o usuário).");
  }
  const days = Math.max(1, Math.round(months * 30.44));

  const combos: Array<[string, Record<string, unknown>]> = [];
  if (id) {
    for (const path of [
      `/api/customers/${id}/renew`,
      `/api/customers/${id}/renewal`,
      `/api/clients/${id}/renew`,
      `/api/user/${id}/renew`,
    ]) {
      combos.push([path, { months }]);
      combos.push([path, { months, period: months }]);
      combos.push([path, { days, months }]);
    }
  }
  if (username) {
    const userPaths = [
      "/api/user/renew",
      "/api/users/renew",
      "/api/clients/renew",
      "/api/renew",
      "/api/user/extend",
    ];
    if (id) userPaths.push(`/api/users/${username}/renew`);
    for (const path of userPaths) {
      combos.push([path, { username, days }]);
      combos.push([path, { user: username, days }]);
      combos.push([path, { username, months }]);
      combos.push([path, { username, duration: days }]);
      combos.push([path, { username, extend_days: days }]);
    }
  }

  const attempts: string[] = [];
  for (const [path, body] of combos) {
    let result: HttpResult;
    try {
      result = await authorizedRequest(config, path, { method: "POST", body: JSON.stringify(body) });
    } catch {
      attempts.push(`${path} -> erro de rede`);
      continue;
    }
    if (result.ok) return;
    attempts.push(`${path} -> ${result.status}`);
  }

  throw new Error(`O painel recusou a renovação. Respostas: ${attempts.slice(0, 3).join(" • ")}`);
}

/** Altera o status (bloqueia ou ativa) do cliente no painel Sigma. */
export async function toggleSigmaCustomerStatus(
  config: SigmaConfig,
  ref: { id?: string | null; username?: string | null },
  targetStatus: "active" | "blocked" | "inactive",
): Promise<void> {
  const id = ref?.id ? String(ref.id).trim() : "";
  const username = ref?.username ? String(ref.username).trim() : "";
  if (!id && !username) throw new Error("Identificador do cliente não fornecido.");

  const isBlocked = targetStatus === "blocked" || targetStatus === "inactive";
  const action = isBlocked ? "block" : "unblock";
  const enableAction = isBlocked ? "disable" : "enable";

  const calls: Array<{ method: string; path: string; body?: any }> = [];
  if (id) {
    calls.push({ method: "POST", path: `/api/customers/${id}/${action}` });
    calls.push({ method: "POST", path: `/api/customers/${id}/${enableAction}` });
    calls.push({ method: "POST", path: `/api/customers/${id}/status`, body: { status: targetStatus } });
    calls.push({ method: "PUT", path: `/api/customers/${id}`, body: { is_active: !isBlocked, status: targetStatus } });
  }
  if (username) {
    calls.push({ method: "POST", path: `/api/user/${action}`, body: { username } });
    calls.push({ method: "POST", path: `/api/user/status`, body: { username, status: targetStatus } });
  }

  const attempts: string[] = [];
  for (const call of calls) {
    let result: HttpResult;
    try {
      result = await authorizedRequest(config, call.path, {
        method: call.method,
        body: call.body ? JSON.stringify(call.body) : undefined,
      });
    } catch {
      continue;
    }
    if (result.ok) return;
    attempts.push(`${call.path} -> ${result.status}`);
  }

  throw new Error(`Não foi possível alterar o status no painel. Respostas: ${attempts.slice(0, 3).join(" • ")}`);
}

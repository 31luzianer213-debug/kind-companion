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
  base = base.replace(/\/(#\/)?(sign-in|signin|login|logout|dashboard|home|index\.(php|html))(\/.*)?$/i, "");
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

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function prepareHeaders(init?: RequestInit, base?: string): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", BROWSER_USER_AGENT);
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json, text/plain, */*");
  }
  if (!headers.has("X-Requested-With")) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }
  if (base) {
    try {
      const parsed = new URL(base);
      if (!headers.has("Origin")) {
        headers.set("Origin", parsed.origin);
      }
      if (!headers.has("Referer")) {
        headers.set("Referer", `${parsed.origin}/`);
      }
    } catch {
      // Ignora erro se base for inválida
    }
  }
  if (init?.body && !headers.has("Content-Type")) {
    if (
      init.body instanceof URLSearchParams ||
      (typeof init.body === "string" && init.body.includes("=") && !init.body.trim().startsWith("{"))
    ) {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
    } else {
      headers.set("Content-Type", "application/json");
    }
  }
  return headers;
}

/** Executa chamada HTTP via curl nativo no Node.js para contornar proteções Cloudflare */
async function curlRequest(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
  base?: string,
): Promise<HttpResult | null> {
  try {
    const { execFile } = await import("child_process");
    return await new Promise<HttpResult>((resolve) => {
      const method = (init.method ?? "GET").toUpperCase();
      const headers = prepareHeaders(init, base);
      const args = [
        "-s",
        "-k",
        "-L",
        "--max-time",
        String(Math.max(5, Math.round(timeoutMs / 1000))),
        "-X",
        method,
      ];
      headers.forEach((val, key) => {
        args.push("-H", `${key}: ${val}`);
      });
      if (init.body) {
        args.push("-d", typeof init.body === "string" ? init.body : JSON.stringify(init.body));
      }
      args.push("-w", "\n__HTTP_STATUS__:%{http_code}", url);

      const parseAndResolve = (stdout: string) => {
        const parts = (stdout ?? "").split("\n__HTTP_STATUS__:");
        const text = parts[0] ?? "";
        const status = parseInt(parts[1] || "0", 10);
        let payload: any = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = null;
        }
        resolve({
          ok: status >= 200 && status < 300,
          status,
          payload,
          text,
          headers: new Headers({ "content-type": "application/json" }),
        });
      };

      execFile("curl.exe", args, (err, stdout) => {
        if (err && !stdout) {
          execFile("curl", args, (err2, stdout2) => {
            if (err2 && !stdout2) {
              return resolve({ ok: false, status: 0, payload: null, text: "", headers: new Headers() });
            }
            parseAndResolve(stdout2);
          });
          return;
        }
        parseAndResolve(stdout);
      });
    });
  } catch {
    return null;
  }
}

async function requestJson(
  base: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<HttpResult> {
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers = prepareHeaders(init, base);
  const enrichedInit = { ...init, headers };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let fetchError: Error | null = null;
  try {
    const response = await fetch(url, { ...enrichedInit, signal: controller.signal });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    const isCloudflareBlocked =
      (response.status === 403 || response.status === 503) &&
      (text.includes("<!DOCTYPE") ||
        text.includes("Just a moment") ||
        text.includes("challenges.cloudflare.com") ||
        text.includes("cf-mitigated"));

    if (!isCloudflareBlocked) {
      return { ok: response.ok, status: response.status, payload, text, headers: response.headers };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`O painel demorou mais de ${Math.round(timeoutMs / 1000)}s para responder (${url}).`);
    }
    fetchError = error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }

  // Tenta contornar bloqueio de Cloudflare via curl do sistema operacional (Node.js)
  const curlResult = await curlRequest(url, enrichedInit, timeoutMs, base);
  if (curlResult && curlResult.status > 0) {
    return curlResult;
  }

  if (fetchError) {
    throw new Error(`Não foi possível conectar ao painel em ${base}. Verifique a URL.`);
  }

  throw new Error(`O painel em ${base} está protegido pelo Cloudflare e bloqueou o acesso.`);
}

function withAuth(token: string, init: RequestInit = {}): RequestInit {
  const headers = prepareHeaders(init);
  const trimmed = token.trim();
  if (trimmed.startsWith("cookie:")) {
    headers.set("Cookie", trimmed.slice(7).trim());
  } else if (trimmed.includes("=") || /PHPSESSID|session|laravel_/i.test(trimmed)) {
    headers.set("Cookie", trimmed);
  } else if (trimmed.startsWith("xtream:")) {
    const parts = trimmed.slice(7).split(":");
    const u = parts[0] ?? "";
    const p = parts.slice(1).join(":");
    if (u && p) {
      const basic = Buffer.from(`${u}:${p}`).toString("base64");
      headers.set("Authorization", `Basic ${basic}`);
    }
  } else {
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${trimmed}`);
    }
  }
  return { ...init, headers };
}

function extractCookie(headers: Headers): string | null {
  if (!headers) return null;
  if (typeof (headers as any).getSetCookie === "function") {
    const cookies: string[] = (headers as any).getSetCookie();
    if (cookies && cookies.length > 0) {
      return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
    }
  }
  const raw = headers.get("set-cookie");
  if (raw) {
    return raw.split(";")[0];
  }
  return null;
}

/** Procura token em headers ou no corpo JSON */
function readToken(payload: any, headers: Headers): string | null {
  const headerValue = headers.get("authorization") ?? headers.get("x-auth-token") ?? headers.get("token");
  if (headerValue) {
    const cleaned = headerValue.replace(/^Bearer\s+/i, "").trim();
    if (cleaned.length > 5) return cleaned;
  }
  if (payload) {
    if (typeof payload === "string" && payload.length > 20 && !payload.includes(" ")) {
      return payload.trim();
    }

    const scan = (value: any, depth: number): string | null => {
      if (!value || typeof value !== "object" || depth > 4) return null;
      for (const [key, val] of Object.entries(value)) {
        if (
          typeof val === "string" &&
          /^(token|access_token|jwt|bearer_token|auth_token|id_token|session_token|hash|auth_hash|key|api_key)$/i.test(key) &&
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

    const tokenFound = scan(payload, 0);
    if (tokenFound) return tokenFound;
  }

  // Verifica se o painel respondeu com cookie de sessão
  const cookie = extractCookie(headers);
  if (cookie) {
    return `cookie:${cookie}`;
  }

  return null;
}

function extractServerMessage(payload: any, text: string): string | null {
  if (payload && typeof payload === "object") {
    const candidate =
      payload.message ||
      payload.msg ||
      payload.error ||
      payload.detail ||
      payload.description ||
      payload.motivo ||
      payload.errors?.username?.[0] ||
      payload.errors?.password?.[0] ||
      payload.errors?.login?.[0] ||
      payload.errors?.auth?.[0] ||
      (typeof payload.data === "string" ? payload.data : null);

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (text && typeof text === "string") {
    const trimmed = text.trim();
    if (
      trimmed &&
      trimmed.length < 250 &&
      !trimmed.includes("<html") &&
      !trimmed.includes("<!DOCTYPE") &&
      !trimmed.includes("<body")
    ) {
      return trimmed;
    }
  }

  return null;
}

const LOGIN_ENDPOINTS = [
  "/api/auth/login",
  "/api/login",
  "/api/v1/auth/login",
  "/api/v1/login",
  "/api/v1/reseller/login",
  "/api/reseller/login",
  "/api/sign-in",
  "/api/signin",
  "/api/session",
  "/api/auth",
  "/login",
  "/api/token",
];

/** Realiza login no painel Sigma e devolve o token de acesso. */
export async function sigmaLogin(url: string, username: string, password: string): Promise<string> {
  const base = normalizeBaseUrl(url);
  const user = (username ?? "").trim();
  const pass = (password ?? "").trim();
  if (!user || !pass) throw new Error("Informe o usuário e a senha do painel.");

  const isEmail = user.includes("@");
  const bodies: Array<Record<string, string>> = [
    { username: user, password: pass },
    ...(isEmail ? [{ email: user, password: pass }] : []),
    { login: user, password: pass },
    { user: user, password: pass },
  ];

  const attempts: string[] = [];
  let had403Forbidden = false;

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
        attempts.push(`${endpoint} respondeu OK mas sem token`);
        continue;
      }

      // Se o painel respondeu erro de credenciais (401 ou 422), pare imediatamente
      if (result.status === 401 || result.status === 422) {
        const serverMsg = extractServerMessage(result.payload, result.text);
        if (serverMsg) {
          throw new Error(`Painel Sigma: ${serverMsg}`);
        }
        throw new Error("Usuário ou senha do painel Sigma incorretos.");
      }

      // Se o painel respondeu 403 (Acesso Proibido)
      if (result.status === 403) {
        had403Forbidden = true;
        const serverMsg = extractServerMessage(result.payload, result.text);
        if (serverMsg) {
          throw new Error(`Painel Sigma (403): ${serverMsg}`);
        }

        // Tenta fallback com application/x-www-form-urlencoded caso o painel espere form post padrão
        try {
          const formParams = new URLSearchParams({ username: user, password: pass });
          if (isEmail) formParams.set("email", user);
          const formRes = await requestJson(
            base,
            endpoint,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: formParams.toString(),
            },
            LOGIN_TIMEOUT_MS,
          );

          if (formRes.ok) {
            const token = readToken(formRes.payload, formRes.headers);
            if (token) return token;
          } else if (formRes.status === 401 || formRes.status === 422) {
            const formMsg = extractServerMessage(formRes.payload, formRes.text);
            if (formMsg) throw new Error(`Painel Sigma: ${formMsg}`);
            throw new Error("Usuário ou senha do painel Sigma incorretos.");
          } else if (formRes.status === 403) {
            const formMsg = extractServerMessage(formRes.payload, formRes.text);
            if (formMsg) throw new Error(`Painel Sigma (403): ${formMsg}`);
          }
        } catch (formErr) {
          if (formErr instanceof Error && formErr.message.includes("Painel Sigma")) {
            throw formErr;
          }
        }

        attempts.push(`${endpoint} → 403 (Acesso Proibido)`);
        break;
      }

      // Se for 404 ou 405, passa para o próximo endpoint
      if (result.status === 404 || result.status === 405) {
        attempts.push(`${endpoint} → ${result.status}`);
        break;
      }

      attempts.push(`${endpoint} → ${result.status}`);
    }
  }

  // Tenta autenticação de revenda estilo Xtream UI via /panel_api.php
  try {
    const xtreamRes = await requestJson(
      base,
      `/panel_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
      { method: "GET" },
      LOGIN_TIMEOUT_MS,
    );
    if (xtreamRes.ok && xtreamRes.payload) {
      const auth = xtreamRes.payload?.user_info?.auth;
      const status = xtreamRes.payload?.user_info?.status;
      if (auth === 1 || String(status).toLowerCase() === "active") {
        return `xtream:${user}:${pass}`;
      }
    }
  } catch {
    // Segue para os erros abaixo
  }

  const notFound = attempts.filter((a) => /404|405/.test(a)).length;
  if (attempts.length > 0 && notFound === attempts.length) {
    throw new Error(
      `Não encontrei uma API de login em ${base}. Confira se o endereço é o painel de revenda correto (ex.: https://painel.sigma.st).`,
    );
  }

  if (had403Forbidden) {
    throw new Error(
      `O painel Sigma recusou a autenticação com erro 403 (Acesso Proibido).\n\n` +
      `Como resolver:\n` +
      `1. Confira se o Usuário e a Senha foram digitados corretamente.\n` +
      `2. Verifique se o seu painel possui restrição de IP ou firewall ativo.\n` +
      `3. Caso o painel forneça uma chave de API ou Token nas configurações de revenda, cole diretamente no campo "Token da API".`
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
  "/api/reseller-api/v1/customers",
  "/api/resellers/customers",
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
      const isValidListPayload =
        Array.isArray(result.payload) ||
        (result.payload &&
          typeof result.payload === "object" &&
          ("data" in result.payload ||
            "customers" in result.payload ||
            "clients" in result.payload ||
            "users" in result.payload ||
            "items" in result.payload ||
            "rows" in result.payload));
      if (isValidListPayload) {
        return [];
      }
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

export type UpdateSigmaCustomerInput = {
  name?: string | null;
  username?: string | null;
  password?: string | null;
  phone?: string | null;
  email?: string | null;
  screens?: number | null;
  dueDate?: string | null;
  status?: string | null;
  notes?: string | null;
};

/** Atualiza dados de uma linha/cliente no painel Sigma. */
export async function updateSigmaCustomer(
  config: SigmaConfig,
  ref: { id?: string | null; username?: string | null },
  input: UpdateSigmaCustomerInput,
): Promise<void> {
  const id = ref?.id ? String(ref.id).trim() : "";
  const username = (input.username || ref?.username || "").trim();
  if (!id && !username) {
    throw new Error("Identificador do cliente não fornecido para atualização no Sigma.");
  }

  const payload: Record<string, any> = {};
  if (input.name) payload.name = input.name;
  if (input.username) {
    payload.username = input.username;
    payload.user = input.username;
  }
  if (input.password) {
    payload.password = input.password;
    payload.pass = input.password;
  }
  if (input.phone) {
    payload.phone = input.phone.replace(/\D/g, "");
    payload.contact = input.phone.replace(/\D/g, "");
  }
  if (input.email) payload.email = input.email;
  if (input.screens) {
    payload.screens = input.screens;
    payload.connections = input.screens;
    payload.max_connections = input.screens;
  }
  if (input.dueDate) {
    payload.due_date = input.dueDate;
    payload.expiration_date = input.dueDate;
    payload.exp_date = input.dueDate;
    payload.expires_at = input.dueDate;
  }
  if (input.status) {
    payload.status = input.status;
    payload.is_active = input.status === "active" ? 1 : 0;
  }
  if (input.notes) payload.notes = input.notes;

  const candidateCalls: Array<{ method: string; path: string; body: any }> = [];

  if (id) {
    candidateCalls.push({ method: "PUT", path: `/api/customers/${id}`, body: payload });
    candidateCalls.push({ method: "POST", path: `/api/customers/${id}`, body: payload });
    candidateCalls.push({ method: "POST", path: `/api/customers/${id}/edit`, body: payload });
    candidateCalls.push({ method: "PUT", path: `/api/clients/${id}`, body: payload });
    candidateCalls.push({ method: "POST", path: `/api/clients/${id}`, body: payload });
    candidateCalls.push({ method: "PUT", path: `/api/users/${id}`, body: payload });
    candidateCalls.push({ method: "POST", path: `/api/users/${id}`, body: payload });
    candidateCalls.push({ method: "POST", path: `/api/customer/edit`, body: { id, ...payload } });
    candidateCalls.push({ method: "POST", path: `/api/client/edit`, body: { id, ...payload } });
    candidateCalls.push({ method: "POST", path: `/api/user/edit`, body: { id, ...payload } });
  }

  if (username) {
    candidateCalls.push({ method: "POST", path: `/api/user/edit`, body: { username, ...payload } });
    candidateCalls.push({ method: "POST", path: `/api/users/edit`, body: { username, ...payload } });
    candidateCalls.push({ method: "POST", path: `/api/customer/edit`, body: { username, ...payload } });
  }

  const attempts: string[] = [];
  for (const { method, path, body } of candidateCalls) {
    let result: HttpResult;
    try {
      result = await authorizedRequest(
        config,
        path,
        {
          method,
          body: JSON.stringify(body),
        },
        5000,
      );
    } catch {
      continue;
    }
    if (result.ok || result.status === 204) return;
    attempts.push(`${method} ${path} -> ${result.status}`);
  }

  console.warn("Aviso ao atualizar no Sigma:", attempts.slice(0, 3).join(" • "));
}


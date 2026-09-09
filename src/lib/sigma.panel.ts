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
  packageName?: string | null;
  serverName?: string | null;
  dns?: string | null;
  m3uUrl?: string | null;
  notes?: string | null;
};

export type SigmaPanelDetails = {
  serverName: string | null;
  dns: string | null;
  brandName: string | null;
  credits: number | null;
  packages: string[];
  servers: Array<{ id?: string | number; name: string; url?: string }>;
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

let cachedLastLoginPayload: any = null;

export function getLastLoginPayload(): any {
  return cachedLastLoginPayload;
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
        headers.set("Referer", `${parsed.origin}/#/sign-in`);
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
  let trimmed = token.trim();
  if (trimmed.startsWith("Bearer ")) {
    trimmed = trimmed.slice(7).trim();
  }
  if (trimmed.startsWith("cookie:")) {
    const cookieVal = trimmed.slice(7).trim();
    headers.set("Cookie", cookieVal);
    const xsrfMatch = cookieVal.match(/XSRF-TOKEN=([^;]+)/);
    if (xsrfMatch && xsrfMatch[1]) {
      headers.set("X-XSRF-TOKEN", decodeURIComponent(xsrfMatch[1]));
      headers.set("X-CSRF-TOKEN", decodeURIComponent(xsrfMatch[1]));
    }
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
    headers.set("x-api-key", trimmed);
    headers.set("api-key", trimmed);
    headers.set("token", trimmed);
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
  const bodies: Array<Record<string, any>> = [
    // 1. Formato padrão sem captcha (usado pela maioria das APIs REST do Sigma / XUI)
    { username: user, password: pass },
    ...(isEmail ? [{ email: user, password: pass }] : []),
    { login: user, password: pass },
    { user: user, password: pass },
    // 2. Formato oficial do painel Sigma / XUI Web (Laravel Sanctum com captcha)
    {
      username: user,
      password: pass,
      captcha: "not-a-robot",
      captchaChecked: true,
      twofactor_code: "",
      twofactor_recovery_code: "",
      twofactor_trusted_device_id: "",
    },
    ...(isEmail
      ? [
          {
            email: user,
            password: pass,
            captcha: "not-a-robot",
            captchaChecked: true,
            twofactor_code: "",
            twofactor_recovery_code: "",
            twofactor_trusted_device_id: "",
          },
        ]
      : []),
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
        cachedLastLoginPayload = result.payload;
        const token = readToken(result.payload, result.headers);
        if (token) return token;
        attempts.push(`${endpoint} respondeu OK mas sem token`);
        continue;
      }

      // Se o painel respondeu erro de credenciais (401 ou 422), confere mensagem
      if (result.status === 401 || result.status === 422) {
        const serverMsg = extractServerMessage(result.payload, result.text);
        if (serverMsg) {
          throw new Error(`Painel Sigma: ${serverMsg}`);
        }
        throw new Error("Usuário ou senha do painel Sigma incorretos.");
      }

      // Se o painel respondeu 403 (Acesso Proibido ou Cloudflare Challenge)
      if (result.status === 403) {
        had403Forbidden = true;
        const isCloudflare =
          result.text?.includes("challenges.cloudflare.com") ||
          result.text?.includes("Just a moment") ||
          result.text?.includes("cf-mitigated");
        if (isCloudflare) {
          throw new Error(
            `O painel Sigma (${base}) está protegido pelo Cloudflare (verificação antibot/captcha).\n\n` +
            `Como resolver:\n` +
            `1. O login automático por usuário e senha é bloqueado pelo Cloudflare.\n` +
            `2. Acesse seu painel Sigma no navegador, vá em "Configurações" ou "Integrações / API de Revenda" e gere seu "Token da API".\n` +
            `3. Cole esse token no campo "Token da API" em Servidor Sigma. Com o Token, as requisições passam sem bloqueio.`
          );
        }
        const serverMsg = extractServerMessage(result.payload, result.text);
        attempts.push(`${endpoint} → 403 (${serverMsg || "Acesso Proibido"})`);
        continue;
      }

      // Se for 404 ou 405, passa para o próximo endpoint sem testar outros corpos
      if (result.status === 404 || result.status === 405) {
        attempts.push(`${endpoint} → ${result.status}`);
        break;
      }

      attempts.push(`${endpoint} → ${result.status}`);
    }
  }

  // Tenta autenticação de revenda estilo Xtream UI via /panel_api.php ou /player_api.php
  for (const xtreamCheckPath of [
    `/panel_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
    `/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
  ]) {
    try {
      const xtreamRes = await requestJson(
        base,
        xtreamCheckPath,
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
  }

  const notFound = attempts.filter((a) => /404|405/.test(a)).length;
  if (attempts.length > 0 && notFound === attempts.length) {
    const isStreamHost = /karen256\.top|\bcdn\b|\bstream\b|\bplay\b/i.test(base);
    if (isStreamHost) {
      throw new Error(
        `O endereço "${base}" parece ser o servidor de transmissão de streaming (DNS) e não o painel de gerenciamento de revenda.\n\n` +
        `Coloque a URL onde você faz login (ex.: https://aplicativoz342.click) no campo "Endereço do Painel", e mantenha "${base}" no campo "DNS de Transmissão".`
      );
    }
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

/** Faz uma chamada autenticada; se receber 401, tenta refazer login uma vez sem quebrar o fluxo. */
async function authorizedRequest(
  config: SigmaConfig,
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<HttpResult> {
  const base = normalizeBaseUrl(config.url);
  let token = config.token?.trim();
  if (!token && config.username?.trim() && config.password?.trim()) {
    try {
      token = await sigmaLogin(config.url, config.username, config.password);
    } catch (err) {
      return {
        ok: false,
        status: 401,
        payload: null,
        text: err instanceof Error ? err.message : "Falha na autenticação",
        headers: new Headers(),
      };
    }
  }
  if (!token) {
    return {
      ok: false,
      status: 401,
      payload: null,
      text: "Credenciais ou token não informados",
      headers: new Headers(),
    };
  }

  let result: HttpResult;
  try {
    result = await requestJson(base, path, withAuth(token, init), timeoutMs);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      payload: null,
      text: err instanceof Error ? err.message : "Erro de conexão",
      headers: new Headers(),
    };
  }

  // Apenas em caso de 401 Unauthorized (token expirado), tenta re-autenticar uma vez se tiver usuário/senha
  const canRelogin = Boolean(config.username?.trim() && config.password?.trim());
  if (!result.ok && result.status === 401 && canRelogin) {
    try {
      const refreshedToken = await sigmaLogin(config.url, config.username ?? "", config.password ?? "");
      if (refreshedToken) {
        config.token = refreshedToken;
        result = await requestJson(base, path, withAuth(refreshedToken, init), timeoutMs);
      }
    } catch {
      // Mantém a resposta 401 original sem quebrar o fluxo com throw
    }
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
    for (const key of ["data", "customers", "clients", "users", "lines", "items", "results", "list", "rows", "subscribers"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.data)) return value.data;
      if (value && typeof value === "object") {
        const innerList = Object.values(value);
        if (
          innerList.length > 0 &&
          typeof innerList[0] === "object" &&
          innerList[0] !== null &&
          ("username" in (innerList[0] as any) || "id" in (innerList[0] as any) || "user" in (innerList[0] as any))
        ) {
          return innerList;
        }
      }
    }
    const values = Object.values(payload);
    if (
      values.length > 0 &&
      typeof values[0] === "object" &&
      values[0] !== null &&
      ("username" in (values[0] as any) || "id" in (values[0] as any) || "user" in (values[0] as any) || "name" in (values[0] as any))
    ) {
      return values;
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
  if (/^\d{9,13}$/.test(text)) {
    const num = Number(text);
    const fromSeconds = new Date(num > 1_000_000_000_000 ? num : num * 1000);
    if (!Number.isNaN(fromSeconds.getTime())) return fromSeconds.toISOString().slice(0, 10);
  }
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

function isRawDomainOrUrl(val?: string | null): boolean {
  if (!val) return false;
  const s = val.trim();
  return /^https?:\/\//i.test(s) || /\.(click|com|net|org|xyz|st|top|io|tv|online|site|app|live)\b/i.test(s);
}

function extractM3uFromRaw(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;

  // 1. Campos diretos de lista M3U conhecidos no ecossistema IPTV / Sigma
  const directFields = [
    "m3u_url",
    "m3u",
    "m3u_plus",
    "m3u_plus_url",
    "m3u8_url",
    "line_url",
    "playlist_url",
    "playlist",
    "get_url",
    "download_url",
    "stream_url",
    "stream_link",
    "links.m3u",
    "links.m3u_plus",
    "links.hls",
    "links.ts",
    "links.line",
    "urls.m3u",
    "urls.m3u_plus",
    "urls.hls",
    "urls.ts",
    "urls.get",
    "data.m3u_url",
    "data.m3u",
    "data.line_url",
    "data.playlist_url",
    "output_urls.m3u",
    "output_urls.m3u_plus",
    "details.m3u_url",
    "lines.0.m3u_url",
    "lines.0.m3u",
    "lines.0.line_url",
  ];

  for (const field of directFields) {
    const val = pickField(raw, [field]);
    if (typeof val === "string" && /^https?:\/\//i.test(val.trim())) {
      const trimmed = val.trim();
      if (!trimmed.includes("/sign-in") && !trimmed.includes("#/") && !trimmed.includes("/dashboard") && !trimmed.includes("/login")) {
        return trimmed;
      }
    }
  }

  // 2. Varredura recursiva de strings no JSON para detectar URLs de transmissão M3U
  const scan = (obj: any, depth: number): string | null => {
    if (!obj || depth > 5) return null;
    if (typeof obj === "string") {
      const s = obj.trim();
      if (
        /^https?:\/\//i.test(s) &&
        !s.includes("/sign-in") &&
        !s.includes("#/") &&
        !s.includes("/dashboard") &&
        !s.includes("/login") &&
        (/get\.php\?/i.test(s) || /\.m3u8?\b/i.test(s) || /\/playlist\//i.test(s) || /output=(ts|m3u8)/i.test(s) || /type=m3u/i.test(s))
      ) {
        return s;
      }
      return null;
    }
    if (typeof obj === "object") {
      for (const val of Object.values(obj)) {
        const found = scan(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  return scan(raw, 0);
}

function extractStreamingDnsFromRaw(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;

  // 1. Mapeamento servers_dns retornado pelo login e /api/auth/me do painel Sigma
  if (raw.servers_dns && typeof raw.servers_dns === "object") {
    for (const val of Object.values(raw.servers_dns)) {
      if (typeof val === "string" && val.trim()) {
        const s = val.trim();
        if (!s.includes("/sign-in") && !s.includes("#/") && !s.includes("/dashboard") && !s.includes("/login")) {
          const norm = normalizeIptvDns(s);
          if (norm) return norm;
        }
      }
    }
  }

  // 2. Campo dns_list retornado por /api/servers
  if (raw.dns_list && typeof raw.dns_list === "string") {
    const s = raw.dns_list.split("\n")[0]?.split(",")[0]?.trim();
    if (s && !s.includes("/sign-in") && !s.includes("#/") && !s.includes("/dashboard") && !s.includes("/login")) {
      const norm = normalizeIptvDns(s);
      if (norm) return norm;
    }
  }

  const directCandidates = [
    "streaming_dns",
    "server_dns",
    "stream_dns",
    "dns",
    "stream_domain",
    "stream_url",
    "server_url",
    "host",
    "server_host",
    "domain",
    "server.dns",
    "server.streaming_dns",
    "server.url",
    "server_info.dns",
    "server_info.url",
    "data.dns",
    "data.streaming_dns",
  ];

  for (const cand of directCandidates) {
    const val = pickField(raw, [cand]);
    if (typeof val === "string" && val.trim()) {
      const s = val.trim();
      if (!s.includes("/sign-in") && !s.includes("#/") && !s.includes("/dashboard") && !s.includes("/login")) {
        const norm = normalizeIptvDns(s);
        if (norm) return norm;
      }
    }
  }

  const m3u = extractM3uFromRaw(raw);
  if (m3u) {
    return normalizeIptvDns(m3u);
  }

  return null;
}

function mapCustomer(raw: any): SigmaCustomer | null {
  const screensValue = Number(
    pickField(raw, ["connections", "screens", "max_connections", "connection_limit", "devices"]) ?? 0,
  );

  // 1. Extrai o nome do servidor vinculado à linha no painel Sigma
  let rawServerName = pickField(raw, [
    "server_name",
    "server.name",
    "server_title",
    "server_display_name",
    "assigned_server",
    "servidor",
    "nome_servidor",
    "server_label",
  ]);

  if (!rawServerName && typeof raw?.server === "string") {
    const s = raw.server.trim();
    if (s && !isRawDomainOrUrl(s)) {
      rawServerName = s;
    }
  } else if (!rawServerName && typeof raw?.server === "object" && raw?.server?.name) {
    rawServerName = raw.server.name;
  }

  // 2. Extrai pacote ou plano da linha
  let rawPackageName = pickField(raw, [
    "package_name",
    "package.name",
    "plan_name",
    "plan.name",
    "package_title",
    "bouquet_name",
    "category_name",
    "pacote",
    "plano",
  ]);
  if (!rawPackageName && typeof raw?.package === "string") {
    rawPackageName = raw.package.trim();
  } else if (!rawPackageName && typeof raw?.package === "object" && raw?.package?.name) {
    rawPackageName = raw.package.name;
  }

  // 3. Extrai DNS / URL de transmissão diretamente do objeto da linha
  const extractedM3u = extractM3uFromRaw(raw);
  let rawDns = extractStreamingDnsFromRaw(raw) || pickField(raw, [
    "dns",
    "server_dns",
    "streaming_dns",
    "stream_url",
    "server_url",
    "server_info.url",
    "host",
    "domain",
  ]);
  if (rawDns && typeof rawDns === "string") {
    if (!isRawDomainOrUrl(rawDns)) {
      // Se não tem formato de URL/domínio, pode ter sido gravado o nome do servidor aqui
      if (!rawServerName) rawServerName = rawDns;
      rawDns = null;
    } else if (rawDns.includes("/sign-in") || rawDns.includes("#/")) {
      rawDns = null;
    }
  }

  // 4. Notas adicionais gravadas na linha
  const rawNotes = pickField(raw, ["notes", "note", "obs", "observacao", "observacoes", "comment", "description"]);

  const id = pickField(raw, ["id", "uuid", "customer_id", "client_id", "user_id", "uid", "member_id", "line_id"]);
  const username = String(pickField(raw, ["username", "user", "login", "uname", "iptv_username"]) ?? "");
  const finalId = id !== null ? String(id) : (username || null);
  if (!finalId && !username) return null;

  return {
    id: finalId ?? username,
    name: String(
      pickField(raw, ["name", "full_name", "customer_name", "display_name", "note", "admin_notes", "username"]) ??
        "Cliente do painel",
    ),
    phone: pickField(raw, ["whatsapp", "phone", "telephone", "mobile", "contact"]),
    email: pickField(raw, ["email", "mail"]),
    username: username,
    password: String(pickField(raw, ["password", "pass", "passwd", "iptv_password"]) ?? ""),
    screens: Number.isFinite(screensValue) && screensValue > 0 ? screensValue : null,
    dueDate: parseDate(
      pickField(raw, ["expiration_date", "expiry_date", "expiration", "exp_date", "due_date", "expires_at", "expires", "valid_until"]),
    ),
    status: normalizeStatus(pickField(raw, ["status", "state", "is_active", "isActive", "enabled"])),
    packageId: pickField(raw, ["package_id", "packageId", "plan_id", "plan", "bouquet"]),
    packageName: rawPackageName ? String(rawPackageName).trim() : null,
    serverName: rawServerName ? String(rawServerName).trim() : null,
    dns: rawDns ? normalizeIptvDns(String(rawDns).trim()) : null,
    m3uUrl: extractedM3u,
    notes: rawNotes ? String(rawNotes).trim() : null,
  };
}

// ============================================================
// Métodos de Gerenciamento do Painel Sigma
// ============================================================

/** Lista todos os clientes cadastrados no painel Sigma ou Xtream Codes. */
export async function listSigmaCustomers(config: SigmaConfig): Promise<SigmaCustomer[]> {
  const attempts: string[] = [];

  let user = (config.username ?? "").trim();
  let pass = config.password ?? "";
  if (!user && config.token?.startsWith("xtream:")) {
    const parts = config.token.slice(7).split(":");
    user = parts[0] ?? "";
    pass = parts.slice(1).join(":");
  }

  // 1. Se NÃO foi fornecido um token direto e temos usuário e senha, realiza login primeiro
  let token = config.token?.trim() || null;
  if (!token && user && pass) {
    // Se o login falhar (ex.: Cloudflare ou credenciais inválidas), interrompe imediatamente e avisa o usuário!
    token = await sigmaLogin(config.url, user, pass);
  }

  const effectiveConfig: SigmaConfig = token ? { ...config, token } : config;
  const candidateEndpoints: string[] = [];

  // Endpoints REST oficiais de clientes e linhas do Painel Sigma / XUI (PRIORIDADE MÁXIMA)
  candidateEndpoints.push(
    "/api/customers",
    "/api/lines",
    "/api/reseller/lines",
    "/api/reseller/customers",
    "/api/reseller/clients",
    "/api/resellers/lines",
    "/api/resellers/customers",
    "/api/reseller-api/v1/customers",
    "/api/reseller-api/v1/lines",
    "/api/v1/lines",
    "/api/v1/customers",
    "/api/v1/reseller/lines",
    "/api/v1/reseller/customers",
    "/api/clients",
    "/api/users",
    "/api/user/list",
    "/api/user/lines",
    "/api/subscribers",
    "/api/subresellers",
    "/api/members",
  );

  if (token && !token.startsWith("xtream:") && !token.startsWith("cookie:")) {
    const encToken = encodeURIComponent(token);
    candidateEndpoints.push(
      `/api/customers?token=${encToken}`,
      `/api/customers?api_token=${encToken}`,
      `/api/lines?token=${encToken}`,
      `/api/lines?api_token=${encToken}`,
      `/api/reseller/lines?token=${encToken}`,
    );
  }

  // Se tiver usuário e senha, tenta os endpoints legados de Xtream UI / Xtream Codes por ÚLTIMO
  if (user && pass) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);
    candidateEndpoints.push(
      `/panel_api.php?username=${u}&password=${p}&action=get_lines`,
      `/panel_api.php?username=${u}&password=${p}&action=get_users`,
      `/panel_api.php?username=${u}&password=${p}&action=user_list`,
      `/panel_api.php?username=${u}&password=${p}&action=manage_users`,
      `/player_api.php?username=${u}&password=${p}&action=get_lines`,
      `/player_api.php?username=${u}&password=${p}&action=get_users`,
    );
  }

  for (const endpoint of candidateEndpoints) {
    let result: HttpResult;
    try {
      result = await authorizedRequest(effectiveConfig, endpoint, { method: "GET" });
    } catch (error) {
      attempts.push(`${endpoint} -> ${error instanceof Error ? error.message : "erro"}`);
      continue;
    }
    if (!result.ok) {
      const errNote = result.text && result.text.length < 80 && !result.text.includes("<") ? ` (${result.text})` : "";
      attempts.push(`${endpoint} -> ${result.status}${errNote}`);
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
            "lines" in result.payload ||
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
        next = await authorizedRequest(effectiveConfig, `${endpoint}${separator}page=${page}&per_page=100`, { method: "GET" });
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

  // Analisa os erros ocorridos para apresentar um diagnóstico preciso ao usuário
  const cfBlocked = attempts.some((a) => /cloudflare|challenge|just a moment|cf-mitigated/i.test(a));
  const hasForbidden = attempts.some((a) => /403/.test(a));
  const hasUnauthorized = attempts.some((a) => /401/.test(a));
  const onlyNotFound = attempts.length > 0 && attempts.every((a) => /404/.test(a));

  // Se o painel estiver bloqueando por Cloudflare (ou 403 challenge)
  if (cfBlocked || (hasForbidden && !config.token)) {
    throw new Error(
      `O painel Sigma (${config.url}) está protegido pelo Cloudflare (Erro 403 / Captcha).\n\n` +
      `Como resolver:\n` +
      `1. O login automático via usuário/senha é barrado pelo antibot do Cloudflare.\n` +
      `2. Acesse seu painel Sigma no navegador, vá em "Configurações" ou "Integrações / API de Revenda" e gere seu "Token da API".\n` +
      `3. Cole esse token no campo "Token da API" em Servidor Sigma.`
    );
  }

  if (hasUnauthorized) {
    // Se falhou com 401 usando o token salvo/fornecido, mas temos usuário e senha, tenta login fresco!
    if (user && pass) {
      try {
        const freshToken = await sigmaLogin(config.url, user, pass);
        if (freshToken) {
          config.token = freshToken;
          return await listSigmaCustomers({ ...config, token: freshToken });
        }
      } catch (loginErr) {
        throw new Error(
          `Acesso não autorizado ao painel Sigma (Erro 401).\n` +
          `A tentativa de renovar a sessão com usuário e senha falhou: ${loginErr instanceof Error ? loginErr.message : "credenciais inválidas"}.\n` +
          `Verifique o usuário/senha ou o Token da API nas Configurações do Servidor Sigma.`
        );
      }
    }

    throw new Error(
      `Acesso não autorizado ao painel Sigma (Erro 401).\n` +
      `Verifique se o usuário/senha ou o Token da API fornecidos estão corretos e ativos.`
    );
  }

  // Se for apenas 404 em tudo, verifica se o usuário digitou o host de streaming em vez do painel
  if (onlyNotFound) {
    const isStreamHost = /karen256\.top|\bcdn\b|\bstream\b|\bplay\b/i.test(config.url);
    if (isStreamHost) {
      throw new Error(
        `O endereço "${config.url}" aparenta ser o servidor de streaming/transmissão (DNS), e não o painel de gerenciamento de revenda onde você cria as linhas.\n\n` +
        `Coloque a URL do painel onde você faz login (ex.: https://aplicativoz342.click) no campo "Endereço do Painel", e mantenha "${config.url}" no campo "DNS de Transmissão".`
      );
    }
    throw new Error(
      `Nenhum dos endpoints de listagem de clientes respondeu em ${config.url} (todas retornaram 404). Verifique se o endereço do painel de revenda está correto.`
    );
  }

  // Prioriza exibir erros que não sejam 404
  const informativeAttempts = attempts.filter((a) => !a.includes(" -> 404"));
  const displayAttempts = informativeAttempts.length > 0 ? informativeAttempts.slice(0, 4) : attempts.slice(0, 4);

  throw new Error(
    `Não consegui listar os clientes do painel. Respostas: ${displayAttempts.join(" • ") || "nenhuma"}.`,
  );
}

function normalizeIptvDns(urlStr: string): string {
  if (!urlStr) return "";
  let cleaned = urlStr.trim().split("#")[0].split("?")[0].replace(/\/+$/, "");
  const hasHttps = /^https:\/\//i.test(cleaned);
  const proto = hasHttps ? "https://" : "http://";
  cleaned = cleaned.replace(/^https?:\/\//i, "");
  const hostPart = cleaned.split("/")[0]?.trim() ?? "";
  if (!hostPart) return "";
  return `${proto}${hostPart}`;
}

/**
 * Tenta descobrir todos os detalhes do painel Sigma diretamente de dentro da sua API:
 * - Nome oficial do servidor / marca do revendedor
 * - DNS / URL oficial de streaming para os aplicativos
 * - Créditos restantes
 * - Pacotes / planos disponíveis
 * - Servidores cadastrados
 */
export async function fetchSigmaPanelDetails(config: SigmaConfig): Promise<SigmaPanelDetails> {
  const base = normalizeBaseUrl(config.url);
  const user = config.username?.trim();
  const pass = config.password ?? "";

  let discoveredServerName: string | null = null;
  let discoveredDns: string | null = null;
  let discoveredBrand: string | null = null;
  let discoveredCredits: number | null = null;
  const discoveredPackages: string[] = [];
  const discoveredServers: Array<{ id?: string | number; name: string; url?: string }> = [];

  // 0. Se acabamos de fazer login, aproveita os dados já retornados (servers_dns, credits)
  if (cachedLastLoginPayload) {
    const loginDns = extractStreamingDnsFromRaw(cachedLastLoginPayload);
    if (loginDns && !discoveredDns) discoveredDns = loginDns;
    if (cachedLastLoginPayload.credits != null && !Number.isNaN(Number(cachedLastLoginPayload.credits))) {
      discoveredCredits = Number(cachedLastLoginPayload.credits);
    }
  }

  // 1. Tenta endpoints de Xtream/Player API se tiver credenciais
  if (user && pass) {
    for (const xtreamPath of [
      `/panel_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
      `/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
    ]) {
      try {
        const res = await requestJson(base, xtreamPath, { method: "GET" }, 5000);
        if (res.ok && res.payload) {
          const p = res.payload;
          if (p.server_info) {
            const s = p.server_info;
            const sName = s.server_name || s.name || s.title;
            if (sName && typeof sName === "string" && !isRawDomainOrUrl(sName)) {
              if (!discoveredServerName) discoveredServerName = sName.trim();
            }
            const urlCandidate = s.url || s.server_dns || s.dns;
            if (urlCandidate && typeof urlCandidate === "string" && !urlCandidate.includes("/sign-in")) {
              if (!discoveredDns) discoveredDns = normalizeIptvDns(urlCandidate);
            } else if (s.server_ip) {
              const port = s.port ? `:${s.port}` : "";
              if (!discoveredDns) discoveredDns = `http://${s.server_ip}${port}`;
            }
          }
          if (p.user_info) {
            const u = p.user_info;
            if (u.credits != null && !Number.isNaN(Number(u.credits))) {
              discoveredCredits = Number(u.credits);
            }
          }
        }
      } catch {
        // tenta o próximo
      }
    }
  }

  // 2. Tenta endpoints REST de informações do servidor e perfil de revenda
  const candidateEndpoints = [
    "/api/auth/me",
    "/api/profile",
    "/api/resellers/me",
    "/api/reseller/me",
    "/api/reseller/profile",
    "/api/user/info",
    "/api/user/me",
    "/api/me",
    "/api/server-info",
    "/api/server/info",
    "/api/servers",
    "/api/dns",
    "/api/dashboard",
    "/api/reseller/dashboard",
    "/api/config",
  ];

  for (const endpoint of candidateEndpoints) {
    try {
      const res = await authorizedRequest(config, endpoint, { method: "GET" }, 4000);
      if (!res.ok || !res.payload) continue;

      const p = res.payload;

      // Nome do servidor ou da marca do painel
      const rawServer = pickField(p, [
        "server_name",
        "server.name",
        "brand_name",
        "brand",
        "panel_title",
        "panel_name",
        "site_name",
        "app_name",
        "server_info.server_name",
        "server_info.name",
        "server_info.title",
        "data.server_name",
        "data.brand_name",
        "data.panel_title",
        "data.server_info.server_name",
      ]);
      if (rawServer && typeof rawServer === "string" && !isRawDomainOrUrl(rawServer)) {
        if (!discoveredServerName) discoveredServerName = rawServer.trim();
      }

      // Créditos
      const rawCredits = pickField(p, ["credits", "balance", "credit", "data.credits", "data.balance"]);
      if (rawCredits != null && !Number.isNaN(Number(rawCredits))) {
        discoveredCredits = Number(rawCredits);
      }

      // DNS
      const dnsCandidate =
        extractStreamingDnsFromRaw(p) ||
        pickField(p, [
          "dns",
          "server_dns",
          "streaming_dns",
          "stream_url",
          "server_url",
          "server_info.url",
          "server_info.dns",
          "data.dns",
          "data.server_url",
          "data.streaming_dns",
        ]);
      if (dnsCandidate && typeof dnsCandidate === "string" && !dnsCandidate.includes("/sign-in")) {
        if (!discoveredDns) discoveredDns = normalizeIptvDns(dnsCandidate);
      }
    } catch {
      // continua tentando
    }
  }

  // 3. Consulta endpoints de servidores cadastrados no painel e DNS de streaming
  const serverEndpoints = [
    "/api/servers",
    "/api/server-info",
    "/api/server/info",
    "/api/dns",
    "/api/streaming-dns",
    "/api/streaming_dns",
    "/api/stream-dns",
    "/api/domains",
    "/api/reseller/dns",
    "/api/reseller/servers",
    "/api/resellers/dns",
    "/api/resellers/servers",
    "/api/lines/dns",
    "/api/panel/dns",
    "/api/settings/dns",
    "/api/links",
  ];

  for (const sEndpoint of serverEndpoints) {
    try {
      const res = await authorizedRequest(config, sEndpoint, { method: "GET" }, 4000);
      if (!res.ok || !res.payload) continue;

      const payloadDns = extractStreamingDnsFromRaw(res.payload);
      if (payloadDns && !discoveredDns) {
        discoveredDns = payloadDns;
      }

      const rows = extractRows(res.payload);
      for (const row of rows) {
        const sName = pickField(row, ["name", "server_name", "title", "label"]);
        const sUrl =
          extractStreamingDnsFromRaw(row) ||
          pickField(row, ["url", "dns", "server_url", "streaming_dns", "domain", "dns_list"]);
        if (sName && typeof sName === "string") {
          discoveredServers.push({
            id: row.id,
            name: sName.trim(),
            url: sUrl ? normalizeIptvDns(String(sUrl)) : undefined,
          });
          if (!discoveredServerName && !isRawDomainOrUrl(sName)) {
            discoveredServerName = sName.trim();
          }
          if (sUrl && !discoveredDns && !String(sUrl).includes("/sign-in")) {
            discoveredDns = normalizeIptvDns(String(sUrl));
          }
        }
        if (Array.isArray(row.packages)) {
          for (const pkg of row.packages) {
            const pName = pickField(pkg, ["name", "package_name", "title"]);
            if (pName && typeof pName === "string") {
              const cleaned = pName.trim();
              if (!discoveredPackages.includes(cleaned)) {
                discoveredPackages.push(cleaned);
              }
            }
          }
        }
      }
    } catch {}
  }

  // 4. Consulta pacotes disponíveis (/api/packages, /api/plans, /api/categories)
  for (const pkgEndpoint of ["/api/packages", "/api/plans", "/api/categories", "/api/bouquets"]) {
    try {
      const res = await authorizedRequest(config, pkgEndpoint, { method: "GET" }, 4000);
      if (!res.ok || !res.payload) continue;
      const rows = extractRows(res.payload);
      for (const row of rows) {
        const pName = pickField(row, ["name", "package_name", "title", "plan_name"]);
        if (pName && typeof pName === "string") {
          const cleaned = pName.trim();
          if (!discoveredPackages.includes(cleaned)) {
            discoveredPackages.push(cleaned);
          }
        }
      }
    } catch {}
  }

  // 5. Inspeciona as linhas dos clientes caso DNS ou Servidor ainda não tenham sido detectados
  if (!discoveredDns || !discoveredServerName) {
    for (const custEndpoint of [
      "/api/customers",
      "/api/reseller-api/v1/customers",
      "/api/resellers/customers",
      "/api/clients",
      "/api/users",
    ]) {
      try {
        const res = await authorizedRequest(config, custEndpoint, { method: "GET" }, 4000);
        if (!res.ok || !res.payload) continue;
        const rows = extractRows(res.payload);
        if (rows.length > 0) {
          for (const row of rows.slice(0, 15)) {
            const m3u = extractM3uFromRaw(row);
            if (m3u && !discoveredDns) {
              discoveredDns = normalizeIptvDns(m3u);
            }
            const dns = extractStreamingDnsFromRaw(row);
            if (dns && !discoveredDns) {
              discoveredDns = dns;
            }
            const sName = pickField(row, ["server", "server_name", "server.name"]);
            if (sName && typeof sName === "string" && !isRawDomainOrUrl(sName) && !discoveredServerName) {
              discoveredServerName = sName.trim();
            }
            const pkg = pickField(row, ["package", "package_name", "plan"]);
            if (pkg && typeof pkg === "string") {
              const cleaned = pkg.trim();
              if (!discoveredPackages.includes(cleaned)) {
                discoveredPackages.push(cleaned);
              }
            }
          }
          break;
        }
      } catch {}
    }
  }

  return {
    serverName: discoveredServerName,
    dns: discoveredDns,
    brandName: discoveredBrand,
    credits: discoveredCredits,
    packages: discoveredPackages,
    servers: discoveredServers,
  };
}

/**
 * Tenta descobrir o DNS/URL oficial de transmissão diretamente de dentro do painel Sigma.
 */
export async function fetchSigmaPanelDns(config: SigmaConfig): Promise<string | null> {
  const details = await fetchSigmaPanelDetails(config);
  return details.dns;
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

  const payload: any = {};
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


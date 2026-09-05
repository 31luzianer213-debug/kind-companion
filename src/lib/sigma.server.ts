/** Integração com painéis IPTV Sigma (server-only). */

export type SigmaConfig = { url: string; token?: string; username?: string | null; password?: string | null };

function normalizeBase(url: string) {
  let base = url.trim();
  if (!base) throw new Error("Endereço do painel Sigma não configurado.");
  // Se o usuário colou a URL da tela de login (ex: https://painel.com/#/sign-in?...),
  // corta o fragmento (#...) e query de redirect para sobrar só a origem do painel.
  const hashIdx = base.indexOf("#");
  if (hashIdx >= 0) base = base.slice(0, hashIdx);
  const qIdx = base.indexOf("?");
  // Mantém query apenas se for raiz? Por segurança remove query de redirect.
  if (qIdx >= 0 && /sign-in|redirect|login/i.test(base)) base = base.slice(0, qIdx);
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/+$/, "");
  // Remove sufixos de tela de login que o usuário pode ter colado
  base = base.replace(/\/(#\/)?(sign-in|login|dashboard)(\/.*)?$/i, "");
  return base.replace(/\/+$/, "");
}

async function sigmaFetchWithToken(token: string, base: string, path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.trim()}`,
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Usuário/senha do painel Sigma inválidos ou sem permissão.");
    }
    if (response.status === 404) {
      throw new Error("Endereço do painel Sigma não encontrado (verifique a URL).");
    }
    const detail = payload?.message ?? payload?.error ?? text.slice(0, 160);
    throw new Error(`Painel Sigma respondeu ${response.status}: ${detail || "erro desconhecido"}`);
  }

  if (payload === null && text) {
    throw new Error("O painel respondeu em formato inesperado. Confira se a URL é a do painel Sigma.");
  }
  return payload;
}

async function sigmaFetch(config: SigmaConfig, path: string, init?: RequestInit) {
  const base = normalizeBase(config.url);
  const token = await ensureSigmaToken(config);

  try {
    return await sigmaFetchWithToken(token, base, path, init);
  } catch (error) {
    // Se o token salvo expirou e temos usuário/senha, tenta logar de novo uma vez
    const hasCredentials = config.username?.trim() && config.password?.trim();
    const isAuthError =
      error instanceof Error && /inválidos|sem permissão|401|403|expir/i.test(error.message);
    if (hasCredentials && isAuthError && config.token?.trim() && token === config.token.trim()) {
      const fresh = await sigmaLogin(base, config.username!.trim(), config.password!.trim());
      return await sigmaFetchWithToken(fresh, base, path, init);
    }
    throw error;
  }
}

/** Procura um token em respostas com formatos variados. */
function findToken(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const keys = [
    "token",
    "access_token",
    "accessToken",
    "api_token",
    "apiToken",
    "auth_token",
    "authToken",
    "jwt",
    "bearer",
    "session_token",
    "sessionToken",
  ];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 5) return value.trim();
  }
  for (const nest of ["data", "user", "result", "payload", "auth"]) {
    const nested = payload[nest];
    if (nested && typeof nested === "object") {
      const found = findToken(nested);
      if (found) return found;
    }
  }
  return null;
}

/** Faz login no painel com usuário + senha e devolve o token. */
export async function sigmaLogin(url: string, username: string, password: string): Promise<string> {
  const base = normalizeBase(url);
  const user = username.trim();
  const pass = password.trim();
  if (!user || !pass) throw new Error("Informe o usuário e a senha do painel.");

  const endpoints = [
    "/api/login",
    "/api/auth/login",
    "/api/sign-in",
    "/api/signin",
    "/api/session",
    "/api/sessions",
    "/api/token",
    "/api/auth",
    "/api/authenticate",
    "/api/v1/login",
    "/api/v1/auth/login",
  ];

  const payloadVariants: Record<string, string>[] = [
    { username: user, password: pass },
    { email: user, password: pass },
    { login: user, password: pass },
    { user: user, password: pass },
    { username: user, pass: pass },
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    for (const body of payloadVariants) {
      try {
        const response = await fetch(`${base}${endpoint}`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403 || response.status === 422) {
            lastError = new Error("Usuário ou senha do painel incorretos.");
          } else if (response.status !== 404 && response.status !== 405) {
            const text = await response.text().catch(() => "");
            lastError = new Error(
              `Painel respondeu ${response.status} no login: ${text.slice(0, 120) || "erro desconhecido"}`,
            );
          }
          continue;
        }
        const text = await response.text();
        let payload: any = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          continue;
        }
        const token = findToken(payload);
        if (token) return token;
        lastError = new Error("O painel respondeu ao login mas não devolveu um token.");
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Falha ao conectar no painel.");
      }
    }
  }

  throw lastError ?? new Error("Não foi possível fazer login no painel. Confira URL, usuário e senha.");
}

/** Resolve o token: usa o salvo ou faz login com usuário + senha. */
export async function ensureSigmaToken(config: SigmaConfig): Promise<string> {
  if (config.token?.trim()) return config.token.trim();
  if (config.username?.trim() && config.password?.trim()) {
    return await sigmaLogin(config.url, config.username, config.password);
  }
  throw new Error("Informe o usuário e a senha do painel Sigma.");
}

export type SigmaCustomer = {
  id: string;
  name: string;
  phone: string | null;
  username: string | null;
  password: string | null;
  screens: number | null;
  dueDate: string | null;
  status: string | null;
};

function pick(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = key.split(".").reduce((acc: any, part) => (acc == null ? acc : acc[part]), obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function toDate(value: any): string | null {
  if (!value) return null;
  const date = new Date(typeof value === "number" ? value * 1000 : String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function mapCustomer(raw: any): SigmaCustomer | null {
  const id = pick(raw, ["id", "uuid", "customer_id", "client_id"]);
  if (id === null) return null;
  return {
    id: String(id),
    name: String(pick(raw, ["name", "full_name", "customer_name", "note", "username"]) ?? "Cliente Sigma"),
    phone: pick(raw, ["whatsapp", "phone", "telephone", "mobile", "contact"]) as string | null,
    username: pick(raw, ["username", "user", "login", "credentials.username"]) as string | null,
    password: pick(raw, ["password", "pass", "credentials.password"]) as string | null,
    screens: Number(pick(raw, ["connections", "screens", "max_connections", "connection_limit"]) ?? 0) || null,
    dueDate: toDate(pick(raw, ["expires_at", "expire_at", "expiration", "exp_date", "due_date", "expires"])),
    status: (pick(raw, ["status", "state"]) as string | null) ?? null,
  };
}

function extractList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "customers", "items", "results", "clients"]) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
  }
  return [];
}

/** Busca todos os clientes do painel (paginado). */
export async function listSigmaCustomers(config: SigmaConfig): Promise<SigmaCustomer[]> {
  const all: SigmaCustomer[] = [];
  for (let page = 1; page <= 20; page++) {
    const payload = await sigmaFetch(config, `/api/customers?page=${page}&per_page=100`);
    const rows = extractList(payload);
    if (rows.length === 0) break;
    for (const row of rows) {
      const mapped = mapCustomer(row);
      if (mapped) all.push(mapped);
    }
    const lastPage = Number(payload?.meta?.last_page ?? payload?.last_page ?? 0);
    if (rows.length < 100 || (lastPage && page >= lastPage)) break;
  }
  return all;
}

/** Renova o cliente no painel Sigma por N meses. */
export async function renewSigmaCustomer(config: SigmaConfig, customerId: string, months = 1) {
  const attempts: Array<[string, Record<string, unknown>]> = [
    [`/api/customers/${customerId}/renew`, { months }],
    [`/api/customers/${customerId}/renewal`, { months, period: months }],
  ];
  let lastError: Error | null = null;
  for (const [path, body] of attempts) {
    try {
      await sigmaFetch(config, path, { method: "POST", body: JSON.stringify(body) });
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Falha ao renovar no painel.");
    }
  }
  throw lastError ?? new Error("Falha ao renovar no painel Sigma.");
}

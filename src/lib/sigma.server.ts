/** Integração com painéis IPTV Sigma (server-only). */

export type SigmaConfig = { url: string; token: string };

function normalizeBase(url: string) {
  let base = url.trim();
  if (!base) throw new Error("Endereço do painel Sigma não configurado.");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/+$/, "");
}

async function sigmaFetch(config: SigmaConfig, path: string, init?: RequestInit) {
  const base = normalizeBase(config.url);
  if (!config.token?.trim()) throw new Error("Token do painel Sigma não configurado.");

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token.trim()}`,
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
      throw new Error("Token do painel Sigma inválido ou sem permissão.");
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

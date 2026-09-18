import type { QueryClient } from "@tanstack/react-query";

/**
 * Persistência leve do cache de consultas em sessionStorage.
 *
 * Objetivo: ao voltar para uma página já visitada (Sigma, Clientes, Cobranças...),
 * os dados salvos aparecem na hora, enquanto a atualização acontece em segundo plano.
 */

const STORAGE_KEY = "sigma-control:query-cache:v1";
const MAX_AGE_MS = 10 * 60_000;

// Apenas listas de trabalho — nada sensível de sessão/autenticação.
const PERSISTED_KEYS = new Set([
  "sigma-servers",
  "sigma-sync-overview",
  "clients",
  "bot-settings",
  "sidebar-counts",
  "dashboard-v2",
  "operational-dashboard",
  "invoices",
  "cobrancas",
  "orders",
  "message-templates",
  "reseller-context",
]);

type Entry = { key: unknown[]; data: unknown; at: number };

function rootKey(key: readonly unknown[]): string | null {
  const first = key[0];
  return typeof first === "string" ? first : null;
}

function shouldPersist(key: readonly unknown[]): boolean {
  const root = rootKey(key);
  return !!root && PERSISTED_KEYS.has(root);
}

export function hydrateQueryCache(queryClient: QueryClient): void {
  if (typeof window === "undefined") return;
  let entries: Entry[] = [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    entries = parsed as Entry[];
  } catch {
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.key) || typeof entry.at !== "number") continue;
    if (now - entry.at > MAX_AGE_MS) continue;
    if (!shouldPersist(entry.key)) continue;
    // Não sobrescreve dados já carregados nesta sessão de navegação.
    if (queryClient.getQueryData(entry.key) !== undefined) continue;
    queryClient.setQueryData(entry.key, entry.data, { updatedAt: entry.at });
  }
}

export function startQueryCachePersistence(queryClient: QueryClient): () => void {
  if (typeof window === "undefined") return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    try {
      const entries: Entry[] = [];
      for (const query of queryClient.getQueryCache().getAll()) {
        const key = query.queryKey as unknown[];
        if (!shouldPersist(key)) continue;
        const data = query.state.data;
        if (data === undefined) continue;
        entries.push({ key, data, at: query.state.dataUpdatedAt || Date.now() });
      }
      if (entries.length === 0) return;
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Cota cheia ou dado não serializável: cache persistente é só otimização.
    }
  };

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(flush, 800);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && shouldPersist(event.query.queryKey as unknown[])) schedule();
  });

  window.addEventListener("pagehide", flush);

  return () => {
    unsubscribe();
    window.removeEventListener("pagehide", flush);
    if (timer) clearTimeout(timer);
  };
}

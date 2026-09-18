import type { QueryClient } from "@tanstack/react-query";

/**
 * Persistência leve do cache de consultas em localStorage, isolada por usuário.
 *
 * Objetivo: ao voltar para uma página já visitada (Sigma, Clientes, Cobranças...),
 * os dados salvos aparecem na hora, enquanto a atualização acontece em segundo plano.
 */

const STORAGE_PREFIX = "sigma-control:query-cache:v3";
const LEGACY_STORAGE_KEY = "sigma-control:query-cache:v1";
const ACTIVE_USER_KEY = "sigma-control:query-cache:active-user";
const MAX_AGE_MS = 24 * 60 * 60_000;

// Apenas listas de trabalho — nada sensível de sessão/autenticação.
const PERSISTED_KEYS = new Set([
  "sigma-servers",
  "sigma-sync-health",
  "sigma-clients-list",
  "clients",
  "operational-clients",
  "operational-dashboard",
  "dashboard-v2",
  "dashboard-kpis",
  "sidebar-counts",
  "invoices",
  "orders-list",
  "billing-rules",
  "bot-settings",
  "payment-settings",
  "whatsapp-settings",
  "activities",
  "reseller-trial-server-settings",
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

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function hydrateQueryCache(queryClient: QueryClient, userId: string): void {
  if (typeof window === "undefined") return;
  let entries: Entry[] = [];
  try {
    const previousUserId = window.sessionStorage.getItem(ACTIVE_USER_KEY);
    if (previousUserId && previousUserId !== userId) {
      queryClient.removeQueries({
        predicate: (query) => shouldPersist(query.queryKey),
      });
    }
    window.sessionStorage.setItem(ACTIVE_USER_KEY, userId);

    // Remove o cache antigo, que não sobrevivia ao fechamento do navegador
    // e não era separado por conta.
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(storageKey(userId));
      return;
    }
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

export function startQueryCachePersistence(queryClient: QueryClient, userId: string): () => void {
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
      window.localStorage.setItem(storageKey(userId), JSON.stringify(entries));
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

  const flushWhenHidden = () => {
    if (document.visibilityState === "hidden") flush();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", flushWhenHidden);

  return () => {
    flush();
    unsubscribe();
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", flushWhenHidden);
    if (timer) clearTimeout(timer);
  };
}

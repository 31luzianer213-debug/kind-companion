import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSigmaSettings, syncSigmaClients } from "./sigma.functions";

/**
 * Hook global que mantém o sistema 100% sincronizado com o Painel Sigma:
 * 1. Ao focar na janela/aba (quando você adiciona ou altera no Sigma e volta para o site).
 * 2. Em intervalos periódicos em segundo plano (a cada 60 segundos).
 * 3. Notifica com toast amigável quando novos clientes são detectados no Sigma.
 * 4. Atualiza imediatamente o cache de clientes, cobranças e contadores.
 */
export function useSigmaAutoSync() {
  const queryClient = useQueryClient();
  const getSigma = useServerFn(getSigmaSettings);
  const syncSigma = useServerFn(syncSigmaClients);

  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(Date.now());

  // Consulta se o Sigma está configurado
  const { data: sigmaSettings } = useQuery({
    queryKey: ["sigma-settings"],
    queryFn: async () => {
      const res = await getSigma({});
      return res.ok ? res.settings : null;
    },
    staleTime: 60000,
  });

  const isConfigured = Boolean(sigmaSettings?.isConfigured);

  async function runSync(options: { silent?: boolean; reason?: string } = {}) {
    if (!isConfigured || isSyncingRef.current) return;

    // Limite mínimo de 15 segundos entre chamadas para evitar duplicidade
    const now = Date.now();
    if (now - lastSyncTimeRef.current < 15000 && !options.reason?.includes("force")) {
      return;
    }

    isSyncingRef.current = true;
    try {
      const res = await syncSigma({ data: {} });
      lastSyncTimeRef.current = Date.now();

      if (res.ok) {
        if (res.created > 0) {
          const names = res.createdNames?.slice(0, 3).join(", ") || "";
          const msg =
            res.created === 1
              ? `🎉 Novo cliente importado do Sigma: ${names}`
              : `🎉 ${res.created} novos clientes importados do Painel Sigma! (${names})`;
          toast.success(msg, { duration: 6000 });
        }

        if (res.created > 0 || res.updated > 0) {
          queryClient.invalidateQueries({ queryKey: ["clients"] });
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          queryClient.invalidateQueries({ queryKey: ["sigma-clients-list"] });
          queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
        }
      }
    } catch {
      // Falha silenciosa para não incomodar o usuário durante navegação
    } finally {
      isSyncingRef.current = false;
    }
  }

  // 1. Sincroniza ao carregar a página
  useEffect(() => {
    if (!isConfigured) return;
    const timer = setTimeout(() => {
      runSync({ silent: true, reason: "mount" });
    }, 2000);
    return () => clearTimeout(timer);
  }, [isConfigured]);

  // 2. Sincroniza ao focar na aba / janela (quando você adiciona no Sigma e volta para o site)
  useEffect(() => {
    if (!isConfigured) return;

    const onFocus = () => {
      runSync({ silent: true, reason: "window-focus" });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runSync({ silent: true, reason: "tab-visible" });
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isConfigured]);

  // 3. Heartbeat periódico a cada 60 segundos
  useEffect(() => {
    if (!isConfigured) return;

    const interval = setInterval(() => {
      runSync({ silent: true, reason: "interval" });
    }, 60000);

    return () => clearInterval(interval);
  }, [isConfigured]);

  return {
    isConfigured,
    triggerSync: () => runSync({ silent: false, reason: "force" }),
  };
}

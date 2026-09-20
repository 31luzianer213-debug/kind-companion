import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { DesktopNavigation, MobileBottomNavigation, MobileDrawer } from "@/components/layout/AppNavigation";
import { MobileClientDelete } from "@/components/clients/MobileClientDelete";
import { SigmaLogo } from "@/components/SigmaLogo";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getWhatsAppStatus } from "@/lib/whatsapp.functions";
import { listSigmaServers } from "@/lib/sigma-servers.functions";
import { getOrdersList } from "@/lib/orders.functions";
import { startQueryCachePersistence } from "@/lib/query-cache-persist";
import "../mobile-app.css";

const mobilePageTitles: Record<string, string> = {
  "/painel": "Início",
  "/clientes": "Clientes",
  "/pedidos": "Pedidos",
  "/cobrancas": "Cobranças",
  "/sigma": "Sigma",
  "/whatsapp": "WhatsApp",
  "/bot": "Robô WhatsApp",
  "/configuracoes": "Configurações",
  "/indicadores": "Indicadores",
  "/clientes-operacao": "Operações",
  "/atividades": "Atividades",
  "/cobranca-automatica": "Automação",
  "/sigma-sincronizacao": "Sincronização",
  "/whatsapp-diagnostico": "Diagnóstico",
  "/mensagens": "Mensagens",
  "/pagamentos": "Recebimentos",
  "/assinatura": "Assinatura",
};

function mobilePageTitle(pathname: string) {
  const direct = mobilePageTitles[pathname];
  if (direct) return direct;
  const entry = Object.entries(mobilePageTitles).find(([route]) => pathname.startsWith(`${route}/`));
  return entry?.[1] ?? "Sigma Control";
}

async function getPendingOrderCount(
  listOrders: (args: { data: { status?: string } }) => Promise<{ orders?: { id: string }[] }>,
) {
  const payload = await listOrders({ data: { status: "pending" } });
  return Array.isArray(payload?.orders) ? payload.orders.length : 0;
}


export function AppLayout({ children, userId }: { children: ReactNode; userId: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const statusFn = useServerFn(getWhatsAppStatus);
  const ordersFn = useServerFn(getOrdersList);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setEmail(data.user?.email ?? null);
      })
      .catch(() => {
        if (active) setEmail(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawerOpen]);

  const { data: counts } = useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: async () => {
      const [pendingOrders, clients, overdueInvoices, sigmaClients] = await Promise.all([
        getPendingOrderCount(ordersFn),
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("clients").select("id", { count: "exact", head: true }).not("sigma_customer_id", "is", null),
      ]);
      return {
        pendingOrders,
        clients: clients.count ?? 0,
        overdueInvoices: overdueInvoices.count ?? 0,
        sigmaClients: sigmaClients.count ?? 0,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: whatsappStatus } = useQuery({
    queryKey: ["layout-whatsapp-status"],
    queryFn: () => statusFn({ data: { origin: typeof window !== "undefined" ? window.location.origin : undefined } }),
    enabled: pathname === "/painel" || pathname.startsWith("/whatsapp"),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  // Carrega a lista de servidores Sigma em segundo plano logo que o painel abre,
  // para que a página Sigma já mostre os servidores salvos ao ser aberta.
  const queryClient = useQueryClient();
  const prefetchSigmaFn = useServerFn(listSigmaServers);
  useEffect(() => startQueryCachePersistence(queryClient, userId), [queryClient, userId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: ["sigma-servers"],
        queryFn: async () => {
          const res = await prefetchSigmaFn({});
          return res?.ok && Array.isArray(res.servers) ? res.servers : [];
        },
        staleTime: 60_000,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [prefetchSigmaFn, queryClient]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const navigationProps = {
    pathname,
    counts,
    email,
    isWhatsAppConnected: whatsappStatus?.state === "open",
    onSignOut: signOut,
  };

  return (
    <div className="app-aurora mobile-native-shell min-h-[100dvh] bg-background text-foreground md:flex">
      <header className="mobile-app-header sticky top-0 z-30 flex min-h-[62px] items-center justify-between border-b border-border bg-background/94 px-4 py-2 backdrop-blur-xl md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card shadow-sm">
            <SigmaLogo size="sm" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Sigma Control</p>
            <h1 className="truncate font-display text-[15px] font-bold text-foreground">{mobilePageTitle(pathname)}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <GlobalSearch enableShortcut={false} />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu principal"
          aria-expanded={drawerOpen}
          className="size-10 rounded-lg border border-border bg-card"
        >
          <Menu className="size-5" />
        </Button>
        </div>
      </header>

      <div className="pointer-events-none fixed right-6 top-4 z-40 hidden md:block">
        <div className="pointer-events-auto">
          <GlobalSearch />
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fechar menu"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="mobile-menu-sheet absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border border-b-0 border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            <div className="mx-auto mb-1 h-1.5 w-11 rounded-full bg-muted-foreground/20" />
            <div className="flex items-center justify-between pb-1">
              <div>
                <p className="text-xs font-extrabold text-foreground">Menu</p>
                <p className="text-[10px] text-muted-foreground">Acesso rápido às áreas do app</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu" className="size-10 rounded-xl">
                <X className="size-5" />
              </Button>
            </div>
            <MobileDrawer {...navigationProps} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-[100dvh] w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <DesktopNavigation {...navigationProps} />
      </aside>

      <main className="relative min-w-0 flex-1 overflow-x-hidden">
        <div className="mobile-app-content relative mx-auto min-h-full w-full max-w-[1480px] px-3 pb-28 pt-3 sm:px-5 sm:pt-5 md:px-7 md:pb-12 md:pt-7 lg:px-9 xl:px-10">
          {children}
        </div>
      </main>

      {pathname === "/clientes" ? <MobileClientDelete /> : null}

      <MobileBottomNavigation
        pathname={pathname}
        counts={counts}
        isWhatsAppConnected={whatsappStatus?.state === "open"}
        onOpenMenu={() => setDrawerOpen(true)}
      />
    </div>
  );
}

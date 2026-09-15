import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import defaultOrdersSeed from "../../data/orders_default.json";
import { DesktopNavigation, MobileBottomNavigation, MobileDrawer } from "@/components/layout/AppNavigation";
import { MobileClientDelete } from "@/components/clients/MobileClientDelete";
import { SigmaLogo } from "@/components/SigmaLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getWhatsAppStatus } from "@/lib/whatsapp.functions";
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
};

function mobilePageTitle(pathname: string) {
  const direct = mobilePageTitles[pathname];
  if (direct) return direct;
  const entry = Object.entries(mobilePageTitles).find(([route]) => pathname.startsWith(`${route}/`));
  return entry?.[1] ?? "Sigma Control";
}

function getDeletedOrderIds() {
  const ids = new Set<string>();
  if (typeof window === "undefined") return ids;
  try {
    const stored = localStorage.getItem("iptv_deleted_orders");
    const parsed = stored ? JSON.parse(stored) : [];
    if (Array.isArray(parsed)) parsed.forEach((id) => ids.add(String(id)));
  } catch {
    // A malformed local cache must not prevent the application shell from rendering.
  }
  return ids;
}

async function getPendingOrderCount() {
  const deletedIds = getDeletedOrderIds();
  try {
    const response = await fetch("/api/public/orders?status=pending");
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload?.orders)) {
        return payload.orders.filter((order: { id: string }) => !deletedIds.has(order.id)).length;
      }
    }
  } catch {
    // The bundled seed keeps the navigation usable while the public endpoint is offline.
  }

  return Array.isArray(defaultOrdersSeed)
    ? defaultOrdersSeed.filter((order) => order.status === "pending" && !deletedIds.has(order.id)).length
    : 0;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const statusFn = useServerFn(getWhatsAppStatus);
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
        getPendingOrderCount(),
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
      <header className="mobile-app-header sticky top-0 z-30 flex min-h-[58px] items-center justify-between border-b border-border/45 bg-background/88 px-3.5 py-2 backdrop-blur-2xl md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-card/80 shadow-sm">
            <SigmaLogo size="sm" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Sigma Control</p>
            <h1 className="truncate text-[15px] font-extrabold tracking-tight text-foreground">{mobilePageTitle(pathname)}</h1>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu principal"
          aria-expanded={drawerOpen}
          className="size-10 rounded-xl border border-border/55 bg-card/70"
        >
          <Menu className="size-5" />
        </Button>
      </header>

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
            className="mobile-menu-sheet absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col rounded-t-[28px] border border-b-0 border-border/65 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl animate-in slide-in-from-bottom duration-200"
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

      <aside className="sticky top-0 hidden h-[100dvh] w-[276px] shrink-0 flex-col border-r border-border/60 bg-sidebar/92 p-4 backdrop-blur-xl md:flex">
        <DesktopNavigation {...navigationProps} />
      </aside>

      <main className="relative min-w-0 flex-1 overflow-x-hidden">
        <div className="pointer-events-none absolute inset-0 hidden app-grid opacity-[0.14] md:block" />
        <div className="mobile-app-content relative mx-auto min-h-full w-full max-w-[1600px] px-3 pb-28 pt-3 sm:px-5 sm:pt-5 md:px-8 md:pb-12 md:pt-8 lg:px-10 xl:px-12">
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

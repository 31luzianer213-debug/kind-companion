import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import defaultOrdersSeed from "../../data/orders_default.json";
import { AppBrand, DesktopNavigation, MobileBottomNavigation, MobileDrawer } from "@/components/layout/AppNavigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { getWhatsAppStatus } from "@/lib/whatsapp.functions";

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
    <div className="app-aurora min-h-[100dvh] bg-background text-foreground md:flex">
      <header className="mobile-app-header sticky top-0 z-30 flex min-h-[64px] items-center justify-between border-b border-border/60 bg-background/90 px-4 py-2.5 shadow-sm backdrop-blur-xl md:hidden">
        <AppBrand compact />
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu principal"
            aria-expanded={drawerOpen}
            className="size-10 rounded-xl"
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fechar menu"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="absolute inset-y-0 right-0 flex w-[min(92vw,380px)] flex-col border-l border-border/70 bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-right duration-200"
          >
            <div className="mb-2 flex justify-end">
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
        <div className="relative mx-auto min-h-full w-full max-w-[1600px] px-3 pb-24 pt-4 sm:px-5 sm:pt-5 md:px-8 md:pb-12 md:pt-8 lg:px-10 xl:px-12">
          {children}
        </div>
      </main>

      <MobileBottomNavigation
        pathname={pathname}
        counts={counts}
        isWhatsAppConnected={whatsappStatus?.state === "open"}
        onOpenMenu={() => setDrawerOpen(true)}
      />
    </div>
  );
}

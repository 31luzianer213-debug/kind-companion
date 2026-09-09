import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SigmaLogo } from "@/components/SigmaLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getWhatsAppStatus } from "@/lib/whatsapp.functions";
import { useSigmaAutoSync } from "@/lib/useSigmaAutoSync";
import {
  Users,
  Receipt,
  Settings,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  Sparkles,
  Server,
  MessageCircle,
  CreditCard,
  ChevronRight,
  Bot,
  ShoppingBag,
} from "lucide-react";
import defaultOrdersSeed from "../../data/orders_default.json";

const navGroups = [
  {
    title: "Principal",
    items: [
      { to: "/painel", label: "Painel Geral", icon: LayoutDashboard, badgeKey: null },
    ],
  },
  {
    title: "Operação & Vendas",
    items: [
      { to: "/pedidos", label: "Pedidos & PIX", icon: ShoppingBag, badgeKey: "orders" },
      { to: "/clientes", label: "Clientes & Linhas", icon: Users, badgeKey: "clients" },
      { to: "/cobrancas", label: "Cobranças", icon: Receipt, badgeKey: "invoices" },
    ],
  },
  {
    title: "Automação & Robô",
    items: [
      { to: "/sigma", label: "Servidor Sigma", icon: Server, badgeKey: "sigma" },
      { to: "/bot", label: "Robô WhatsApp", icon: Bot, badgeKey: null },
      { to: "/whatsapp", label: "Conexão WhatsApp", icon: MessageCircle, badgeKey: "whatsapp" },
    ],
  },
  {
    title: "Configurações",
    items: [
      { to: "/pagamentos", label: "Formas de Pagamento", icon: CreditCard, badgeKey: null },
      { to: "/mensagens", label: "Modelos de Mensagem", icon: Sparkles, badgeKey: null },
      { to: "/configuracoes", label: "Ajustes Gerais", icon: Settings, badgeKey: null },
    ],
  },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const statusFn = useServerFn(getWhatsAppStatus);

  // Mantém os clientes e linhas do Painel Sigma automaticamente sincronizados em segundo plano
  useSigmaAutoSync();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Quick counts for sidebar badges
  const { data: counts } = useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: async () => {
      let pendingOrdersCount = 0;
      let loadedFromApi = false;
      let deletedIds = new Set<string>();
      try {
        const raw = typeof window !== "undefined" ? localStorage.getItem("iptv_deleted_orders") : null;
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) arr.forEach((id: string) => deletedIds.add(id));
        }
      } catch {}

      try {
        const res = await fetch("/api/public/orders?status=pending");
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.orders)) {
            const valid = json.orders.filter((o: any) => !deletedIds.has(o.id));
            pendingOrdersCount = valid.length;
            loadedFromApi = true;
          }
        }
      } catch {}

      if (!loadedFromApi && Array.isArray(defaultOrdersSeed)) {
        pendingOrdersCount = (defaultOrdersSeed as any[]).filter(
          (o) => o.status === "pending" && !deletedIds.has(o.id),
        ).length;
      }

      const [clientsRes, invoicesRes, sigmaClientsRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("clients").select("id", { count: "exact", head: true }).not("sigma_customer_id", "is", null),
      ]);

      return {
        clients: clientsRes.count ?? 0,
        overdueInvoices: invoicesRes.count ?? 0,
        sigmaClients: sigmaClientsRes.count ?? 0,
        pendingOrders: pendingOrdersCount,
      };
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });

  // WhatsApp status
  const { data: waStatus } = useQuery({
    queryKey: ["layout-whatsapp-status"],
    queryFn: () =>
      statusFn({
        data: { origin: typeof window !== "undefined" ? window.location.origin : undefined },
      }),
    staleTime: 60000,
    refetchInterval: 120000,
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const isWaConnected = waStatus?.state === "open";

  const brand = (
    <Link to="/painel" className="group flex items-center gap-3 transition-opacity hover:opacity-95">
      <SigmaLogo size="md" />
      <div className="leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-black tracking-tight text-foreground group-hover:text-primary transition-colors">
            Painel Sigma
          </span>
          <span className="rounded-md bg-primary text-primary-foreground px-1.5 py-0.5 text-[9px] font-black tracking-wider shadow-sm">
            PRO
          </span>
        </div>
        <span className="block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Gestor & Automação IPTV
        </span>
      </div>
    </Link>
  );

  const whatsappBadge = (
    <Link
      to="/whatsapp"
      className={cn(
        "group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
        isWaConnected
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15"
          : "border-border bg-card/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {isWaConnected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              isWaConnected ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600",
            )}
          />
        </span>
        <span className="truncate font-semibold">
          {isWaConnected ? "WhatsApp Online" : "WhatsApp Desconectado"}
        </span>
      </div>
      <ChevronRight className="h-3.5 w-3.5 opacity-60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );

  const links = (
    <nav className="flex flex-col gap-4">
      {navGroups.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            {group.title}
          </p>
          {group.items.map(({ to, label, icon: Icon, badgeKey }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            let badgeCount: number | null = null;
            let badgeType: "orders" | "overdue" | "clients" | "whatsapp" | null = null;

            if (badgeKey === "orders" && (counts?.pendingOrders ?? 0) > 0) {
              badgeCount = counts?.pendingOrders ?? null;
              badgeType = "orders";
            } else if (badgeKey === "invoices" && (counts?.overdueInvoices ?? 0) > 0) {
              badgeCount = counts?.overdueInvoices ?? null;
              badgeType = "overdue";
            } else if (badgeKey === "clients" && (counts?.clients ?? 0) > 0) {
              badgeCount = counts?.clients ?? null;
              badgeType = "clients";
            }

            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105",
                    active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span className="flex-1 truncate">{label}</span>
                {badgeCount !== null && (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono tracking-tight",
                      badgeType === "orders"
                        ? active
                          ? "bg-amber-400 text-black font-black animate-pulse"
                          : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse font-extrabold"
                        : badgeType === "overdue"
                        ? active
                          ? "bg-rose-400 text-black font-black"
                          : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                        : active
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {badgeCount}
                  </span>
                )}
                {badgeKey === "whatsapp" && isWaConnected && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500" title="Conectado" />
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-3 pt-6 border-t border-border/40">
      {whatsappBadge}

      <div className="rounded-lg border border-border/60 bg-card/70 p-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground ring-1 ring-primary/25 shadow-sm">
            {(email?.[0] ?? "U").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-foreground">
              {email ? email.split("@")[0] : "Minha Conta"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{email ?? "Carregando..."}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <ThemeToggle withLabel />
        <Button
          variant="ghost"
          size="sm"
          className="rounded-md text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sair
        </Button>
      </div>

      <p className="px-1 text-center text-[10px] text-muted-foreground/60">
        © {new Date().getFullYear()} IPTV Manager Pro
      </p>
    </div>
  );

  return (
    <div className="app-aurora min-h-screen bg-background text-foreground md:flex">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl md:hidden">
        {brand}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            className="h-9 w-9 rounded-md border-border"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile Slide-down Menu */}
      {open && (
        <div className="fixed inset-x-0 top-[61px] z-30 border-b border-border/60 bg-background/95 p-4 shadow-xl backdrop-blur-xl md:hidden animate-in slide-in-from-top-2">
          {links}
          <div className="mt-4">{footer}</div>
        </div>
      )}

      {/* Desktop Sticky Sidebar */}
      <aside className="sticky top-0 hidden h-[100dvh] w-[280px] shrink-0 flex-col border-r border-border/60 bg-sidebar/85 p-5 backdrop-blur-xl md:flex">
        {brand}
        <div className="mt-6 flex-1 space-y-4 overflow-y-auto subtle-scrollbar">
          {links}
        </div>
        {footer}
      </aside>

      {/* Main Workspace Area */}
      <main className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto subtle-scrollbar">
        <div className="pointer-events-none absolute inset-0 hidden app-grid opacity-[0.32] dark:opacity-[0.10] md:block" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        <div className="relative flex min-h-full flex-col px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-10">
          <div className="mx-auto w-full max-w-7xl flex-1">{children}</div>
        </div>
      </main>
    </div>
  );
}

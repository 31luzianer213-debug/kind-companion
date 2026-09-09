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

const nav = [
  { to: "/painel", label: "Painel Geral", icon: LayoutDashboard, badgeKey: null },
  { to: "/pedidos", label: "Pedidos & PIX", icon: ShoppingBag, badgeKey: "orders" },
  { to: "/clientes", label: "Clientes & Linhas", icon: Users, badgeKey: "clients" },
  { to: "/cobrancas", label: "Cobranças", icon: Receipt, badgeKey: "invoices" },
  { to: "/sigma", label: "Servidor Sigma", icon: Server, badgeKey: null },
  { to: "/bot", label: "Robô & Auto-Atendimento", icon: Bot, badgeKey: null },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, badgeKey: null },
  { to: "/pagamentos", label: "Pagamentos", icon: CreditCard, badgeKey: null },
  { to: "/mensagens", label: "Mensagens", icon: Sparkles, badgeKey: null },
  { to: "/configuracoes", label: "Configurações", icon: Settings, badgeKey: null },
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
      try {
        const res = await fetch("/api/public/orders?status=pending");
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.orders)) {
            pendingOrdersCount = json.orders.length;
          }
        }
      } catch {}

      if (pendingOrdersCount === 0 && Array.isArray(defaultOrdersSeed)) {
        pendingOrdersCount = (defaultOrdersSeed as any[]).filter(
          (o) => o.status === "pending",
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
          <span className="text-[15px] font-black tracking-tight text-foreground group-hover:text-white transition-colors">
            Painel Sigma
          </span>
          <span className="rounded-md bg-white text-black px-1.5 py-0.5 text-[9px] font-black tracking-wider">
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
        "group flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs font-medium transition-all",
        isWaConnected
          ? "border-white/20 bg-white/5 text-white hover:bg-white/10"
          : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/5",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {isWaConnected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              isWaConnected ? "bg-white" : "bg-zinc-600",
            )}
          />
        </span>
        <span className="truncate">
          {isWaConnected ? "WhatsApp Online" : "WhatsApp Desconectado"}
        </span>
      </div>
      <ChevronRight className="h-3.5 w-3.5 opacity-60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );

  const links = (
    <nav className="flex flex-col gap-1">
      <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
        Navegação Principal
      </p>
      {nav.map(({ to, label, icon: Icon, badgeKey }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        let badgeCount: number | null = null;
        let isOverdue = false;
        if (badgeKey === "orders" && (counts?.pendingOrders ?? 0) > 0) {
          badgeCount = counts?.pendingOrders ?? null;
          isOverdue = true;
        } else if (badgeKey === "invoices" && (counts?.overdueInvoices ?? 0) > 0) {
          badgeCount = counts?.overdueInvoices ?? null;
          isOverdue = true;
        } else if (badgeKey === "sigma" && (counts?.sigmaClients ?? 0) > 0) {
          badgeCount = counts?.sigmaClients ?? null;
        }

        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200",
              active
                ? "bg-white text-black font-bold shadow-sm"
                : "text-zinc-400 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110",
                active ? "text-black" : "text-zinc-400 group-hover:text-white",
              )}
            />
            <span className="flex-1 truncate">{label}</span>
            {badgeCount !== null && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide",
                  badgeKey === "orders"
                    ? "bg-white text-black font-extrabold border border-white"
                    : isOverdue
                    ? "bg-zinc-800 text-white font-bold border border-white/20"
                    : active
                    ? "bg-black text-white font-bold"
                    : "bg-white/10 text-white",
                )}
              >
                {badgeCount}
              </span>
            )}
            {active && badgeCount === null && (
              <span className="h-1.5 w-1.5 rounded-full bg-black" />
            )}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-3 pt-6 border-t border-border/40">
      {whatsappBadge}

      <div className="rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-white text-xs font-bold text-black ring-1 ring-white/20">
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
          className="rounded-xl text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
            className="h-9 w-9 rounded-xl border-border"
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

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
import { Users, Receipt, Settings, LogOut, LayoutDashboard, Menu, X, Sparkles, Server, MessageCircle, CreditCard, ChevronRight, Bot, ShoppingBag } from "lucide-react";
import defaultOrdersSeed from "../../data/orders_default.json";

const navGroups = [
  { title: "Principal", items: [{ to: "/painel", label: "Painel Geral", icon: LayoutDashboard, badgeKey: null }] },
  { title: "Operação & Vendas", items: [{ to: "/pedidos", label: "Pedidos & PIX", icon: ShoppingBag, badgeKey: "orders" }, { to: "/clientes", label: "Clientes & Linhas", icon: Users, badgeKey: "clients" }, { to: "/cobrancas", label: "Cobranças", icon: Receipt, badgeKey: "invoices" }] },
  { title: "Automação & Robô", items: [{ to: "/sigma", label: "Servidor Sigma", icon: Server, badgeKey: "sigma" }, { to: "/bot", label: "Robô WhatsApp", icon: Bot, badgeKey: null }, { to: "/whatsapp", label: "Conexão WhatsApp", icon: MessageCircle, badgeKey: "whatsapp" }] },
  { title: "Configurações", items: [{ to: "/pagamentos", label: "Formas de Pagamento", icon: CreditCard, badgeKey: null }, { to: "/mensagens", label: "Modelos de Mensagem", icon: Sparkles, badgeKey: null }, { to: "/configuracoes", label: "Ajustes Gerais", icon: Settings, badgeKey: null }] },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const statusFn = useServerFn(getWhatsAppStatus);
  useSigmaAutoSync();

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  const { data: counts } = useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: async () => {
      let pendingOrdersCount = 0; let loadedFromApi = false; const deletedIds = new Set<string>();
      try { const raw = localStorage.getItem("iptv_deleted_orders"); const arr = raw ? JSON.parse(raw) : []; if (Array.isArray(arr)) arr.forEach((id: string) => deletedIds.add(id)); } catch {}
      try { const res = await fetch("/api/public/orders?status=pending"); if (res.ok) { const json = await res.json(); if (Array.isArray(json?.orders)) { pendingOrdersCount = json.orders.filter((o: any) => !deletedIds.has(o.id)).length; loadedFromApi = true; } } } catch {}
      if (!loadedFromApi && Array.isArray(defaultOrdersSeed)) pendingOrdersCount = (defaultOrdersSeed as any[]).filter((o) => o.status === "pending" && !deletedIds.has(o.id)).length;
      const [clientsRes, invoicesRes, sigmaClientsRes] = await Promise.all([supabase.from("clients").select("id", { count: "exact", head: true }), supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"), supabase.from("clients").select("id", { count: "exact", head: true }).not("sigma_customer_id", "is", null)]);
      return { clients: clientsRes.count ?? 0, overdueInvoices: invoicesRes.count ?? 0, sigmaClients: sigmaClientsRes.count ?? 0, pendingOrders: pendingOrdersCount };
    }, staleTime: 5000, refetchInterval: 10000,
  });
  const { data: waStatus } = useQuery({ queryKey: ["layout-whatsapp-status"], queryFn: () => statusFn({ data: { origin: typeof window !== "undefined" ? window.location.origin : undefined } }), staleTime: 60000, refetchInterval: 120000 });
  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth" }); }
  const isWaConnected = waStatus?.state === "open";

  const brand = <Link to="/painel" className="group flex items-center gap-3"><SigmaLogo size="md" /><div className="leading-tight"><div className="flex items-center gap-1.5"><span className="text-[15px] font-black tracking-tight text-foreground group-hover:text-primary transition-colors">Painel Sigma</span><span className="rounded-md bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider">GRÁTIS</span></div><span className="block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Gestor & Automação IPTV</span></div></Link>;
  const whatsappBadge = <Link to="/whatsapp" className={cn("group flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all", isWaConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}><div className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", isWaConnected ? "bg-emerald-500" : "bg-muted-foreground")} /><span className="truncate font-semibold">{isWaConnected ? "WhatsApp Online" : "WhatsApp Desconectado"}</span></div><ChevronRight className="h-3.5 w-3.5 opacity-60" /></Link>;
  const links = <nav className="flex flex-col gap-5">{navGroups.map((group) => <div key={group.title} className="space-y-1.5"><p className="px-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground/70">{group.title}</p>{group.items.map(({ to, label, icon: Icon, badgeKey }) => { const active = pathname === to || pathname.startsWith(to + "/"); const badgeCount = badgeKey === "orders" ? counts?.pendingOrders : badgeKey === "invoices" ? counts?.overdueInvoices : badgeKey === "clients" ? counts?.clients : null; return <Link key={to} to={to} className={cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all", active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground")}><Icon className="h-[18px] w-[18px] shrink-0" /><span className="flex-1 truncate">{label}</span>{badgeCount !== null && badgeCount !== undefined && badgeCount > 0 ? <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold font-mono", active ? "bg-white/20 text-white" : badgeKey === "invoices" ? "bg-rose-500/15 text-rose-500" : "bg-primary/15 text-primary")}>{badgeCount}</span> : null}{badgeKey === "whatsapp" && isWaConnected ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}</Link>; })}</div>)}</nav>;
  const footer = <div className="mt-auto space-y-3 border-t border-border/50 pt-5">{whatsappBadge}<div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">{(email?.[0] ?? "U").toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-foreground">{email ? email.split("@")[0] : "Minha Conta"}</p><p className="truncate text-[11px] text-muted-foreground">{email ?? "Carregando..."}</p></div></div></div><div className="flex items-center justify-between gap-2"><ThemeToggle withLabel /><Button variant="ghost" size="sm" className="rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={signOut}><LogOut className="mr-1.5 h-3.5 w-3.5" /> Sair</Button></div><p className="px-1 text-center text-[10px] text-muted-foreground/60">© {new Date().getFullYear()} IPTV Manager Pro</p></div>;
  return <div className="app-aurora min-h-screen bg-background text-foreground md:flex"><header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl md:hidden">{brand}<div className="flex items-center gap-2"><ThemeToggle /><Button variant="outline" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Abrir menu" className="h-9 w-9 rounded-xl">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button></div></header>{open && <div className="fixed inset-x-0 top-[61px] z-30 border-b border-border/60 bg-background/95 p-4 shadow-xl backdrop-blur-xl md:hidden animate-in slide-in-from-top-2">{links}<div className="mt-4">{footer}</div></div>}<aside className="sticky top-0 hidden h-[100dvh] w-[280px] shrink-0 flex-col border-r border-border/60 bg-sidebar p-5 md:flex">{brand}<div className="mt-8 flex-1 space-y-4 overflow-y-auto subtle-scrollbar">{links}</div>{footer}</aside><main className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto subtle-scrollbar"><div className="pointer-events-none absolute inset-0 hidden app-grid opacity-[0.12] md:block" /><div className="relative flex min-h-full flex-col px-4 py-6 sm:px-6 md:px-8 md:py-9 lg:px-10"><div className="mx-auto w-full max-w-7xl flex-1">{children}</div></div></main></div>;
}

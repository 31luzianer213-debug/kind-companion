import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runAutoBilling, sendWhatsAppMessage, getWhatsAppStatus } from "@/lib/whatsapp.functions";
import { getSigmaSettings, syncSigmaClients } from "@/lib/sigma.functions";
import { approveOrder, type OrderItem } from "@/lib/orders.functions";
import defaultOrdersSeed from "../../../data/orders_default.json";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Send,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  MessageSquare,
  TrendingUp,
  Plus,
  RefreshCw,
  CheckCircle2,
  Calendar,
  ChevronRight,
  Server,
  Zap,
  ShoppingBag,
  Check,
  Sparkles,
  CreditCard,
  X,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

function getClientDeletedIds(): Set<string> {
  const set = new Set<string>();
  if (typeof window === "undefined") return set;
  try {
    const raw = localStorage.getItem("iptv_deleted_orders");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) set.add(id);
      }
    }
  } catch {}
  return set;
}

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — IPTV Manager Pro" },
      { name: "description", content: "Visão 360 do seu negócio IPTV: clientes, finanças, capacidade e automação WhatsApp." },
      { property: "og:title", content: "Painel — IPTV Manager Pro" },
      { property: "og:description", content: "Centro de comando e finanças IPTV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Painel,
});

function Painel() {
  const queryClient = useQueryClient();
  const billing = useServerFn(runAutoBilling);
  const send = useServerFn(sendWhatsAppMessage);
  const syncSigma = useServerFn(syncSigmaClients);
  const getSigma = useServerFn(getSigmaSettings);
  const approveFn = useServerFn(approveOrder);
  const getStatus = useServerFn(getWhatsAppStatus);

  const [running, setRunning] = useState(false);
  const [syncingSigma, setSyncingSigma] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("iptv_dismiss_onboarding") !== "true";
    return true;
  });

  const { data: waStatus } = useQuery({
    queryKey: ["painel-wa-status"],
    queryFn: () => getStatus({ data: {} }),
    staleTime: 60000,
  });

  const approveMutation = useMutation({
    mutationFn: async (orderId: string) => approveFn({ data: { orderId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        queryClient.invalidateQueries({ queryKey: ["dashboard-v2"] });
        queryClient.invalidateQueries({ queryKey: ["orders-list"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
      } else toast.error(res.message || "Erro ao aprovar pedido.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha na aprovação."),
  });

  const { data } = useQuery({
    queryKey: ["dashboard-v2"],
    queryFn: async () => {
      const deletedIds = getClientDeletedIds();
      let ordersList: OrderItem[] = [];
      try {
        const oRes = await fetch("/api/public/orders");
        if (oRes.ok) {
          const json = await oRes.json();
          if (Array.isArray(json?.orders) && json.orders.length > 0) {
            ordersList = json.orders.filter((o: OrderItem) => !deletedIds.has(o.id));
          }
        }
      } catch {}
      if (ordersList.length === 0 && Array.isArray(defaultOrdersSeed)) {
        ordersList = (defaultOrdersSeed as unknown as OrderItem[]).filter((o) => !deletedIds.has(o.id));
      }

      const [clients, invoices, logs, settings, sigmaRes] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("invoices").select("*, clients(name, phone)").order("due_date", { ascending: true }),
        supabase.from("message_logs").select("*, clients(name)").order("created_at", { ascending: false }).limit(6),
        supabase.from("whatsapp_settings").select("*").maybeSingle(),
        getSigma({}).catch(() => ({ ok: false, settings: null })),
      ]);

      return {
        clients: clients.data ?? [],
        invoices: invoices.data ?? [],
        logs: logs.data ?? [],
        settings: settings.data,
        sigma: sigmaRes?.ok ? sigmaRes.settings : null,
        orders: ordersList,
      };
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });

  const clients = data?.clients ?? [];
  const invoices = data?.invoices ?? [];
  const logs = data?.logs ?? [];
  const deletedIds = getClientDeletedIds();
  const rawOrders = (data?.orders ?? (defaultOrdersSeed as unknown as OrderItem[])) ?? [];
  const orders = rawOrders.filter((o) => !deletedIds.has(o.id));
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const sigmaSettings = data?.sigma;
  const activeClients = useMemo(() => clients.filter((c) => c.status === "active"), [clients]);
  const sigmaClients = useMemo(() => clients.filter((c) => Boolean(c.sigma_customer_id)), [clients]);
  const totalMonthlyFee = useMemo(() => activeClients.reduce((sum, c) => sum + Number(c.monthly_fee || 0), 0), [activeClients]);
  const ticketMedio = activeClients.length > 0 ? totalMonthlyFee / activeClients.length : 0;
  const pendingInvoices = useMemo(() => invoices.filter((i) => i.status === "pending" || i.status === "overdue"), [invoices]);
  const overdueInvoices = useMemo(() => invoices.filter((i) => i.status === "overdue"), [invoices]);
  const paidInvoices = useMemo(() => invoices.filter((i) => i.status === "paid"), [invoices]);
  const totalPaid = useMemo(() => paidInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0), [paidInvoices]);
  const totalOverdue = useMemo(() => overdueInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0), [overdueInvoices]);
  const totalPending = useMemo(() => pendingInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0), [pendingInvoices]);
  const serverDisplayName = sigmaSettings?.sigma_server_name?.trim() || sigmaSettings?.sigma_server_display_name || (sigmaSettings?.sigma_url ? sigmaSettings.sigma_url.replace(/^https?:\/\//i, "").split("/")[0] : "Servidor Sigma");
  const todayStr = new Date().toISOString().split("T")[0] ?? "";
  const upcomingClients = useMemo(() => clients.filter((c) => {
    const dueDate = c.next_due_date;
    if (!dueDate || c.status !== "active") return false;
    const diffDays = Math.ceil((new Date(String(dueDate)).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  }).slice(0, 5), [clients, todayStr]);
  const chartData = useMemo(() => [
    { name: "Recebido", valor: totalPaid, fill: "var(--color-chart-1)" },
    { name: "Em aberto", valor: totalPending, fill: "var(--color-chart-3)" },
    { name: "Atrasado", valor: totalOverdue, fill: "var(--color-chart-4)" },
  ], [totalPaid, totalPending, totalOverdue]);

  async function runBilling() {
    setRunning(true);
    try {
      const result = await billing({});
      toast.success(`${result.created} fatura(s) gerada(s), ${result.sent} mensagem(ns) enviada(s)${result.failed ? `, ${result.failed} falha(s)` : ""}.`);
      if (result.errors.length) toast.error(result.errors[0]);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao processar cobranças.");
    } finally { setRunning(false); }
  }

  async function cobrarClienteRapido(client: { id: string; name: string; phone: string; monthly_fee: number; next_due_date: string | null }) {
    setSendingId(client.id);
    try {
      const body = `Olá ${client.name}! Sua mensalidade de ${formatBRL(client.monthly_fee)} ${client.next_due_date ? `vence em ${formatDate(client.next_due_date)}` : "está disponível para pagamento"}. Qualquer dúvida estou à disposição! 🚀`;
      const result = await send({ data: { phone: client.phone, body, clientId: client.id } });
      if (result.ok) toast.success(`Cobrança enviada via WhatsApp para ${client.name}!`);
      else toast.error(result.error ?? "Falha ao enviar mensagem.");
      queryClient.invalidateQueries();
    } catch { toast.error("Erro ao enviar mensagem."); }
    finally { setSendingId(null); }
  }

  async function handleSyncSigma() {
    setSyncingSigma(true);
    try {
      const res = await syncSigma({ data: {} });
      if (res.ok) { toast.success(`Sigma sincronizado: ${res.created} novos e ${res.updated} atualizados!`); queryClient.invalidateQueries(); }
      else toast.error(res.error ?? "Falha ao sincronizar com o Sigma.");
    } catch { toast.error("Erro ao sincronizar com o Sigma."); }
    finally { setSyncingSigma(false); }
  }

  const isSigmaOk = Boolean(sigmaSettings?.isConfigured);
  const isWaOk = waStatus?.state === "open";
  const isPixOk = Boolean(data?.settings?.pix_key || data?.settings?.asaas_api_key || data?.settings?.mp_access_token);
  const completedSteps = (isSigmaOk ? 1 : 0) + (isWaOk ? 1 : 0) + (isPixOk ? 1 : 0);

  return (
    <div className="dashboard-page space-y-8 animate-in fade-in duration-300">
      <header className="dashboard-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Visão Geral</h1>
            <span className="status-dot status-dot-success"><span /> Operação ativa</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Acompanhe o faturamento, as pendências e a operação em um só lugar.</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1.5", isSigmaOk ? "text-emerald-400" : "text-amber-400")}><span className="size-1.5 rounded-full bg-current" /> Sigma {isSigmaOk ? "conectado" : "pendente"}</span>
            <span className={cn("inline-flex items-center gap-1.5", isWaOk ? "text-emerald-400" : "text-amber-400")}><span className="size-1.5 rounded-full bg-current" /> WhatsApp {isWaOk ? "conectado" : "pendente"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="dashboard-action-secondary">
            <Link to="/clientes" search={{ novo: "1" } as any}><Plus className="size-3.5" /> Novo cliente</Link>
          </Button>
          <Button size="sm" onClick={runBilling} disabled={running} className="dashboard-action-primary">
            {running ? <Clock3 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {running ? "Processando..." : "Rodar cobranças"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSyncSigma} disabled={syncingSigma} aria-label="Sincronizar servidor Sigma" className="dashboard-icon-action">
            <RefreshCw className={cn("size-4", syncingSigma && "animate-spin")} />
          </Button>
        </div>
      </header>

      {showOnboarding && (
        <section className="dashboard-secondary-panel">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="dashboard-soft-icon"><Sparkles className="size-4" /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold">Checklist de ativação</h2><span className="text-xs text-primary">{completedSteps}/3 concluídos</span></div>
                <p className="mt-1 text-xs text-muted-foreground">Complete as etapas essenciais para automatizar sua operação.</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setShowOnboarding(false); if (typeof window !== "undefined") localStorage.setItem("iptv_dismiss_onboarding", "true"); }} className="self-end text-xs text-muted-foreground sm:self-auto"><X className="mr-1 size-3.5" /> Dispensar</Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Server, title: "Servidor Sigma", ok: isSigmaOk, done: "Conectado", pending: "Pendente", href: "/sigma", action: isSigmaOk ? "Ver configurações" : "Conectar Sigma" },
              { icon: MessageSquare, title: "WhatsApp", ok: isWaOk, done: "Online", pending: "Pendente", href: "/whatsapp", action: isWaOk ? "Ver conexão" : "Conectar WhatsApp" },
              { icon: CreditCard, title: "Recebimento Pix", ok: isPixOk, done: "Configurado", pending: "Pendente", href: "/pagamentos", action: isPixOk ? "Ver configurações" : "Configurar Pix" },
            ].map(({ icon: Icon, title, ok, done, pending, href, action }, index) => (
              <div key={title} className={cn("dashboard-check-item", ok && "dashboard-check-item-done")}>
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-xs font-semibold"><Icon className="size-3.5 text-primary" /> {index + 1}. {title}</span><span className={cn("text-[11px]", ok ? "text-emerald-400" : "text-amber-400")}>{ok ? done : pending}</span></div>
                <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{ok ? "Configuração ativa e pronta para uso." : "Finalize esta configuração para liberar o módulo."}</p>
                <Button asChild size="sm" variant={ok ? "outline" : "default"} className="mt-3 h-8 w-full text-xs"><Link to={href as any}>{action} <ChevronRight className="ml-1 size-3" /></Link></Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo financeiro">
        {[
          { label: "Receita prevista", value: formatBRL(totalMonthlyFee), detail: `${activeClients.length} clientes ativos · Ticket ${formatBRL(ticketMedio)}`, icon: Wallet, tone: "dashboard-kpi-primary" },
          { label: "Recebido no mês", value: formatBRL(totalPaid), detail: `${paidInvoices.length} faturas quitadas`, icon: CheckCircle2, tone: "dashboard-kpi-success" },
          { label: "Em aberto", value: formatBRL(totalPending), detail: `${overdueInvoices.length} faturas atrasadas`, icon: AlertTriangle, tone: "dashboard-kpi-warning" },
          { label: "Clientes no Sigma", value: String(sigmaClients.length), detail: serverDisplayName, icon: Server, tone: "dashboard-kpi-neutral" },
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <Card key={label} className={cn("dashboard-kpi", tone)}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-2 truncate text-xs text-muted-foreground" title={detail}>{detail}</p></div><Icon className="mt-0.5 size-4 shrink-0 text-current" /></div></CardContent></Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2" aria-label="Pendências prioritárias">
        <Card className="dashboard-panel"><CardHeader className="dashboard-panel-header"><div><CardTitle className="dashboard-section-title"><ShoppingBag className="size-4 text-primary" /> Pedidos aguardando aprovação</CardTitle><CardDescription className="mt-1 text-xs">Libere pedidos pagos e entregue as credenciais.</CardDescription></div><Button asChild variant="ghost" size="sm" className="dashboard-link"><Link to="/pedidos">Ver todos ({orders.length}) <ChevronRight className="size-3.5" /></Link></Button></CardHeader><CardContent className="space-y-2 p-4 sm:p-5">{orders.length === 0 ? <div className="dashboard-empty">Nenhum pedido gerado até o momento.</div> : orders.slice(0, 4).map((order) => { const isPending = order.status === "pending"; const isApproved = order.status === "approved"; return <div key={order.id} className="dashboard-list-row"><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">#{order.order_number}</span><span className={cn("text-[11px]", isPending ? "text-amber-400" : isApproved ? "text-emerald-400" : "text-muted-foreground")}>{isPending ? "Aguardando Pix" : isApproved ? "Liberado" : "Cancelado"}</span></div><p className="mt-1 truncate text-sm font-semibold text-foreground">{order.customer_name}</p><p className="text-xs text-muted-foreground">{order.plan_name} · R$ {Number(order.amount).toFixed(2).replace(".", ",")}</p></div>{isPending ? <Button size="sm" onClick={() => approveMutation.mutate(order.id)} disabled={approveMutation.isPending} className="h-8 shrink-0 text-xs"><Zap className="mr-1.5 size-3.5" /> Liberar</Button> : <Button asChild size="sm" variant="outline" className="h-8 shrink-0 text-xs"><Link to="/pedidos">Ver pedido</Link></Button>}</div>; })}</CardContent></Card>

        <Card className="dashboard-panel"><CardHeader className="dashboard-panel-header"><div><CardTitle className="dashboard-section-title"><Calendar className="size-4 text-primary" /> Próximos vencimentos</CardTitle><CardDescription className="mt-1 text-xs">Clientes que vencem hoje ou nos próximos três dias.</CardDescription></div><span className="text-xs text-muted-foreground">{upcomingClients.length} próximos</span></CardHeader><CardContent className="space-y-2 p-4 sm:p-5">{upcomingClients.length === 0 ? <div className="dashboard-empty"><Check className="mx-auto mb-2 size-5 text-emerald-400" /><p className="font-semibold text-foreground">Tudo em dia</p><p className="mt-1 text-xs">Nenhum cliente vencendo nos próximos dias.</p></div> : upcomingClients.map((client) => { const isToday = client.next_due_date === todayStr; return <div key={client.id} className="dashboard-list-row"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{client.name}</p>{isToday && <span className="text-[11px] font-semibold text-amber-400">Hoje</span>}</div><p className="mt-1 text-xs text-muted-foreground">{formatBRL(client.monthly_fee)} · {formatDate(client.next_due_date)}</p></div><Button size="sm" variant="outline" disabled={sendingId === client.id} onClick={() => cobrarClienteRapido(client)} className="h-8 shrink-0 gap-1 text-xs">{sendingId === client.id ? <Clock3 className="size-3 animate-spin" /> : <Send className="size-3" />} Cobrar</Button></div>; })}</CardContent><div className="dashboard-panel-footer"><Button asChild variant="ghost" size="sm" className="dashboard-link w-full justify-between"><Link to="/cobrancas">Ver todas as cobranças <ChevronRight className="size-3" /></Link></Button></div></Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-3" aria-label="Análise financeira">
        <Card className="dashboard-panel lg:col-span-2"><CardHeader className="dashboard-panel-header"><div><CardTitle className="dashboard-section-title"><TrendingUp className="size-4 text-primary" /> Balanço financeiro</CardTitle><CardDescription className="mt-1 text-xs">Distribuição das faturas recebidas, abertas e atrasadas.</CardDescription></div><span className="font-mono text-xs text-muted-foreground">Total {formatBRL(totalPaid + totalPending)}</span></CardHeader><CardContent className="px-4 pb-5 pt-2 sm:px-5"><div className="h-[240px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `R$${v}`} /><Tooltip formatter={(val: number) => [formatBRL(val), "Valor"]} contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "8px", fontSize: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }} /><Bar dataKey="valor" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
        <Card className="dashboard-panel"><CardHeader className="dashboard-panel-header"><div><CardTitle className="dashboard-section-title"><AlertTriangle className="size-4 text-amber-400" /> Faturas em aberto</CardTitle><CardDescription className="mt-1 text-xs">Acompanhe o que precisa de atenção.</CardDescription></div><Button asChild variant="ghost" size="sm" className="dashboard-link"><Link to="/cobrancas">Gerenciar</Link></Button></CardHeader><CardContent className="space-y-2 p-4 sm:p-5">{pendingInvoices.length === 0 ? <div className="dashboard-empty"><p className="font-semibold text-foreground">Tudo em dia</p><p className="mt-1 text-xs">Nenhuma fatura em aberto.</p></div> : pendingInvoices.slice(0, 5).map((invoice) => <div key={invoice.id} className="dashboard-list-row"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{(invoice as unknown as { clients: { name: string } | null }).clients?.name ?? "Cliente"}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(invoice.due_date)} · {formatBRL(invoice.amount)}</p></div><span className={cn("shrink-0 text-xs font-semibold", invoice.status === "overdue" ? "text-rose-400" : "text-amber-400")}>{invoice.status === "overdue" ? "Atrasada" : "Pendente"}</span></div>)}</CardContent></Card>
      </section>

      <section className="dashboard-panel"><CardHeader className="dashboard-panel-header"><div><CardTitle className="dashboard-section-title"><MessageSquare className="size-4 text-primary" /> Histórico de mensagens</CardTitle><CardDescription className="mt-1 text-xs">Últimos disparos automáticos do WhatsApp.</CardDescription></div><Button asChild variant="ghost" size="sm" className="dashboard-link"><Link to="/whatsapp">Ver conexão</Link></Button></CardHeader><CardContent className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">{logs.length === 0 ? <div className="dashboard-empty sm:col-span-2">Nenhum disparo registrado.</div> : logs.slice(0, 5).map((log) => <div key={log.id} className="dashboard-list-row"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-foreground">{(log as unknown as { clients: { name: string } | null }).clients?.name ?? log.phone}</span><span className="shrink-0 text-[11px] text-muted-foreground">{log.created_at ? formatDateTime(log.created_at) : ""}</span></div><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{log.body}</p></div><span className={cn("shrink-0 text-xs font-semibold", log.status === "sent" ? "text-emerald-400" : "text-rose-400")}>{log.status === "sent" ? "Enviado" : "Falhou"}</span></div>)}</CardContent></section>
    </div>
  );
}

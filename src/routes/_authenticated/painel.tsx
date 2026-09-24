import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndicatorsPanel } from "@/components/panels/IndicatorsPanel";
import { ActivitiesPanel } from "@/components/panels/ActivitiesPanel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmptyView, ErrorView, LoadingView } from "@/components/ui/state-view";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, lazy, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runAutoBilling, sendWhatsAppMessage, getWhatsAppStatus } from "@/lib/whatsapp.functions";
import { listSigmaServers, syncAllSigmaServers } from "@/lib/sigma-servers.functions";
import { useSigmaAutoSync } from "@/lib/useSigmaAutoSync";
import { approveOrder, getOrdersList, type OrderItem } from "@/lib/orders.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Server,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";

const FinanceChart = lazy(() => import("@/components/dashboard/FinanceChart"));

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — Sigma Control" },
      { name: "description", content: "Visão geral do seu negócio IPTV: clientes, finanças, pedidos e automação no WhatsApp." },
      { property: "og:title", content: "Painel — Sigma Control" },
      { property: "og:description", content: "Centro de comando da sua operação IPTV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Painel,
});

type StepTone = "ok" | "todo";

function StepCard({
  icon: Icon,
  step,
  title,
  done,
  doneLabel,
  todoLabel,
  description,
  to,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  step: number;
  title: string;
  done: boolean;
  doneLabel: string;
  todoLabel: string;
  description: string;
  to: string;
  cta: string;
}) {
  const tone: StepTone = done ? "ok" : "todo";
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-md border p-4 transition-colors",
        tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card hover:border-primary/40",
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-bold text-foreground">
            <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-3.5" />
            </span>
            {step}. {title}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 gap-1 rounded-md py-0 text-[10px] font-semibold",
              done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-amber-500/30 bg-amber-500/10 text-amber-500",
            )}
          >
            {done ? <CheckCircle2 className="size-3" /> : null}
            {done ? doneLabel : todoLabel}
          </Badge>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Button asChild size="sm" variant={done ? "outline" : "default"} className="mt-4 h-8 w-full rounded-md text-xs font-semibold">
        <Link to={to as never}>
          {cta} <ChevronRight className="ml-1 size-3" />
        </Link>
      </Button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  extra,
  icon: Icon,
  accent,
  valueClass,
}: {
  label: string;
  value: string;
  hint: string;
  extra?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  valueClass?: string;
}) {
  return (
    <Card className="surface-card overflow-hidden rounded-md border-border/70 transition-colors hover:border-border">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-md border", accent)}>
            <Icon className="size-4" />
          </span>
        </div>
        <div className="min-w-0">
          <p className={cn("truncate text-2xl font-bold tracking-tight text-foreground", valueClass)}>{value}</p>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{hint}</span>
            {extra}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
        <p className="truncate text-[11px] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <EmptyView title={title} description={description} />;
}

function PainelOverview() {
  useSigmaAutoSync();
  const queryClient = useQueryClient();
  const billing = useServerFn(runAutoBilling);
  const send = useServerFn(sendWhatsAppMessage);
  const syncSigma = useServerFn(syncAllSigmaServers);
  const getSigma = useServerFn(listSigmaServers);
  const approveFn = useServerFn(approveOrder);
  const ordersFn = useServerFn(getOrdersList);
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
    staleTime: 60_000,
  });

  const approveMutation = useMutation({
    mutationFn: async (orderId: string) => await approveFn({ data: { orderId } }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success(res.message);
        queryClient.invalidateQueries({ queryKey: ["dashboard-v2"] });
        queryClient.invalidateQueries({ queryKey: ["orders-list"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
      } else {
        toast.error(res?.message || "Erro ao aprovar pedido.");
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha na aprovação."),
  });

  const { data, isLoading: dashLoading, isError: dashError, refetch: refetchDash } = useQuery({
    queryKey: ["dashboard-v2"],
    queryFn: async () => {
      const ordersRes = await ordersFn({ data: {} }).catch(() => ({ orders: [] as OrderItem[] }));
      const ordersList: OrderItem[] = Array.isArray(ordersRes?.orders) ? (ordersRes.orders as OrderItem[]) : [];

      const [clients, invoices, logs, settings, sigmaRes] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("invoices").select("*, clients(name, phone)").order("due_date", { ascending: true }),
        supabase.from("message_logs").select("*, clients(name)").order("created_at", { ascending: false }).limit(6),
        supabase.from("whatsapp_settings").select("*").maybeSingle(),
        getSigma({}).catch(() => ({ ok: false as const, servers: [] })),
      ]);

      return {
        clients: Array.isArray(clients.data) ? clients.data : [],
        invoices: Array.isArray(invoices.data) ? invoices.data : [],
        logs: Array.isArray(logs.data) ? logs.data : [],
        settings: settings.data,
        sigmaServers: sigmaRes?.ok && Array.isArray(sigmaRes.servers) ? sigmaRes.servers : [],
        orders: ordersList,
      };
    },
    staleTime: 5_000,
    refetchInterval: 20_000,
  });

  const clients = Array.isArray(data?.clients) ? data.clients : [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const sigmaServers = Array.isArray(data?.sigmaServers) ? data.sigmaServers : [];

  const pendingOrders = orders.filter((order) => order.status === "pending");
  const defaultSigmaServer = sigmaServers.find((server) => server.is_default) ?? sigmaServers[0];

  const activeClients = useMemo(() => clients.filter((c) => c.status === "active"), [clients]);
  const sigmaClients = useMemo(() => clients.filter((c) => Boolean(c.sigma_customer_id)), [clients]);
  const totalMonthlyFee = useMemo(
    () => activeClients.reduce((sum, c) => sum + Number(c.monthly_fee || 0), 0),
    [activeClients],
  );
  const ticketMedio = activeClients.length > 0 ? totalMonthlyFee / activeClients.length : 0;

  const pendingInvoices = useMemo(
    () => invoices.filter((i) => i.status === "pending" || i.status === "overdue"),
    [invoices],
  );
  const overdueInvoices = useMemo(() => invoices.filter((i) => i.status === "overdue"), [invoices]);
  const paidInvoices = useMemo(() => invoices.filter((i) => i.status === "paid"), [invoices]);

  const monthKey = new Date().toISOString().slice(0, 7);
  const totalPaid = useMemo(
    () =>
      paidInvoices
        .filter((i) => String(i.paid_at ?? i.updated_at ?? "").startsWith(monthKey))
        .reduce((sum, i) => sum + Number(i.amount || 0), 0),
    [paidInvoices, monthKey],
  );
  const totalOverdue = useMemo(() => overdueInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0), [overdueInvoices]);
  const totalPending = useMemo(() => pendingInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0), [pendingInvoices]);

  const serverDisplayName =
    sigmaServers.length > 1 ? `${sigmaServers.length} painéis Sigma` : defaultSigmaServer?.name || "Servidor Sigma";

  const todayStr = new Date().toISOString().split("T")[0] ?? "";
  const upcomingClients = useMemo(
    () =>
      clients
        .filter((c) => {
          if (!c.next_due_date || c.status !== "active") return false;
          const diffDays = Math.ceil(
            (new Date(String(c.next_due_date)).getTime() - new Date(todayStr).getTime()) / 86_400_000,
          );
          return diffDays >= 0 && diffDays <= 3;
        })
        .slice(0, 5),
    [clients, todayStr],
  );

  const clientHealth = useMemo(() => {
    const today = new Date(todayStr).getTime();
    let due7 = 0;
    let expired = 0;
    for (const c of clients) {
      if (c.status !== "active" || !c.next_due_date) continue;
      const diffDays = Math.ceil((new Date(String(c.next_due_date)).getTime() - today) / 86_400_000);
      if (diffDays < 0) expired += 1;
      else if (diffDays <= 7) due7 += 1;
    }
    return { due7, expired, inactive: clients.filter((c) => c.status !== "active").length };
  }, [clients, todayStr]);

  const chartData = useMemo(
    () => [
      { name: "Recebido no mês", valor: totalPaid, fill: "#10b981" },
      { name: "Em aberto", valor: totalPending, fill: "#f59e0b" },
      { name: "Atrasado", valor: totalOverdue, fill: "#f43f5e" },
    ],
    [totalPaid, totalPending, totalOverdue],
  );

  async function runBilling() {
    setRunning(true);
    try {
      const result = await billing({});
      toast.success(
        `${result.created} fatura(s) gerada(s), ${result.sent} mensagem(ns) enviada(s)${
          result.failed ? `, ${result.failed} falha(s)` : ""
        }.`,
      );
      const billingErrors = Array.isArray(result.errors) ? result.errors : [];
      if (billingErrors.length) toast.error(billingErrors[0]);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao processar cobranças.");
    } finally {
      setRunning(false);
    }
  }

  async function cobrarClienteRapido(client: {
    id: string;
    name: string;
    phone: string;
    monthly_fee: number;
    next_due_date: string | null;
  }) {
    setSendingId(client.id);
    try {
      const body = `Olá ${client.name}! Sua mensalidade de ${formatBRL(client.monthly_fee)} ${
        client.next_due_date ? `vence em ${formatDate(client.next_due_date)}` : "está disponível para pagamento"
      }. Qualquer dúvida estou à disposição! 🚀`;
      const result = await send({ data: { phone: client.phone, body, clientId: client.id } });
      if (result.ok) toast.success(`Cobrança enviada para ${client.name}!`);
      else toast.error(result.error ?? "Falha ao enviar mensagem.");
      queryClient.invalidateQueries();
    } catch {
      toast.error("Erro ao enviar mensagem.");
    } finally {
      setSendingId(null);
    }
  }

  async function handleSyncSigma() {
    setSyncingSigma(true);
    try {
      const res = await syncSigma({});
      if (res.ok) {
        toast.success(`Sigma sincronizado: ${res.created} novos e ${res.updated} atualizados!`);
        queryClient.invalidateQueries();
      } else {
        toast.error(res.error ?? "Falha ao sincronizar com o Sigma.", {
          duration: 12_000,
          action: { label: "Configurar", onClick: () => (window.location.href = "/sigma") },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? `Erro: ${err.message}` : "Erro ao sincronizar com o Sigma.", { duration: 8_000 });
    } finally {
      setSyncingSigma(false);
    }
  }

  const isSigmaOk = sigmaServers.some((server) => server.enabled);
  const isWaOk = waStatus?.state === "open";
  const isPixOk = Boolean(data?.settings?.pix_key || data?.settings?.asaas_token || data?.settings?.mercadopago_token);
  const completedSteps = (isSigmaOk ? 1 : 0) + (isWaOk ? 1 : 0) + (isPixOk ? 1 : 0);

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      {(() => {
        const expected = Math.max(totalMonthlyFee, totalPaid + totalPending);
        const pct = (v: number) => (expected > 0 ? Math.min(100, (v / expected) * 100) : 0);
        const paidPct = Math.round(pct(totalPaid));
        const hour = new Date().getHours();
        const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
        const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
        const kpis = [
          { label: "Clientes ativos", value: activeClients.length, hint: `${sigmaClients.length} no Sigma`, icon: Users, tone: "text-foreground", dot: "bg-success", to: "/clientes" },
          { label: "Vencem em 7 dias", value: clientHealth.due7, hint: upcomingClients.length ? `${upcomingClients.length} nos próximos 3 dias` : "Nada urgente", icon: Calendar, tone: "text-warning", dot: "bg-warning", to: "/clientes" },
          { label: "Vencidos", value: clientHealth.expired, hint: totalOverdue > 0 ? `${formatBRL(totalOverdue)} atrasado` : "Tudo em dia", icon: AlertTriangle, tone: "text-destructive", dot: "bg-destructive", to: "/cobrancas" },
          { label: "Ticket médio", value: formatBRL(ticketMedio), hint: pendingOrders.length ? `${pendingOrders.length} pedido(s) aguardando` : serverDisplayName, icon: Wallet, tone: "text-foreground", dot: "bg-ring", to: pendingOrders.length ? "/pedidos" : "/clientes" },
        ];
        return (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{greet} — resumo de <span className="capitalize">{monthName}</span></p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Sua operação hoje</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                {[
                  { ok: isWaOk, label: `WhatsApp ${isWaOk ? "online" : "offline"}`, bad: "bg-destructive", to: "/whatsapp" },
                  { ok: isSigmaOk, label: `Sigma ${isSigmaOk ? "conectado" : "pendente"}`, bad: "bg-warning", to: "/sigma" },
                  { ok: isPixOk, label: `Pagamentos ${isPixOk ? "prontos" : "pendentes"}`, bad: "bg-warning", to: "/configuracoes" },
                ].map((s) => (
                  <Link key={s.label} to={s.to as never} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-foreground/30 hover:text-foreground">
                    <span className="relative flex size-2">
                      {s.ok && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
                      <span className={cn("relative inline-flex size-2 rounded-full", s.ok ? "bg-success" : s.bad)} />
                    </span>
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
              <div className="dash-hero relative overflow-hidden rounded-2xl bg-foreground p-6 text-background shadow-xl sm:p-8 lg:col-span-7">
                <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 opacity-20" />
                <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-[radial-gradient(closest-side,var(--ring),transparent)] opacity-40 blur-3xl" />
                <div className="relative flex h-full flex-col gap-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-background/70">
                      <TrendingUp className="size-4 text-ring" /> Recebido neste mês
                    </p>
                    <span className="rounded-full bg-ring px-2.5 py-1 text-xs font-bold tabular-nums text-foreground">{paidPct}% da meta</span>
                  </div>
                  <p className="font-display text-5xl font-bold tracking-tight tabular-nums sm:text-7xl">{formatBRL(totalPaid)}</p>
                  <div className="space-y-3">
                    <div className="flex h-3 overflow-hidden rounded-full bg-background/10">
                      <div className="h-full bg-ring transition-[width] duration-700 ease-out" style={{ width: `${pct(totalPaid)}%` }} />
                      <div className="h-full bg-warning/80 transition-[width] duration-700 ease-out" style={{ width: `${pct(totalPending - totalOverdue)}%` }} />
                      <div className="h-full bg-destructive/80 transition-[width] duration-700 ease-out" style={{ width: `${pct(totalOverdue)}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      {[
                        { c: "bg-ring", l: "Recebido", v: totalPaid },
                        { c: "bg-warning", l: "A receber", v: Math.max(0, totalPending - totalOverdue) },
                        { c: "bg-destructive", l: "Atrasado", v: totalOverdue },
                      ].map((x) => (
                        <div key={x.l} className="min-w-0">
                          <p className="flex items-center gap-1.5 text-background/60"><span className={cn("size-2 rounded-sm", x.c)} />{x.l}</p>
                          <p className="mt-0.5 truncate font-semibold tabular-nums">{formatBRL(x.v)}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-background/50">Previsto no mês: {formatBRL(expected)}</p>
                  </div>
                  <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button onClick={runBilling} disabled={running} className="gap-2 bg-ring text-foreground hover:bg-ring/90">
                      {running ? <Clock3 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      {running ? "Processando…" : "Rodar cobranças agora"}
                    </Button>
                    <Button asChild variant="ghost" className="gap-2 text-background hover:bg-background/10 hover:text-background">
                      <Link to="/clientes" search={{ novo: "1" } as never}>
                        <Plus className="size-4" /> Novo cliente
                      </Link>
                    </Button>
                    <Button variant="ghost" onClick={handleSyncSigma} disabled={syncingSigma} className="gap-2 text-background/80 hover:bg-background/10 hover:text-background">
                      <RefreshCw className={cn("size-4", syncingSigma && "animate-spin")} /> Sincronizar Sigma
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:col-span-5" data-testid="client-health-strip">
                {kpis.map((k) => (
                  <Link
                    key={k.label}
                    to={k.to as never}
                    className="group relative flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid size-9 place-items-center rounded-xl bg-muted text-foreground">
                        <k.icon className="size-4" />
                      </span>
                      <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                      <p className={cn("mt-1 truncate font-display text-2xl font-bold tabular-nums sm:text-3xl", k.tone)}>{k.value}</p>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <span className={cn("size-1.5 shrink-0 rounded-full", k.dot)} />
                        {k.hint}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {!isWaOk && (
        <section className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-bold text-foreground">Seu WhatsApp está desconectado</p>
              <p className="text-xs text-muted-foreground">
                Enquanto isso, nenhuma cobrança e nenhuma mensagem do robô são enviadas. Leia o QR Code para voltar a cobrar.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to="/whatsapp">Reconectar agora</Link>
          </Button>
        </section>
      )}

      {showOnboarding && completedSteps < 3 && (
        <section className="relative overflow-hidden rounded-md border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground">Ativação da sua operação</h2>
                  <span className="rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {completedSteps} de 3 prontos
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Conclua as 3 etapas para deixar tudo no piloto automático.</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowOnboarding(false);
                if (typeof window !== "undefined") localStorage.setItem("iptv_dismiss_onboarding", "true");
              }}
              className="h-8 self-end px-2 text-xs text-muted-foreground hover:text-foreground sm:self-auto"
            >
              <X className="mr-1 size-3.5" /> Dispensar
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StepCard
              icon={Server}
              step={1}
              title="Servidor Sigma"
              done={isSigmaOk}
              doneLabel="Conectado"
              todoLabel="Pendente"
              description={isSigmaOk ? "Sincronização de acessos e renovações ativa." : "Informe a URL e o token para sincronizar acessos."}
              to="/sigma"
              cta={isSigmaOk ? "Ver configurações" : "Conectar Sigma"}
            />
            <StepCard
              icon={MessageSquare}
              step={2}
              title="WhatsApp"
              done={isWaOk}
              doneLabel="Online"
              todoLabel="Desconectado"
              description={isWaOk ? "Disparos automáticos de cobrança ativos." : "Escaneie o QR Code para enviar mensagens automáticas."}
              to="/whatsapp"
              cta={isWaOk ? "Ver conexão" : "Escanear QR Code"}
            />
            <StepCard
              icon={CreditCard}
              step={3}
              title="Recebimento Pix"
              done={isPixOk}
              doneLabel="Configurado"
              todoLabel="Pendente"
              description={isPixOk ? "Chave Pix ou gateway configurado." : "Defina sua chave Pix ou conecte Asaas / Mercado Pago."}
              to="/pagamentos"
              cta={isPixOk ? "Ver chaves" : "Configurar Pix"}
            />
          </div>
        </section>
      )}

      <SectionTitle icon={ShoppingBag} title="Operação do dia" description="Pedidos do robô e vencimentos próximos" />

      <Card className="surface-card overflow-hidden rounded-md border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 px-4 pb-3.5 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold tracking-tight">
              <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <ShoppingBag className="size-4" />
              </span>
              Pedidos do robô
              {pendingOrders.length > 0 && (
                <Badge variant="warning" className="rounded-md text-[10px] font-semibold">
                  {pendingOrders.length} aguardando Pix
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">Aprovação e entrega das credenciais no Sigma e no WhatsApp.</CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-8 shrink-0 gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground">
            <Link to="/pedidos">
              Ver todos ({orders.length}) <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {orders.length === 0 ? (
            <EmptyState title="Nenhum pedido ainda" description="Os pedidos feitos pelo robô no WhatsApp aparecem aqui." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {orders.slice(0, 4).map((order) => {
                const isPending = order.status === "pending";
                const isApproved = order.status === "approved";
                return (
                  <div
                    key={order.id}
                    className="flex flex-col justify-between rounded-md border border-border/70 bg-card p-3.5 transition-colors hover:border-border"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-foreground">#{order.order_number}</span>
                        <Badge
                          variant={isPending ? "warning" : isApproved ? "success" : "outline"}
                          className="rounded-md px-1.5 py-0 text-[10px]"
                        >
                          {isPending ? "Aguardando Pix" : isApproved ? "Liberado" : "Cancelado"}
                        </Badge>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{order.customer_name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{order.customer_phone}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2 text-xs">
                        <span className="truncate text-muted-foreground" title={order.plan_name}>
                          {order.plan_name}
                        </span>
                        <span className="shrink-0 font-bold text-foreground">{formatBRL(Number(order.amount))}</span>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-border/40 pt-2">
                      {isPending ? (
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(order.id)}
                          disabled={approveMutation.isPending}
                          className="h-8 w-full rounded-md bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          {approveMutation.isPending ? (
                            <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                          ) : (
                            <Zap className="mr-1.5 size-3.5" />
                          )}
                          Liberar agora
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline" className="h-8 w-full rounded-md text-xs text-muted-foreground hover:text-foreground">
                          <Link to="/pedidos">
                            Ver pedido <ChevronRight className="ml-1 size-3" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="surface-card overflow-hidden rounded-md border-border/70 lg:col-span-2">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 pb-2 pt-4 sm:px-5">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <TrendingUp className="size-4 shrink-0 text-primary" />
                <span className="truncate">Balanço de faturas</span>
              </CardTitle>
              <CardDescription className="text-xs">Recebidas, em aberto e em atraso</CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0 rounded-md font-mono text-xs">
              {formatBRL(totalPaid + totalPending)}
            </Badge>
          </CardHeader>
          <CardContent className="px-4 pt-4 sm:px-5">
            <div className="h-[240px] w-full">
              <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-muted/40" />}>
                <FinanceChart data={chartData} />
              </Suspense>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card flex flex-col overflow-hidden rounded-md border-border/70">
          <CardHeader className="px-4 pb-2 pt-4 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Calendar className="size-4 text-primary" /> Vencimentos imediatos
              </CardTitle>
              <Badge variant="secondary" className="shrink-0 rounded-md text-[11px] font-medium">
                {upcomingClients.length} próximos
              </Badge>
            </div>
            <CardDescription className="text-xs">Clientes com vencimento em até 3 dias</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-2.5 px-4 pt-2 sm:px-5">
            {upcomingClients.length === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-md border border-dashed border-border/60 p-4 text-center">
                <span className="mb-2 grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Check className="size-4" />
                </span>
                <p className="text-xs font-semibold text-foreground">Tudo em dia!</p>
                <p className="text-[11px] text-muted-foreground">Nenhum cliente vencendo nos próximos dias.</p>
              </div>
            ) : (
              upcomingClients.map((client) => {
                const isToday = client.next_due_date === todayStr;
                return (
                  <div
                    key={client.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-semibold text-foreground">{client.name}</p>
                        {isToday && (
                          <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1 text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400">
                            Hoje
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatBRL(client.monthly_fee)} • {formatDate(client.next_due_date)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingId === client.id}
                      onClick={() => cobrarClienteRapido(client)}
                      className="h-7 shrink-0 gap-1 rounded-md px-2 text-xs font-medium"
                    >
                      {sendingId === client.id ? <Clock3 className="size-3 animate-spin text-primary" /> : <Send className="size-3" />}
                      Cobrar
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
          <div className="border-t border-border/50 bg-muted/10 p-2.5">
            <Button asChild variant="ghost" size="sm" className="h-7 w-full justify-between text-xs text-muted-foreground hover:text-foreground">
              <Link to="/cobrancas">
                Ver todas as cobranças <ChevronRight className="size-3" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      <SectionTitle icon={MessageSquare} title="Acompanhamento" description="Faturas em aberto e mensagens enviadas" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="surface-card overflow-hidden rounded-md border-border/70">
          <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <AlertTriangle className="size-4 text-amber-500" /> Faturas pendentes
              </CardTitle>
              <CardDescription className="text-xs">Acompanhamento das cobranças emitidas</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 text-xs">
              <Link to="/cobrancas">Gerenciar</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4 pt-1 sm:px-5">
            {dashError ? (
              <ErrorView onRetry={() => refetchDash()} />
            ) : dashLoading ? (
              <LoadingView rows={3} />
            ) : pendingInvoices.length === 0 ? (
              <EmptyState title="Nenhuma fatura em aberto" description="Todos os pagamentos estão em dia!" />
            ) : (
              pendingInvoices.slice(0, 5).map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/20 p-2.5 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {(invoice as unknown as { clients: { name: string } | null }).clients?.name ?? "Cliente"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Vencimento: {formatDate(invoice.due_date)} • {formatBRL(invoice.amount)}
                    </p>
                  </div>
                  <Badge variant={invoice.status === "overdue" ? "destructive" : "warning"} className="shrink-0 rounded-md text-[11px] font-medium">
                    {invoice.status === "overdue" ? "Atrasada" : "Pendente"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="surface-card overflow-hidden rounded-md border-border/70">
          <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <MessageSquare className="size-4 text-primary" /> Últimos disparos
              </CardTitle>
              <CardDescription className="text-xs">Cobranças, boas-vindas e lembretes</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 text-xs">
              <Link to="/whatsapp">Conexão</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4 pt-1 sm:px-5">
            {logs.length === 0 ? (
              <EmptyState title="Nenhum disparo registrado" description="O histórico aparece aqui após os envios do robô." />
            ) : (
              logs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-muted/20 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {(log as unknown as { clients: { name: string } | null }).clients?.name ?? log.phone}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {log.created_at ? formatDateTime(log.created_at) : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{log.body}</p>
                  </div>
                  <Badge variant={log.status === "sent" ? "default" : "destructive"} className="shrink-0 rounded-md text-[10px] font-semibold">
                    {log.status === "sent" ? "Enviado" : "Falhou"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Painel() {
  const [tab, setTab] = useState("visao");
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "visao" ? <PainelOverview /> : tab === "indicadores" ? <IndicatorsPanel /> : <ActivitiesPanel />}
    </div>
  );
}

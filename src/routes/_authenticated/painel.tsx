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
import { sendWhatsAppMessage, getWhatsAppStatus } from "@/lib/whatsapp.functions";
import { listSigmaServers, syncAllSigmaServers } from "@/lib/sigma-servers.functions";
import { useSigmaAutoSync } from "@/lib/useSigmaAutoSync";
import { approveOrder, getOrdersList, type OrderItem } from "@/lib/orders.functions";
import { OverviewHero, type OverviewStatus } from "@/components/dashboard/OverviewHero";
import { DueSoonCard, OrdersBoard } from "@/components/dashboard/OperationsBoard";
import { Button } from "@/components/ui/button";
import { currentMonthKey, daysUntil, formatBRL, formatDate, formatDateTime, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronRight,
  CreditCard,
  MessageSquare,
  RefreshCw,
  Server,
  Sparkles,
  TrendingUp,
  Users,
  X,
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
        "flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-colors",
        tone === "ok" ? "border-primary/25 bg-primary/[0.05]" : "border-border bg-card hover:border-primary/35",
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[12px] font-bold text-foreground">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-black",
                done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="truncate">{step}. {title}</span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
              done ? "bg-primary/12 text-primary" : "bg-warning/15 text-warning",
            )}
          >
            {done ? doneLabel : todoLabel}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Button asChild size="sm" variant={done ? "outline" : "default"} className="h-8 w-full rounded-lg text-[11px] font-bold">
        <Link to={to as never}>
          {cta} <ChevronRight className="ml-1 size-3" />
        </Link>
      </Button>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <EmptyView title={title} description={description} />;
}

function PainelOverview() {
  useSigmaAutoSync();
  const queryClient = useQueryClient();
  const send = useServerFn(sendWhatsAppMessage);
  const syncSigma = useServerFn(syncAllSigmaServers);
  const getSigma = useServerFn(listSigmaServers);
  const approveFn = useServerFn(approveOrder);
  const ordersFn = useServerFn(getOrdersList);
  const getStatus = useServerFn(getWhatsAppStatus);

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
      // Antes os erros do banco eram engolidos: a tela mostrava carteira zerada
      // (parecia que o cliente sumiu) em vez de avisar da falha. Agora a primeira
      // consulta valida a conexão e o painel mostra o erro real com "tentar de novo".
      const clients = await supabase.from("clients").select("*").order("name");
      if (clients.error) throw new Error(clients.error.message);

      const ordersRes = await ordersFn({ data: {} }).catch(() => ({ orders: [] as OrderItem[] }));
      const ordersList: OrderItem[] = Array.isArray(ordersRes?.orders) ? (ordersRes.orders as OrderItem[]) : [];

      const [invoices, logs, settings, sigmaRes] = await Promise.all([
        supabase.from("invoices").select("*, clients(name, phone)").order("due_date", { ascending: true }),
        supabase.from("message_logs").select("*, clients(name)").order("created_at", { ascending: false }).limit(6),
        supabase.from("whatsapp_settings").select("*").maybeSingle(),
        getSigma({}).catch(() => ({ ok: false as const, servers: [] })),
      ]);

      return {
        clients: clients.data ?? [],
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

  const monthKey = currentMonthKey();
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

  const todayStr = todayISO();
  const upcomingClients = useMemo(
    () =>
      clients
        .filter((c) => {
          if (!c.next_due_date || c.status !== "active") return false;
          const diffDays = daysUntil(String(c.next_due_date));
          return diffDays !== null && diffDays >= 0 && diffDays <= 3;
        })
        .slice(0, 5),
    [clients],
  );

  const clientHealth = useMemo(() => {
    let due7 = 0;
    let expired = 0;
    for (const c of clients) {
      if (c.status !== "active" || !c.next_due_date) continue;
      const diffDays = daysUntil(String(c.next_due_date));
      if (diffDays === null) continue;
      if (diffDays < 0) expired += 1;
      else if (diffDays <= 7) due7 += 1;
    }
    return { due7, expired, inactive: clients.filter((c) => c.status !== "active").length };
  }, [clients]);

  const chartData = useMemo(
    () => [
      { name: "Recebido no mês", valor: totalPaid, fill: "var(--success)" },
      { name: "Em aberto", valor: totalPending, fill: "var(--warning)" },
      { name: "Atrasado", valor: totalOverdue, fill: "var(--destructive)" },
    ],
    [totalPaid, totalPending, totalOverdue],
  );

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
      if (result.ok) {
        toast.success(`Cobrança enviada para ${client.name}!`);
        // Só invalida as consultas do painel: `invalidateQueries()` sem filtro
        // recarregava todas as telas montadas (clientes, cobranças, sigma…)
        // a cada mensagem enviada.
        void queryClient.invalidateQueries({ queryKey: ["dashboard-v2"] });
        void queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
      } else {
        toast.error(result.error ?? "Falha ao enviar mensagem.");
      }
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
        void queryClient.invalidateQueries({ queryKey: ["dashboard-v2"] });
        void queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
        void queryClient.invalidateQueries({ queryKey: ["sigma-servers"] });
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
  const hasClients = clients.length > 0;
  const completedSteps = (isSigmaOk ? 1 : 0) + (isWaOk ? 1 : 0) + (isPixOk ? 1 : 0) + (hasClients ? 1 : 0);

  const expected = Math.max(totalMonthlyFee, totalPaid + totalPending);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const paidPct = expected > 0 ? Math.round(Math.min(100, (totalPaid / expected) * 100)) : 0;
  const statuses: OverviewStatus[] = [
    { ok: isWaOk, label: isWaOk ? "WhatsApp online" : "WhatsApp offline", to: "/whatsapp" },
    { ok: isSigmaOk, label: isSigmaOk ? "Sigma conectado" : "Sigma pendente", to: "/sigma" },
    { ok: isPixOk, label: isPixOk ? "Pagamentos prontos" : "Pix pendente", to: "/pagamentos" },
  ];

  return (
    <div className="animate-in fade-in space-y-5 duration-300">
      {dashError && !dashLoading ? (
        <section className="panel-card p-4">
          <ErrorView onRetry={() => refetchDash()} />
        </section>
      ) : null}

      <OverviewHero
        greet={greet}
        monthName={monthName}
        totalPaid={totalPaid}
        totalPending={totalPending}
        totalOverdue={totalOverdue}
        expected={expected}
        paidPct={paidPct}
        activeClients={activeClients.length}
        sigmaClients={sigmaClients.length}
        dueSoon={clientHealth.due7}
        expired={clientHealth.expired}
        ticketMedio={ticketMedio}
        pendingOrders={pendingOrders.length}
        upcomingCount={upcomingClients.length}
        serverDisplayName={serverDisplayName}
        statuses={statuses}
        syncingSigma={syncingSigma}
        onSyncSigma={handleSyncSigma}
      />

      {!isWaOk && (
        <section className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-bold text-foreground">Seu WhatsApp está desconectado</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Enquanto isso, nenhuma cobrança e nenhuma mensagem do robô são enviadas. Leia o QR Code para voltar a cobrar.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0 rounded-lg font-semibold">
            <Link to="/whatsapp">Reconectar agora</Link>
          </Button>
        </section>
      )}

      {showOnboarding && completedSteps < 4 && (
        <section className="panel-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                  Primeiros passos
                  <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">{completedSteps}/4</span>
                </h2>
                <p className="truncate text-[11px] text-muted-foreground">Cada etapa marca sozinha quando estiver pronta.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block">
                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(completedSteps / 4) * 100}%` }} />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowOnboarding(false);
                  if (typeof window !== "undefined") localStorage.setItem("iptv_dismiss_onboarding", "true");
                }}
                className="h-8 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <X className="mr-1 size-3.5" /> Dispensar
              </Button>
            </div>
          </div>

          <div className="grid gap-3 p-3.5 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
            <StepCard
              icon={MessageSquare}
              step={1}
              title="Conecte o WhatsApp"
              done={isWaOk}
              doneLabel="Online"
              todoLabel="Falta"
              description={isWaOk ? "Pronto para enviar cobranças e responder clientes." : "Escaneie o QR Code com o celular da sua revenda."}
              to="/whatsapp"
              cta={isWaOk ? "Ver conexão" : "Conectar WhatsApp"}
            />
            <StepCard
              icon={Server}
              step={2}
              title="Ligue seu painel Sigma"
              done={isSigmaOk}
              doneLabel="Conectado"
              todoLabel="Falta"
              description={isSigmaOk ? "Acessos e renovações sincronizados." : "Informe o endereço e o token do seu painel."}
              to="/sigma"
              cta={isSigmaOk ? "Ver painel" : "Ligar Sigma"}
            />
            <StepCard
              icon={Users}
              step={3}
              title="Cadastre um cliente"
              done={hasClients}
              doneLabel="Feito"
              todoLabel="Falta"
              description={hasClients ? `${clients.length} cliente(s) cadastrado(s).` : "Adicione seu primeiro cliente ou importe do Sigma."}
              to="/clientes"
              cta={hasClients ? "Ver clientes" : "Novo cliente"}
            />
            <StepCard
              icon={CreditCard}
              step={4}
              title="Configure o Pix"
              done={isPixOk}
              doneLabel="Pronto"
              todoLabel="Falta"
              description={isPixOk ? "Seus clientes já conseguem pagar." : "Defina sua chave Pix ou conecte Mercado Pago / Asaas."}
              to="/pagamentos"
              cta={isPixOk ? "Ver recebimentos" : "Configurar Pix"}
            />
          </div>
        </section>
      )}

      <OrdersBoard
        orders={orders}
        approving={approveMutation.isPending}
        onApprove={(orderId) => approveMutation.mutate(orderId)}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                <TrendingUp className="size-4 shrink-0 text-primary" />
                Balanço de faturas
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">Recebidas, em aberto e em atraso</p>
            </div>
            <span className="numeric shrink-0 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-bold text-foreground">
              {formatBRL(totalPaid + totalPending)}
            </span>
          </header>
          <div className="px-2 pt-3 sm:px-3">
            <div className="h-[236px] w-full">
              <Suspense fallback={<div className="h-full w-full animate-pulse rounded-xl bg-muted/40" />}>
                <FinanceChart data={chartData} />
              </Suspense>
            </div>
          </div>
        </section>

        <DueSoonCard
          clients={upcomingClients}
          today={todayStr}
          sendingId={sendingId}
          onCharge={(client) => {
            const full = upcomingClients.find((item) => item.id === client.id);
            if (full) void cobrarClienteRapido(full);
          }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel-card">
          <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-warning" /> Faturas pendentes
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">Acompanhamento das cobranças emitidas</p>
            </div>
            <Link to="/cobrancas" className="shrink-0 text-[11px] font-bold text-primary hover:underline">
              Gerenciar
            </Link>
          </header>
          <div className="space-y-1.5 p-3">
            {dashError ? (
              <ErrorView onRetry={() => refetchDash()} />
            ) : dashLoading ? (
              <LoadingView rows={3} />
            ) : pendingInvoices.length === 0 ? (
              <EmptyState title="Nenhuma fatura em aberto" description="Todos os pagamentos estão em dia!" />
            ) : (
              pendingInvoices.slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="data-row">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">
                      {(invoice as unknown as { clients: { name: string } | null }).clients?.name ?? "Cliente"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Vence {formatDate(invoice.due_date)} · <span className="numeric font-semibold text-foreground/80">{formatBRL(invoice.amount)}</span>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      invoice.status === "overdue" ? "bg-destructive/12 text-destructive" : "bg-warning/15 text-warning",
                    )}
                  >
                    {invoice.status === "overdue" ? "Atrasada" : "Pendente"}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel-card">
          <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                <MessageSquare className="size-4 shrink-0 text-primary" /> Últimos disparos
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">Cobranças, boas-vindas e lembretes</p>
            </div>
            <Link to="/whatsapp" className="shrink-0 text-[11px] font-bold text-primary hover:underline">
              Conexão
            </Link>
          </header>
          <div className="space-y-1.5 p-3">
            {logs.length === 0 ? (
              <EmptyState title="Nenhum disparo registrado" description="O histórico aparece aqui após os envios do robô." />
            ) : (
              logs.slice(0, 5).map((log) => (
                <div key={log.id} className="data-row items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold text-foreground">
                        {(log as unknown as { clients: { name: string } | null }).clients?.name ?? log.phone}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {log.created_at ? formatDateTime(log.created_at) : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{log.body}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      log.status === "sent" ? "bg-primary/12 text-primary" : "bg-destructive/12 text-destructive",
                    )}
                  >
                    {log.status === "sent" ? "Enviado" : "Falhou"}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Painel() {
  const [tab, setTab] = useState("visao");
  const tabs = [
    { value: "visao", label: "Visão geral", description: "Seu mês em números" },
    { value: "indicadores", label: "Indicadores", description: "Evolução e comparações" },
    { value: "historico", label: "Histórico", description: "Tudo o que já aconteceu" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Centro de comando</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{tabs.find((item) => item.value === tab)?.description}</p>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            {tabs.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="text-xs font-bold">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {tab === "visao" ? <PainelOverview /> : tab === "indicadores" ? <IndicatorsPanel /> : <ActivitiesPanel />}
    </div>
  );
}

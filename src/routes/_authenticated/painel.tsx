import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runAutoBilling, sendWhatsAppMessage } from "@/lib/whatsapp.functions";
import { getSigmaSettings, syncSigmaClients } from "@/lib/sigma.functions";
import { approveOrder, type OrderItem } from "@/lib/orders.functions";
import defaultOrdersSeed from "../../../data/orders_default.json";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import {
  Send,
  Users,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Plus,
  RefreshCw,
  CheckCircle2,
  Calendar,
  Layers,
  Smartphone,
  Check,
  ChevronRight,
  Server,
  Zap,
  ShoppingBag,
  Copy,
  MessageCircle,
  Tv,
  ExternalLink,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

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

  const [running, setRunning] = useState(false);
  const [syncingSigma, setSyncingSigma] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await approveFn({ data: { orderId } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        queryClient.invalidateQueries({ queryKey: ["dashboard-v2"] });
        queryClient.invalidateQueries({ queryKey: ["orders-list"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
      } else {
        toast.error(res.message || "Erro ao aprovar pedido.");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha na aprovação.");
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-v2"],
    queryFn: async () => {
      let ordersList: OrderItem[] = [];
      try {
        const oRes = await fetch("/api/public/orders");
        if (oRes.ok) {
          const json = await oRes.json();
          if (Array.isArray(json?.orders) && json.orders.length > 0) {
            ordersList = json.orders;
          }
        }
      } catch {}
      if (ordersList.length === 0 && Array.isArray(defaultOrdersSeed)) {
        ordersList = defaultOrdersSeed as unknown as OrderItem[];
      }

      const [clients, invoices, logs, settings, sigmaRes] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("invoices").select("*, clients(name, phone)").order("due_date", { ascending: true }),
        supabase.from("message_logs").select("*, clients(name)").order("created_at", { ascending: false }).limit(6),
        supabase.from("whatsapp_settings").select("*").maybeSingle(),
        getSigma({}),
      ]);

      return {
        clients: clients.data ?? [],
        invoices: invoices.data ?? [],
        logs: logs.data ?? [],
        settings: settings.data,
        sigma: sigmaRes.ok ? sigmaRes.settings : null,
        orders: ordersList,
      };
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });

  const clients = data?.clients ?? [];
  const invoices = data?.invoices ?? [];
  const logs = data?.logs ?? [];
  const orders = (data?.orders ?? (defaultOrdersSeed as unknown as OrderItem[])) ?? [];
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const sigmaSettings = data?.sigma;

  // Financial calculations
  const activeClients = useMemo(() => clients.filter((c) => c.status === "active"), [clients]);
  const sigmaClients = useMemo(() => clients.filter((c) => Boolean(c.sigma_customer_id)), [clients]);
  const totalMonthlyFee = useMemo(
    () => activeClients.reduce((sum, c) => sum + Number(c.monthly_fee || 0), 0),
    [activeClients],
  );
  const ticketMedio = activeClients.length > 0 ? totalMonthlyFee / activeClients.length : 0;

  // Invoices calculations
  const pendingInvoices = useMemo(
    () => invoices.filter((i) => i.status === "pending" || i.status === "overdue"),
    [invoices],
  );
  const overdueInvoices = useMemo(() => invoices.filter((i) => i.status === "overdue"), [invoices]);
  const paidInvoices = useMemo(() => invoices.filter((i) => i.status === "paid"), [invoices]);

  const totalPaid = useMemo(
    () => paidInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0),
    [paidInvoices],
  );
  const totalOverdue = useMemo(
    () => overdueInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0),
    [overdueInvoices],
  );
  const totalPending = useMemo(
    () => pendingInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0),
    [pendingInvoices],
  );

  const serverDisplayName =
    sigmaSettings?.sigma_server_name?.trim() ||
    sigmaSettings?.sigma_server_display_name ||
    (sigmaSettings?.sigma_url ? sigmaSettings.sigma_url.replace(/^https?:\/\//i, "").split("/")[0] : "Servidor Sigma");

  // Clientes que vencem hoje ou nos próximos 3 dias
  const todayStr = new Date().toISOString().split("T")[0] ?? "";
  const upcomingClients = useMemo(() => {
    return clients
      .filter((c) => {
        const dueDate = c.next_due_date;
        if (!dueDate || c.status !== "active") return false;
        const diffTime = new Date(String(dueDate)).getTime() - new Date(todayStr).getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 3;
      })
      .slice(0, 5);
  }, [clients, todayStr]);

  // Chart data: Monthly comparison or status distribution
  const chartData = useMemo(() => {
    return [
      {
        name: "Recebido",
        valor: totalPaid,
        fill: "#ffffff",
      },
      {
        name: "Em Aberto",
        valor: totalPending,
        fill: "#a1a1aa",
      },
      {
        name: "Atrasado",
        valor: totalOverdue,
        fill: "#52525b",
      },
    ];
  }, [totalPaid, totalPending, totalOverdue]);

  async function runBilling() {
    setRunning(true);
    try {
      const result = await billing({});
      toast.success(
        `${result.created} fatura(s) gerada(s), ${result.sent} mensagem(ns) enviada(s)${
          result.failed ? `, ${result.failed} falha(s)` : ""
        }.`,
      );
      if (result.errors.length) toast.error(result.errors[0]);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao processar cobranças.");
    } finally {
      setRunning(false);
    }
  }

  async function cobrarClienteRapido(client: { id: string; name: string; phone: string; monthly_fee: number; next_due_date: string | null }) {
    setSendingId(client.id);
    try {
      const body = `Olá ${client.name}! Sua mensalidade de ${formatBRL(client.monthly_fee)} ${
        client.next_due_date ? `vence em ${formatDate(client.next_due_date)}` : "está disponível para pagamento"
      }. Qualquer dúvida estou à disposição! 🚀`;
      const result = await send({ data: { phone: client.phone, body, clientId: client.id } });
      if (result.ok) toast.success(`Cobrança enviada via WhatsApp para ${client.name}!`);
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
        toast.error(res.error ?? "Falha ao sincronizar com o Sigma.");
      }
    } catch {
      toast.error("Erro ao sincronizar com o Sigma.");
    } finally {
      setSyncingSigma(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Header com Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> Painel Sigma Operacional
            </span>
            <span className="text-xs text-muted-foreground">• Atualizado em tempo real</span>
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Visão Geral
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe o faturamento, controle a inadimplência e sincronize linhas do Painel Sigma em piloto automático.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            onClick={handleSyncSigma}
            disabled={syncingSigma}
            className="rounded-xl border-border/80 font-semibold gap-2 shadow-sm"
          >
            {syncingSigma ? <RefreshCw className="h-4 w-4 animate-spin text-primary" /> : <RefreshCw className="h-4 w-4 text-primary" />}
            Sincronizar Sigma
          </Button>

          <Button
            asChild
            variant="outline"
            className="rounded-xl border-white/20 text-white hover:bg-white/10 font-bold gap-2 shadow-sm"
          >
            <Link to="/pedidos">
              <ShoppingBag className="h-4 w-4" />
              Pedidos & PIX
              {pendingOrders.length > 0 && (
                <span className="rounded-full bg-white text-black px-1.5 py-0.2 text-[10px] font-black">
                  {pendingOrders.length}
                </span>
              )}
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="rounded-xl border-border/80 font-semibold gap-2 shadow-sm"
          >
            <Link to="/clientes">
              <Plus className="h-4 w-4" /> Novo Cliente
            </Link>
          </Button>

          <Button
            onClick={runBilling}
            disabled={running}
            className="rounded-xl font-bold gap-2 bg-white text-black hover:bg-zinc-200 border-0 transition-all shadow-sm"
          >
            {running ? <Clock3 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {running ? "Disparando..." : "Rodar Cobranças do Dia"}
          </Button>
        </div>
      </div>

      {/* 4 Cards Principais de Indicadores Financeiros */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Receita Mensal Prevista */}
        <Card className="surface-card hover-lift relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Receita Prevista
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white border border-white/20">
                <Wallet className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-foreground truncate">
              {formatBRL(totalMonthlyFee)}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{activeClients.length} clientes ativos</span>
              <span className="font-semibold text-white">Ticket: {formatBRL(ticketMedio)}</span>
            </div>
          </CardContent>
          <div className="h-1 w-full bg-gradient-to-r from-white to-zinc-600" />
        </Card>

        {/* Receita Já Recebida */}
        <Card className="surface-card hover-lift relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Recebido Este Mês
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white border border-white/20">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-foreground truncate">
              {formatBRL(totalPaid)}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{paidInvoices.length} faturas quitadas</span>
              <span className="font-semibold text-white">Liquidado</span>
            </div>
          </CardContent>
          <div className="h-1 w-full bg-gradient-to-r from-white to-zinc-500" />
        </Card>

        {/* Em Aberto / Atrasadas */}
        <Card className="surface-card hover-lift relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Em Aberto / Atraso
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-800 text-white border border-white/10">
                <AlertTriangle className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-foreground truncate">
              {formatBRL(totalPending)}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{overdueInvoices.length} faturas vencidas</span>
              <span className="font-semibold text-zinc-300">
                {overdueInvoices.length > 0 ? "Cobrança ativa" : "Tudo em dia"}
              </span>
            </div>
          </CardContent>
          <div className="h-1 w-full bg-gradient-to-r from-zinc-500 to-zinc-800" />
        </Card>

        {/* Painel Sigma & Servidor */}
        <Card className="surface-card hover-lift relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Painel Sigma
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white border border-white/20">
                <Server className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-xl font-extrabold text-foreground truncate" title={serverDisplayName}>
              {serverDisplayName}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{sigmaClients.length} linhas vinculadas</span>
              <Link to="/sigma" className="font-semibold text-white hover:underline flex items-center gap-0.5">
                Servidor <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
          <div className="h-1 w-full bg-gradient-to-r from-white to-zinc-700" />
        </Card>
      </div>

      {/* Widget Especial: Pedidos Recentes & Liberação 1-Clique */}
      <Card className="surface-elevated overflow-hidden border-border/80 bg-gradient-to-br from-card via-card/90 to-card/60 shadow-xl">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/40 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-white border border-white/20">
                <ShoppingBag className="h-4 w-4" />
              </span>
              <CardTitle className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                Pedidos do Robô & Liberação 1-Clique
                {pendingOrders.length > 0 && (
                  <Badge className="bg-white text-black border border-white text-[10px] font-black">
                    {pendingOrders.length} aguardando PIX
                  </Badge>
                )}
              </CardTitle>
            </div>
            <CardDescription className="mt-1 text-xs text-muted-foreground">
              Pedidos gerados pelo auto-atendimento do WhatsApp. Libere no Sigma e WhatsApp sem precisar esperar o cliente pagar.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs rounded-xl border-border/80 font-bold">
              <Link to="/pedidos">
                Ver todos os pedidos ({orders.length}) <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {orders.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Nenhum pedido gerado até o momento.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {orders.slice(0, 4).map((order) => {
                const isPending = order.status === "pending";
                const isApproved = order.status === "approved";
                return (
                  <div
                    key={order.id}
                    className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card/70 p-4 transition-all hover:border-white/40 hover:bg-card shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-black text-white">
                          #{order.order_number}
                        </span>
                        {isPending ? (
                          <Badge className="border border-white/20 bg-white/5 text-zinc-300 text-[9px] font-bold">
                            ⏳ Aguardando
                          </Badge>
                        ) : isApproved ? (
                          <Badge className="border border-white/30 bg-white/10 text-white text-[9px] font-bold">
                            ✅ Liberado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px]">Cancelado</Badge>
                        )}
                      </div>

                      <p className="mt-2 text-sm font-extrabold text-white truncate">
                        {order.customer_name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {order.customer_phone}
                      </p>

                      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                        <span className="text-muted-foreground truncate max-w-[130px]" title={order.plan_name}>
                          {order.plan_name}
                        </span>
                        <span className="font-black text-white">
                          R$ {Number(order.amount).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-border/30 flex items-center gap-2">
                      {isPending ? (
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(order.id)}
                          disabled={approveMutation.isPending}
                          className="w-full h-8 text-xs font-extrabold bg-white text-black hover:bg-zinc-200 border-0 shadow-sm"
                          title="Aprovar e liberar linha no Sigma e WhatsApp agora"
                        >
                          {approveMutation.isPending ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Zap className="h-3.5 w-3.5 fill-black text-black mr-1" />
                          )}
                          Liberar Agora
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="ghost" className="w-full h-8 text-xs text-muted-foreground hover:text-white">
                          <Link to="/pedidos">
                            Ver Detalhes <ChevronRight className="h-3.5 w-3.5 ml-1" />
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

      {/* Seção Central: Gráfico Financeiro + Clientes Vencendo Hoje */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Gráfico Analítico (Ocupa 2 colunas) */}
        <Card className="surface-elevated lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Balanço Financeiro de Faturas
              </CardTitle>
              <CardDescription>Distribuição de valores: Recebidos vs Em Aberto vs Atrasados</CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              R$ {formatBRL(totalPaid + totalPending)}
            </Badge>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(v) => `R$${v}`}
                  />
                  <Tooltip
                    formatter={(val: number) => [formatBRL(val), "Valor"]}
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      borderColor: "var(--color-border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)",
                    }}
                  />
                  <Bar dataKey="valor" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Card: Clientes Vencendo Hoje / Próximos 3 Dias */}
        <Card className="surface-elevated overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Vencimentos Próximos
              </CardTitle>
              <Badge variant="secondary" className="rounded-full text-[11px]">
                {upcomingClients.length} urgentes
              </Badge>
            </div>
            <CardDescription>Clientes que vencem hoje ou nos próximos 3 dias</CardDescription>
          </CardHeader>

          <CardContent className="flex-1 space-y-3 pt-1">
            {upcomingClients.length === 0 ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 p-4 text-center">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white border border-white/20">
                  <Check className="h-5 w-5" />
                </div>
                <p className="mt-2 text-sm font-semibold">Tudo tranquilo!</p>
                <p className="text-xs text-muted-foreground">Nenhum cliente vencendo nos próximos dias.</p>
              </div>
            ) : (
              upcomingClients.map((client) => {
                const isToday = client.next_due_date === todayStr;
                return (
                  <div
                    key={client.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-bold">{client.name}</p>
                        {isToday && (
                          <span className="rounded bg-white text-black px-1.5 py-0.2 text-[9px] font-extrabold uppercase">
                            Hoje
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatBRL(client.monthly_fee)} • {formatDate(client.next_due_date)}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingId === client.id}
                      onClick={() => cobrarClienteRapido(client)}
                      className="h-8 rounded-lg px-2.5 text-xs font-bold gap-1 border-white/20 text-white hover:bg-white/10"
                    >
                      {sendingId === client.id ? (
                        <Clock3 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Cobrar
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>

          <div className="border-t border-border/50 p-3 bg-muted/20">
            <Button asChild variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground hover:text-foreground">
              <Link to="/cobrancas">
                Ver todas as cobranças <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      {/* Seção Inferior: Últimas Faturas + Histórico de Mensagens WhatsApp */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Faturas em Aberto */}
        <Card className="surface-elevated overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-white" />
                Faturas Pendentes & Atrasadas
              </CardTitle>
              <CardDescription>Acompanhe quem ainda não efetuou o pagamento</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/cobrancas">Gerenciar</Link>
            </Button>
          </CardHeader>

          <CardContent className="space-y-2.5 pt-1">
            {pendingInvoices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
                <p className="text-sm font-semibold">Nenhuma fatura em aberto</p>
                <p className="text-xs text-muted-foreground mt-1">Todos os pagamentos estão em dia!</p>
              </div>
            ) : (
              pendingInvoices.slice(0, 6).map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {(invoice as unknown as { clients: { name: string } | null }).clients?.name ?? "Cliente"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vencimento: {formatDate(invoice.due_date)} • {formatBRL(invoice.amount)}
                    </p>
                  </div>
                  <Badge
                    variant={invoice.status === "overdue" ? "destructive" : "secondary"}
                    className="shrink-0 rounded-full font-semibold text-xs"
                  >
                    {invoice.status === "overdue" ? "Atrasada" : "Pendente"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Histórico do Robô WhatsApp */}
        <Card className="surface-elevated overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Últimos Disparos de WhatsApp
              </CardTitle>
              <CardDescription>Mensagens de cobrança e boas-vindas enviadas</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/configuracoes">Ajustes</Link>
            </Button>
          </CardHeader>

          <CardContent className="space-y-2.5 pt-1">
            {logs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
                <p className="text-sm font-semibold">Nenhum disparo registrado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Assim que o robô enviar mensagens, o histórico aparecerá aqui.
                </p>
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold text-foreground">
                        {(log as unknown as { clients: { name: string } | null }).clients?.name ?? log.phone}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {log.created_at ? formatDateTime(log.created_at) : ""}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {log.body}
                    </p>
                  </div>
                  <Badge
                    variant={log.status === "sent" ? "default" : "destructive"}
                    className="shrink-0 rounded-full text-[10px] font-bold"
                  >
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

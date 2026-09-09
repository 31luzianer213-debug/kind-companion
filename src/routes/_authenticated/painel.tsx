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
  Users,
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
  ShieldCheck,
  CreditCard,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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
    if (typeof window !== "undefined") {
      return localStorage.getItem("iptv_dismiss_onboarding") !== "true";
    }
    return true;
  });

  const { data: waStatus } = useQuery({
    queryKey: ["painel-wa-status"],
    queryFn: () => getStatus({ data: {} }),
    staleTime: 60000,
  });

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

  // Chart data: Monthly comparison
  const chartData = useMemo(() => {
    return [
      {
        name: "Recebido",
        valor: totalPaid,
        fill: "#10b981",
      },
      {
        name: "Em Aberto",
        valor: totalPending,
        fill: "#f59e0b",
      },
      {
        name: "Atrasado",
        valor: totalOverdue,
        fill: "#f43f5e",
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
      const res = await syncSigma({ data: {} });
      if (res.ok) {
        toast.success(`Sigma sincronizado: ${res.created} novos e ${res.updated} atualizados!`);
        queryClient.invalidateQueries();
      } else {
        toast.error(res.error ?? "Falha ao sincronizar com o Sigma.", {
          duration: 12000,
          action: {
            label: "Configurar",
            onClick: () => {
              window.location.href = "/sigma";
            },
          },
        });
      }
    } catch (err: any) {
      console.error("Erro no handleSyncSigma:", err);
      toast.error(err?.message ? `Erro: ${err.message}` : "Erro ao sincronizar com o Sigma.", { duration: 8000 });
    } finally {
      setSyncingSigma(false);
    }
  }

  const isSigmaOk = Boolean(sigmaSettings?.isConfigured);
  const isWaOk = waStatus?.state === "open";
  const isPixOk = Boolean(data?.settings?.pix_key || data?.settings?.asaas_api_key || data?.settings?.mp_access_token);
  const completedSteps = (isSigmaOk ? 1 : 0) + (isWaOk ? 1 : 0) + (isPixOk ? 1 : 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header com Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Visão Geral
            </h1>
            <Badge variant="outline" className="text-xs gap-1.5 rounded-md border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              100% Grátis
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Acompanhe o faturamento em tempo real, aprove pedidos e automatize cobranças pelo WhatsApp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncSigma}
            disabled={syncingSigma}
            className="rounded-lg border-border font-medium gap-1.5 shadow-sm text-xs"
          >
            <RefreshCw className={`size-3.5 text-primary ${syncingSigma ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-lg border-border font-medium gap-1.5 shadow-sm text-xs"
          >
            <Link to="/clientes" search={{ novo: "1" } as any}>
              <Plus className="size-3.5 text-primary" /> Novo Cliente
            </Link>
          </Button>

          <Button
            size="sm"
            onClick={runBilling}
            disabled={running}
            className="rounded-lg font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm text-xs"
          >
            {running ? <Clock3 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {running ? "Processando..." : "Rodar Cobranças"}
          </Button>
        </div>
      </div>

      {/* 3-Step Setup Assistant for Revendedores */}
      {showOnboarding && (
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm">
                <Sparkles className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground">
                    Checklist de Ativação da sua Operação
                  </h2>
                  <span className="rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {completedSteps} de 3 Prontos
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Complete as 3 etapas essenciais para deixar seu IPTV no piloto automático.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowOnboarding(false);
                if (typeof window !== "undefined") {
                  localStorage.setItem("iptv_dismiss_onboarding", "true");
                }
              }}
              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2 self-end sm:self-auto"
            >
              <X className="size-3.5 mr-1" /> Dispensar
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {/* Step 1: Servidor Sigma */}
            <div className={cn(
              "flex flex-col justify-between rounded-lg border p-3.5 transition-colors",
              isSigmaOk
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-border/80 bg-card/80 hover:border-primary/40"
            )}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Server className="size-3.5 text-primary" />
                    1. Servidor Sigma
                  </span>
                  {isSigmaOk ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 text-[10px] gap-1 py-0 font-semibold">
                      <CheckCircle2 className="size-3" /> Conectado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] py-0 font-medium">
                      Pendente
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isSigmaOk ? "Sincronização de linhas e renovações ativa." : "Informe a URL da API e token para sincronizar linhas."}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-border/40">
                <Button asChild size="sm" variant={isSigmaOk ? "outline" : "default"} className="w-full h-7 text-xs font-semibold rounded-md">
                  <Link to="/sigma">
                    {isSigmaOk ? "Ver Configurações" : "Conectar Sigma"} <ChevronRight className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Step 2: WhatsApp Evolution */}
            <div className={cn(
              "flex flex-col justify-between rounded-lg border p-3.5 transition-colors",
              isWaOk
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-border/80 bg-card/80 hover:border-primary/40"
            )}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <MessageSquare className="size-3.5 text-emerald-500" />
                    2. WhatsApp Evolution
                  </span>
                  {isWaOk ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 text-[10px] gap-1 py-0 font-semibold">
                      <CheckCircle2 className="size-3" /> Online
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] py-0 font-medium">
                      Desconectado
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isWaOk ? "Disparos automáticos de cobrança e boas-vindas ativos." : "Escaneie o QR Code para disparar mensagens automáticas."}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-border/40">
                <Button asChild size="sm" variant={isWaOk ? "outline" : "default"} className="w-full h-7 text-xs font-semibold rounded-md">
                  <Link to="/whatsapp">
                    {isWaOk ? "Ver Conexão" : "Escanear QR Code"} <ChevronRight className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Step 3: Forma de Recebimento PIX */}
            <div className={cn(
              "flex flex-col justify-between rounded-lg border p-3.5 transition-colors",
              isPixOk
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-border/80 bg-card/80 hover:border-primary/40"
            )}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <CreditCard className="size-3.5 text-amber-500" />
                    3. Recebimento Pix
                  </span>
                  {isPixOk ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 text-[10px] gap-1 py-0 font-semibold">
                      <CheckCircle2 className="size-3" /> Configurado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] py-0 font-medium">
                      Pendente
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isPixOk ? "Chave Pix / Gateway configurado para os pagamentos." : "Defina sua chave Pix ou conecte Asaas / Mercado Pago."}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-border/40">
                <Button asChild size="sm" variant={isPixOk ? "outline" : "default"} className="w-full h-7 text-xs font-semibold rounded-md">
                  <Link to="/pagamentos">
                    {isPixOk ? "Ver Chaves" : "Configurar Pix"} <ChevronRight className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4 Cards Principais de Indicadores Financeiros */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Receita Mensal Prevista */}
        <Card className="surface-card rounded-lg overflow-hidden border-border/70 hover:border-border transition-colors">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Receita Prevista
              </span>
              <span className="grid size-8 place-items-center rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <Wallet className="size-4" />
              </span>
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight text-foreground truncate">
                {formatBRL(totalMonthlyFee)}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{activeClients.length} ativos</span>
                <span className="font-medium text-foreground">Ticket: {formatBRL(ticketMedio)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receita Já Recebida */}
        <Card className="surface-card rounded-lg overflow-hidden border-border/70 hover:border-border transition-colors">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recebido no Mês
              </span>
              <span className="grid size-8 place-items-center rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="size-4" />
              </span>
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 truncate">
                {formatBRL(totalPaid)}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{paidInvoices.length} faturas quitadas</span>
                <span className="font-semibold text-emerald-500 text-[11px]">Liquidado</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Em Aberto / Atrasadas */}
        <Card className="surface-card rounded-lg overflow-hidden border-border/70 hover:border-border transition-colors">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Em Aberto / Atraso
              </span>
              <span className="grid size-8 place-items-center rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <AlertTriangle className="size-4" />
              </span>
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight text-foreground truncate">
                {formatBRL(totalPending)}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{overdueInvoices.length} vencidas</span>
                <span className={`font-semibold text-[11px] ${overdueInvoices.length > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                  {overdueInvoices.length > 0 ? "Cobrança ativa" : "Tudo em dia"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Painel Sigma & Servidor */}
        <Card className="surface-card rounded-lg overflow-hidden border-border/70 hover:border-border transition-colors">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Servidor Sigma
              </span>
              <span className="grid size-8 place-items-center rounded-md bg-sky-500/10 text-sky-500 border border-sky-500/20">
                <Server className="size-4" />
              </span>
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-foreground truncate" title={serverDisplayName}>
                {serverDisplayName}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{sigmaClients.length} linhas vinculadas</span>
                <Link to="/sigma" className="font-semibold text-primary hover:underline flex items-center gap-0.5 text-[11px]">
                  Configurar <ArrowUpRight className="size-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Widget Especial: Pedidos Recentes & Liberação 1-Clique */}
      <Card className="surface-card rounded-lg overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3.5 pt-4 px-4 sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <ShoppingBag className="size-4" />
              </span>
              <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                Pedidos do Robô WhatsApp
                {pendingOrders.length > 0 && (
                  <Badge variant="warning" className="text-[10px] font-semibold rounded-md">
                    {pendingOrders.length} aguardando PIX
                  </Badge>
                )}
              </CardTitle>
            </div>
            <CardDescription className="mt-0.5 text-xs text-muted-foreground">
              Aprovação e entrega imediata de credenciais no Sigma e WhatsApp.
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost" className="gap-1 text-xs rounded-md h-8 text-muted-foreground hover:text-foreground">
            <Link to="/pedidos">
              Ver todos ({orders.length}) <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {orders.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
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
                    className="flex flex-col justify-between rounded-lg border border-border/70 bg-card p-3.5 transition-colors hover:border-border shadow-none"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          #{order.order_number}
                        </span>
                        {isPending ? (
                          <Badge variant="warning" className="text-[10px] rounded-md px-1.5 py-0">
                            Aguardando PIX
                          </Badge>
                        ) : isApproved ? (
                          <Badge variant="success" className="text-[10px] rounded-md px-1.5 py-0">
                            Liberado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] rounded-md px-1.5 py-0">Cancelado</Badge>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-bold text-foreground truncate">
                          {order.customer_name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {order.customer_phone}
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                        <span className="text-muted-foreground truncate max-w-[120px]" title={order.plan_name}>
                          {order.plan_name}
                        </span>
                        <span className="font-bold text-foreground">
                          R$ {Number(order.amount).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-border/40">
                      {isPending ? (
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(order.id)}
                          disabled={approveMutation.isPending}
                          className="w-full h-8 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        >
                          {approveMutation.isPending ? (
                            <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                          ) : (
                            <Zap className="size-3.5 fill-white text-white mr-1.5" />
                          )}
                          Liberar Agora
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline" className="w-full h-8 text-xs rounded-md text-muted-foreground hover:text-foreground">
                          <Link to="/pedidos">
                            Ver Pedido <ChevronRight className="size-3 ml-1" />
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
        <Card className="surface-card rounded-lg lg:col-span-2 overflow-hidden border-border/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 sm:px-5">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <TrendingUp className="size-4 text-primary" />
                Balanço Financeiro de Faturas
              </CardTitle>
              <CardDescription className="text-xs">Distribuição de faturas recebidas, em aberto e em atraso</CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs rounded-md">
              R$ {formatBRL(totalPaid + totalPending)}
            </Badge>
          </CardHeader>
          <CardContent className="pt-4 px-4 sm:px-5">
            <div className="h-[240px] w-full">
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
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Card: Clientes Vencendo Hoje / Próximos 3 Dias */}
        <Card className="surface-card rounded-lg overflow-hidden flex flex-col border-border/70">
          <CardHeader className="pb-2 pt-4 px-4 sm:px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Calendar className="size-4 text-primary" />
                Vencimentos Imediatos
              </CardTitle>
              <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                {upcomingClients.length} próximos
              </Badge>
            </div>
            <CardDescription className="text-xs">Clientes com vencimento hoje ou nos próximos 3 dias</CardDescription>
          </CardHeader>

          <CardContent className="flex-1 space-y-2.5 pt-2 px-4 sm:px-5">
            {upcomingClients.length === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-4 text-center">
                <div className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground mb-2">
                  <Check className="size-4" />
                </div>
                <p className="text-xs font-semibold text-foreground">Tudo em dia!</p>
                <p className="text-[11px] text-muted-foreground">Nenhum cliente vencendo nos próximos dias.</p>
              </div>
            ) : (
              upcomingClients.map((client) => {
                const isToday = client.next_due_date === todayStr;
                return (
                  <div
                    key={client.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-semibold text-foreground">{client.name}</p>
                        {isToday && (
                          <span className="rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1 py-0.2 text-[9px] font-bold uppercase">
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
                      className="h-7 rounded-md px-2 text-xs font-medium gap-1 border-border"
                    >
                      {sendingId === client.id ? (
                        <Clock3 className="size-3 animate-spin text-primary" />
                      ) : (
                        <Send className="size-3" />
                      )}
                      Cobrar
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>

          <div className="border-t border-border/50 p-2.5 bg-muted/10">
            <Button asChild variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground hover:text-foreground h-7">
              <Link to="/cobrancas">
                Ver todas as cobranças <ChevronRight className="size-3" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      {/* Seção Inferior: Últimas Faturas + Histórico de Mensagens WhatsApp */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Faturas em Aberto */}
        <Card className="surface-card rounded-lg overflow-hidden border-border/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 sm:px-5">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <AlertTriangle className="size-4 text-amber-500" />
                Faturas Pendentes & Atrasadas
              </CardTitle>
              <CardDescription className="text-xs">Acompanhamento das cobranças emitidas</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs h-7">
              <Link to="/cobrancas">Gerenciar</Link>
            </Button>
          </CardHeader>

          <CardContent className="space-y-2 pt-1 px-4 sm:px-5 pb-4">
            {pendingInvoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                <p className="text-xs font-semibold text-foreground">Nenhuma fatura em aberto</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Todos os pagamentos estão em dia!</p>
              </div>
            ) : (
              pendingInvoices.slice(0, 5).map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {(invoice as unknown as { clients: { name: string } | null }).clients?.name ?? "Cliente"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Vencimento: {formatDate(invoice.due_date)} • {formatBRL(invoice.amount)}
                    </p>
                  </div>
                  <Badge
                    variant={invoice.status === "overdue" ? "destructive" : "warning"}
                    className="shrink-0 rounded-md font-medium text-[11px]"
                  >
                    {invoice.status === "overdue" ? "Atrasada" : "Pendente"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Histórico do Robô WhatsApp */}
        <Card className="surface-card rounded-lg overflow-hidden border-border/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 sm:px-5">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <MessageSquare className="size-4 text-primary" />
                Últimos Disparos de WhatsApp
              </CardTitle>
              <CardDescription className="text-xs">Cobranças, boas-vindas e lembretes automáticos</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs h-7">
              <Link to="/whatsapp">Conexão</Link>
            </Button>
          </CardHeader>

          <CardContent className="space-y-2 pt-1 px-4 sm:px-5 pb-4">
            {logs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                <p className="text-xs font-semibold text-foreground">Nenhum disparo registrado</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  O histórico aparecerá aqui após os disparos do robô.
                </p>
              </div>
            ) : (
              logs.slice(0, 5).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {(log as unknown as { clients: { name: string } | null }).clients?.name ?? log.phone}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {log.created_at ? formatDateTime(log.created_at) : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {log.body}
                    </p>
                  </div>
                  <Badge
                    variant={log.status === "sent" ? "default" : "destructive"}
                    className="shrink-0 rounded-md text-[10px] font-semibold"
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

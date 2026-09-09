import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getOrdersList,
  approveOrder,
  cancelOrder,
  createManualOrder,
  type OrderItem,
} from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  ExternalLink,
  Zap,
  DollarSign,
  Plus,
  Tv,
  Calendar,
  Layers,
  Copy,
  MessageCircle,
  Sparkles,
  Smartphone,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

import defaultOrdersSeed from "../../../data/orders_default.json";

export const Route = createFileRoute("/_authenticated/pedidos")({
  component: PedidosPage,
});

function PedidosPage() {
  const queryClient = useQueryClient();
  const getOrdersFn = useServerFn(getOrdersList);
  const approveFn = useServerFn(approveOrder);
  const cancelFn = useServerFn(cancelOrder);
  const createOrderFn = useServerFn(createManualOrder);

  const [activeTab, setActiveTab] = useState<string>("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [releasedCredentials, setReleasedCredentials] = useState<{
    orderNumber: number;
    username: string;
    password?: string | undefined;
    m3uUrl?: string | undefined;
    customerPhone: string;
  } | null>(null);

  // Modal de Novo Pedido Manual
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({
    customer_name: "",
    customer_phone: "",
    plan_name: "Plano Mensal (1 Mês - 1 Tela)",
    amount: "35.00",
    duration_months: 1,
    screens: 1,
    type: "new_access" as "new_access" | "renewal",
    target_username: "",
    notes: "",
  });

  // Query para listar os pedidos em tempo real (atualiza a cada 3s)
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["orders-list"],
    initialData: (defaultOrdersSeed as unknown as OrderItem[]) || [],
    queryFn: async () => {
      try {
        const res = await getOrdersFn({ data: {} });
        if (res?.orders && res.orders.length > 0) {
          return res.orders;
        }
      } catch (err) {
        console.warn("Aviso ao carregar lista via serverFn:", err);
      }

      // Fallback seguro via API pública
      try {
        const res = await fetch("/api/public/orders");
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.orders) && json.orders.length > 0) {
            return json.orders;
          }
        }
      } catch (err) {
        console.warn("Aviso no fallback /api/public/orders:", err);
      }

      // Fallback garantido pré-compilado no bundle (Lovable Cloud / Edge Workers)
      if (Array.isArray(defaultOrdersSeed) && defaultOrdersSeed.length > 0) {
        return defaultOrdersSeed as unknown as OrderItem[];
      }

      return [];
    },
    refetchInterval: 3000,
  });

  const orders: OrderItem[] = data ?? [];

  // Mutações
  const approveMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await approveFn({ data: { orderId } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        queryClient.invalidateQueries({ queryKey: ["orders-list"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
        setReleaseModalOpen(false);

        if (res.username && res.order) {
          setReleasedCredentials({
            orderNumber: res.order.order_number,
            username: res.username,
            password: res.password,
            m3uUrl: res.m3uUrl,
            customerPhone: res.order.customer_phone,
          });
          setCredentialsModalOpen(true);
        }
      } else {
        toast.error(res.message || "Erro ao aprovar pedido.");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha na aprovação.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await cancelFn({ data: { orderId } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        queryClient.invalidateQueries({ queryKey: ["orders-list"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
      } else {
        toast.error(res.message || "Erro ao cancelar pedido.");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha no cancelamento.");
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        customer_name: newOrderForm.customer_name,
        customer_phone: newOrderForm.customer_phone,
        plan_name: newOrderForm.plan_name,
        amount: parseFloat(newOrderForm.amount) || 35.0,
        duration_months: Number(newOrderForm.duration_months) || 1,
        screens: Number(newOrderForm.screens) || 1,
        type: newOrderForm.type,
      };
      if (newOrderForm.target_username) payload.target_username = newOrderForm.target_username;
      if (newOrderForm.notes) payload.notes = newOrderForm.notes;
      return await createOrderFn({ data: payload });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Pedido #${res.order.order_number} cadastrado com sucesso!`);
        queryClient.invalidateQueries({ queryKey: ["orders-list"] });
        setNewOrderModalOpen(false);
        setNewOrderForm({
          customer_name: "",
          customer_phone: "",
          plan_name: "Plano Mensal (1 Mês - 1 Tela)",
          amount: "35.00",
          duration_months: 1,
          screens: 1,
          type: "new_access",
          target_username: "",
          notes: "",
        });
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao criar pedido.");
    },
  });

  // Métricas
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const approvedOrders = orders.filter((o) => o.status === "approved");
  const totalApprovedRevenue = approvedOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const totalPendingRevenue = pendingOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  // Filtro
  const filteredOrders = orders.filter((order) => {
    // Filtro por Tab
    if (activeTab === "pending" && order.status !== "pending") return false;
    if (activeTab === "approved" && order.status !== "approved") return false;
    if (activeTab === "cancelled" && order.status !== "cancelled") return false;

    // Filtro por Busca
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      order.customer_name.toLowerCase().includes(term) ||
      order.customer_phone.includes(term) ||
      String(order.order_number).includes(term) ||
      order.plan_name.toLowerCase().includes(term) ||
      (order.target_username && order.target_username.toLowerCase().includes(term))
    );
  });

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência!`);
  }

  function handleOpenWhatsApp(phone: string, customerName: string) {
    const clean = phone.replace(/\D/g, "");
    const formatted = clean.length <= 11 ? `55${clean}` : clean;
    const msg = encodeURIComponent(`Olá ${customerName}, tudo bem? Falo da central de atendimento do IPTV.`);
    window.open(`https://wa.me/${formatted}?text=${msg}`, "_blank");
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Principal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              Pedidos & Liberação de Acesso
            </h1>
            <Badge className="border border-white/30 bg-white/10 text-white gap-1 text-xs font-semibold">
              <Zap className="h-3 w-3 fill-white text-white" /> Liberação 1-Clique
            </Badge>
            <Badge className="border border-white/20 bg-white/5 text-zinc-300 gap-1 text-xs">
              <RefreshCw className="h-3 w-3" /> Tempo Real
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe pedidos gerados pelo Bot WhatsApp e Loja. Você pode aprovar e liberar acessos no Sigma e WhatsApp a qualquer momento (mesmo antes do cliente pagar o PIX).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="gap-2 border-white/20 text-white hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin text-white" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setNewOrderModalOpen(true)}
            className="gap-2 bg-white text-black hover:bg-zinc-200 font-bold border-0 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo Pedido Manual
          </Button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Aguardando PIX (Pendentes)
            </CardTitle>
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white border border-white/20">
                <Clock className="h-5 w-5" />
              </div>
              {pendingOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[9px] font-black text-black animate-ping" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">
              {pendingOrders.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Total a receber:{" "}
              <strong className="text-foreground">
                R$ {totalPendingRevenue.toFixed(2).replace(".", ",")}
              </strong>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Acessos Liberados
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white border border-white/20">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">
              {approvedOrders.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Entregues no WhatsApp & Sigma
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Faturamento Aprovado
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white border border-white/20">
              <DollarSign className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">
              R$ {totalApprovedRevenue.toFixed(2).replace(".", ",")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Total faturado via PIX
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total de Pedidos
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white border border-white/20">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-foreground">
              {totalOrders}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Histórico geral de pedidos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Controles de Filtros e Busca */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Abas de Filtro */}
        <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-card p-1 shadow-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "pending"
                ? "bg-white text-black shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Pendentes
            {pendingOrders.length > 0 && (
              <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                activeTab === "pending" ? "bg-black text-white" : "bg-white/10 text-white"
              }`}>
                {pendingOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("approved")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "approved"
                ? "bg-white text-black shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Liberados
            <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-black ${
              activeTab === "approved" ? "bg-black text-white" : "bg-white/10 text-white"
            }`}>
              {approvedOrders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "all"
                ? "bg-white text-black shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Todos
            <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-black ${
              activeTab === "all" ? "bg-black text-white" : "bg-white/10 text-white"
            }`}>
              {totalOrders}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("cancelled")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "cancelled"
                ? "bg-zinc-800 text-white shadow border border-white/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancelados
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, zap, nº..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs bg-card"
          />
        </div>
      </div>

      {/* Lista de Pedidos */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 py-16 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground font-medium">Carregando pedidos...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 py-16 text-center bg-card/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-foreground">
            Nenhum pedido encontrado
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {activeTab === "pending"
              ? "Nenhum pedido pendente aguardando liberação no momento."
              : "Não há pedidos para exibir com os filtros selecionados."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNewOrderModalOpen(true)}
            className="mt-4 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Criar Pedido Manual
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredOrders.map((order) => {
            const isPending = order.status === "pending";
            const isApproved = order.status === "approved";
            const isCancelled = order.status === "cancelled";
            const isMercadoPago = order.payment_method === "mercadopago_pix";

            return (
              <Card
                key={order.id}
                className={`overflow-hidden transition-all duration-200 border ${
                  isPending
                    ? "border-white/20 bg-card hover:border-white/40"
                    : isApproved
                    ? "border-white/15 bg-card hover:border-white/30"
                    : "border-border/60 bg-card/60 opacity-80"
                }`}
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Bloco 1: Identificação e Cliente */}
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-black text-sm border shadow-sm ${
                          isPending
                            ? "bg-white/10 text-white border-white/20"
                            : isApproved
                            ? "bg-white text-black border-white"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        #{order.order_number}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-base text-foreground">
                            {order.customer_name}
                          </span>

                          {/* Status Badge */}
                          {isPending && (
                            <Badge className="border border-white/20 bg-white/5 text-zinc-300 text-[10px] font-bold uppercase tracking-wider">
                              ⏳ Aguardando PIX
                            </Badge>
                          )}
                          {isApproved && (
                            <Badge className="border border-white/30 bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider">
                              ✅ Acesso Liberado
                            </Badge>
                          )}
                          {isCancelled && (
                            <Badge variant="outline" className="text-muted-foreground text-[10px]">
                              Cancelado
                            </Badge>
                          )}

                          {/* Tipo de Pedido */}
                          <Badge variant="secondary" className="text-[10px] font-medium border border-border/50">
                            {order.type === "renewal" ? "🔄 Renovação" : "⭐ Novo Acesso"}
                          </Badge>
                        </div>

                        {/* Detalhes do Cliente */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <button
                            onClick={() => handleOpenWhatsApp(order.customer_phone, order.customer_name)}
                            className="inline-flex items-center gap-1 font-semibold text-zinc-300 hover:text-white hover:underline"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            {order.customer_phone}
                            <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                          </button>

                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 opacity-60" />
                            {new Date(order.created_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>

                          {order.target_username && (
                            <span className="inline-flex items-center gap-1 font-mono text-zinc-300 font-semibold">
                              Login: {order.target_username}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bloco 2: Detalhes do Plano e Pagamento */}
                    <div className="flex flex-wrap items-center gap-4 lg:gap-6 border-t border-border/40 pt-3 lg:border-t-0 lg:pt-0">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Plano & Telas
                        </span>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Tv className="h-4 w-4 text-white" />
                          <span className="text-xs font-semibold text-foreground">
                            {order.plan_name}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            ({order.screens || 1} {order.screens === 1 ? "tela" : "telas"})
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Forma & Valor
                        </span>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-base font-black text-foreground">
                            R$ {Number(order.amount).toFixed(2).replace(".", ",")}
                          </span>
                          <Badge
                            variant="outline"
                            className="border-white/20 text-white bg-white/5 text-[9px] font-bold"
                          >
                            {isMercadoPago ? "⚡ Mercado Pago" : "📋 PIX Manual"}
                          </Badge>
                        </div>
                      </div>

                      {/* Bloco 3: Botões de Ação */}
                      <div className="flex flex-wrap items-center gap-2">
                        {isPending && (
                          <>
                            {order.pix_code && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(order.pix_code!, "Código PIX Copia e Cola")}
                                className="gap-1 text-xs border-white/20 text-white hover:bg-white/10"
                                title="Copiar código PIX para testar ou enviar"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                Copiar PIX
                              </Button>
                            )}

                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedOrder(order);
                                setReleaseModalOpen(true);
                              }}
                              className="gap-2 bg-white text-black hover:bg-zinc-200 font-extrabold border-0 shadow-sm transition-all hover:scale-[1.02]"
                              title="Aprovar este pedido e liberar acesso no Sigma e WhatsApp sem esperar o cliente pagar"
                            >
                              <Zap className="h-4 w-4 fill-black text-black" />
                              ⚡ Liberar Acesso Agora
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Deseja realmente cancelar o pedido #${order.order_number}?`)) {
                                  cancelMutation.mutate(order.id);
                                }
                              }}
                              className="text-xs text-muted-foreground hover:text-white"
                            >
                              Cancelar
                            </Button>
                          </>
                        )}

                        {isApproved && (
                          <div className="flex items-center gap-2">
                            {order.target_username && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setReleasedCredentials({
                                    orderNumber: order.order_number,
                                    username: order.target_username || "",
                                    customerPhone: order.customer_phone,
                                  });
                                  setCredentialsModalOpen(true);
                                }}
                                className="gap-1.5 text-xs border-white/20 text-white hover:bg-white/10"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Ver Acessos
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenWhatsApp(order.customer_phone, order.customer_name)}
                              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              Conversar
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notas ou Informações Adicionais */}
                  {order.notes && (
                    <div className="mt-3 rounded-lg bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span>{order.notes}</span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE LIBERAÇÃO DE ACESSO */}
      <Dialog open={releaseModalOpen} onOpenChange={setReleaseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <Zap className="h-5 w-5 fill-white text-white" />
              Liberar Acesso do Pedido #{selectedOrder?.order_number}
            </DialogTitle>
            <DialogDescription>
              Você pode liberar o acesso imediatamente (mesmo antes do cliente pagar o PIX).
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pedido:</span>
                  <span className="font-bold">#{selectedOrder.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-bold">{selectedOrder.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WhatsApp:</span>
                  <span className="font-bold">{selectedOrder.customer_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plano:</span>
                  <span className="font-bold text-white">{selectedOrder.plan_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor PIX:</span>
                  <span className="font-bold text-white">
                    R$ {Number(selectedOrder.amount).toFixed(2).replace(".", ",")}
                  </span>
                </div>
                {selectedOrder.pix_code && (
                  <div className="pt-2 border-t border-border/40 flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">PIX Copia e Cola:</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(selectedOrder.pix_code!, "Código PIX Copia e Cola")}
                      className="h-7 text-xs gap-1 text-white hover:bg-white/10"
                    >
                      <Copy className="h-3 w-3" /> Copiar Código PIX
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-xs space-y-1.5 text-zinc-300">
                <div className="flex items-center gap-1.5 font-bold text-white">
                  <CheckCircle2 className="h-4 w-4" />
                  Ao clicar em Aprovar Agora:
                </div>
                <p>1. Criará ou renovará a linha no <strong>Painel Sigma</strong> com os dias do plano.</p>
                <p>2. Gerará a <strong>Lista M3U Plus</strong> e o Guia EPG completos.</p>
                <p>3. Enviará uma mensagem imediata no <strong>WhatsApp do cliente</strong> com login, senha e URL da lista.</p>
                <p>4. Atualizará o status do pedido para APROVADO.</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setReleaseModalOpen(false)}
              disabled={approveMutation.isPending}
            >
              Voltar
            </Button>
            <Button
              onClick={() => selectedOrder && approveMutation.mutate(selectedOrder.id)}
              disabled={approveMutation.isPending}
              className="gap-2 bg-white text-black hover:bg-zinc-200 font-bold border-0 shadow-sm"
            >
              {approveMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-black" />
                  Criando no Sigma & Enviando WhatsApp...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 fill-black text-black" />
                  Aprovar & Liberar Agora
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CREDENCIAIS LIBERADAS (SUCESSO) */}
      <Dialog open={credentialsModalOpen} onOpenChange={setCredentialsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <Sparkles className="h-5 w-5 text-white" />
              Acesso Liberado com Sucesso!
            </DialogTitle>
            <DialogDescription>
              A linha foi criada no Sigma e as credenciais foram enviadas no WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {releasedCredentials && (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-xl border border-white/20 bg-white/5 p-3.5 space-y-2 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Usuário:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-foreground">{releasedCredentials.username}</span>
                    <button
                      onClick={() => copyToClipboard(releasedCredentials.username, "Usuário")}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {releasedCredentials.password && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Senha:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-foreground">{releasedCredentials.password}</span>
                      <button
                        onClick={() => copyToClipboard(releasedCredentials.password!, "Senha")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {releasedCredentials.m3uUrl && (
                  <div className="pt-2 border-t border-border/40">
                    <span className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">
                      URL Lista M3U:
                    </span>
                    <div className="flex items-center justify-between gap-2 rounded bg-background/50 p-2 text-xs break-all">
                      <span className="truncate">{releasedCredentials.m3uUrl}</span>
                      <button
                        onClick={() => copyToClipboard(releasedCredentials.m3uUrl!, "URL M3U")}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setCredentialsModalOpen(false)}
              className="w-full bg-primary font-bold"
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE NOVO PEDIDO MANUAL */}
      <Dialog open={newOrderModalOpen} onOpenChange={setNewOrderModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Plus className="h-5 w-5 text-primary" />
              Novo Pedido Manual
            </DialogTitle>
            <DialogDescription>
              Cadastre um pedido manual caso o cliente compre direto com você fora do bot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-bold">Nome do Cliente *</Label>
              <Input
                placeholder="Ex: João da Silva"
                value={newOrderForm.customer_name}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, customer_name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">WhatsApp do Cliente (com DDD) *</Label>
              <Input
                placeholder="Ex: 11999999999"
                value={newOrderForm.customer_phone}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, customer_phone: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-bold">Tipo de Pedido</Label>
                <select
                  value={newOrderForm.type}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, type: e.target.value as any })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="new_access">Novo Acesso</option>
                  <option value="renewal">Renovação</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold">Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newOrderForm.amount}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, amount: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-bold">Plano</Label>
                <select
                  value={newOrderForm.duration_months}
                  onChange={(e) => {
                    const months = Number(e.target.value);
                    let name = "Plano Mensal (1 Mês - 1 Tela)";
                    let val = "35.00";
                    if (months === 3) {
                      name = "Plano Trimestral (3 Meses - Econômico)";
                      val = "90.00";
                    } else if (months === 6) {
                      name = "Plano Semestral (6 Meses - Super Desconto)";
                      val = "160.00";
                    }
                    setNewOrderForm({
                      ...newOrderForm,
                      duration_months: months,
                      plan_name: name,
                      amount: val,
                    });
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value={1}>1 Mês (Mensal)</option>
                  <option value={3}>3 Meses (Trimestral)</option>
                  <option value={6}>6 Meses (Semestral)</option>
                  <option value={12}>12 Meses (Anual)</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold">Telas Simultâneas</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={newOrderForm.screens}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, screens: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>

            {newOrderForm.type === "renewal" && (
              <div>
                <Label className="text-xs font-bold">Usuário a Renovar</Label>
                <Input
                  placeholder="Ex: joao123"
                  value={newOrderForm.target_username}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, target_username: e.target.value })}
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <Label className="text-xs font-bold">Observações (Opcional)</Label>
              <Input
                placeholder="Ex: Comprovante recebido no WhatsApp particular"
                value={newOrderForm.notes}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setNewOrderModalOpen(false)}
              disabled={createOrderMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!newOrderForm.customer_name.trim() || !newOrderForm.customer_phone.trim()) {
                  toast.error("Preencha o nome e telefone do cliente.");
                  return;
                }
                createOrderMutation.mutate();
              }}
              disabled={createOrderMutation.isPending}
              className="gap-2 bg-primary font-bold shadow-md shadow-primary/20"
            >
              {createOrderMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Criar Pedido
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

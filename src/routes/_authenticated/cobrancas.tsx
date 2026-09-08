import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { markInvoicePaid, runAutoBilling, sendWhatsAppMessage } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatDate, renderTemplate } from "@/lib/format";
import {
  Check,
  MessageCircle,
  RefreshCw,
  Search,
  Plus,
  Copy,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Loader2,
  X,
  QrCode,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/cobrancas")({
  head: () => ({
    meta: [
      { title: "Cobranças & Pix — IPTV Manager" },
      { name: "description", content: "Acompanhe faturas pendentes, pagas e atrasadas com disparo de Pix e renovação Sigma automática." },
      { property: "og:title", content: "Cobranças — IPTV Manager" },
      { property: "og:description", content: "Controle financeiro de mensalidades IPTV com QR Code Pix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cobrancas,
});

type InvoiceRow = Tables<"invoices"> & { clients: { name: string; phone: string } | null };

const labels: Record<string, { label: string; tone: string; badge: string }> = {
  pending: {
    label: "Pendente",
    tone: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  overdue: {
    label: "Atrasada",
    tone: "text-rose-400",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  paid: {
    label: "Paga",
    tone: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  cancelled: {
    label: "Cancelada",
    tone: "text-zinc-400",
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
};

function getRelativeDueInfo(dueDateStr: string, isPaid: boolean) {
  if (isPaid) return { text: "Liquidada", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + "T00:00:00");
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      text: `Atrasada há ${days} dia${days > 1 ? "s" : ""}`,
      badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    };
  }
  if (diffDays === 0) {
    return {
      text: "Vence hoje!",
      badge: "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse",
    };
  }
  if (diffDays === 1) {
    return {
      text: "Vence amanhã",
      badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    };
  }
  return {
    text: `Vence em ${diffDays} dias`,
    badge: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  };
}

function Cobrancas() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendWhatsAppMessage);
  const pay = useServerFn(markInvoicePaid);
  const billing = useServerFn(runAutoBilling);

  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Modal Pix Interativo com QR Code
  const [pixModalInvoice, setPixModalInvoice] = useState<InvoiceRow | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  // Modal nova fatura avulsa
  const [createOpen, setCreateOpen] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newAmount, setNewAmount] = useState("35.00");
  const [newDueDate, setNewDueDate] = useState(() => new Date().toISOString().split("T")[0] ?? "");
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const [invoices, settings, clients] = await Promise.all([
        supabase.from("invoices").select("*, clients(name, phone)").order("due_date", { ascending: false }),
        supabase.from("whatsapp_settings").select("*").maybeSingle(),
        supabase.from("clients").select("id, name, monthly_fee, phone").order("name"),
      ]);
      return {
        invoices: (invoices.data ?? []) as InvoiceRow[],
        settings: settings.data,
        clients: clients.data ?? [],
      };
    },
  });

  const allInvoices = data?.invoices ?? [];
  const settings = data?.settings;
  const clientList = data?.clients ?? [];

  // Financial Metrics
  const metrics = useMemo(() => {
    const pending = allInvoices.filter((i) => i.status === "pending");
    const overdue = allInvoices.filter((i) => i.status === "overdue");
    const paid = allInvoices.filter((i) => i.status === "paid");

    const totalPending = pending.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const totalOverdue = overdue.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const totalPaid = paid.reduce((sum, i) => sum + Number(i.amount || 0), 0);

    return {
      openCount: pending.length + overdue.length,
      overdueCount: overdue.length,
      paidCount: paid.length,
      totalOpen: totalPending + totalOverdue,
      totalOverdue,
      totalPaid,
    };
  }, [allInvoices]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return allInvoices.filter((invoice) => {
      const term = search.toLowerCase().trim();
      const clientName = invoice.clients?.name?.toLowerCase() ?? "";
      const clientPhone = invoice.clients?.phone ?? "";
      const matchesSearch = !term || clientName.includes(term) || clientPhone.includes(term);
      if (!matchesSearch) return false;

      if (filter === "all") return true;
      if (filter === "open") return invoice.status === "pending" || invoice.status === "overdue";
      return invoice.status === filter;
    });
  }, [allInvoices, search, filter]);

  const markPaid = useMutation({
    mutationFn: async (invoiceId: string) => pay({ data: { invoiceId } }),
    onSuccess: (res) => {
      if (res.sigmaRenewed) {
        toast.success("Fatura marcada como paga e renovada automaticamente no Sigma!");
      } else if (res.sigmaError) {
        toast.warning(`Fatura marcada como paga. (Aviso Sigma: ${res.sigmaError})`);
      } else {
        toast.success("Fatura marcada como paga com sucesso!");
      }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function criarFaturaAvulsa(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientId) {
      toast.error("Selecione o cliente.");
      return;
    }

    setCreatingInvoice(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("invoices").insert({
        user_id: auth.user!.id,
        client_id: newClientId,
        amount: Number(newAmount),
        due_date: newDueDate,
        status: "pending",
      });

      if (error) throw error;

      toast.success("Fatura avulsa gerada com sucesso!");
      setCreateOpen(false);
      setNewClientId("");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar fatura.");
    } finally {
      setCreatingInvoice(false);
    }
  }

  async function lembrar(invoice: InvoiceRow) {
    if (!invoice.clients?.phone) {
      toast.error("Este cliente não tem telefone cadastrado.");
      return;
    }

    setSendingId(invoice.id);
    const template =
      invoice.status === "overdue" && settings?.overdue_template
        ? settings.overdue_template
        : settings?.message_template;

    const body = renderTemplate(template, {
      cliente: invoice.clients.name,
      valor: formatBRL(invoice.amount),
      vencimento: formatDate(invoice.due_date),
      pix: invoice.pix_code ?? settings?.pix_key ?? "",
      link: invoice.payment_link ?? settings?.payment_link ?? "",
      empresa: settings?.business_name ?? "",
    });

    const result = await send({
      data: {
        phone: invoice.clients.phone,
        body,
        invoiceId: invoice.id,
        clientId: invoice.client_id,
      },
    });

    setSendingId(null);
    if (result.ok) {
      toast.success(`Cobrança enviada com sucesso para ${invoice.clients.name}!`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } else {
      toast.error(result.error ?? "Falha no envio.");
    }
  }

  function copiarChavePix(invoice: InvoiceRow) {
    const pixVal = invoice.pix_code ?? settings?.pix_key;
    if (!pixVal) {
      toast.error("Configure sua chave Pix em Configurações para poder copiar.");
      return;
    }
    navigator.clipboard.writeText(pixVal);
    toast.success("Código / Chave Pix copiada!");
  }

  async function run() {
    setRunning(true);
    try {
      const result = await billing({});
      if (result.ok) {
        toast.success(
          `Processamento concluído: ${result.created} faturas geradas, ${result.sent} mensagens enviadas.`,
        );
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      } else {
        toast.error(result.error ?? "Falha ao executar cobrança.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao rodar a cobrança.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Cobranças & Faturas
            </h1>
            <Badge variant="secondary" className="font-mono text-xs">
              {metrics.openCount} em aberto
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Acompanhe mensalidades pendentes, gere Pix e automatize a renovação dos clientes no Sigma.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Modal Nova Cobrança */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 shadow-sm hover-lift">
                <Plus className="size-4" /> Nova Fatura
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="size-5 text-primary" />
                  Lançar Fatura Avulsa
                </DialogTitle>
                <DialogDescription>
                  Gere uma cobrança manual para renovação antecipada ou taxa adicional.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={criarFaturaAvulsa} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Cliente *</Label>
                  <Select
                    value={newClientId}
                    onValueChange={(id) => {
                      setNewClientId(id);
                      const selected = clientList.find((c) => c.id === id);
                      if (selected?.monthly_fee) {
                        setNewAmount(String(selected.monthly_fee));
                      }
                    }}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({formatBRL(c.monthly_fee)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Valor (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="rounded-xl font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Vencimento *</Label>
                    <Input
                      type="date"
                      required
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="rounded-xl font-mono"
                    />
                  </div>
                </div>

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={creatingInvoice} className="bg-primary text-primary-foreground font-medium">
                    {creatingInvoice ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                    Criar Fatura
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button
            size="sm"
            onClick={run}
            disabled={running}
            className="gap-1.5 shadow-md hover-lift bg-primary text-primary-foreground font-medium"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Disparar Cobranças
          </Button>
        </div>
      </div>

      {/* 3 Cards de Métricas Financeiras */}
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="surface-card hover-lift overflow-hidden relative border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-amber-500 to-yellow-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">A Receber (Em Aberto)</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{formatBRL(metrics.totalOpen)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {metrics.openCount} fatura{metrics.openCount !== 1 ? "s" : ""} pendente{metrics.openCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-amber-500/10 text-amber-400">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card hover-lift overflow-hidden relative border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-rose-500 to-red-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total em Atraso</p>
              <p className="text-2xl font-bold mt-1 text-rose-400">{formatBRL(metrics.totalOverdue)}</p>
              <p className="text-[11px] text-rose-300/80 mt-0.5">
                {metrics.overdueCount} cliente{metrics.overdueCount !== 1 ? "s" : ""} atrasado{metrics.overdueCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-rose-500/10 text-rose-400">
              <AlertTriangle className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card hover-lift overflow-hidden relative border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Liquidado</p>
              <p className="text-2xl font-bold mt-1 text-emerald-400">{formatBRL(metrics.totalPaid)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {metrics.paidCount} pagamento{metrics.paidCount !== 1 ? "s" : ""} confirmado{metrics.paidCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca & Tabs */}
      <Card className="surface-card border-border/60">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 rounded-xl bg-background/60"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            <Tabs value={filter} onValueChange={setFilter} className="w-full sm:w-auto">
              <TabsList className="grid grid-cols-4 w-full sm:w-auto h-9 p-1 bg-muted/60">
                <TabsTrigger value="open" className="text-xs">
                  Em aberto ({metrics.openCount})
                </TabsTrigger>
                <TabsTrigger value="overdue" className="text-xs text-rose-400">
                  Atrasadas ({metrics.overdueCount})
                </TabsTrigger>
                <TabsTrigger value="paid" className="text-xs text-emerald-400">
                  Pagas ({metrics.paidCount})
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs">
                  Todas ({allInvoices.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Cobranças */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Carregando faturas...</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <Card className="surface-card border-dashed p-12 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground mb-3">
            <Wallet className="size-6" />
          </div>
          <h3 className="font-semibold text-lg text-foreground">Nenhuma fatura encontrada</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {search
              ? "Nenhum resultado corresponde à sua pesquisa. Tente buscar por outro termo."
              : "Não há cobranças registradas nesta categoria no momento."}
          </p>
        </Card>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Lembretes</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredInvoices.map((invoice) => {
                const statusInfo = labels[invoice.status] ?? labels["pending"]!;
                const isPaid = invoice.status === "paid";
                const relDue = getRelativeDueInfo(invoice.due_date, isPaid);

                return (
                  <TableRow key={invoice.id} className="hover:bg-muted/30 transition-colors">
                    {/* Nome do Cliente */}
                    <TableCell>
                      <p className="font-medium text-sm text-foreground">
                        {invoice.clients?.name ?? "Cliente Desconhecido"}
                      </p>
                      {invoice.clients?.phone && (
                        <a
                          href={`https://wa.me/55${invoice.clients.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground font-mono inline-flex items-center gap-1 mt-0.5 hover:text-emerald-400"
                        >
                          <MessageCircle className="size-3 text-emerald-400" />
                          {invoice.clients.phone}
                        </a>
                      )}
                    </TableCell>

                    {/* Valor */}
                    <TableCell className="font-mono font-bold text-sm text-foreground">
                      {formatBRL(invoice.amount)}
                    </TableCell>

                    {/* Vencimento */}
                    <TableCell>
                      <Badge variant="outline" className={`text-xs gap-1 ${relDue.badge}`}>
                        <Calendar className="size-3" />
                        {relDue.text}
                      </Badge>
                      <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                        {formatDate(invoice.due_date)}
                        {isPaid && invoice.paid_at ? ` • Pago em ${formatDate(invoice.paid_at)}` : ""}
                      </div>
                    </TableCell>

                    {/* Situação */}
                    <TableCell>
                      <Badge variant="outline" className={`text-xs font-semibold ${statusInfo.badge}`}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>

                    {/* Lembretes */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MessageCircle className="size-3.5 text-primary" />
                        <span>{invoice.reminders_sent || 0} enviado(s)</span>
                      </div>
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Botão Ver Pix / QR Code */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-xs font-medium gap-1.5 text-foreground hover:bg-primary/10 hover:text-primary"
                          onClick={() => {
                            setPixModalInvoice(invoice);
                            setCopiedPix(false);
                          }}
                          title="Ver QR Code Pix"
                        >
                          <QrCode className="size-3.5 text-primary" />
                          Pix
                        </Button>

                        {/* Enviar Lembrete WhatsApp */}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendingId === invoice.id || isPaid}
                          onClick={() => lembrar(invoice)}
                          className="h-8 px-2.5 text-xs font-medium gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          title="Cobrar via WhatsApp"
                        >
                          {sendingId === invoice.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Send className="size-3.5" />
                          )}
                          Cobrar
                        </Button>

                        {/* Marcar como Pago */}
                        {!isPaid ? (
                          <Button
                            size="sm"
                            disabled={markPaid.isPending}
                            onClick={() => markPaid.mutate(invoice.id)}
                            className="h-8 px-2.5 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            title="Confirmar pagamento e renovar no Sigma"
                          >
                            <Check className="size-3.5" /> Pago
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal Interativo de Pix com QR Code */}
      <Dialog open={Boolean(pixModalInvoice)} onOpenChange={(open) => !open && setPixModalInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <QrCode className="size-5 text-primary" />
              Pagamento via Pix
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou utilize a chave Pix abaixo para efetuar o pagamento.
            </DialogDescription>
          </DialogHeader>

          {pixModalInvoice ? (
            <div className="space-y-4 py-2 text-center">
              {/* Box do Valor e Cliente */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-semibold text-foreground text-sm">{pixModalInvoice.clients?.name}</p>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="text-2xl font-bold text-emerald-400 font-mono">
                    {formatBRL(pixModalInvoice.amount)}
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    Venc: {formatDate(pixModalInvoice.due_date)}
                  </Badge>
                </div>
              </div>

              {/* Simulação Visual de QR Code com Design Moderno */}
              <div className="mx-auto size-52 p-3 bg-white rounded-2xl shadow-md border border-border/40 flex flex-col items-center justify-center relative group">
                <svg
                  className="size-full text-zinc-900"
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Marcadores de Canto QR */}
                  <rect x="5" y="5" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="4" />
                  <rect x="11" y="11" width="14" height="14" rx="2" fill="currentColor" />

                  <rect x="69" y="5" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="4" />
                  <rect x="75" y="11" width="14" height="14" rx="2" fill="currentColor" />

                  <rect x="5" y="69" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="4" />
                  <rect x="11" y="75" width="14" height="14" rx="2" fill="currentColor" />

                  {/* Padrões internos do QR Code */}
                  <rect x="37" y="10" width="6" height="6" fill="currentColor" />
                  <rect x="47" y="10" width="6" height="6" fill="currentColor" />
                  <rect x="57" y="10" width="6" height="6" fill="currentColor" />
                  <rect x="37" y="20" width="6" height="6" fill="currentColor" />
                  <rect x="57" y="20" width="6" height="6" fill="currentColor" />

                  <rect x="10" y="37" width="6" height="6" fill="currentColor" />
                  <rect x="20" y="37" width="6" height="6" fill="currentColor" />
                  <rect x="10" y="47" width="6" height="6" fill="currentColor" />
                  <rect x="20" y="57" width="6" height="6" fill="currentColor" />

                  {/* Centro */}
                  <rect x="37" y="37" width="26" height="26" rx="3" fill="#0ea5e9" />
                  <circle cx="50" cy="50" r="7" fill="white" />
                  <circle cx="50" cy="50" r="3" fill="#0ea5e9" />

                  <rect x="69" y="37" width="6" height="6" fill="currentColor" />
                  <rect x="79" y="47" width="6" height="6" fill="currentColor" />
                  <rect x="89" y="37" width="6" height="6" fill="currentColor" />

                  <rect x="37" y="69" width="6" height="6" fill="currentColor" />
                  <rect x="47" y="79" width="6" height="6" fill="currentColor" />
                  <rect x="57" y="89" width="6" height="6" fill="currentColor" />
                  <rect x="69" y="69" width="6" height="6" fill="currentColor" />
                  <rect x="79" y="79" width="6" height="6" fill="currentColor" />
                  <rect x="89" y="89" width="6" height="6" fill="currentColor" />
                </svg>
              </div>

              {/* Informações da Chave Pix */}
              <div className="space-y-2 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    Chave Pix ({settings?.pix_key_type ? settings.pix_key_type.toUpperCase() : "Chave"})
                  </span>
                  {settings?.pix_holder ? (
                    <span className="text-muted-foreground text-[11px]">Titular: {settings.pix_holder}</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-1.5">
                  <Input
                    readOnly
                    value={pixModalInvoice.pix_code || settings?.pix_key || "Chave Pix não configurada"}
                    className="font-mono text-xs bg-muted/30"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const code = pixModalInvoice.pix_code || settings?.pix_key;
                      if (code) {
                        navigator.clipboard.writeText(code);
                        setCopiedPix(true);
                        toast.success("Chave Pix copiada para a área de transferência!");
                        setTimeout(() => setCopiedPix(false), 3000);
                      }
                    }}
                    className="shrink-0 gap-1.5"
                  >
                    {copiedPix ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                    {copiedPix ? "Copiado!" : "Copiar"}
                  </Button>
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPixModalInvoice(null)}
                  className="sm:flex-1"
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    lembrar(pixModalInvoice);
                    setPixModalInvoice(null);
                  }}
                  className="sm:flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-medium"
                >
                  <Send className="size-4" /> Enviar no WhatsApp
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

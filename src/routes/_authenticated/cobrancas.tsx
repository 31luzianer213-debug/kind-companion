import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, formatDate } from "@/lib/format";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/cobrancas")({
  head: () => ({
    meta: [
      { title: "Monitor de Cobranças — Sigma Control" },
      { name: "description", content: "Acompanhe cobranças, pagamentos e renovações processadas automaticamente." },
    ],
  }),
  component: Cobrancas,
});

type InvoiceRow = Tables<"invoices"> & { clients: { name: string; phone: string } | null };

const labels: Record<string, { label: string; badge: string }> = {
  pending: { label: "Pendente", badge: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  overdue: { label: "Atrasada", badge: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  paid: { label: "Paga", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  cancelled: { label: "Cancelada", badge: "border-border bg-muted/40 text-muted-foreground" },
};

function getRelativeDueInfo(dueDateStr: string, isPaid: boolean) {
  if (isPaid) return { text: "Liquidada", badge: labels.paid.badge };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDateStr}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { text: `Atrasada há ${Math.abs(diffDays)} dia${Math.abs(diffDays) === 1 ? "" : "s"}`, badge: labels.overdue.badge };
  if (diffDays === 0) return { text: "Vence hoje", badge: labels.pending.badge };
  if (diffDays === 1) return { text: "Vence amanhã", badge: labels.pending.badge };
  return { text: `Vence em ${diffDays} dias`, badge: "border-border bg-muted/40 text-muted-foreground" };
}

function Cobrancas() {
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<InvoiceRow | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const [invoices, settings] = await Promise.all([
        supabase.from("invoices").select("*, clients(name, phone)").order("due_date", { ascending: false }),
        supabase.from("whatsapp_settings").select("pix_key, pix_key_type, pix_holder").maybeSingle(),
      ]);
      if (invoices.error) throw invoices.error;
      return {
        invoices: (Array.isArray(invoices.data) ? invoices.data : []) as InvoiceRow[],
        settings: settings.data,
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const allInvoices = Array.isArray(data?.invoices) ? data.invoices : [];

  const metrics = useMemo(() => {
    const pending = allInvoices.filter((i) => i.status === "pending");
    const overdue = allInvoices.filter((i) => i.status === "overdue");
    const paid = allInvoices.filter((i) => i.status === "paid");
    return {
      openCount: pending.length + overdue.length,
      overdueCount: overdue.length,
      paidCount: paid.length,
      totalOpen: [...pending, ...overdue].reduce((sum, i) => sum + Number(i.amount || 0), 0),
      totalOverdue: overdue.reduce((sum, i) => sum + Number(i.amount || 0), 0),
      totalPaid: paid.reduce((sum, i) => sum + Number(i.amount || 0), 0),
      reminders: allInvoices.reduce((sum, i) => sum + Number(i.reminders_sent || 0), 0),
    };
  }, [allInvoices]);

  const filteredInvoices = useMemo(() => {
    const term = search.toLowerCase().trim();
    return allInvoices.filter((invoice) => {
      const matchesSearch = !term || (invoice.clients?.name || "").toLowerCase().includes(term) || (invoice.clients?.phone || "").includes(term);
      if (!matchesSearch) return false;
      if (filter === "all") return true;
      if (filter === "open") return invoice.status === "pending" || invoice.status === "overdue";
      return invoice.status === filter;
    });
  }, [allInvoices, search, filter]);

  function exportarCobrancasCSV() {
    if (allInvoices.length === 0) return toast.info("Nenhuma cobrança para exportar.");
    const headers = ["Cliente", "Telefone", "Valor", "Vencimento", "Status", "Lembretes", "Data Pagamento"];
    const rows = allInvoices.map((inv) => [
      `"${(inv.clients?.name || "").replace(/"/g, '""')}"`,
      `"${inv.clients?.phone || ""}"`,
      Number(inv.amount || 0).toFixed(2),
      inv.due_date || "",
      inv.status,
      inv.reminders_sent || 0,
      inv.paid_at ? inv.paid_at.slice(0, 10) : "",
    ]);
    const blob = new Blob(["\uFEFF" + [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_cobrancas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyPix(invoice: InvoiceRow) {
    const pix = (invoice as any).pix_code || data?.settings?.pix_key;
    if (!pix) return toast.info("Nenhum código Pix registrado para esta cobrança.");
    navigator.clipboard.writeText(pix);
    toast.success("Pix copiado.");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Monitor de Cobranças</h1>
            <Badge variant="secondary" className="font-mono text-xs">{metrics.openCount} em aberto</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Visualize o que a automação está fazendo: cobranças geradas, lembretes enviados, pagamentos confirmados e faturas em atraso. O envio e a renovação continuam automáticos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCobrancasCSV} className="gap-1.5">
            <Download className="size-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      <Card className="surface-card border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex gap-3 p-4">
          <div className="mt-0.5 rounded-xl bg-emerald-500/10 p-2 text-emerald-500"><ShieldCheck className="size-5" /></div>
          <div>
            <h3 className="text-sm font-semibold">Operação automática</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Esta tela é somente para acompanhamento. Cobranças, confirmação de pagamento e renovação seguem o fluxo automático configurado no sistema.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="surface-card"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">A receber</p><p className="mt-1 text-2xl font-black">{formatBRL(metrics.totalOpen)}</p><p className="text-[11px] text-muted-foreground">{metrics.openCount} faturas</p></div><Clock className="size-6 text-amber-500" /></CardContent></Card>
        <Card className="surface-card"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Em atraso</p><p className="mt-1 text-2xl font-black text-rose-500">{formatBRL(metrics.totalOverdue)}</p><p className="text-[11px] text-muted-foreground">{metrics.overdueCount} atrasadas</p></div><AlertTriangle className="size-6 text-rose-500" /></CardContent></Card>
        <Card className="surface-card"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Recebido</p><p className="mt-1 text-2xl font-black text-emerald-500">{formatBRL(metrics.totalPaid)}</p><p className="text-[11px] text-muted-foreground">{metrics.paidCount} pagas</p></div><CheckCircle2 className="size-6 text-emerald-500" /></CardContent></Card>
        <Card className="surface-card"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Lembretes</p><p className="mt-1 text-2xl font-black">{metrics.reminders}</p><p className="text-[11px] text-muted-foreground">enviados pela automação</p></div><MessageCircle className="size-6 text-primary" /></CardContent></Card>
      </div>

      <Card className="surface-card border-border/60"><CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por cliente ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-8" />
            {search ? <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button> : null}
          </div>
          <Tabs value={filter} onValueChange={setFilter} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-4 sm:w-auto">
              <TabsTrigger value="open" className="text-xs">Abertas ({metrics.openCount})</TabsTrigger>
              <TabsTrigger value="overdue" className="text-xs">Atrasadas ({metrics.overdueCount})</TabsTrigger>
              <TabsTrigger value="paid" className="text-xs">Pagas ({metrics.paidCount})</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">Todas ({allInvoices.length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardContent></Card>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground"><Loader2 className="size-8 animate-spin text-primary" /><p className="text-sm">Carregando cobranças...</p></div>
      ) : filteredInvoices.length === 0 ? (
        <Card className="surface-card border-dashed p-12 text-center"><Wallet className="mx-auto mb-3 size-8 text-muted-foreground" /><h3 className="font-semibold">Nenhuma cobrança encontrada</h3><p className="mt-1 text-sm text-muted-foreground">Não há registros nesta categoria.</p></Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm">
          <Table>
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Status</TableHead><TableHead>Lembretes</TableHead><TableHead className="text-right">Detalhes</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => {
                const isPaid = invoice.status === "paid";
                const status = labels[invoice.status] || labels.pending;
                const due = getRelativeDueInfo(invoice.due_date, isPaid);
                return <TableRow key={invoice.id}>
                  <TableCell><p className="font-medium">{invoice.clients?.name || "Cliente"}</p><p className="text-xs text-muted-foreground">{invoice.clients?.phone || "Sem telefone"}</p></TableCell>
                  <TableCell className="font-mono font-bold">{formatBRL(invoice.amount)}</TableCell>
                  <TableCell><Badge variant="outline" className={`gap-1 text-xs ${due.badge}`}><Calendar className="size-3" />{due.text}</Badge><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(invoice.due_date)}{isPaid && invoice.paid_at ? ` • pago em ${formatDate(invoice.paid_at)}` : ""}</p></TableCell>
                  <TableCell><Badge variant="outline" className={`text-xs font-semibold ${status.badge}`}>{status.label}</Badge></TableCell>
                  <TableCell><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><MessageCircle className="size-3.5" />{invoice.reminders_sent || 0} enviado(s)</span></TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setDetails(invoice)} className="gap-1.5"><Eye className="size-3.5" /> Ver</Button></TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(details)} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Detalhes da cobrança</DialogTitle><DialogDescription>Consulta do registro processado pela automação.</DialogDescription></DialogHeader>
          {details ? <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Cliente</p><p className="font-semibold">{details.clients?.name || "Cliente"}</p></div>
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Valor</p><p className="font-mono font-bold">{formatBRL(details.amount)}</p></div>
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Vencimento</p><p className="font-semibold">{formatDate(details.due_date)}</p></div>
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Lembretes</p><p className="font-semibold">{details.reminders_sent || 0}</p></div>
            </div>
            {details.paid_at ? <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><p className="text-xs text-muted-foreground">Pagamento confirmado</p><p className="font-semibold text-emerald-500">{formatDate(details.paid_at)}</p></div> : null}
            {((details as any).pix_code || data?.settings?.pix_key) ? <Button variant="outline" onClick={() => copyPix(details)} className="w-full gap-2"><Copy className="size-4" /> Copiar Pix registrado</Button> : null}
          </div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

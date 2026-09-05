import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { markInvoicePaid, runAutoBilling, sendWhatsAppMessage } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatDate, renderTemplate } from "@/lib/format";
import { Check, MessageCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cobrancas")({
  head: () => ({
    meta: [
      { title: "Cobranças — IPTV Manager" },
      { name: "description", content: "Acompanhe mensalidades pendentes, pagas e atrasadas dos seus clientes." },
      { property: "og:title", content: "Cobranças — IPTV Manager" },
      { property: "og:description", content: "Controle de mensalidades e envio de lembretes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cobrancas,
});

type InvoiceRow = Tables<"invoices"> & { clients: { name: string; phone: string } | null };

const labels: Record<string, string> = {
  pending: "Pendente",
  overdue: "Atrasada",
  paid: "Paga",
  cancelled: "Cancelada",
};

function Cobrancas() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendWhatsAppMessage);
  const pay = useServerFn(markInvoicePaid);
  const billing = useServerFn(runAutoBilling);
  const [filter, setFilter] = useState("open");
  const [running, setRunning] = useState(false);

  const { data } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const [invoices, settings] = await Promise.all([
        supabase.from("invoices").select("*, clients(name, phone)").order("due_date", { ascending: false }),
        supabase.from("whatsapp_settings").select("message_template").maybeSingle(),
      ]);
      return { invoices: invoices.data ?? [], template: settings.data?.message_template ?? "" };
    },
  });

  const invoices = (data?.invoices ?? []).filter((invoice) =>
    filter === "all"
      ? true
      : filter === "open"
        ? invoice.status === "pending" || invoice.status === "overdue"
        : invoice.status === filter,
  );

  const markPaid = useMutation({
    mutationFn: async (invoiceId: string) => pay({ data: { invoiceId } }),
    onSuccess: () => {
      toast.success("Cobrança marcada como paga.");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function lembrar(invoice: InvoiceRow) {
    const client = invoice.clients;
    if (!client) {
      toast.error("Cliente não encontrado.");
      return;
    }
    const template =
      data?.template ||
      "Olá {nome}! Sua mensalidade de {valor} vence em {vencimento}.";
    const body = renderTemplate(template, {
      nome: client.name,
      valor: formatBRL(invoice.amount),
      vencimento: formatDate(invoice.due_date),
      dias: "",
    });
    const result = await send({
      data: {
        phone: client.phone,
        body,
        clientId: invoice.client_id,
        invoiceId: invoice.id,
      },
    });
    if (result.ok) toast.success("Lembrete enviado.");
    else toast.error(result.error ?? "Falha no envio.");
    queryClient.invalidateQueries();
  }

  async function run() {
    setRunning(true);
    try {
      const result = await billing({});
      toast.success(`${result.created} cobrança(s) gerada(s), ${result.sent} enviada(s).`);
      if (result.errors.length) toast.error(result.errors[0]);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao rodar a cobrança.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Financeiro</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-[30px]">Cobranças</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">Mensalidades, atrasos e lembretes — acompanhe o fluxo de caixa sem sair do WhatsApp.</p>
        </div>
        <Button onClick={run} disabled={running} size="lg" className="gap-2 rounded-xl shadow-md shadow-primary/20">
          <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} /> {running ? "Processando..." : "Gerar e enviar"}
        </Button>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="h-11 rounded-xl bg-muted p-1">
          <TabsTrigger value="open" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Em aberto</TabsTrigger>
          <TabsTrigger value="overdue" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Atrasadas</TabsTrigger>
          <TabsTrigger value="paid" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Pagas</TabsTrigger>
          <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="surface-elevated overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
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
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Nenhuma cobrança nesta lista.
                  </TableCell>
                </TableRow>
              )}
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {(invoice as unknown as { clients: { name: string } | null }).clients?.name ?? "—"}
                  </TableCell>
                  <TableCell>{formatBRL(invoice.amount)}</TableCell>
                  <TableCell>{formatDate(invoice.due_date)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invoice.status === "overdue"
                          ? "destructive"
                          : invoice.status === "paid"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {labels[invoice.status] ?? invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{invoice.reminders_sent}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Enviar lembrete" onClick={() => lembrar(invoice as InvoiceRow)}>
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      {invoice.status !== "paid" && (
                        <Button size="icon" variant="ghost" title="Marcar como paga" onClick={() => markPaid.mutate(invoice.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

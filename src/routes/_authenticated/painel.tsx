import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runAutoBilling } from "@/lib/whatsapp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { Send, Users, ListVideo, Wallet, AlertTriangle, ArrowUpRight, Clock3, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — IPTV Manager" },
      { name: "description", content: "Resumo de clientes, listas ativas e cobranças em aberto." },
      { property: "og:title", content: "Painel — IPTV Manager" },
      { property: "og:description", content: "Resumo do seu negócio de IPTV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Painel,
});

function Painel() {
  const queryClient = useQueryClient();
  const billing = useServerFn(runAutoBilling);
  const [running, setRunning] = useState(false);

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [clients, lists, invoices, logs] = await Promise.all([
        supabase.from("clients").select("*"),
        supabase.from("iptv_lists").select("*"),
        supabase.from("invoices").select("*, clients(name)").order("due_date"),
        supabase.from("message_logs").select("*").order("created_at", { ascending: false }).limit(8),
      ]);
      return {
        clients: clients.data ?? [],
        lists: lists.data ?? [],
        invoices: invoices.data ?? [],
        logs: logs.data ?? [],
      };
    },
  });

  const clients = data?.clients ?? [];
  const invoices = data?.invoices ?? [];
  const open = invoices.filter((i) => i.status === "pending" || i.status === "overdue");
  const overdue = invoices.filter((i) => i.status === "overdue");
  const monthly = clients
    .filter((c) => c.status === "active")
    .reduce((sum, c) => sum + Number(c.monthly_fee), 0);

  async function run() {
    setRunning(true);
    try {
      const result = await billing({});
      toast.success(
        `${result.created} cobrança(s) gerada(s), ${result.sent} mensagem(ns) enviada(s)${result.failed ? `, ${result.failed} falha(s)` : ""}.`,
      );
      if (result.errors.length) toast.error(result.errors[0]);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao rodar a cobrança.");
    } finally {
      setRunning(false);
    }
  }

  const cards = [
    {
      label: "Clientes ativos",
      value: clients.filter((c) => c.status === "active").length,
      icon: Users,
      tone: "text-primary bg-primary/12 ring-primary/25",
    },
    {
      label: "Listas ativas",
      value: (data?.lists ?? []).filter((l) => l.status === "active").length,
      icon: ListVideo,
      tone: "text-chart-2 bg-chart-2/12 ring-chart-2/25",
    },
    {
      label: "Receita mensal",
      value: formatBRL(monthly),
      icon: Wallet,
      tone: "text-chart-3 bg-chart-3/12 ring-chart-3/25",
    },
    {
      label: "Em atraso",
      value: overdue.length,
      icon: AlertTriangle,
      tone: "text-destructive bg-destructive/12 ring-destructive/25",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Ao vivo
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-[30px]">Painel</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Visão geral do seu negócio — clientes, faturamento e cobranças em um só lugar.
          </p>
        </div>
        <Button onClick={run} disabled={running} size="lg" className="gap-2 rounded-xl shadow-md shadow-primary/20">
          {running ? <Clock3 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {running ? "Processando..." : "Rodar cobrança agora"}
          {!running && <ArrowUpRight className="h-4 w-4 opacity-70" />}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="surface-card hover-lift overflow-hidden">
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="kpi-value mt-2 truncate">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">Atualizado agora</p>
              </div>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
            </CardContent>
            <div className="h-1 w-full bg-gradient-to-r from-primary/0 via-primary/15 to-transparent" />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="surface-elevated overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <span className="soft-icon h-9 w-9">
                <Wallet className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-[15px]">Cobranças em aberto</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {open.length} pendente(s) • {overdue.length} atrasada(s)
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-xs font-semibold">
              {open.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {open.length === 0 && (
              <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-10 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                  <Clock3 className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium">Tudo em dia</p>
                <p className="mx-auto mt-1 max-w-[28ch] text-xs text-muted-foreground">Nenhuma cobrança em aberto no momento.</p>
              </div>
            )}
            {open.slice(0, 8).map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-3.5 py-3 text-sm shadow-sm transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {(invoice as unknown as { clients: { name: string } | null }).clients?.name ?? "Cliente"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(invoice.due_date)} • {formatBRL(invoice.amount)}
                  </p>
                </div>
                <Badge variant={invoice.status === "overdue" ? "destructive" : "secondary"} className="shrink-0 rounded-full">
                  {invoice.status === "overdue" ? "Atrasada" : "Pendente"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="surface-elevated overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <span className="soft-icon h-9 w-9">
                <MessageSquare className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-[15px]">Últimas mensagens</CardTitle>
                <p className="text-xs text-muted-foreground">Histórico do WhatsApp</p>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full">
              8 recentes
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {(data?.logs ?? []).length === 0 && (
              <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-10 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium">Nenhuma mensagem ainda</p>
                <p className="mx-auto mt-1 max-w-[28ch] text-xs text-muted-foreground">As mensagens enviadas aparecerão aqui automaticamente.</p>
              </div>
            )}
            {(data?.logs ?? []).map((log) => (
              <div key={log.id} className="rounded-2xl border bg-card px-3.5 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{log.phone}</span>
                  <Badge variant={log.status === "sent" ? "secondary" : "destructive"} className="shrink-0 rounded-full text-[11px]">
                    {log.status === "sent" ? "Enviada" : "Falhou"}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{log.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

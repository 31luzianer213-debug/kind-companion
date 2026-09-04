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
import { Send, Users, ListVideo, Wallet, AlertTriangle } from "lucide-react";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-gradient text-3xl font-bold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground">Visão geral do seu negócio.</p>
        </div>
        <Button onClick={run} disabled={running} className="gap-2">
          <Send className="h-4 w-4" />
          {running ? "Processando..." : "Rodar cobrança agora"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="surface-card hover-lift">
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{card.value}</p>
              </div>
              <span className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ${card.tone}`}>
                <card.icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="text-base">Cobranças em aberto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {open.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma cobrança em aberto.</p>
            )}
            {open.slice(0, 8).map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-white/[0.02] px-3 py-2.5 text-sm">
                <span>
                  {(invoice as unknown as { clients: { name: string } | null }).clients?.name ?? "Cliente"}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">{formatDate(invoice.due_date)}</span>
                  <span>{formatBRL(invoice.amount)}</span>
                  <Badge variant={invoice.status === "overdue" ? "destructive" : "secondary"}>
                    {invoice.status === "overdue" ? "Atrasada" : "Pendente"}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="text-base">Últimas mensagens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.logs ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma mensagem enviada ainda.</p>
            )}
            {(data?.logs ?? []).map((log) => (
              <div key={log.id} className="rounded-xl border border-border/60 bg-white/[0.02] px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{log.phone}</span>
                  <Badge variant={log.status === "sent" ? "secondary" : "destructive"}>
                    {log.status === "sent" ? "Enviada" : "Falhou"}
                  </Badge>
                </div>
                <p className="truncate text-muted-foreground">{log.body}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

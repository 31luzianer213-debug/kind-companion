import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarClock, CircleDollarSign, RefreshCw, UserPlus, Users, WalletCards } from "lucide-react";
import { getOperationalDashboard } from "@/lib/operational-dashboard.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function IndicatorsPanel() {
  const load = useServerFn(getOperationalDashboard);
  const query = useQuery({
    queryKey: ["operational-dashboard"],
    queryFn: () => load({}),
    retry: 1,
    staleTime: 30000,
  });
  const metrics = query.data?.metrics;
  const attention = Array.isArray(query.data?.attention) ? query.data!.attention : [];

  const cards = [
    { label: "Receita mensal estimada", value: money(metrics?.monthlyRevenue || 0), helper: `${metrics?.activeClients || 0} clientes ativos`, icon: CircleDollarSign },
    { label: "Em atraso", value: money(metrics?.overdueAmount || 0), helper: `${metrics?.overdueCount || 0} cobrança(s)`, icon: WalletCards },
    { label: "Vencem em 7 dias", value: String(metrics?.dueNext7 || 0), helper: "clientes ativos", icon: CalendarClock },
    { label: "Novos no mês", value: String(metrics?.newThisMonth || 0), helper: "clientes cadastrados", icon: UserPlus },
    { label: "Bloqueados ou inativos", value: String(metrics?.blockedInactive || 0), helper: "exigem acompanhamento", icon: Users },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Números reais da sua operação, atualizados a cada acesso.</p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={query.isFetching ? "animate-spin" : ""} /> Atualizar
        </Button>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-32 animate-pulse rounded-md bg-muted/60" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((item) => (
            <Card key={item.label}>
              <CardContent className="p-5">
                <item.icon className="mb-4 size-5 text-primary" />
                <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-amber-500" /> Atenção rápida
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attention.length === 0 ? (
            <div className="rounded-md border border-dashed p-7 text-center">
              <p className="font-semibold">Nada urgente por aqui</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clientes que vencem em breve ou estão sem telefone aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {attention.map((client: any) => (
                <div key={client.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{client.name || "Cliente"}</p>
                    <p className="text-xs text-muted-foreground">
                      {client.phone || "Sem telefone"} ·{" "}
                      {client.next_due_date
                        ? `vence ${new Date(`${client.next_due_date}T12:00:00`).toLocaleDateString("pt-BR")}`
                        : "sem vencimento"}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/clientes">Ver clientes</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

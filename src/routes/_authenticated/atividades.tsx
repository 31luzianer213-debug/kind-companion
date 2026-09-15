import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { listActivities } from "@/lib/activity.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/atividades")({
  head: () => ({
    meta: [
      { title: "Atividades — Sigma Control" },
      { name: "description", content: "Acompanhe as ações recentes realizadas no seu painel." },
    ],
  }),
  component: ActivitiesPage,
});

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function ActivitiesPage() {
  const loadActivities = useServerFn(listActivities);
  const query = useQuery({
    queryKey: ["activities"],
    queryFn: async () => {
      const result = await loadActivities({});
      return Array.isArray(result?.activities) ? result.activities : [];
    },
    retry: 1,
  });

  const activities = Array.isArray(query.data) ? query.data : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Auditoria</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Atividades</h1>
          <p className="mt-1 text-sm text-muted-foreground">Veja as ações recentes feitas na sua conta.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" />
            Histórico recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-xl bg-muted/60" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-5 text-center">
              <AlertTriangle className="mx-auto mb-2 size-5 text-destructive" />
              <p className="text-sm font-semibold">Não foi possível carregar as atividades.</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => query.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : activities.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 size-7 text-muted-foreground" />
              <p className="font-semibold">Nenhuma atividade registrada ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">As próximas ações importantes do painel aparecerão aqui.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {activities.map((item: any) => (
                <div key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Activity className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-semibold text-foreground">{item.title}</p>
                      <time className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</time>
                    </div>
                    {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

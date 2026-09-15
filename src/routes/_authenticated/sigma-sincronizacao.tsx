import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, RefreshCw, Server } from "lucide-react";
import { toast } from "sonner";
import { listSigmaSyncHealth, syncAllSigmaServersDetailed, syncSigmaServerDetailed } from "@/lib/sigma-sync-health.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/sigma-sincronizacao")({
  head: () => ({ meta: [{ title: "Sincronização Sigma — Sigma Control" }] }),
  component: SigmaSyncPage,
});

function fmt(value?: string | null) {
  if (!value) return "Nunca";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Nunca" : date.toLocaleString("pt-BR");
}

function statusLabel(status?: string | null) {
  if (status === "success") return "Sucesso";
  if (status === "partial") return "Com avisos";
  if (status === "running") return "Sincronizando";
  if (status === "error") return "Erro";
  return "Sem histórico";
}

function SigmaSyncPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(listSigmaSyncHealth);
  const syncOne = useServerFn(syncSigmaServerDetailed);
  const syncAll = useServerFn(syncAllSigmaServersDetailed);
  const query = useQuery({ queryKey: ["sigma-sync-health"], queryFn: () => load({}), retry: 1 });
  const servers = Array.isArray(query.data?.servers) ? query.data!.servers : [];

  const oneMutation = useMutation({
    mutationFn: (serverId: string) => syncOne({ data: { serverId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`${result.serverName}: ${result.imported} importado(s), ${result.updated} atualizado(s).`);
      else toast.error(result.error || "Falha ao sincronizar.");
      queryClient.invalidateQueries({ queryKey: ["sigma-sync-health"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
  const allMutation = useMutation({
    mutationFn: () => syncAll({}),
    onSuccess: (result) => {
      if (result.ok) toast.success(`Sincronização concluída: ${result.imported} importado(s), ${result.updated} atualizado(s).`);
      else toast.warning(result.error || "Alguns servidores terminaram com avisos.");
      queryClient.invalidateQueries({ queryKey: ["sigma-sync-health"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Sigma</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Sincronização dos servidores</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe importados, atualizados, ignorados e erros por servidor.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? "animate-spin" : ""} /> Atualizar</Button><Button size="sm" onClick={() => allMutation.mutate()} disabled={allMutation.isPending || servers.length === 0}>{allMutation.isPending ? "Sincronizando..." : "Sincronizar todos"}</Button></div></div>

    {query.isLoading ? <div className="grid gap-4 lg:grid-cols-2">{[0,1].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-muted/60" />)}</div> : servers.length === 0 ? <Card><CardContent className="p-10 text-center"><Server className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Nenhum servidor Sigma configurado</p><p className="mt-1 text-sm text-muted-foreground">Adicione um servidor Sigma para começar a sincronização.</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{servers.map((server: any) => <Card key={server.id}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{server.name || "Servidor Sigma"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Última tentativa: {fmt(server.last_sync_at || server.last_sync_started_at)}</p></div><Badge variant="outline">{statusLabel(server.last_sync_status)}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Importados</p><p className="text-xl font-black">{server.last_sync_imported || 0}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Atualizados</p><p className="text-xl font-black">{server.last_sync_updated || 0}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Ignorados</p><p className="text-xl font-black">{server.last_sync_skipped || 0}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Erros</p><p className="text-xl font-black">{server.last_sync_errors || 0}</p></div></div>{server.last_sync_error ? <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{server.last_sync_error}</span></div> : server.last_sync_status === "success" ? <div className="flex gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span>Última sincronização concluída sem erros.</span></div> : null}<Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => oneMutation.mutate(server.id)} disabled={oneMutation.isPending}>Sincronizar este servidor</Button></CardContent></Card>)}</div>}
  </div>;
}

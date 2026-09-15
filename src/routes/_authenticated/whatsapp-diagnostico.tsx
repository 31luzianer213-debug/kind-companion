import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, RefreshCw, Server, Smartphone, Webhook } from "lucide-react";
import { toast } from "sonner";
import { getWhatsAppDiagnostics, testWhatsAppConnection } from "@/lib/whatsapp-diagnostics.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/whatsapp-diagnostico")({
  head: () => ({ meta: [{ title: "Diagnóstico WhatsApp — Sigma Control" }] }),
  component: WhatsAppDiagnosticsPage,
});

function formatCheckedAt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function WhatsAppDiagnosticsPage() {
  const load = useServerFn(getWhatsAppDiagnostics);
  const test = useServerFn(testWhatsAppConnection);
  const query = useQuery({
    queryKey: ["whatsapp-diagnostics"],
    queryFn: () => load({}),
    retry: 1,
    refetchInterval: 30000,
  });

  const testMutation = useMutation({
    mutationFn: () => test({}),
    onSuccess: (result) => {
      if (result.ok) toast.success("Conexão Evolution respondendo normalmente.");
      else toast.error(result.error || "A instância não está conectada.");
      query.refetch();
    },
    onError: () => toast.error("Falha ao testar a conexão."),
  });

  const data = query.data;
  const connected = data?.state === "open";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">WhatsApp</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Diagnóstico da conexão</h1>
          <p className="mt-1 text-sm text-muted-foreground">Informações da instância Evolution exclusiva da sua conta.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            Testar conexão
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-muted/60" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Smartphone className="size-4" /> Status</CardTitle></CardHeader>
            <CardContent><Badge className={connected ? "bg-emerald-500/15 text-emerald-500" : "bg-zinc-500/15 text-zinc-400"}>{connected ? "Conectado" : "Desconectado"}</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Server className="size-4" /> Instância</CardTitle></CardHeader>
            <CardContent><p className="break-all font-mono text-xs">{data?.instance || "—"}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Smartphone className="size-4" /> Número</CardTitle></CardHeader>
            <CardContent><p className="text-sm font-semibold">{data?.number || "Não disponível"}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Webhook className="size-4" /> Webhook</CardTitle></CardHeader>
            <CardContent><Badge variant="outline">{data?.webhookConfigured ? "Configurado" : "Não confirmado"}</Badge></CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Última verificação</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><span className="text-muted-foreground">Horário:</span> {formatCheckedAt(data?.checkedAt)}</p>
          {data?.lastError ? (
            <div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{data.lastError}</span>
            </div>
          ) : connected ? (
            <div className="flex gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span>A instância exclusiva desta conta está respondendo.</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

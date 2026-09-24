import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlugZap, RefreshCw, Power, Trash2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminDeleteExtraInstances, adminManageConnection, listAdminConnections } from "@/lib/admin.functions";

const STATUS_LABEL: Record<string, { text: string; variant: "success" | "secondary" | "destructive" }> = {
  open: { text: "Conectado", variant: "success" },
  connecting: { text: "Aguardando leitura", variant: "secondary" },
  close: { text: "Desconectado", variant: "destructive" },
  none: { text: "Nunca conectou", variant: "secondary" },
};

export function AdminConnectionsCard() {
  const listFn = useServerFn(listAdminConnections);
  const manageFn = useServerFn(adminManageConnection);
  const deleteExtrasFn = useServerFn(adminDeleteExtraInstances);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-connections"],
    queryFn: () => listFn({}),
    refetchInterval: 30_000,
  });

  const manage = useMutation({
    mutationFn: (input: { userId: string; action: "logout" | "reset" }) => manageFn({ data: input }),
    onSuccess: (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Não foi possível atualizar a conexão.");
      toast.success("Conexão atualizada.");
      queryClient.invalidateQueries({ queryKey: ["admin-connections"] });
    },
    onError: () => toast.error("Não foi possível atualizar a conexão."),
  });

  const deleteExtras = useMutation({
    mutationFn: (names: string[]) => deleteExtrasFn({ data: { names } }),
    onSuccess: (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Não foi possível apagar.");
      toast.success(res.deleted === 1 ? "1 conexão sobrando apagada." : `${res.deleted} conexões sobrando apagadas.`);
      queryClient.invalidateQueries({ queryKey: ["admin-connections"] });
    },
    onError: () => toast.error("Não foi possível apagar."),
  });

  const rows = (data as any)?.rows ?? [];
  const extras: Array<{ instance: string; state: string; number: string | null }> = (data as any)?.extras ?? [];
  const connected = rows.filter((r: any) => r.status === "open").length;
  const withInstance = rows.filter((r: any) => r.exists).length;

  const confirmDelete = (names: string[]) => {
    const msg =
      names.length === 1
        ? `Apagar a conexão "${names[0]}"? Ela não pertence a nenhuma conta.`
        : `Apagar ${names.length} conexões que não pertencem a nenhuma conta?`;
    if (window.confirm(msg)) deleteExtras.mutate(names);
  };

  return (
    <Card className="rounded-md">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlugZap className="size-4 text-primary" /> Conexões de WhatsApp
          </CardTitle>
          <CardDescription>Cada conta tem só uma conexão. Aqui você vê e controla todas.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-connections"] })}
          disabled={isFetching}
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {!isLoading ? (
          <div className="grid grid-cols-3 gap-2 pb-2">
            {[
              { label: "Contas com conexão", value: withInstance },
              { label: "Conectadas agora", value: connected },
              { label: "Sobrando", value: extras.length },
            ].map((k) => (
              <div key={k.label} className="rounded-md border border-border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`font-display text-xl font-semibold ${k.label === "Sobrando" && k.value > 0 ? "text-warning" : ""}`}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {!isLoading && extras.length > 0 ? (
          <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Conexões sobrando no servidor</p>
                <p className="text-xs text-muted-foreground">
                  Não pertencem a nenhuma conta. Podem ser apagadas sem afetar ninguém.
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteExtras.isPending}
                onClick={() => confirmDelete(extras.map((e) => e.instance))}
              >
                <Trash2 className="size-4" /> Apagar todas
              </Button>
            </div>
            {extras.map((e) => (
              <div key={e.instance} className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{e.instance}</p>
                  <p className="text-xs text-muted-foreground">
                    {(STATUS_LABEL[e.state] ?? STATUS_LABEL.none).text}
                    {e.number ? ` · ${e.number}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" disabled={deleteExtras.isPending} onClick={() => confirmDelete([e.instance])}>
                  <Trash2 className="size-4" /> Apagar
                </Button>
              </div>
            ))}
          </div>
        ) : !isLoading ? (
          <p className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-success" /> Nenhuma conexão sobrando. Cada conta está com no máximo uma.
          </p>
        ) : null}
        {isLoading ? (
          <div className="grid h-24 place-items-center">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
        ) : (
          rows.map((row: any) => {
            const status = STATUS_LABEL[row.status] ?? STATUS_LABEL.none;
            return (
              <div
                key={row.user_id}
                className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.email}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {row.exists ? row.instance : "Ainda não criou conexão"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.number ? `Número ${row.number}` : "Sem número vinculado"}
                    {row.last_connected_at
                      ? ` · última conexão ${new Date(row.last_connected_at).toLocaleString("pt-BR")}`
                      : ""}
                  </p>
                  {row.last_error ? <p className="mt-1 text-xs text-destructive">{row.last_error}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={status.variant} className="text-xs">
                    {status.text}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={manage.isPending}
                    onClick={() => manage.mutate({ userId: row.user_id, action: "logout" })}
                  >
                    <Power className="size-4" /> Desconectar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={manage.isPending}
                    onClick={() => manage.mutate({ userId: row.user_id, action: "reset" })}
                  >
                    <Trash2 className="size-4" /> Apagar conexão
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlugZap, RefreshCw, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminManageConnection, listAdminConnections } from "@/lib/admin.functions";

const STATUS_LABEL: Record<string, { text: string; variant: "success" | "secondary" | "destructive" }> = {
  open: { text: "Conectado", variant: "success" },
  connecting: { text: "Aguardando leitura", variant: "secondary" },
  close: { text: "Desconectado", variant: "destructive" },
  none: { text: "Nunca conectou", variant: "secondary" },
};

export function AdminConnectionsCard() {
  const listFn = useServerFn(listAdminConnections);
  const manageFn = useServerFn(adminManageConnection);
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

  const rows = (data as any)?.rows ?? [];

  return (
    <Card className="rounded-md">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlugZap className="size-4 text-primary" /> Conexões de WhatsApp
          </CardTitle>
          <CardDescription>Número conectado por revendedor, direto do servidor de mensagens.</CardDescription>
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
                  <p className="truncate text-xs text-muted-foreground">
                    {row.number ? `Número ${row.number}` : "Sem número vinculado"}
                    {row.last_connected_at
                      ? ` · última conexão ${new Date(row.last_connected_at).toLocaleString("pt-BR")}`
                      : ""}
                  </p>
                  {row.last_error ? <p className="mt-1 text-xs text-rose-500">{row.last_error}</p> : null}
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
                    <RefreshCw className="size-4" /> Recriar sessão
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

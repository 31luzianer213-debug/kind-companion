import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Loader2, MessageCircle, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminOverview } from "@/lib/admin.functions";
import { formatBRL } from "@/lib/format";

export function AdminOverviewCard() {
  const fn = useServerFn(getAdminOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fn({}),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid h-40 place-items-center rounded-md border border-border bg-card">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          {(data as any)?.error ?? "Não foi possível carregar os números agora."}
        </CardContent>
      </Card>
    );
  }

  const o = data.overview;
  const cards = [
    { label: "Revendedores", value: String(o.resellers), hint: `${o.active} pagando · ${o.trialing} em teste`, icon: Users },
    { label: "Receita mensal", value: formatBRL(o.monthlyRevenue), hint: "Assinaturas ativas", icon: Wallet },
    { label: "WhatsApp conectado", value: `${o.connected}/${o.resellers}`, hint: "Contas com número ativo", icon: MessageCircle },
    { label: "Mensagens em 24h", value: String(o.messages24h), hint: `${o.failed24h} com falha`, icon: Activity },
    { label: "Clientes cadastrados", value: String(o.clients), hint: "Somando todas as contas", icon: Users },
    { label: "Assinaturas vencidas", value: String(o.expired), hint: "Precisam renovar", icon: AlertTriangle },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="rounded-md">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wide">
              <c.icon className="size-4 text-primary" /> {c.label}
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">{c.value}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{c.hint}</CardContent>
        </Card>
      ))}
    </div>
  );
}

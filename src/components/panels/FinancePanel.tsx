import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";
import { AlertTriangle, CheckCircle2, Clock, TrendingUp, UserMinus } from "lucide-react";

const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Resumo financeiro do mês e lista de clientes que pararam de renovar. */
export function FinancePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["finance-panel"],
    queryFn: async () => {
      const [invoices, clients] = await Promise.all([
        supabase.from("invoices").select("amount, status, due_date, paid_at"),
        supabase.from("clients").select("id, name, phone, monthly_fee, next_due_date, status"),
      ]);
      if (invoices.error) throw invoices.error;
      return {
        invoices: Array.isArray(invoices.data) ? invoices.data : [],
        clients: Array.isArray(clients.data) ? clients.data : [],
      };
    },
    staleTime: 30_000,
  });

  const invoices = Array.isArray(data?.invoices) ? data!.invoices : [];
  const clients = Array.isArray(data?.clients) ? data!.clients : [];

  const summary = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let received = 0;
    let pending = 0;
    let overdue = 0;

    for (const invoice of invoices) {
      const amount = Number(invoice.amount || 0);
      const paidKey = invoice.paid_at ? String(invoice.paid_at).slice(0, 7) : null;
      const dueKey = invoice.due_date ? String(invoice.due_date).slice(0, 7) : null;
      if (invoice.status === "paid" && paidKey === monthKey) received += amount;
      if (invoice.status === "pending" && dueKey === monthKey) pending += amount;
      if (invoice.status === "overdue") overdue += amount;
    }

    const months: { label: string; total: number }[] = [];
    for (let index = 5; index >= 0; index--) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const total = invoices
        .filter((invoice) => invoice.status === "paid" && String(invoice.paid_at || "").slice(0, 7) === key)
        .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
      months.push({ label: `${monthNames[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`, total });
    }

    return { received, pending, overdue, months };
  }, [invoices]);

  const inactive = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() - 30);
    return clients
      .filter((client) => {
        if (!client.next_due_date) return false;
        const due = new Date(`${String(client.next_due_date).slice(0, 10)}T12:00:00`);
        return due.getTime() < limit.getTime();
      })
      .sort((a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date)));
  }, [clients]);

  const maxMonth = Math.max(1, ...summary.months.map((month) => month.total));
  const lostRevenue = inactive.reduce((sum, client) => sum + Number(client.monthly_fee || 0), 0);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted/60" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="surface-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Recebido no mês</p>
              <p className="mt-1 text-2xl font-black text-emerald-500">{formatBRL(summary.received)}</p>
            </div>
            <CheckCircle2 className="size-6 text-emerald-500" />
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">A receber no mês</p>
              <p className="mt-1 text-2xl font-black">{formatBRL(summary.pending)}</p>
            </div>
            <Clock className="size-6 text-amber-500" />
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Atrasado (total)</p>
              <p className="mt-1 text-2xl font-black text-rose-500">{formatBRL(summary.overdue)}</p>
            </div>
            <AlertTriangle className="size-6 text-rose-500" />
          </CardContent>
        </Card>
      </div>

      <Card className="surface-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="size-4 text-primary" /> Faturamento dos últimos 6 meses</CardTitle>
          <CardDescription>Soma dos pagamentos confirmados em cada mês.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-3">
            {summary.months.map((month) => (
              <div key={month.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">{month.total > 0 ? formatBRL(month.total) : ""}</span>
                <div
                  className="w-full rounded-t-lg bg-primary/80"
                  style={{ height: `${Math.max(4, (month.total / maxMonth) * 100)}%` }}
                  aria-label={`${month.label}: ${formatBRL(month.total)}`}
                />
                <span className="text-[11px] text-muted-foreground">{month.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="surface-card">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><UserMinus className="size-4 text-rose-500" /> Clientes que pararam de renovar</CardTitle>
              <CardDescription>Vencidos há mais de 30 dias — vale uma mensagem para recuperar.</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">{inactive.length} cliente(s) • {formatBRL(lostRevenue)}/mês</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {inactive.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              Ninguém nessa situação. Sua base está em dia.
            </p>
          ) : (
            inactive.slice(0, 15).map((client) => (
              <div key={client.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-semibold">{client.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Venceu em {formatDate(client.next_due_date!)} • {formatBRL(Number(client.monthly_fee || 0))}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <Link to="/clientes">Abrir cliente</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Clock3, RefreshCw, Send, ShoppingBag, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BoardOrder {
  id: string;
  order_number: number | string;
  customer_name: string;
  customer_phone: string;
  plan_name: string;
  amount: number | string;
  status: string;
}

export interface DueClient {
  id: string;
  name: string;
  monthly_fee: number | string;
  next_due_date: string | null;
}

/** Fila do robô: pedidos que aguardam liberação. */
export function OrdersBoard({
  orders,
  onApprove,
  approving,
}: {
  orders: BoardOrder[];
  onApprove: (id: string) => void;
  approving: boolean;
}) {
  const pending = orders.filter((order) => order.status === "pending");

  return (
    <section className="panel-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <ShoppingBag className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
              Pedidos do robô
              {pending.length > 0 ? (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">{pending.length} na fila</span>
              ) : null}
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">Aprove o Pix e o acesso é liberado no Sigma e no WhatsApp.</p>
          </div>
        </div>
        <Link to="/pedidos" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Ver todos ({orders.length}) <ChevronRight className="size-3.5" />
        </Link>
      </header>

      <div className="p-4 sm:p-5">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <span className="mb-2 grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
              <ShoppingBag className="size-4" />
            </span>
            <p className="text-xs font-bold text-foreground">Nenhum pedido ainda</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Os pedidos feitos pelo robô no WhatsApp aparecem aqui.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {orders.slice(0, 4).map((order) => {
              const isPending = order.status === "pending";
              const isApproved = order.status === "approved";
              return (
                <article
                  key={order.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border bg-card p-3.5 transition-colors",
                    isPending ? "border-warning/35 bg-warning/[0.03]" : "border-border/80",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-muted-foreground">#{order.order_number}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        isPending && "bg-warning/15 text-warning",
                        isApproved && "bg-primary/15 text-primary",
                        !isPending && !isApproved && "bg-muted text-muted-foreground",
                      )}
                    >
                      {isPending ? "Aguardando Pix" : isApproved ? "Liberado" : "Cancelado"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{order.customer_name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{order.customer_phone}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[11px]">
                    <span className="truncate text-muted-foreground" title={order.plan_name}>
                      {order.plan_name}
                    </span>
                    <span className="numeric shrink-0 font-bold text-foreground">{formatBRL(Number(order.amount))}</span>
                  </div>
                  {isPending ? (
                    <Button
                      size="sm"
                      onClick={() => onApprove(order.id)}
                      disabled={approving}
                      className="h-8 w-full gap-1.5 rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                      {approving ? <RefreshCw className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                      Liberar acesso
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline" className="h-8 w-full rounded-lg text-xs font-semibold">
                      <Link to="/pedidos">
                        Ver pedido <ChevronRight className="ml-1 size-3" />
                      </Link>
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** Clientes com vencimento nos próximos dias, com cobrança em um clique. */
export function DueSoonCard({
  clients,
  today,
  onCharge,
  sendingId,
}: {
  clients: DueClient[];
  today: string;
  onCharge: (client: DueClient) => void;
  sendingId: string | null;
}) {
  return (
    <section className="panel-card flex flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-bold text-foreground">Vencimentos próximos</h2>
          <p className="truncate text-[11px] text-muted-foreground">Até 3 dias — cobre antes de vencer.</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{clients.length}</span>
      </header>

      <div className="flex-1 space-y-1.5 p-3">
        {clients.length === 0 ? (
          <div className="flex h-full min-h-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 text-center">
            <span className="mb-2 grid size-8 place-items-center rounded-full bg-primary/12 text-primary">
              <Check className="size-4" />
            </span>
            <p className="text-xs font-bold text-foreground">Tudo em dia!</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Nenhum cliente vencendo nos próximos dias.</p>
          </div>
        ) : (
          clients.map((client) => {
            const isToday = client.next_due_date === today;
            return (
              <div key={client.id} className="data-row">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-xs font-bold text-foreground">
                    {client.name}
                    {isToday ? (
                      <span className="rounded bg-warning/15 px-1 py-0.5 text-[9px] font-bold uppercase text-warning">hoje</span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatBRL(Number(client.monthly_fee))} · {formatDate(client.next_due_date)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sendingId === client.id}
                  onClick={() => onCharge(client)}
                  className="h-7 shrink-0 gap-1 rounded-lg px-2 text-[11px] font-bold"
                >
                  {sendingId === client.id ? <Clock3 className="size-3 animate-spin" /> : <Send className="size-3" />}
                  Cobrar
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border/70 p-2">
        <Button asChild variant="ghost" size="sm" className="h-8 w-full justify-between rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground">
          <Link to="/cobrancas">
            Ver todas as cobranças <ChevronRight className="size-3" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

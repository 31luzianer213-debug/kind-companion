import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface OverviewStatus {
  ok: boolean;
  label: string;
  to: string;
}

export interface OverviewHeroProps {
  greet: string;
  monthName: string;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  expected: number;
  paidPct: number;
  activeClients: number;
  sigmaClients: number;
  dueSoon: number;
  expired: number;
  ticketMedio: number;
  pendingOrders: number;
  upcomingCount: number;
  serverDisplayName: string;
  statuses: OverviewStatus[];
  syncingSigma: boolean;
  onSyncSigma: () => void;
}

/**
 * Topo do painel: leitura do mês + saúde da operação.
 * Reúne o número que importa (recebido), a composição da carteira
 * e quatro indicadores clicáveis — tudo sem scroll no desktop.
 */
export function OverviewHero(props: OverviewHeroProps) {
  const pct = (value: number) => (props.expected > 0 ? Math.min(100, (value / props.expected) * 100) : 0);
  const waiting = Math.max(0, props.totalPending - props.totalOverdue);

  const kpis = [
    {
      label: "Clientes ativos",
      value: String(props.activeClients),
      hint: `${props.sigmaClients} sincronizados no Sigma`,
      icon: Users,
      to: "/clientes",
      accent: "bg-primary",
    },
    {
      label: "Vencem em 7 dias",
      value: String(props.dueSoon),
      hint: props.upcomingCount > 0 ? `${props.upcomingCount} em até 3 dias` : "Nada urgente",
      icon: Calendar,
      to: "/clientes",
      accent: "bg-warning",
    },
    {
      label: "Em atraso",
      value: String(props.expired),
      hint: props.totalOverdue > 0 ? `${formatBRL(props.totalOverdue)} a recuperar` : "Carteira em dia",
      icon: AlertTriangle,
      to: "/cobrancas",
      accent: "bg-destructive",
    },
    {
      label: "Ticket médio",
      value: formatBRL(props.ticketMedio),
      hint: props.pendingOrders > 0 ? `${props.pendingOrders} pedido(s) na fila` : props.serverDisplayName,
      icon: Wallet,
      to: props.pendingOrders > 0 ? "/pedidos" : "/clientes",
      accent: "bg-info",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{props.greet} · resumo de {props.monthName}</p>
          <h1 className="mt-1 font-display text-2xl font-black tracking-tight text-foreground sm:text-[30px]">
            Sua operação hoje
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {props.statuses.map((status) => (
            <Link key={status.label} to={status.to as never} className="status-chip">
              <span className="relative flex size-2">
                {status.ok ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" /> : null}
                <span className={cn("relative inline-flex size-2 rounded-full", status.ok ? "bg-primary" : "bg-warning")} />
              </span>
              {status.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="panel-hero flex flex-col gap-6 p-5 sm:p-7">
          <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <TrendingUp className="size-3.5 text-primary" />
                Recebido em {props.monthName}
              </p>
              <p className="numeric mt-2 font-display text-[2.4rem] font-black leading-none text-foreground sm:text-5xl">
                {formatBRL(props.totalPaid)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Previsto no mês: <span className="font-semibold text-foreground">{formatBRL(props.expected)}</span>
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-black tabular-nums text-primary-foreground shadow-sm">
              {props.paidPct}%
            </span>
          </div>

          <div className="relative space-y-3">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-foreground/8">
              <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${pct(props.totalPaid)}%` }} />
              <div className="h-full rounded-full bg-warning transition-[width] duration-700 ease-out" style={{ width: `${pct(waiting)}%` }} />
              <div className="h-full rounded-full bg-destructive transition-[width] duration-700 ease-out" style={{ width: `${pct(props.totalOverdue)}%` }} />
            </div>
            <dl className="grid grid-cols-3 gap-2">
              {[
                { key: "recebido", label: "Recebido", value: props.totalPaid, dot: "bg-primary" },
                { key: "aberto", label: "A receber", value: waiting, dot: "bg-warning" },
                { key: "atraso", label: "Atrasado", value: props.totalOverdue, dot: "bg-destructive" },
              ].map((item) => (
                <div key={item.key} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", item.dot)} />
                    {item.label}
                  </dt>
                  <dd className="numeric mt-0.5 truncate text-sm font-bold text-foreground">{formatBRL(item.value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mt-auto flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="gap-1.5 rounded-lg font-semibold shadow-sm">
              <Link to="/clientes" search={{ novo: "1" } as never}>
                <Plus className="size-4" /> Novo cliente
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={props.onSyncSigma}
              disabled={props.syncingSigma}
              className="gap-1.5 rounded-lg border-border bg-card/70 font-semibold"
            >
              <RefreshCw className={cn("size-3.5", props.syncingSigma && "animate-spin")} />
              {props.syncingSigma ? "Sincronizando…" : "Sincronizar Sigma"}
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 rounded-lg font-semibold text-muted-foreground hover:text-foreground">
              <Link to="/cobrancas">
                <Sparkles className="size-3.5" /> Cobranças
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-2" data-testid="client-health-strip">
          {kpis.map((kpi) => (
            <Link key={kpi.label} to={kpi.to as never} className="kpi-tile group">
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground/80">
                  <kpi.icon className="size-4" />
                </span>
                <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="min-w-0">
                <span className={cn("mb-2 block h-1 w-8 rounded-full", kpi.accent)} />
                <p className="numeric truncate font-display text-[22px] font-black leading-none text-foreground">{kpi.value}</p>
                <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{kpi.label}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{kpi.hint}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

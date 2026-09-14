import { Link } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/SigmaLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import {
  navigationGroups,
  primaryMobileNavigation,
  type NavigationBadge,
  type NavigationItem,
} from "./navigation";

export interface NavigationCounts {
  clients: number;
  overdueInvoices: number;
  pendingOrders: number;
  sigmaClients: number;
}

interface AppNavigationProps {
  pathname: string;
  counts?: NavigationCounts;
  email: string | null;
  isWhatsAppConnected: boolean;
  onNavigate?: () => void;
  onSignOut: () => void;
}

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function getBadge(
  key: NavigationBadge | undefined,
  counts: NavigationCounts | undefined,
  isWhatsAppConnected: boolean,
) {
  if (key === "orders" && counts?.pendingOrders) return { value: counts.pendingOrders, tone: "warning" };
  if (key === "invoices" && counts?.overdueInvoices) return { value: counts.overdueInvoices, tone: "danger" };
  if (key === "clients" && counts?.clients) return { value: counts.clients, tone: "neutral" };
  if (key === "sigma" && counts?.sigmaClients) return { value: counts.sigmaClients, tone: "neutral" };
  if (key === "whatsapp" && isWhatsAppConnected) return { value: "•", tone: "success" };
  return null;
}

function Badge({
  item,
  counts,
  connected,
  active,
}: {
  item: NavigationItem;
  counts?: NavigationCounts;
  connected: boolean;
  active: boolean;
}) {
  const badge = getBadge(item.badgeKey, counts, connected);
  if (!badge) return null;

  return (
    <span
      className={cn(
        "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold tabular-nums",
        active && "bg-white/20 text-white",
        !active && badge.tone === "warning" && "bg-amber-500/15 text-amber-500",
        !active && badge.tone === "danger" && "bg-rose-500/15 text-rose-500",
        !active && badge.tone === "success" && "bg-emerald-500/15 text-emerald-500",
        !active && badge.tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {badge.value}
    </span>
  );
}

export function AppBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/painel" className="group flex min-w-0 items-center gap-2.5" aria-label="Ir para o painel">
      <SigmaLogo size={compact ? "sm" : "md"} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-black tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-[15px]">
            Sigma Control
          </span>
          {!compact && (
            <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-emerald-500">
              GRÁTIS
            </span>
          )}
        </div>
        {!compact && (
          <span className="block truncate text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Operação inteligente
          </span>
        )}
      </div>
    </Link>
  );
}

export function DesktopNavigation(props: AppNavigationProps) {
  return (
    <>
      <div className="border-b border-border/50 px-2 pb-5">
        <AppBrand />
      </div>
      <nav className="mt-4 flex flex-1 flex-col gap-5 overflow-y-auto pr-1 subtle-scrollbar" aria-label="Navegação principal">
        {navigationGroups.map((group) => (
          <section key={group.title} aria-labelledby={`nav-${group.title}`}>
            <p id={`nav-${group.title}`} className="mb-1.5 px-3 text-[9px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/65">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(props.pathname, item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 text-sm font-semibold transition-all",
                      active
                        ? "border-primary/25 bg-primary text-primary-foreground shadow-lg shadow-primary/15"
                        : "text-muted-foreground hover:border-border/70 hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    <Badge item={item} counts={props.counts} connected={props.isWhatsAppConnected} active={active} />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
      <AccountFooter {...props} />
    </>
  );
}

export function MobileDrawer(props: AppNavigationProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/50 px-1 pb-4">
        <AppBrand />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto py-5 pr-1 subtle-scrollbar" aria-label="Menu mobile">
        {navigationGroups.map((group) => (
          <section key={group.title}>
            <p className="mb-1.5 px-3 text-[9px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/65">
              {group.title}
            </p>
            {group.items.map((item) => {
              const active = isActive(props.pathname, item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={props.onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground active:bg-accent active:text-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <Badge item={item} counts={props.counts} connected={props.isWhatsAppConnected} active={active} />
                  <ChevronRight className="size-4 opacity-40" />
                </Link>
              );
            })}
          </section>
        ))}
      </nav>
      <AccountFooter {...props} />
    </div>
  );
}

export function MobileBottomNavigation(props: Pick<AppNavigationProps, "pathname" | "counts" | "isWhatsAppConnected">) {
  return (
    <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border/70 bg-background/92 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-12px_40px_-28px_rgba(0,0,0,.75)] backdrop-blur-xl md:hidden" aria-label="Atalhos principais">
      {primaryMobileNavigation.map((item) => {
        const active = isActive(props.pathname, item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold transition-all",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-accent",
            )}
          >
            <Icon className="size-[19px]" />
            <span>{item.shortLabel}</span>
            <span className={cn("absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary transition-opacity", active ? "opacity-100" : "opacity-0")} />
          </Link>
        );
      })}
    </nav>
  );
}

function AccountFooter(props: AppNavigationProps) {
  return (
    <div className="space-y-3 border-t border-border/50 pt-4">
      <Link
        to="/whatsapp"
        onClick={props.onNavigate}
        className={cn(
          "flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-bold",
          props.isWhatsAppConnected
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
            : "border-border/70 bg-card/60 text-muted-foreground",
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", props.isWhatsAppConnected ? "bg-emerald-500" : "bg-zinc-500")} />
          {props.isWhatsAppConnected ? "WhatsApp online" : "WhatsApp desconectado"}
        </span>
        <ChevronRight className="size-3.5 opacity-50" />
      </Link>
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/65 p-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-xs font-black text-primary-foreground">
          {(props.email?.[0] ?? "U").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">{props.email?.split("@")[0] ?? "Minha conta"}</p>
          <p className="truncate text-[10px] text-muted-foreground">{props.email ?? "Carregando…"}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle withLabel />
        <Button variant="ghost" size="sm" onClick={props.onSignOut} className="text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="mr-1.5 size-3.5" /> Sair
        </Button>
      </div>
    </div>
  );
}

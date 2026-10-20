import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, LogOut, Menu } from "lucide-react";
import { useState } from "react";
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
  clients?: number;
  overdueInvoices?: number;
  pendingOrders?: number;
  sigmaClients?: number;
}

interface AppNavigationProps {
  pathname: string;
  counts?: NavigationCounts;
  email: string | null;
  isWhatsAppConnected: boolean;
  isAdmin?: boolean;
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

function Badge({ item, counts, connected, active }: { item: NavigationItem; counts?: NavigationCounts; connected: boolean; active: boolean }) {
  const badge = getBadge(item.badgeKey, counts, connected);
  if (!badge) return null;
  return (
    <span className={cn(
      "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold tabular-nums",
      active && "bg-sidebar-primary text-sidebar-primary-foreground",
      !active && badge.tone === "warning" && "bg-warning/20 text-warning",
      !active && badge.tone === "danger" && "bg-destructive/25 text-destructive",
      !active && badge.tone === "success" && "bg-success/25 text-success",
      !active && badge.tone === "neutral" && "bg-sidebar-accent text-sidebar-foreground/80",
    )}>{badge.value}</span>
  );
}

export function AppBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/painel"
      className="group flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 transition-colors"
      aria-label="Ir para o painel"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary/15 ring-1 ring-sidebar-primary/25 transition-colors group-hover:bg-sidebar-primary/25">
        <SigmaLogo size={compact ? "sm" : "md"} />
      </span>
      <div className="min-w-0 leading-tight">
        <span className="block truncate font-display text-[15px] font-black tracking-tight text-sidebar-foreground transition-colors group-hover:text-sidebar-primary">
          Sigma Control
        </span>
        {!compact && (
          <span className="block truncate text-[9px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/45">
            Gestão de revenda IPTV
          </span>
        )}
      </div>
    </Link>
  );
}

function DesktopGroup({ group, index, props }: { group: (typeof navigationGroups)[number]; index: number; props: AppNavigationProps }) {
  const items = group.items.filter((item) => !item.adminOnly || props.isAdmin);
  const hasActive = items.some((item) => isActive(props.pathname, item.to));
  const [open, setOpen] = useState(index === 0 || hasActive);
  const expanded = open || hasActive;
  return (
    <section aria-labelledby={`nav-${index}`} className="space-y-1">
      {index === 0 ? (
        <p id={`nav-${index}`} className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-sidebar-foreground/40">{group.title}</p>
      ) : (
        <button
          id={`nav-${index}`}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-sidebar-foreground/40 transition-colors hover:text-sidebar-foreground/80"
        >
          {group.title}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded ? "rotate-0" : "-rotate-90")} />
        </button>
      )}
      {expanded && (
        <div className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(props.pathname, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-all",
                  active
                    ? "bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-inset ring-sidebar-primary/30"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md transition-colors",
                    active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-foreground/8 text-sidebar-foreground/60 group-hover:bg-sidebar-foreground/12 group-hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                <Badge item={item} counts={props.counts} connected={props.isWhatsAppConnected} active={active} />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function DesktopNavigation(props: AppNavigationProps) {
  return (
    <>
      <div className="border-b border-border px-2 pb-5 pt-1"><AppBrand /></div>
      <nav className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto pr-1 subtle-scrollbar" aria-label="Navegação principal">
        {navigationGroups.map((group, index) => (
          <DesktopGroup key={group.title} group={group} index={index} props={props} />
        ))}
      </nav>
      <AccountFooter {...props} />
    </>
  );
}

export function MobileDrawer(props: AppNavigationProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="flex-1 space-y-4 overflow-y-auto overscroll-contain py-3 subtle-scrollbar" aria-label="Menu mobile">
        {navigationGroups.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || props.isAdmin);
          return (
            <section key={group.title}>
              <p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/70">{group.title}</p>
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => {
                  const active = isActive(props.pathname, item.to);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={props.onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[52px] min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all",
                        active ? "border-primary/30 bg-primary/12 text-primary" : "border-border/55 bg-card/65 text-foreground active:scale-[.98] active:bg-accent",
                      )}
                    >
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">{item.label}</span>
                      <Badge item={item} counts={props.counts} connected={props.isWhatsAppConnected} active={active} />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
      <AccountFooter {...props} compactMobile />
    </div>
  );
}

export function MobileBottomNavigation(props: Pick<AppNavigationProps, "pathname" | "counts" | "isWhatsAppConnected"> & { onOpenMenu: () => void }) {
  return (
    <nav
      className="mobile-bottom-nav fixed inset-x-2 bottom-2 z-30 grid grid-cols-[repeat(5,minmax(0,1fr))] gap-0.5 rounded-2xl border border-border bg-card/96 px-1.5 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:hidden"
      aria-label="Atalhos principais"
    >
      {primaryMobileNavigation.map((item) => {
        const active = isActive(props.pathname, item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[9px] font-bold transition-all active:scale-[.96]",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-8 place-items-center rounded-xl transition-all",
                active ? "bg-primary text-primary-foreground shadow-sm" : "bg-transparent",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
            </span>
            <span className="max-w-full truncate">{item.shortLabel}</span>
          </Link>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        onClick={props.onOpenMenu}
        className="relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[9px] font-bold text-muted-foreground transition-all active:scale-[.96] active:bg-accent"
        aria-label="Abrir todas as opções"
      >
        <span className="grid size-8 place-items-center rounded-xl bg-muted/70"><Menu className="size-[18px] shrink-0" /></span>
        <span>Mais</span>
      </Button>
    </nav>
  );
}

function AccountFooter(props: AppNavigationProps & { compactMobile?: boolean }) {
  if (props.compactMobile) {
    return (
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-border pt-3">
        <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
          <p className="truncate text-[11px] font-bold text-foreground">{props.email?.split("@")[0] ?? "Minha conta"}</p>
          <p className={cn("mt-0.5 flex items-center gap-1.5 text-[9px] font-semibold", props.isWhatsAppConnected ? "text-primary" : "text-muted-foreground")}>
            <span className={cn("size-1.5 rounded-full", props.isWhatsAppConnected ? "bg-primary" : "bg-muted-foreground/50")} />
            {props.isWhatsAppConnected ? "WhatsApp online" : "WhatsApp offline"}
          </p>
        </div>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={props.onSignOut} aria-label="Sair" className="size-10 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LogOut className="size-4" /></Button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-sidebar-border pt-3">
      <Link
        to="/whatsapp"
        onClick={props.onNavigate}
        className={cn(
          "flex items-center justify-between rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors",
          props.isWhatsAppConnected
            ? "border-sidebar-primary/30 bg-sidebar-primary/12 text-sidebar-primary hover:bg-sidebar-primary/20"
            : "border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground/60 hover:text-sidebar-foreground",
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", props.isWhatsAppConnected ? "bg-sidebar-primary" : "bg-sidebar-foreground/40")} />
          {props.isWhatsAppConnected ? "WhatsApp online" : "WhatsApp desconectado"}
        </span>
        <ChevronRight className="size-3.5 opacity-60" />
      </Link>
      <div className="flex items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-xs font-black text-sidebar-primary-foreground">
          {(props.email?.[0] ?? "U").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-sidebar-foreground">{props.email?.split("@")[0] ?? "Minha conta"}</p>
          <p className="truncate text-[10px] text-sidebar-foreground/50">{props.email ?? "Carregando…"}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle withLabel />
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onSignOut}
          className="text-xs text-sidebar-foreground/60 hover:bg-destructive/15 hover:text-destructive"
        >
          <LogOut className="mr-1.5 size-3.5" /> Sair
        </Button>
      </div>
    </div>
  );
}

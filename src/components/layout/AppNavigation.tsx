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
          active && "bg-primary/10 text-primary",
      !active && badge.tone === "warning" && "bg-warning/15 text-warning",
      !active && badge.tone === "danger" && "bg-destructive/15 text-destructive",
      !active && badge.tone === "success" && "bg-success/15 text-success",
      !active && badge.tone === "neutral" && "bg-muted text-muted-foreground",
    )}>{badge.value}</span>
  );
}

export function AppBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/painel" className="group flex min-w-0 items-center gap-2.5" aria-label="Ir para o painel">
      <SigmaLogo size={compact ? "sm" : "md"} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-black tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-[15px]">Sigma Control</span>
        </div>
        {!compact && <span className="block truncate text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Gestão de revenda IPTV</span>}
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
    <section aria-labelledby={`nav-${index}`}>
      {index === 0 ? (
        <p id={`nav-${index}`} className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/70">{group.title}</p>
      ) : (
        <button
          id={`nav-${index}`}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          className="mb-1.5 flex w-full items-center justify-between rounded-md px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/70 hover:text-foreground"
        >
          {group.title}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded ? "rotate-0" : "-rotate-90")} />
        </button>
      )}
      {expanded && (
        <div className="space-y-1">
          {items.map((item) => {
            const active = isActive(props.pathname, item.to);
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined} className={cn(
                "group relative flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-semibold transition-all",
                active ? "border-primary/15 bg-primary/10 text-primary" : "text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground",
              )}>
                <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary transition-opacity", active ? "opacity-100" : "opacity-0")} />
                <Icon className="size-[18px] shrink-0" />
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
    <nav className="mobile-bottom-nav fixed inset-x-2 bottom-2 z-30 grid grid-cols-[repeat(5,minmax(0,1fr))] rounded-md border border-border bg-background/96 px-1.5 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 shadow-sm backdrop-blur-xl lg:hidden" aria-label="Atalhos principais">
      {primaryMobileNavigation.map((item) => {
        const active = isActive(props.pathname, item.to);
        const Icon = item.icon;
        return (
          <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined} className={cn(
            "relative flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[9px] font-extrabold transition-all active:scale-[.96]",
            active ? "text-primary" : "text-muted-foreground",
          )}>
            <span className={cn("grid size-8 place-items-center rounded-lg transition-all", active ? "bg-primary/10 text-primary" : "bg-transparent")}> 
              <Icon className="size-[18px] shrink-0" />
            </span>
            <span className="max-w-full truncate">{item.shortLabel}</span>
          </Link>
        );
      })}
      <Button type="button" variant="ghost" onClick={props.onOpenMenu} className="relative flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[9px] font-extrabold text-muted-foreground transition-all active:scale-[.96] active:bg-accent" aria-label="Abrir todas as opções">
        <span className="grid size-8 place-items-center rounded-md bg-muted/65"><Menu className="size-[18px] shrink-0" /></span>
        <span>Mais</span>
      </Button>
    </nav>
  );
}

function AccountFooter(props: AppNavigationProps & { compactMobile?: boolean }) {
  if (props.compactMobile) {
    return (
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-border/50 pt-3">
        <div className="min-w-0 rounded-md bg-card/55 px-3 py-2">
          <p className="truncate text-[11px] font-bold">{props.email?.split("@")[0] ?? "Minha conta"}</p>
          <p className={cn("mt-0.5 flex items-center gap-1.5 text-[9px]", props.isWhatsAppConnected ? "text-success" : "text-muted-foreground")}>
            <span className={cn("size-1.5 rounded-full", props.isWhatsAppConnected ? "bg-success" : "bg-muted-foreground/50")} />
            {props.isWhatsAppConnected ? "WhatsApp online" : "WhatsApp offline"}
          </p>
        </div>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={props.onSignOut} aria-label="Sair" className="size-10 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LogOut className="size-4" /></Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border/50 pt-4">
      <Link to="/whatsapp" onClick={props.onNavigate} className={cn(
        "flex items-center justify-between rounded-md border px-3 py-2.5 text-xs font-bold",
        props.isWhatsAppConnected ? "border-success/25 bg-success/10 text-success" : "border-border/70 bg-card/60 text-muted-foreground",
      )}>
        <span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", props.isWhatsAppConnected ? "bg-success" : "bg-muted-foreground/50")} />{props.isWhatsAppConnected ? "WhatsApp online" : "WhatsApp desconectado"}</span>
        <ChevronRight className="size-3.5 opacity-50" />
      </Link>
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/65 p-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-xs font-black text-primary-foreground">{(props.email?.[0] ?? "U").toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{props.email?.split("@")[0] ?? "Minha conta"}</p><p className="truncate text-[10px] text-muted-foreground">{props.email ?? "Carregando…"}</p></div>
      </div>
      <div className="flex items-center justify-between gap-2"><ThemeToggle withLabel /><Button variant="ghost" size="sm" onClick={props.onSignOut} className="text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LogOut className="mr-1.5 size-3.5" /> Sair</Button></div>
    </div>
  );
}

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Users,
  ListVideo,
  Receipt,
  Settings,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  Sparkles,
} from "lucide-react";

const nav = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/listas", label: "Listas IPTV", icon: ListVideo },
  { to: "/cobrancas", label: "Cobranças", icon: Receipt },
  { to: "/configuracoes", label: "WhatsApp", icon: Settings },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const brand = (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20 ring-1 ring-primary/15">
        <img src={logo} alt="IPTV Manager" width={22} height={22} className="h-[22px] w-[22px] object-contain brightness-0 invert" />
      </span>
      <span className="leading-none">
        <span className="block text-[15px] font-bold tracking-tight">IPTV Manager</span>
        <span className="block text-[11px] font-medium tracking-widest text-muted-foreground">GESTÃO PREMIUM</span>
      </span>
    </div>
  );

  const links = (
    <nav className="flex flex-col gap-1.5">
      <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Menu</p>
      {nav.map(({ to, label, icon: Icon }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
            {label}
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-foreground/90" />}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-3 pt-6">
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conectado como</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
            {(email?.[0] ?? "?").toUpperCase()}
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium leading-none">{email ?? "..."}</p>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{email ?? ""}</p>
      </div>
      <div className="rounded-2xl border border-primary/10 bg-primary/[0.06] p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Cobrança automática
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">WhatsApp enviando sozinho todo dia às 9h.</p>
      </div>
      <ThemeToggle withLabel />
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={signOut}
      >
        <LogOut className="h-4 w-4" /> Sair
      </Button>
      <p className="px-1 text-[11px] text-muted-foreground/60">© {new Date().getFullYear()} IPTV Manager</p>
    </div>
  );

  return (
    <div className="app-aurora min-h-screen bg-background md:flex">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl md:hidden">
        {brand}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Menu" className="rounded-full">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {open && (
        <div className="border-b border-border/60 bg-sidebar/95 px-4 py-4 backdrop-blur-xl md:hidden">
          {links}
          <div className="mt-4">{footer}</div>
        </div>
      )}

      <aside className="sticky top-0 hidden h-[100dvh] w-[276px] shrink-0 flex-col border-r border-border/60 bg-sidebar/80 p-5 backdrop-blur-xl md:flex">
        {brand}
        <div className="mt-8">{links}</div>
        {footer}
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 hidden app-grid opacity-[0.32] dark:opacity-[0.10] md:block" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        <div className="relative px-4 py-6 sm:px-6 md:px-8 md:py-9 lg:px-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </div>
      </main>
    </div>
  );
}

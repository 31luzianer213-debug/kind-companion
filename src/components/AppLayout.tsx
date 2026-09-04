import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import {
  Users,
  ListVideo,
  Receipt,
  Settings,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
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
    <div className="flex items-center gap-2.5">
      <img src={logo} alt="IPTV Manager" width={36} height={36} className="h-9 w-9" />
      <span className="text-[15px] font-semibold tracking-tight">IPTV Manager</span>
    </div>
  );

  const links = (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon }) => {
        const active = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
              active
                ? "bg-primary/12 font-medium text-foreground ring-1 ring-primary/25"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-3 pt-6">
      <div className="rounded-xl border border-border/70 bg-white/[0.03] p-3">
        <p className="text-xs text-muted-foreground">Conectado como</p>
        <p className="truncate text-sm font-medium">{email ?? "..."}</p>
      </div>
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        onClick={signOut}
      >
        <LogOut className="h-4 w-4" /> Sair
      </Button>
    </div>
  );

  return (
    <div className="app-aurora min-h-screen bg-background md:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur md:hidden">
        {brand}
        <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {open && (
        <div className="border-b border-border/70 bg-sidebar/95 px-4 py-4 backdrop-blur md:hidden">
          {links}
          {footer}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-sidebar/70 p-5 backdrop-blur md:flex">
        {brand}
        <div className="mt-8">{links}</div>
        {footer}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

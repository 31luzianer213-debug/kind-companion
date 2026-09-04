import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Tv,
  Users,
  ListVideo,
  Receipt,
  Settings,
  LogOut,
  LayoutDashboard,
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

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="border-b border-border bg-sidebar p-4 md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="mb-6 flex items-center gap-2 font-semibold">
          <Tv className="h-5 w-5 text-primary" /> IPTV Manager
        </div>
        <nav className="flex flex-wrap gap-1 md:flex-col">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                pathname === to
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <Button variant="ghost" className="mt-6 w-full justify-start gap-2" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

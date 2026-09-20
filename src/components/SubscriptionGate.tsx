import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { getMySubscription } from "@/lib/subscription.functions";

const ALWAYS_ALLOWED = ["/assinatura", "/configuracoes"];

export function useSubscriptionStatus() {
  const subFn = useServerFn(getMySubscription);
  return useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => subFn({}),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** Aviso de teste/vencimento e bloqueio suave quando a assinatura expira. */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: sub } = useSubscriptionStatus();

  if (!sub) return <>{children}</>;
  const allowed = ALWAYS_ALLOWED.some((route) => pathname.startsWith(route));

  if (sub.state === "blocked" && !allowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" data-testid="subscription-blocked">
        <div className="max-w-md space-y-4 rounded-xl border border-rose-500/30 bg-card p-6 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-rose-500/10 text-rose-500"><Lock className="size-5" /></span>
          <h2 className="text-lg font-bold text-foreground">Assinatura vencida</h2>
          <p className="text-sm text-muted-foreground">Seus dados estão guardados com segurança. Renove sua assinatura para voltar a gerenciar clientes, cobranças e o robô do WhatsApp.</p>
          <Button asChild className="w-full"><Link to="/assinatura">Renovar agora</Link></Button>
        </div>
      </div>
    );
  }

  const showTrial = sub.state === "trialing" && sub.daysLeft <= 3;
  const showGrace = sub.state === "grace";

  return (
    <>
      {(showTrial || showGrace) && !pathname.startsWith("/assinatura") && (
        <div
          className={`mb-4 flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${showGrace ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "border-primary/30 bg-primary/10 text-foreground"}`}
          data-testid="subscription-banner"
        >
          <span className="flex items-center gap-2 font-semibold">
            {showGrace ? <AlertTriangle className="size-4 shrink-0" /> : <Sparkles className="size-4 shrink-0 text-primary" />}
            {showGrace
              ? "Sua assinatura venceu. Novos cadastros estão pausados até a renovação."
              : `Seu teste grátis termina em ${Math.max(sub.daysLeft, 0)} dia(s).`}
          </span>
          <Button asChild size="sm" variant={showGrace ? "default" : "outline"}><Link to="/assinatura">{showGrace ? "Renovar" : "Ver planos"}</Link></Button>
        </div>
      )}
      {children}
    </>
  );
}

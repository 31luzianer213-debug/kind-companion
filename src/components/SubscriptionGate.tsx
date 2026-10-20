import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { getMySubscription } from "@/lib/subscription.functions";

const ALWAYS_ALLOWED = ["/assinatura", "/configuracoes", "/admin"];

export function useSubscriptionStatus() {
  const subFn = useServerFn(getMySubscription);
  return useQuery({
    // Chave nova (v2): descarta respostas antigas salvas no navegador que ainda
    // traziam "blocked" de antes da regra do administrador.
    queryKey: ["my-subscription-v2"],
    queryFn: () => subFn({}),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    // Se a checagem falhar (rede, sessão renovando), libera o acesso em vez de
    // mostrar um bloqueio falso de "Assinatura vencida".
    retry: 1,
  });
}

/** Aviso de teste/vencimento e bloqueio suave quando a assinatura expira. */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: sub, isError } = useSubscriptionStatus();

  if (!sub || isError) return <>{children}</>;
  const allowed = ALWAYS_ALLOWED.some((route) => pathname.startsWith(route));

  // O administrador do sistema não tem assinatura: nunca bloqueia o painel dele.
  if (sub.isAdmin) return <>{children}</>;

  if (sub.state === "blocked" && !allowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" data-testid="subscription-blocked">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-destructive/25 bg-card p-6 text-center shadow-[0_24px_60px_-40px_rgba(0,0,0,0.5)]">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive"><Lock className="size-5" /></span>
          <h2 className="font-display text-lg font-bold text-foreground">Assinatura vencida</h2>
          <p className="text-sm text-muted-foreground">Seus dados estão guardados com segurança. Renove sua assinatura para voltar a gerenciar clientes, cobranças e o robô do WhatsApp.</p>
          <Button asChild className="w-full rounded-lg font-bold"><Link to="/assinatura">Renovar agora</Link></Button>
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
          className={`mb-4 flex flex-col gap-2 rounded-xl border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${showGrace ? "border-warning/35 bg-warning/10" : "border-primary/30 bg-primary/[0.07]"}`}
          data-testid="subscription-banner"
        >
          <span className="flex items-center gap-2 font-semibold text-foreground">
            {showGrace ? <AlertTriangle className="size-4 shrink-0 text-warning" /> : <Sparkles className="size-4 shrink-0 text-primary" />}
            {showGrace
              ? "Sua assinatura venceu. Novos cadastros estão pausados até a renovação."
              : `Seu teste grátis termina em ${Math.max(sub.daysLeft, 0)} dia(s).`}
          </span>
          <Button asChild size="sm" className="shrink-0 rounded-lg font-bold">
            <Link to="/assinatura">{showGrace ? "Renovar" : "Ver planos"}</Link>
          </Button>
        </div>
      )}
      {children}
    </>
  );
}

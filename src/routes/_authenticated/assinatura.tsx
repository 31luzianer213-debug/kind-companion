import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Check, Copy, Crown, Loader2, QrCode, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  checkSubscriptionPayment,
  createSubscriptionPix,
  getMySubscription,
  listSaasPlans,
  type SaasPlan,
} from "@/lib/subscription.functions";

export const Route = createFileRoute("/_authenticated/assinatura")({
  head: () => ({ meta: [{ title: "Assinatura — Sigma Control" }] }),
  component: AssinaturaPage,
});

const PERIODS = [
  { months: 1, label: "Mensal", note: "" },
  { months: 6, label: "Semestral", note: "10% off" },
  { months: 12, label: "Anual", note: "20% off" },
];

function priceFor(plan: SaasPlan, months: number) {
  const discount = months >= 12 ? 0.8 : months >= 6 ? 0.9 : 1;
  return Number((plan.price_monthly * months * discount).toFixed(2));
}

const stateLabels: Record<string, { label: string; tone: string }> = {
  active: { label: "Assinatura ativa", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  trialing: { label: "Período de teste", tone: "border-primary/30 bg-primary/10 text-primary" },
  grace: { label: "Vencida — somente leitura", tone: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  blocked: { label: "Bloqueada", tone: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

function AssinaturaPage() {
  const queryClient = useQueryClient();
  const plansFn = useServerFn(listSaasPlans);
  const subFn = useServerFn(getMySubscription);
  const pixFn = useServerFn(createSubscriptionPix);
  const checkFn = useServerFn(checkSubscriptionPayment);
  const [months, setMonths] = useState(1);
  const [payment, setPayment] = useState<{ id: string; pix_code: string | null; pix_qr_base64: string | null; ticket_url: string | null; amount: number; planName: string } | null>(null);

  const { data: plansData } = useQuery({ queryKey: ["saas-plans"], queryFn: () => plansFn({}) });
  const { data: sub } = useQuery({ queryKey: ["my-subscription"], queryFn: () => subFn({}) });
  const plans = plansData?.plans ?? [];

  const createPix = useMutation({
    mutationFn: (plan: SaasPlan) => pixFn({ data: { planId: plan.id, months } }).then((res) => ({ res, plan })),
    onSuccess: ({ res, plan }) => {
      if (!res.ok) return toast.error(res.error);
      setPayment({
        id: res.payment.id,
        pix_code: res.payment.pix_code,
        pix_qr_base64: res.payment.pix_qr_base64,
        ticket_url: res.payment.ticket_url,
        amount: res.amount,
        planName: plan.name,
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao gerar o Pix."),
  });

  useEffect(() => {
    if (!payment) return;
    const timer = setInterval(async () => {
      try {
        const res = await checkFn({ data: { paymentId: payment.id } });
        if (res.ok && res.status === "approved") {
          toast.success("Pagamento confirmado! Sua assinatura está ativa.");
          setPayment(null);
          queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
        } else if (res.ok && res.status === "cancelled") {
          toast.error("O Pix foi cancelado ou expirou. Gere um novo.");
          setPayment(null);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(timer);
  }, [payment, checkFn, queryClient]);

  const state = sub?.state ?? "trialing";
  const stateInfo = stateLabels[state] ?? stateLabels.trialing;
  const limit = sub?.plan?.max_clients;
  const usage = limit ? Math.min(100, Math.round(((sub?.clientsCount ?? 0) / limit) * 100)) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300" data-testid="subscription-page">
      <div className="border-b border-border/50 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Assinatura do Sigma Control</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu plano, acompanhe o vencimento e renove com Pix em segundos.</p>
      </div>

      <Card className="surface-card rounded-lg border-border/70">
        <CardContent className="grid gap-5 p-5 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("rounded-md text-xs font-semibold", stateInfo.tone)} data-testid="subscription-state">{stateInfo.label}</Badge>
              {sub?.plan && <span className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Crown className="size-4 text-primary" /> Plano {sub.plan.name}</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              {state === "trialing" && `Seu teste grátis termina em ${sub?.daysLeft ?? 0} dia(s) (${sub?.trialEndsAt ? formatDate(sub.trialEndsAt) : "—"}). Assine para não perder o acesso.`}
              {state === "active" && `Renovação em ${sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "—"} (${sub?.daysLeft ?? 0} dia(s) restantes).`}
              {state === "grace" && "Sua assinatura venceu. Você ainda pode consultar os dados, mas novos cadastros estão pausados. Renove para reativar tudo."}
              {state === "blocked" && "Sua assinatura está vencida há mais de 3 dias e o acesso foi bloqueado. Renove para voltar a usar o painel."}
            </p>
            {!sub?.saasPaymentsEnabled && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300" data-testid="saas-payments-disabled">
                Os pagamentos da assinatura ainda não foram habilitados pelo administrador do sistema (Access Token do Mercado Pago em Administração).
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Users className="size-3.5" /> Uso do plano</p>
            <p className="mt-2 text-2xl font-bold text-foreground" data-testid="subscription-usage">
              {sub?.clientsCount ?? 0}
              <span className="text-sm font-semibold text-muted-foreground"> / {limit ?? "∞"} clientes</span>
            </p>
            {limit ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", usage >= 90 ? "bg-rose-500" : "bg-primary")} style={{ width: `${usage}%` }} /></div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Sem limite de clientes.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {payment ? (
        <Card className="surface-card rounded-lg border-primary/30" data-testid="subscription-pix-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><QrCode className="size-4 text-primary" /> Pague o Pix para ativar o plano {payment.planName}</CardTitle>
            <CardDescription>Valor: <strong className="text-foreground">{formatBRL(payment.amount)}</strong>. A confirmação é automática em até 1 minuto após o pagamento.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-[220px_1fr]">
            {payment.pix_qr_base64 ? (
              <img src={`data:image/png;base64,${payment.pix_qr_base64}`} alt="QR Code Pix" className="mx-auto size-[220px] rounded-lg border border-border bg-white p-2" />
            ) : (
              <div className="grid size-[220px] place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">QR Code indisponível</div>
            )}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pix copia e cola</p>
              <textarea readOnly value={payment.pix_code ?? ""} className="h-28 w-full resize-none rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] text-foreground" data-testid="subscription-pix-code" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => { navigator.clipboard.writeText(payment.pix_code ?? ""); toast.success("Código Pix copiado!"); }} className="gap-2" data-testid="copy-pix-button"><Copy className="size-4" /> Copiar código</Button>
                {payment.ticket_url && <Button asChild variant="outline"><a href={payment.ticket_url} target="_blank" rel="noreferrer">Abrir no Mercado Pago</a></Button>}
                <Button type="button" variant="ghost" onClick={() => setPayment(null)}>Escolher outro plano</Button>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Aguardando confirmação do pagamento…</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-foreground">Escolha seu plano</h2>
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1" data-testid="period-selector">
              {PERIODS.map((p) => (
                <button key={p.months} type="button" onClick={() => setMonths(p.months)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold transition-colors", months === p.months ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} data-testid={`period-${p.months}`}>
                  {p.label}{p.note && <span className="ml-1 text-[10px] text-emerald-500">{p.note}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const current = sub?.plan?.id === plan.id && state === "active";
              return (
                <Card key={plan.id} className={cn("surface-card relative rounded-lg border-border/70", plan.highlighted && "border-primary/40 shadow-lg shadow-primary/10")} data-testid={`plan-card-${plan.id}`}>
                  {plan.highlighted && <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground"><Sparkles className="size-3" /> Mais escolhido</span>}
                  <CardHeader>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <p className="pt-2 text-3xl font-bold text-foreground">{formatBRL(priceFor(plan, months))}<span className="text-xs font-semibold text-muted-foreground"> / {months === 1 ? "mês" : `${months} meses`}</span></p>
                    {months > 1 && <p className="text-xs text-muted-foreground">Equivale a {formatBRL(priceFor(plan, months) / months)} por mês</p>}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2 text-sm">
                      {plan.features.map((f) => <li key={f} className="flex items-start gap-2 text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /> {f}</li>)}
                    </ul>
                    <Button className="w-full gap-2" variant={plan.highlighted ? "default" : "outline"} disabled={createPix.isPending || !sub?.saasPaymentsEnabled} onClick={() => createPix.mutate(plan)} data-testid={`subscribe-${plan.id}`}>
                      {createPix.isPending && createPix.variables?.id === plan.id ? <Loader2 className="size-4 animate-spin" /> : current ? <BadgeCheck className="size-4" /> : <QrCode className="size-4" />}
                      {current ? "Renovar este plano" : "Assinar com Pix"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Pagamento processado pelo Mercado Pago. Ao assinar você concorda com os <Link to="/termos" className="underline">Termos de Uso</Link>.</p>
    </div>
  );
}

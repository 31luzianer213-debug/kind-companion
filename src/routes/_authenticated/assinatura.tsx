import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Check, Copy, Crown, Loader2, Lock, QrCode, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function formatDoc(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

function isValidDoc(d: string) {
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const calc = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  if (d.length === 14) {
    const calc = (n: number) => {
      const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = w.reduce((acc, x, i) => acc + x * Number(d[i]), 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  checkMySubscriptionPayments,
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

const PERIODS = [{ months: 1, label: "Mensal", note: "" }];

function priceFor(plan: SaasPlan, months: number) {
  const discount = months >= 12 ? 0.8 : months >= 6 ? 0.9 : 1;
  return Number((plan.price_monthly * months * discount).toFixed(2));
}

const stateLabels: Record<string, { label: string; tone: string }> = {
  active: { label: "Assinatura ativa", tone: "border-success/30 bg-success/10 text-success" },
  trialing: { label: "Período de teste", tone: "border-primary/30 bg-primary/10 text-primary" },
  grace: { label: "Vencida — somente leitura", tone: "border-warning/30 bg-warning/10 text-warning" },
  blocked: { label: "Bloqueada", tone: "border-destructive/30 bg-destructive/10 text-destructive" },
  admin: { label: "Acesso de administrador", tone: "border-primary/30 bg-primary/10 text-primary" },
};

function AssinaturaPage() {
  const queryClient = useQueryClient();
  const plansFn = useServerFn(listSaasPlans);
  const subFn = useServerFn(getMySubscription);
  const pixFn = useServerFn(createSubscriptionPix);
  const checkFn = useServerFn(checkSubscriptionPayment);
  const healFn = useServerFn(checkMySubscriptionPayments);
  const [months, setMonths] = useState(1);
  const [cpf, setCpf] = useState("");
  const [payerName, setPayerName] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState<SaasPlan | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [slowConfirmation, setSlowConfirmation] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [payment, setPayment] = useState<{ id: string; pix_code: string | null; pix_qr_base64: string | null; ticket_url: string | null; amount: number; planName: string } | null>(null);

  const { data: plansData } = useQuery({ queryKey: ["saas-plans"], queryFn: () => plansFn({}) });
  const { data: sub } = useQuery({ queryKey: ["my-subscription-v2"], queryFn: () => subFn({}) });
  const plans = plansData?.plans ?? [];
  const needsDoc = sub?.saasProvider === "misticpay";

  useEffect(() => {
    try {
      // CPF/CNPJ não fica mais guardado no aparelho; apaga cópias antigas.
      localStorage.removeItem("assinatura-doc");
      const savedName = localStorage.getItem("assinatura-nome");
      if (savedName) setPayerName(savedName);
    } catch {}
  }, []);

  const createPix = useMutation({
    mutationFn: async (plan: SaasPlan) => {
      const digits = cpf.replace(/\D/g, "");
      try {
        localStorage.setItem("assinatura-nome", payerName.trim());
      } catch {}
      const res = await pixFn({ data: { planId: plan.id, months, document: digits, payerName: payerName.trim() } });
      return { res, plan };
    },
    onSuccess: ({ res, plan }) => {
      if (!res.ok) return setFormError(res.error);
      setCheckoutPlan(null);
      setPayment({
        id: res.payment.id,
        pix_code: res.payment.pix_code,
        pix_qr_base64: res.payment.pix_qr_base64,
        ticket_url: res.payment.ticket_url,
        amount: res.amount,
        planName: plan.name,
      });
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Falha ao gerar o Pix."),
  });

  useEffect(() => {
    if (!payment) return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const res = await checkFn({ data: { paymentId: payment.id } });
        if (res.ok && res.status === "approved") {
          toast.success("Pagamento confirmado! Sua assinatura está ativa.");
          setPayment(null);
          setSlowConfirmation(false);
          queryClient.invalidateQueries({ queryKey: ["my-subscription-v2"] });
        } else if (res.ok && res.status === "cancelled") {
          toast.error("O Pix foi cancelado ou expirou. Gere um novo.");
          setPayment(null);
        }
      } catch {}
      // Depois de 2 minutos sem confirmação, usa a checagem ampla: reconfere
      // todos os Pix pendentes da conta (caso o aviso da operadora tenha se perdido).
      if (attempts === 24) {
        setSlowConfirmation(true);
        try {
          const healed = await healFn({ data: {} });
          if (healed.approved) {
            toast.success("Pagamento confirmado! Sua assinatura está ativa.");
            setPayment(null);
            setSlowConfirmation(false);
            queryClient.invalidateQueries({ queryKey: ["my-subscription-v2"] });
          }
        } catch {}
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [payment, checkFn, healFn, queryClient]);

  // Ao abrir a tela com assinatura pendente/vencida, reconfere os Pix recentes:
  // cobre o caso de o cliente ter fechado a página antes da confirmação chegar.
  useEffect(() => {
    if (!sub || sub.isAdmin) return;
    if (sub.state === "active") return;
    let cancelled = false;
    (async () => {
      try {
        const healed = await healFn({ data: {} });
        if (!cancelled && healed.approved) {
          toast.success("Encontramos um pagamento aprovado: sua assinatura foi liberada.");
          queryClient.invalidateQueries({ queryKey: ["my-subscription-v2"] });
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [sub?.state, sub?.isAdmin, healFn, queryClient]);

  const state = sub?.isAdmin ? "admin" : sub?.state ?? "trialing";
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
        <CardContent className="grid gap-5 p-5 !pt-5 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("rounded-md text-xs font-semibold", stateInfo.tone)} data-testid="subscription-state">{stateInfo.label}</Badge>
              {sub?.plan && <span className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Crown className="size-4 text-primary" /> {sub.plan.name}</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              {state === "trialing" && `Seu teste grátis termina em ${sub?.daysLeft ?? 0} dia(s) (${sub?.trialEndsAt ? formatDate(sub.trialEndsAt) : "—"}). Assine para não perder o acesso.`}
              {state === "active" && `Renovação em ${sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "—"} (${sub?.daysLeft ?? 0} dia(s) restantes).`}
              {state === "grace" && "Sua assinatura venceu. Você ainda pode consultar os dados, mas novos cadastros estão pausados. Renove para reativar tudo."}
              {state === "blocked" && "Sua assinatura está vencida há mais de 3 dias e o acesso foi bloqueado. Renove para voltar a usar o painel."}
              {sub?.isAdmin && "Você é o administrador do sistema: seu acesso é vitalício e nunca é bloqueado por assinatura. Os planos abaixo são os que você vende para os revendedores."}
            </p>
            {!sub?.saasPaymentsEnabled && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning" data-testid="saas-payments-disabled">
                {sub?.isAdmin
                  ? "Você ainda não configurou a conta que recebe os pagamentos das assinaturas (Administração › Pagamentos). Sem isso, seus revendedores não conseguem assinar."
                  : "Os pagamentos da assinatura ainda não foram habilitados pelo administrador do sistema (conta de recebimento em Administração)."}
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
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", usage >= 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${usage}%` }} /></div>
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
              {slowConfirmation && (
                <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning" data-testid="subscription-slow-confirmation">
                  <p className="font-semibold">A confirmação está demorando mais que o normal.</p>
                  <p>Se você já pagou, toque no botão abaixo: o sistema confere direto na operadora e libera seu acesso na hora.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={verifying}
                    onClick={async () => {
                      setVerifying(true);
                      try {
                        const healed = await healFn({ data: {} });
                        if (healed.approved) {
                          toast.success("Pagamento confirmado! Sua assinatura está ativa.");
                          setPayment(null);
                          setSlowConfirmation(false);
                          queryClient.invalidateQueries({ queryKey: ["my-subscription-v2"] });
                        } else {
                          const again = await checkFn({ data: { paymentId: payment.id } });
                          if (again.ok && again.status === "approved") {
                            toast.success("Pagamento confirmado! Sua assinatura está ativa.");
                            setPayment(null);
                            queryClient.invalidateQueries({ queryKey: ["my-subscription-v2"] });
                          } else {
                            toast.info("A operadora ainda não confirmou este Pix. Aguarde alguns instantes ou fale com o suporte.");
                          }
                        }
                      } catch {
                        toast.error("Não foi possível conferir agora. Tente de novo em instantes.");
                      } finally {
                        setVerifying(false);
                      }
                    }}
                    data-testid="subscription-verify-button"
                  >
                    {verifying ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />} Já paguei, liberar meu acesso
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-foreground">Escolha seu plano</h2>
            {PERIODS.length > 1 && (
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1" data-testid="period-selector">
                {PERIODS.map((p) => (
                  <button key={p.months} type="button" onClick={() => setMonths(p.months)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold transition-colors", months === p.months ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} data-testid={`period-${p.months}`}>
                    {p.label}{p.note && <span className="ml-1 text-[10px] text-success">{p.note}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={cn("grid gap-4 pt-2", plans.length === 1 ? "max-w-md" : plans.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
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
                      {plan.features.map((f) => <li key={f} className="flex items-start gap-2 text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-success" /> {f}</li>)}
                    </ul>
                    <Button className="w-full gap-2" variant={plan.highlighted ? "default" : "outline"} disabled={createPix.isPending || !sub?.saasPaymentsEnabled} onClick={() => { setCheckoutPlan(plan); setFormError(null); }} data-testid={`subscribe-${plan.id}`}>
                      {current ? <BadgeCheck className="size-4" /> : <QrCode className="size-4" />}
                      {current ? "Renovar este plano" : "Assinar com Pix"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Pagamento processado pelo {sub?.saasProvider === "misticpay" ? "MisticPay" : "Mercado Pago"}. Ao assinar você concorda com os <Link to="/termos" className="underline">Termos de Uso</Link>.</p>

      <Dialog open={!!checkoutPlan} onOpenChange={(open) => { if (!open && !createPix.isPending) setCheckoutPlan(null); }}>
        <DialogContent className="sm:max-w-md" data-testid="checkout-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="size-4 text-primary" /> Finalizar assinatura</DialogTitle>
            <DialogDescription>Confira o plano e informe os dados de quem vai pagar o Pix.</DialogDescription>
          </DialogHeader>
          {checkoutPlan && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const digits = cpf.replace(/\D/g, "");
                if (payerName.trim().split(/\s+/).length < 2) return setFormError("Digite o nome completo de quem vai pagar.");
                if (needsDoc && !isValidDoc(digits)) return setFormError("CPF ou CNPJ inválido. Confira os números.");
                setFormError(null);
                createPix.mutate(checkoutPlan);
              }}
            >
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Plano escolhido</p>
                    <p className="mt-1 flex items-center gap-1.5 font-bold text-foreground"><Crown className="size-4 text-primary" /> {checkoutPlan.name}</p>
                    <p className="text-xs text-muted-foreground">{months === 1 ? "Mensal · renova a cada 30 dias" : `${months} meses`}</p>
                  </div>
                  <p className="text-right text-2xl font-bold text-foreground">{formatBRL(priceFor(checkoutPlan, months))}</p>
                </div>
                {plans.length > 1 && (
                  <select value={checkoutPlan.id} onChange={(e) => { const p = plans.find((x) => x.id === e.target.value); if (p) setCheckoutPlan(p); }} className="mt-3 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground" aria-label="Trocar plano" data-testid="checkout-plan">
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatBRL(priceFor(p, months))}</option>)}
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="checkout-name" className="text-sm font-semibold text-foreground">Nome completo</label>
                <input id="checkout-name" value={payerName} onChange={(e) => { setPayerName(e.target.value.slice(0, 80)); setFormError(null); }} autoComplete="name" placeholder="Como está no seu documento" className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground" data-testid="checkout-name" />
              </div>
              {needsDoc && (
                <div className="space-y-1.5">
                  <label htmlFor="checkout-cpf" className="text-sm font-semibold text-foreground">CPF ou CNPJ</label>
                  <input id="checkout-cpf" value={cpf} onChange={(e) => { setCpf(formatDoc(e.target.value)); setFormError(null); }} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground" data-testid="subscription-cpf" />
                  <p className="text-xs text-muted-foreground">Exigido pelo banco para emitir o Pix. Usado só nesta cobrança.</p>
                </div>
              )}
              {formError && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs font-semibold text-destructive" role="alert">{formError}</p>}

              <Button type="submit" className="h-11 w-full gap-2" disabled={createPix.isPending} data-testid="checkout-submit">
                {createPix.isPending ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                {createPix.isPending ? "Gerando Pix…" : `Gerar Pix de ${formatBRL(priceFor(checkoutPlan, months))}`}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5" /> Pagamento seguro · liberação automática após o Pix</p>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

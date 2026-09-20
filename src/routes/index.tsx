import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  CircleDollarSign,
  MessageCircle,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SigmaLogo } from "@/components/SigmaLogo";
import { listSaasPlans, type SaasPlan } from "@/lib/subscription.functions";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

const FALLBACK_PLANS: SaasPlan[] = [
  { id: "ilimitado", name: "Plano Mensal", description: "Acesso completo ao Sigma Control.", price_monthly: 20, max_clients: null, features: ["Clientes ilimitados", "Cobranças e lembretes no WhatsApp", "Painel Sigma integrado", "Pedidos com Pix automático", "Robô de atendimento 24h no WhatsApp", "Suporte via WhatsApp"], highlighted: true, sort_order: 1 },
];

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      const res = await listSaasPlans();
      return { plans: res.plans.length ? res.plans : FALLBACK_PLANS };
    } catch {
      return { plans: FALLBACK_PLANS };
    }
  },
  head: () => ({
    meta: [
      { title: "Sigma Control — Gestão de revenda IPTV com cobrança automática no WhatsApp" },
      { name: "description", content: "Organize clientes, integre seu painel Sigma, receba por Pix e automatize cobranças e atendimento pelo WhatsApp. Teste grátis por 7 dias." },
      { property: "og:title", content: "Sigma Control — Gestão de revenda IPTV em nível profissional" },
      { property: "og:description", content: "Clientes, painel Sigma, pedidos Pix, robô e cobrança no WhatsApp em uma operação organizada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Users, title: "Clientes organizados", text: "Acessos, vencimentos, valores e contatos reunidos em uma visão objetiva, com importação em massa." },
  { icon: MonitorPlay, title: "Painel Sigma integrado", text: "Sincronize clientes, crie acessos, renove e gere testes sem sair do sistema." },
  { icon: MessageCircle, title: "Cobrança no WhatsApp", text: "Lembretes antes do vencimento, cobrança no dia e aviso de atraso, com Pix automático." },
  { icon: Bot, title: "Robô de atendimento 24h", text: "Testes grátis, planos, renovação por Pix e reenvio de acessos respondidos automaticamente." },
  { icon: CircleDollarSign, title: "Pedidos e recebimentos", text: "Pix do Mercado Pago ou Asaas confirmado automaticamente e acesso liberado na hora." },
  { icon: BarChart3, title: "Indicadores do negócio", text: "Ativos, vencendo, inadimplência e receita do mês para decidir com dados reais." },
];

const steps = [
  { title: "Crie sua conta", text: "Cadastro em 1 minuto e 7 dias de teste com todos os recursos liberados." },
  { title: "Conecte Sigma e WhatsApp", text: "Informe seu painel Sigma e escaneie o QR Code do WhatsApp da sua revenda." },
  { title: "Deixe o sistema trabalhar", text: "Clientes sincronizados, cobranças enviadas e pedidos liberados automaticamente." },
];

const testimonials = [
  { name: "Rafael M.", role: "Revenda com 320 clientes", text: "Antes eu perdia horas cobrando um por um. Hoje o Sigma Control avisa, cobra e libera sozinho." },
  { name: "Juliana S.", role: "Revenda com 90 clientes", text: "O robô do WhatsApp responde os testes e os planos enquanto eu trabalho em outra coisa." },
  { name: "Carlos A.", role: "Operação com 3 painéis", text: "Ter todos os painéis Sigma e a cobrança Pix no mesmo lugar mudou minha organização." },
];

const faqs = [
  { q: "Preciso de conhecimento técnico?", a: "Não. A configuração é guiada: você informa o painel Sigma, conecta o WhatsApp e cadastra sua chave Pix ou token do Mercado Pago." },
  { q: "Como funciona o teste grátis?", a: "Ao criar a conta você tem 7 dias com todos os recursos do plano Ilimitado. Ao final, escolha um plano e pague por Pix. Seus dados continuam salvos." },
  { q: "Meus clientes ficam visíveis para outros revendedores?", a: "Nunca. Cada conta enxerga apenas seus próprios clientes, cobranças e configurações, com isolamento aplicado direto no banco de dados." },
  { q: "Quais painéis IPTV são compatíveis?", a: "Atualmente o Sigma Control integra com painéis Sigma (um ou vários). Outros painéis podem ser gerenciados manualmente pelo cadastro de clientes." },
  { q: "Posso cancelar quando quiser?", a: "Sim. Não há fidelidade. Se não renovar, o acesso fica em modo somente leitura por 3 dias e depois é bloqueado até a renovação." },
];

function DashboardPreview() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-lg border border-border bg-card p-3 shadow-2xl shadow-primary/10">
        <div className="rounded-lg bg-muted/55 p-4 sm:p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Visão da operação</p>
              <p className="mt-1 font-display text-sm font-bold text-foreground">Resumo de hoje</p>
            </div>
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-4" /></span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Clientes ativos</p>
              <p className="mt-2 font-display text-2xl font-bold text-foreground">128</p>
              <p className="mt-1 text-[10px] font-bold text-emerald-500">+12 este mês</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Recebido no mês</p>
              <p className="mt-2 font-display text-2xl font-bold text-primary">R$ 3.840</p>
              <p className="mt-1 text-[10px] font-bold text-primary">Pix confirmado</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {[
              { icon: MessageCircle, label: "WhatsApp conectado", detail: "Sessão pronta para envios", tone: "text-emerald-500 bg-emerald-500/10" },
              { icon: CircleDollarSign, label: "Cobrança automática", detail: "12 lembretes programados", tone: "text-primary bg-primary/10" },
            ].map(({ icon: Icon, label, detail, tone }) => (
              <div key={label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-foreground">{label}</p><p className="truncate text-[10px] text-muted-foreground">{detail}</p></div>
                <span className="size-2 rounded-full bg-emerald-500" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden w-48 rounded-lg bg-foreground p-4 text-background shadow-xl sm:block">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-60">Status do sistema</p>
        <p className="mt-2 flex items-center gap-2 text-xs font-bold"><span className="size-2 rounded-full bg-emerald-400" /> Operação online</p>
        <p className="mt-2 text-[10px] leading-relaxed opacity-65">Sigma e WhatsApp prontos para trabalhar.</p>
      </div>
    </div>
  );
}

function Pricing({ plans }: { plans: SaasPlan[] }) {
  return (
    <section id="planos" className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Planos e preços</p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">Um plano simples, tudo incluído</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Comece com 7 dias grátis. Depois, pague por Pix. Sem fidelidade, cancele quando quiser.</p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-3" data-testid="landing-pricing">
          {plans.map((plan) => (
            <article key={plan.id} className={cn("relative flex flex-col rounded-lg border bg-background p-6", plan.highlighted ? "border-primary/50 shadow-xl shadow-primary/10" : "border-border")} data-testid={`landing-plan-${plan.id}`}>
              {plan.highlighted && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Mais escolhido</span>}
              <h3 className="font-display text-lg font-bold text-foreground">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-5 font-display text-4xl font-extrabold text-foreground">{formatBRL(plan.price_monthly)}<span className="text-sm font-semibold text-muted-foreground"> /mês</span></p>
              <p className="text-xs text-muted-foreground">{plan.max_clients ? `até ${plan.max_clients} clientes` : "clientes ilimitados"} · desconto no semestral e anual</p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />{f}</li>)}
              </ul>
              <Button asChild size="lg" variant={plan.highlighted ? "default" : "outline"} className="mt-8 h-12"><Link to="/auth">Testar grátis por 7 dias</Link></Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Index() {
  const { plans } = Route.useLoaderData();
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Sigma Control">
            <SigmaLogo size="sm" />
            <div><p className="font-display text-sm font-bold text-foreground sm:text-base">Sigma Control</p><p className="hidden text-[9px] font-bold uppercase tracking-[0.12em] text-primary sm:block">Gestão de revenda IPTV</p></div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#recursos" className="hover:text-foreground">Recursos</a>
            <a href="#como-funciona" className="hover:text-foreground">Como funciona</a>
            <a href="#planos" className="hover:text-foreground">Planos</a>
            <a href="#faq" className="hover:text-foreground">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm"><Link to="/auth" data-testid="landing-login">Entrar</Link></Button>
            <Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/auth" data-testid="landing-signup">Teste grátis <ArrowRight /></Link></Button>
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto grid min-h-[640px] max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_.98fr] lg:gap-20 lg:py-24">
          <div className="space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
              7 DIAS GRÁTIS · SEM CARTÃO
            </div>
            <div className="space-y-5">
              <h1 className="max-w-2xl font-display text-4xl font-extrabold leading-[1.08] text-foreground sm:text-5xl lg:text-6xl">
                Sua revenda <span className="text-primary">IPTV</span> cobrando e atendendo sozinha
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Organize clientes, integre o painel Sigma, receba por Pix e deixe o WhatsApp cobrar, renovar e liberar acessos automaticamente.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-7"><Link to="/auth">Começar teste grátis <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7"><a href="#planos">Ver planos</a></Button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-6">
              {["Apenas R$ 20/mês", "Configuração guiada", "Dados isolados por revenda"].map((item) => <span key={item} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><span className="grid size-5 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-3" /></span>{item}</span>)}
            </div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section id="recursos" className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Uma central completa</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">Tudo no lugar certo para sua operação crescer</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Menos tarefas repetitivas, mais controle sobre clientes, acessos e recebimentos.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="group bg-background p-6 transition-colors hover:bg-accent/35">
                  <span className="mb-5 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
                  <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Como funciona</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">Do cadastro à primeira cobrança automática em minutos</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-border bg-card p-6">
                <span className="grid size-9 place-items-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">{index + 1}</span>
                <h3 className="mt-4 font-display text-base font-bold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Pricing plans={plans} />

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Quem usa recomenda</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {testimonials.map((t) => (
              <blockquote key={t.name} className="rounded-lg border border-border bg-card p-6">
                <p className="text-sm leading-relaxed text-foreground">“{t.text}”</p>
                <footer className="mt-4 text-xs text-muted-foreground"><strong className="text-foreground">{t.name}</strong> · {t.role}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Perguntas frequentes</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-foreground">Dúvidas comuns</h2>
          <div className="mt-8 divide-y divide-border rounded-lg border border-border bg-background">
            {faqs.map((item) => (
              <details key={item.q} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold text-foreground marker:content-none">{item.q}</summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-8 rounded-lg border border-primary/20 bg-primary p-7 text-primary-foreground shadow-xl shadow-primary/15 sm:p-10 lg:grid-cols-[1fr_auto]">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">Pronto para começar?</p><h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Profissionalize sua revenda hoje. Os primeiros 7 dias são por nossa conta.</h2><p className="mt-3 max-w-2xl text-sm opacity-75">Crie sua conta e tenha clientes, Sigma, WhatsApp e cobranças em uma única rotina.</p></div>
          <Button asChild size="lg" variant="secondary" className="h-12 px-7"><Link to="/auth"><Zap /> Criar conta</Link></Button>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><span className="text-xs font-semibold text-foreground">Sigma Control</span></div>
          <nav className="flex gap-4 text-xs text-muted-foreground">
            <Link to="/termos" className="hover:text-foreground">Termos de Uso</Link>
            <Link to="/privacidade" className="hover:text-foreground">Política de Privacidade</Link>
          </nav>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Sigma Control. Feito para revendas IPTV profissionais.</p>
        </div>
      </footer>
    </main>
  );
}

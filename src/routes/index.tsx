import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CalendarClock,
  Check,
  CircleDollarSign,
  MessageCircle,
  MonitorPlay,
  QrCode,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SigmaLogo } from "@/components/SigmaLogo";
import { listSaasPlans, type SaasPlan } from "@/lib/subscription.functions";
import { formatBRL } from "@/lib/format";

const FALLBACK_PLANS: SaasPlan[] = [
  {
    id: "ilimitado",
    name: "Plano Mensal",
    description: "Acesso completo ao Sigma Control.",
    price_monthly: 20,
    max_clients: null,
    features: [
      "Clientes ilimitados",
      "Cobranças e lembretes no WhatsApp",
      "Painel Sigma integrado",
      "Pedidos com Pix automático",
      "Robô de atendimento 24h",
      "Suporte via WhatsApp",
    ],
    highlighted: true,
    sort_order: 1,
  },
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
      { title: "Sigma Control — Revenda IPTV organizada e cobrança automática no WhatsApp" },
      {
        name: "description",
        content:
          "Cadastre clientes, conecte seu painel Sigma, receba por Pix e deixe o WhatsApp cobrar e atender sozinho. Teste grátis por 7 dias.",
      },
      { property: "og:title", content: "Sigma Control — Sua revenda IPTV no piloto automático" },
      {
        property: "og:description",
        content: "Clientes, painel Sigma, pedidos por Pix, robô e cobrança no WhatsApp em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const pillars = [
  {
    icon: Users,
    title: "Clientes sob controle",
    text: "Vencimento, valor, telas e acessos de cada pessoa em uma lista limpa, com importação em massa.",
  },
  {
    icon: MonitorPlay,
    title: "Painel Sigma ligado",
    text: "Criar, renovar, mover de servidor e gerar teste sem abrir outra aba.",
  },
  {
    icon: MessageCircle,
    title: "Cobrança que sai sozinha",
    text: "Aviso antes, cobrança no dia e lembrete de atraso, cada um com o Pix pronto.",
  },
  {
    icon: Bot,
    title: "Atendimento 24 horas",
    text: "O robô responde no WhatsApp, oferece teste, vende plano e reenvia acesso.",
  },
  {
    icon: CircleDollarSign,
    title: "Pix confirmado na hora",
    text: "Pagou, o sistema reconhece, renova o acesso e avisa o cliente.",
  },
  {
    icon: BadgeCheck,
    title: "Nada se perde",
    text: "Pedidos, mensagens e renovações ficam registrados para você conferir depois.",
  },
];

const steps = [
  { icon: ShieldCheck, title: "Crie sua conta", text: "Um minuto e 7 dias de teste com tudo liberado." },
  { icon: QrCode, title: "Conecte o WhatsApp", text: "Leia o QR Code uma vez e o número fica pronto para cobrar e atender." },
  { icon: MonitorPlay, title: "Ligue o painel Sigma", text: "Importe seus clientes e passe a renovar por aqui." },
  { icon: Repeat2, title: "Deixe rodando", text: "As cobranças saem no horário e os pagamentos renovam sozinhos." },
];

const chat = [
  { from: "cliente", text: "Oi, quero renovar meu plano" },
  { from: "robo", text: "Boa tarde, João! Seu acesso vence hoje. Renovação mensal: R$ 35,00." },
  { from: "robo", text: "Pix copia e cola gerado ✅ Assim que o pagamento cair eu renovo na hora." },
  { from: "cliente", text: "Paguei!" },
  { from: "robo", text: "Pagamento confirmado 🎉 Acesso renovado até 20/10. Bom filme!" },
];

const faq = [
  {
    q: "Preciso deixar o computador ligado?",
    a: "Não. O sistema funciona na nuvem, envia as cobranças e responde no WhatsApp mesmo com seu celular e computador desligados.",
  },
  {
    q: "Funciona com qualquer painel Sigma?",
    a: "Sim. Você informa o endereço e o acesso do seu painel e o sistema passa a criar, renovar e mover clientes por você.",
  },
  {
    q: "Como recebo os pagamentos?",
    a: "Pelo seu próprio Pix. Dá para usar chave Pix simples ou conectar Mercado Pago e Asaas para confirmação automática.",
  },
  {
    q: "Meu número pode ser bloqueado?",
    a: "As mensagens saem no ritmo de uma conversa normal, com textos personalizados, reduzindo bastante esse risco.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim, sem fidelidade. Você começa com 7 dias grátis e só continua se fizer sentido para a sua revenda.",
  },
];

function LandingPage() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("is-visible"), io.unobserve(e.target))),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const { plans } = Route.useLoaderData();
  const plan = plans[0] ?? FALLBACK_PLANS[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <SigmaLogo size="sm" />
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">Sigma Control</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex" aria-label="Seções da página">
            <a href="#recursos" className="transition-colors hover:text-foreground">Recursos</a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">Como funciona</a>
            <a href="#preco" className="transition-colors hover:text-foreground">Preço</a>
            <a href="#duvidas" className="transition-colors hover:text-foreground">Dúvidas</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="font-semibold">
              <Link to="/auth">Testar grátis</Link>
            </Button>
          </div>
        </div>
        {/* No celular os atalhos das seções não sumiam: viram uma faixa rolável. */}
        <nav className="flex items-center gap-5 overflow-x-auto border-t border-border/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Seções da página">
          <a href="#recursos" className="shrink-0 transition-colors hover:text-foreground">Recursos</a>
          <a href="#como-funciona" className="shrink-0 transition-colors hover:text-foreground">Como funciona</a>
          <a href="#preco" className="shrink-0 transition-colors hover:text-foreground">Preço</a>
          <a href="#duvidas" className="shrink-0 transition-colors hover:text-foreground">Dúvidas</a>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="hero-grid pointer-events-none absolute inset-0"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 size-[560px] rounded-full bg-[radial-gradient(closest-side,var(--ring),transparent)] opacity-25 blur-3xl"
          />
          <div aria-hidden className="pointer-events-none absolute -left-40 top-40 size-[420px] rounded-full bg-[radial-gradient(closest-side,var(--primary),transparent)] opacity-10 blur-3xl" />

          <div className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-14 sm:px-6 sm:pt-16 lg:pb-20 lg:pt-20">
            <div className="grid gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-10">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  7 dias grátis, sem cartão
                </span>

                <h1 className="mt-6 font-display text-[2.5rem] font-bold leading-[1.03] tracking-tight sm:text-6xl lg:text-[4.2rem]">
                  Sua revenda IPTV cobrando <span className="hero-mark">no automático</span>
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Clientes organizados, painel Sigma conectado, Pix confirmado sozinho e um robô que atende seu WhatsApp o dia inteiro.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button asChild size="lg" className="h-12 gap-2 px-6 text-base">
                    <Link to="/auth">
                      Começar agora <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12 px-6">
                    <a href="#como-funciona">Ver como funciona</a>
                  </Button>
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  Cancela quando quiser · Sem fidelidade · Suporte no WhatsApp
                </p>

                <dl className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card/60">
                  {[
                    { k: "24h", v: "atendimento no zap" },
                    { k: "1 min", v: "para começar" },
                    { k: "0", v: "planilhas" },
                  ].map((s) => (
                    <div key={s.k} className="px-4 py-3.5 first:pl-5">
                      <dt className="font-display text-2xl font-bold leading-none text-foreground">{s.k}</dt>
                      <dd className="mt-1.5 text-xs leading-snug text-muted-foreground">{s.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Conversa demonstrativa */}
              <div className="rise-in rounded-2xl border border-border bg-card p-4 shadow-[0_30px_70px_-50px_color-mix(in_oklch,var(--ring)_75%,transparent)] sm:p-6">
                <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <Bot className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">Atendimento Sigma Control</p>
                    <p className="text-xs text-primary">online agora</p>
                  </div>
                  <span className="hidden shrink-0 rounded-full bg-success/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success sm:inline-flex">
                    automático
                  </span>
                </div>
                <div className="space-y-2.5">
                  {chat.map((m, i) => (
                    <div key={i} className={m.from === "robo" ? "flex justify-start" : "flex justify-end"}>
                      <p
                        className={
                          m.from === "robo"
                            ? "max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm text-foreground"
                            : "max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                        }
                      >
                        {m.text}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-4 shrink-0 text-primary" />
                  Renovação aplicada no painel Sigma automaticamente
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Recursos */}
        <section data-reveal id="recursos" className="border-t border-border bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Tudo que a revenda precisa, em um lugar só
              </h2>
              <p className="mt-3 text-muted-foreground">
                Sem planilha, sem lembrete no papel, sem esquecer de cobrar ninguém.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pillars.map((f) => (
                <article key={f.title} className="group rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_24px_50px_-38px_color-mix(in_oklch,var(--ring)_75%,transparent)]">
                  <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <f.icon className="size-5" />
                  </div>
                  <h3 className="font-display text-base font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section data-reveal id="como-funciona" className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Do zero ao automático</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">Quatro passos e sua operação passa a rodar sem você.</p>
            <ol className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="relative flex flex-col rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <s.icon className="size-[18px]" />
                    </span>
                    <span className="font-display text-2xl font-bold text-muted-foreground/30">0{i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Preço */}
        <section data-reveal id="preco" className="border-t border-border bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Um preço, tudo liberado</h2>
              <p className="mt-3 text-muted-foreground">Sem limite de clientes e sem fidelidade. Você começa com 7 dias grátis.</p>
            </div>

            <div className="mx-auto mt-10 grid max-w-4xl gap-6 rounded-2xl border border-primary/30 bg-card p-6 shadow-[0_30px_70px_-52px_color-mix(in_oklch,var(--ring)_80%,transparent)] lg:grid-cols-[0.9fr_1.1fr] lg:p-8">
              <div className="flex flex-col justify-center rounded-xl border border-border bg-muted/25 p-5 lg:p-6">
                <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                  <Sparkles className="size-3.5" /> {plan.name}
                </p>
                <p className="mt-4 flex items-end gap-1.5">
                  <span className="font-display text-5xl font-bold leading-none tracking-tight text-foreground">{formatBRL(plan.price_monthly)}</span>
                  <span className="pb-1 text-sm text-muted-foreground">/mês</span>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                <Button asChild size="lg" className="mt-6 h-12 w-full gap-2">
                  <Link to="/auth">
                    Testar grátis por 7 dias <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">Sem cartão de crédito para começar</p>
              </div>

              <ul className="grid content-center gap-3 sm:grid-cols-2">
                {(plan.features ?? []).map((f) => (
                  <li key={f} className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-background/40 p-3 text-sm">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                      <Check className="size-3.5" />
                    </span>
                    <span className="leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Dúvidas */}
        <section data-reveal id="duvidas" className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Perguntas frequentes</h2>
            <Accordion type="single" collapsible className="mt-8">
              {faq.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="text-left text-base">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Chamada final */}
        <section className="border-t border-border bg-primary/5 py-16 sm:py-20">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 px-4 text-center sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Comece hoje e cobre no automático já na próxima semana
            </h2>
            <p className="max-w-xl text-muted-foreground">
              Sete dias grátis, sem cartão. Se não gostar, é só parar de usar.
            </p>
            <Button asChild size="lg" className="h-12 gap-2 px-6 text-base">
              <Link to="/auth">
                Criar minha conta <ArrowRight className="size-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">Já tem conta? <Link to="/auth" className="font-semibold text-primary hover:underline">Entrar no painel</Link></p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <SigmaLogo size="sm" showGlow={false} />
            <span>Sigma Control © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/termos" className="transition-colors hover:text-foreground">Termos</Link>
            <Link to="/privacidade" className="transition-colors hover:text-foreground">Privacidade</Link>
            <Link to="/auth" className="transition-colors hover:text-foreground">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

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
  const { plans } = Route.useLoaderData();
  const plan = plans[0] ?? FALLBACK_PLANS[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <SigmaLogo size="sm" />
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">Sigma Control</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#recursos" className="transition-colors hover:text-foreground">Recursos</a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">Como funciona</a>
            <a href="#preco" className="transition-colors hover:text-foreground">Preço</a>
            <a href="#duvidas" className="transition-colors hover:text-foreground">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Testar grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="hero-grid pointer-events-none absolute inset-0"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 size-[520px] rounded-full bg-[radial-gradient(closest-side,var(--ring),transparent)] opacity-25 blur-3xl"
          />
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                7 dias grátis, sem cartão
              </span>
              <h1 className="font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                Sua revenda IPTV cobrando <span className="hero-mark">no automático</span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Clientes organizados, painel Sigma conectado, Pix confirmado sozinho e um robô que atende seu WhatsApp o dia inteiro.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/auth">
                    Começar agora <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#como-funciona">Ver como funciona</a>
                </Button>
              </div>
              <dl className="grid max-w-md grid-cols-3 gap-4 pt-2">
                {[
                  { k: "24h", v: "atendimento no zap" },
                  { k: "1 min", v: "para começar" },
                  { k: "0", v: "planilhas" },
                ].map((s) => (
                  <div key={s.k}>
                    <dt className="font-display text-2xl font-semibold text-foreground">{s.k}</dt>
                    <dd className="text-xs text-muted-foreground">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Conversa demonstrativa */}
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm shadow-primary/5 sm:p-6">
              <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Atendimento Sigma Control</p>
                  <p className="text-xs text-primary">online agora</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {chat.map((m, i) => (
                  <div key={i} className={m.from === "robo" ? "flex justify-start" : "flex justify-end"}>
                    <p
                      className={
                        m.from === "robo"
                          ? "max-w-[85%] rounded-lg rounded-tl-sm bg-muted px-3.5 py-2 text-sm text-foreground"
                          : "max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                      }
                    >
                      {m.text}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <CalendarClock className="size-4 text-primary" />
                Renovação aplicada no painel Sigma automaticamente
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
                <article key={f.title} className="rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-lg hover:shadow-primary/5">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
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
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="relative rounded-lg border border-border bg-card p-5">
                  <span className="font-display text-sm font-semibold text-primary">0{i + 1}</span>
                  <s.icon className="mt-3 size-5 text-primary" />
                  <h3 className="mt-3 font-display text-base font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Preço */}
        <section data-reveal id="preco" className="border-t border-border bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Um preço, tudo liberado</h2>
            <p className="mt-3 text-muted-foreground">Sem limite de clientes e sem fidelidade.</p>
            <div className="mt-10 rounded-lg border border-primary/30 bg-card p-6 text-left shadow-sm shadow-primary/10 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold">{plan.name}</p>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <p className="font-display text-4xl font-semibold text-primary">
                  {formatBRL(plan.price_monthly)}
                  <span className="text-base font-normal text-muted-foreground">/mês</span>
                </p>
              </div>
              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {(plan.features ?? []).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-7 w-full gap-2">
                <Link to="/auth">
                  Testar grátis por 7 dias <ArrowRight className="size-4" />
                </Link>
              </Button>
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
        <section className="border-t border-border bg-primary/5 py-16">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 px-4 text-center sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Comece hoje e cobre no automático já na próxima semana
            </h2>
            <p className="max-w-xl text-muted-foreground">
              Sete dias grátis, sem cartão. Se não gostar, é só parar de usar.
            </p>
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth">
                Criar minha conta <ArrowRight className="size-4" />
              </Link>
            </Button>
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

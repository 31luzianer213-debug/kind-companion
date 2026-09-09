import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SigmaLogo } from "@/components/SigmaLogo";
import { Users, MessageCircle, BarChart3, Clock, MonitorPlay, Zap, Shield, TrendingUp, Sparkles, ArrowUpRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel Sigma — Gestão e Cobrança Automática IPTV (100% Grátis)" },
      { name: "description", content: "Gerencie clientes do Servidor Sigma e envie cobranças automáticas pelo WhatsApp em um só painel moderno e 100% gratuito." },
      { property: "og:title", content: "Painel Sigma — Automação de Revenda IPTV (Grátis)" },
      { property: "og:description", content: "Cadastro de clientes, sincronização com Servidor Sigma e lembretes de pagamento no WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Users, title: "Gestão de Clientes", text: "Controle total da sua base: valor, vencimento, status e credenciais de cada linha." },
  { icon: MonitorPlay, title: "Servidor Sigma", text: "Conexão direta por API: crie, sincronize, renove e gere testes rápidos de 4h automaticamente." },
  { icon: MessageCircle, title: "Cobrança no WhatsApp", text: "Faturas Pix e lembretes enviados direto no celular do cliente com proteção Anti-Ban integrada." },
  { icon: BarChart3, title: "Painel Financeiro", text: "Veja valores em aberto, atrasados e recebidos do mês num resumo simples e atualizado." },
];

const benefits = [
  { icon: Zap, label: "Automatização Total", description: "Cobranças enviadas sem intervenção manual" },
  { icon: Shield, label: "Dados Seguros", description: "Criptografia e sincronização contínua" },
  { icon: TrendingUp, label: "100% Gratuito", description: "Sem mensalidade e sem taxas ocultas" },
];

function Index() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/20">
      {/* Top Banner de Gratuito */}
      <div className="border-b border-primary/20 bg-primary/10 px-4 py-2 text-center text-xs font-semibold text-primary">
        🎉 <strong className="text-foreground">Ferramenta 100% Gratuita para Revendedores:</strong> Todas as funcionalidades liberadas sem necessidade de cartão de crédito!
      </div>

      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight transition-opacity hover:opacity-80">
            <SigmaLogo size="sm" />
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold tracking-tight text-foreground">Painel Sigma</span>
              <span className="rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-black tracking-wider">
                GRÁTIS
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground shadow-sm hover-lift">
              <Link to="/auth"><Sparkles className="h-3.5 w-3.5" />Criar Conta Grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <section className="relative isolate py-16 sm:py-24 lg:py-28">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
            <div className="absolute -left-20 top-1/3 h-64 w-64 rounded-full bg-primary/10 blur-[100px]" />
          </div>

          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-500 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Plataforma Gratuita para Revendedores IPTV
              </div>

              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Seu IPTV no
                <span className="block text-primary">piloto automático</span>
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Gerencie assinantes, crie testes de 4h em 1 clique e automatize cobranças Pix no WhatsApp. <strong className="font-semibold text-foreground">Tudo pronto e 100% gratuito.</strong>
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild size="lg" className="h-12 gap-2 rounded-lg px-6 text-sm font-semibold bg-primary text-primary-foreground shadow-md hover-lift">
                  <Link to="/auth"><Sparkles className="h-4 w-4" />Começar Agora — É Grátis<ArrowUpRight className="h-4 w-4 opacity-70" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-lg px-6 text-sm font-semibold border-border">
                  <a href="#features">Conhecer Recursos</a>
                </Button>
              </div>

              <div className="flex flex-wrap gap-6 pt-4">
                {benefits.map(({ icon: Icon, label, description }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mockup do Painel */}
            <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
              <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-3">
                  <div className="flex gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground">Prévia em Tempo Real</span>
                  <div className="w-12" />
                </div>

                <div className="space-y-4 p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clientes Ativos</p>
                      <p className="text-2xl font-bold text-foreground mt-1">128</p>
                      <p className="mt-1 text-[11px] text-emerald-500 font-semibold">+12 este mês</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recebido no Mês</p>
                      <p className="text-2xl font-bold text-foreground font-mono mt-1">R$ 3.840</p>
                      <p className="mt-1 text-[11px] text-emerald-500 font-semibold">Liquidado</p>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Clock className="h-4 w-4 animate-pulse" />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-foreground">Cobrança Automática</p>
                          <p className="text-[11px] text-muted-foreground">Enviando via WhatsApp para 12 clientes...</p>
                        </div>
                      </div>
                      <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        Ativo
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
                          <MessageCircle className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-foreground">Lembrete Entregue</p>
                          <p className="text-[11px] text-muted-foreground">Vencimento Hoje — R$ 35,00</p>
                        </div>
                      </div>
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                        Confirmado
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Recursos Principais */}
        <section id="features" className="py-16 sm:py-20 border-t border-border/50">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />Recursos Principais
            </div>
            <h2 className="mb-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">
              Ferramentas completas para escalar sua operação de IPTV sem complicação e sem custos.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 shadow-sm"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-base font-bold text-foreground">{title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Chamada Final */}
        <section className="my-16 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-8 sm:p-12 text-center shadow-sm">
          <div className="mx-auto max-w-2xl space-y-4">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              Pronto para automatizar sua gestão de IPTV?
            </h2>
            <p className="text-sm text-muted-foreground sm:text-base">
              Comece agora mesmo. Crie sua conta gratuitamente em menos de 1 minuto.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button asChild size="lg" className="h-12 gap-2 rounded-lg px-8 text-sm font-semibold bg-primary text-primary-foreground shadow-md hover-lift">
                <Link to="/auth"><Sparkles className="h-4 w-4" />Criar Conta Gratuita</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-lg px-8 text-sm font-semibold">
                <Link to="/auth">Entrar na Minha Conta</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-border/60 bg-card py-6">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <p className="text-xs text-muted-foreground">© 2026 Painel Sigma. Feito especialmente para revendedores de IPTV.</p>
        </div>
      </footer>
    </main>
  );
}

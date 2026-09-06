import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Users, MessageCircle, BarChart3, Clock, MonitorPlay, Zap, Shield, TrendingUp, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IPTV Manager — Clientes, listas e cobrança no WhatsApp" },
      {
        name: "description",
        content:
          "Gerencie clientes de IPTV, organize suas listas e envie cobranças automáticas pelo WhatsApp em um só painel.",
      },
      { property: "og:title", content: "IPTV Manager — Cobrança automática no WhatsApp" },
      {
        property: "og:description",
        content:
          "Cadastro de clientes, gestão de listas IPTV e lembretes de pagamento enviados sozinhos pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  {
    icon: Users,
    title: "Gestão de clientes",
    text: "Controle total da sua base: valor, vencimento, status e a lista que cada pessoa usa.",
    gradient: "from-blue-500/10 to-cyan-500/10",
    iconColor: "text-blue-500",
  },
  {
    icon: MonitorPlay,
    title: "Controle de listas",
    text: "Importe arquivos M3U, ative, desative e acompanhe a lotação de cada lista.",
    gradient: "from-purple-500/10 to-pink-500/10",
    iconColor: "text-purple-500",
  },
  {
    icon: MessageCircle,
    title: "Cobrança no WhatsApp",
    text: "Faturas e lembretes enviados direto no celular do cliente pela sua conexão Evolution.",
    gradient: "from-green-500/10 to-emerald-500/10",
    iconColor: "text-green-500",
  },
  {
    icon: BarChart3,
    title: "Painel financeiro",
    text: "Veja em aberto, atrasados e recebidos do mês num resumo simples e atualizado.",
    gradient: "from-orange-500/10 to-red-500/10",
    iconColor: "text-orange-500",
  },
];

const benefits = [
  { icon: Zap, label: "Automatização Total", description: "Cobranças enviadas sem intervenção manual" },
  { icon: Shield, label: "Dados Seguros", description: "Criptografia e backup automático" },
  { icon: TrendingUp, label: "Escalável", description: "Cresce junto com seu negócio" },
];

function Index() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 text-foreground overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight transition-opacity hover:opacity-80">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/80 p-2 shadow-lg shadow-primary/25">
              <MonitorPlay className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="hidden sm:inline">IPTV Manager</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5 rounded-xl shadow-md shadow-primary/20">
              <Link to="/auth">
                <Sparkles className="h-3.5 w-3.5" />
                Começar grátis
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Hero Section */}
        <section className="relative py-20 sm:py-28 lg:py-36">
          {/* Background decoration */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute right-0 top-1/3 h-[400px] w-[400px] translate-x-1/3 rounded-full bg-chart-2/5 blur-3xl" />
          </div>

          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left column - Text */}
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                Feito para revendedores de IPTV
              </div>

              <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Seu IPTV no
                <span className="block bg-gradient-to-r from-primary via-primary to-chart-2 bg-clip-text text-transparent">
                  piloto automático
                </span>
              </h1>

              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Gerencie clientes, organize listas e automatize cobranças pelo WhatsApp.
                <strong className="font-semibold text-foreground"> Todo mês, sem você precisar lembrar.</strong>
              </p>

              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-14 gap-2 rounded-xl px-8 text-base font-bold shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:shadow-primary/30 active:scale-95">
                  <Link to="/auth">
                    <Sparkles className="h-4 w-4" />
                    Criar minha conta
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-14 rounded-xl border-2 px-8 text-base font-bold backdrop-blur-sm transition-all hover:bg-muted/50"
                >
                  <a href="#features">Ver recursos</a>
                </Button>
              </div>

              {/* Benefits row */}
              <div className="flex flex-wrap gap-6 pt-4">
                {benefits.map(({ icon: Icon, label, description }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column - Preview card */}
            <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-primary/20 via-chart-2/20 to-primary/20 opacity-20 blur-3xl" />
              <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/80 shadow-2xl backdrop-blur-sm">
                {/* Browser chrome */}
                <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 px-5 py-3.5">
                  <div className="flex gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500/80" />
                    <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                    <span className="h-3 w-3 rounded-full bg-green-500/80" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Prévia do painel</span>
                  <div className="w-16" />
                </div>

                {/* Content */}
                <div className="space-y-5 p-6">
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-5 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">Clientes ativos</p>
                      <p className="text-3xl font-bold text-foreground">128</p>
                      <p className="mt-1 text-xs text-muted-foreground">+12 este mês</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20 p-5">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebido</p>
                      <p className="text-3xl font-bold text-foreground">R$ 3.840</p>
                      <p className="mt-1 text-xs text-muted-foreground">Janeiro/2024</p>
                    </div>
                  </div>

                  {/* Activity items */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 p-4 backdrop-blur-sm">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
                          <Clock className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">Cobrança automática</p>
                          <p className="text-xs text-muted-foreground">Enviando para 12 clientes...</p>
                        </div>
                      </div>
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-primary/20">
                        <div className="h-full w-3/4 animate-pulse rounded-full bg-primary" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 p-4 backdrop-blur-sm">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-500/20 text-green-600 dark:text-green-400">
                          <MessageCircle className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">Lembrete enviado</p>
                          <p className="text-xs text-muted-foreground">Vence amanhã — R$ 30,00</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-600 dark:text-green-400">
                        Entregue
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 sm:py-24">
          <div className="mb-16 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Recursos principais
            </div>
            <h2 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Tudo que você precisa
              <span className="block text-primary">em um só lugar</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Ferramentas completas para escalar sua operação de IPTV sem complicação.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text, gradient, iconColor }, index) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-3xl border border-border bg-card p-8 transition-all duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'backwards' }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                <div className="relative">
                  <div className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} ${iconColor} transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-foreground">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background py-20 text-center sm:py-24">
          <div className="absolute inset-0 -z-10">
            <div className="absolute left-1/4 top-0 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] translate-y-1/2 rounded-full bg-chart-2/20 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-3xl px-4">
            <h2 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Pronto para automatizar
              <span className="block bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
                sua gestão de IPTV?
              </span>
            </h2>
            <p className="mb-10 text-lg text-muted-foreground sm:text-xl">
              Comece agora e veja seus clientes sendo gerenciados sozinhos enquanto você foca em crescer.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="h-14 gap-2 rounded-xl px-8 text-base font-bold shadow-xl shadow-primary/25">
                <Link to="/auth">
                  <Sparkles className="h-4 w-4" />
                  Começar gratuitamente
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 rounded-xl border-2 bg-background/80 px-8 text-base font-bold backdrop-blur-sm"
              >
                <Link to="/auth">Já tenho conta</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-24 border-t border-border/40 bg-muted/30 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <p className="text-sm text-muted-foreground">
            © 2024 IPTV Manager. Feito com dedicação para revendedores de IPTV.
          </p>
        </div>
      </footer>
    </main>
  );
}

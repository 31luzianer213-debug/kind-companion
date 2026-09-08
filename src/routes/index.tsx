import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SigmaLogo } from "@/components/SigmaLogo";
import { Users, MessageCircle, BarChart3, Clock, MonitorPlay, Zap, Shield, TrendingUp, Sparkles, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel Sigma PRO — Gestão e Cobrança Automática IPTV" },
      { name: "description", content: "Gerencie clientes do Servidor Sigma e envie cobranças automáticas pelo WhatsApp em um só painel." },
      { property: "og:title", content: "Painel Sigma PRO — Automação de Revenda IPTV" },
      { property: "og:description", content: "Cadastro de clientes, sincronização com Servidor Sigma e lembretes de pagamento no WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Users, title: "Gestão de clientes", text: "Controle total da sua base: valor, vencimento, status e a linha que cada pessoa usa.", gradient: "from-blue-500/10 to-cyan-500/10", iconColor: "text-blue-500" },
  { icon: MonitorPlay, title: "Servidor Sigma", text: "Conexão direta por API: crie, sincronize e renove linhas automaticamente.", gradient: "from-purple-500/10 to-pink-500/10", iconColor: "text-purple-500" },
  { icon: MessageCircle, title: "Cobrança no WhatsApp", text: "Faturas e lembretes enviados direto no celular do cliente pela sua conexão Evolution.", gradient: "from-green-500/10 to-emerald-500/10", iconColor: "text-green-500" },
  { icon: BarChart3, title: "Painel financeiro", text: "Veja em aberto, atrasados e recebidos do mês num resumo simples e atualizado.", gradient: "from-orange-500/10 to-red-500/10", iconColor: "text-orange-500" },
];

const benefits = [
  { icon: Zap, label: "Automatização Total", description: "Cobranças enviadas sem intervenção manual" },
  { icon: Shield, label: "Dados Seguros", description: "Criptografia e backup automático" },
  { icon: TrendingUp, label: "Escalável", description: "Cresce junto com seu negócio" },
];

function Index() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-b from-background via-background to-muted/20 text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight transition-opacity hover:opacity-80">
            <SigmaLogo size="sm" />
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold tracking-tight">Painel Sigma</span>
              <span className="rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-cyan-400 border border-cyan-500/30">
                PRO
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2"><ThemeToggle /><Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground"><Link to="/auth">Entrar</Link></Button><Button asChild size="sm" className="gap-1.5 rounded-xl shadow-md shadow-primary/20"><Link to="/auth"><Sparkles className="h-3.5 w-3.5" />Começar grátis</Link></Button></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <section className="relative isolate py-20 sm:py-28 lg:py-36">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -left-24 top-1/3 h-72 w-72 animate-pulse rounded-full bg-chart-2/10 blur-3xl [animation-delay:700ms]" />
            <div className="absolute -right-24 bottom-0 h-80 w-80 animate-pulse rounded-full bg-primary/10 blur-3xl [animation-delay:1.4s]" />
            <span className="absolute left-[12%] top-[18%] h-2 w-2 animate-bounce rounded-full bg-primary shadow-lg shadow-primary/70 [animation-delay:300ms]" />
            <span className="absolute right-[18%] top-[14%] h-3 w-3 animate-ping rounded-full bg-chart-2/70" />
            <span className="absolute bottom-[18%] left-[46%] h-2 w-2 animate-bounce rounded-full bg-primary/70 [animation-delay:1s]" />
            <span className="absolute right-[7%] top-[58%] h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          </div>

          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
              <div className="inline-flex animate-in fade-in zoom-in-95 items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary backdrop-blur-sm duration-700">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>
                Feito para revendedores de IPTV
              </div>
              <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Seu IPTV no
                <span className="block animate-pulse bg-gradient-to-r from-primary via-primary to-chart-2 bg-clip-text text-transparent [animation-duration:4s]">piloto automático</span>
              </h1>
              <p className="max-w-xl animate-in fade-in slide-in-from-bottom-3 text-lg leading-relaxed text-muted-foreground delay-300 duration-1000 fill-mode-both sm:text-xl">Gerencie clientes, organize listas e automatize cobranças pelo WhatsApp. <strong className="font-semibold text-foreground">Todo mês, sem você precisar lembrar.</strong></p>
              <div className="flex flex-wrap gap-3 animate-in fade-in slide-in-from-bottom-3 delay-500 duration-1000 fill-mode-both"><Button asChild size="lg" className="h-14 gap-2 rounded-xl px-8 text-base font-bold shadow-xl shadow-primary/25 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/30 active:scale-95"><Link to="/auth"><Sparkles className="h-4 w-4" />Criar minha conta<ArrowUpRight className="h-4 w-4 opacity-70" /></Link></Button><Button asChild size="lg" variant="outline" className="h-14 rounded-xl border-2 px-8 text-base font-bold backdrop-blur-sm transition-all hover:-translate-y-1 hover:bg-muted/50"><a href="#features">Ver recursos</a></Button></div>
              <div className="flex flex-wrap gap-6 pt-4 animate-in fade-in delay-700 duration-1000 fill-mode-both">{benefits.map(({ icon: Icon, label, description }) => <div key={label} className="flex items-start gap-3 transition-transform hover:-translate-y-1"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><div className="min-w-0"><p className="text-sm font-semibold text-foreground">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div></div>)}</div>
            </div>

            <div className="relative animate-in fade-in slide-in-from-bottom-8 zoom-in-95 duration-1000 delay-300 fill-mode-both">
              <div className="absolute -inset-6 animate-pulse rounded-[2rem] bg-gradient-to-r from-primary/30 via-chart-2/20 to-primary/30 opacity-40 blur-3xl [animation-duration:5s]" />
              <div className="absolute -right-4 -top-6 z-10 hidden animate-bounce rounded-2xl border border-green-500/20 bg-card/90 px-4 py-3 shadow-xl backdrop-blur-sm sm:block [animation-duration:4s]"><div className="flex items-center gap-2 text-xs font-semibold text-green-600 dark:text-green-400"><span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />Sistema funcionando</div></div>
              <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/80 shadow-2xl backdrop-blur-sm transition-transform duration-700 hover:rotate-1 hover:scale-[1.02]">
                <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 px-5 py-3.5"><div className="flex gap-2"><span className="h-3 w-3 rounded-full bg-red-500/80" /><span className="h-3 w-3 rounded-full bg-yellow-500/80" /><span className="h-3 w-3 rounded-full bg-green-500/80" /></div><span className="text-xs font-medium text-muted-foreground">Prévia do painel</span><div className="w-16" /></div>
                <div className="space-y-5 p-6"><div className="grid grid-cols-2 gap-4"><div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-5 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10"><p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">Clientes ativos</p><p className="text-3xl font-bold text-foreground">128</p><p className="mt-1 text-xs text-muted-foreground">+12 este mês</p></div><div className="rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20 p-5 transition-transform hover:-translate-y-1"><p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebido</p><p className="text-3xl font-bold text-foreground">R$ 3.840</p><p className="mt-1 text-xs text-muted-foreground">Janeiro/2024</p></div></div><div className="space-y-3"><div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary"><Clock className="h-5 w-5 animate-pulse" /></span><div><p className="text-sm font-semibold">Cobrança automática</p><p className="text-xs text-muted-foreground">Enviando para 12 clientes...</p></div></div><div className="h-2 w-20 overflow-hidden rounded-full bg-primary/20"><div className="h-full w-3/4 animate-pulse rounded-full bg-primary" /></div></div><div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-500/20 text-green-600 dark:text-green-400"><MessageCircle className="h-5 w-5" /></span><div><p className="text-sm font-semibold">Lembrete enviado</p><p className="text-xs text-muted-foreground">Vence amanhã — R$ 30,00</p></div></div><span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-600 dark:text-green-400">Entregue</span></div></div></div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 sm:py-24"><div className="mb-16 text-center"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary"><Sparkles className="h-3.5 w-3.5" />Recursos principais</div><h2 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">Tudo que você precisa<span className="block text-primary">em um só lugar</span></h2><p className="mx-auto max-w-2xl text-lg text-muted-foreground">Ferramentas completas para escalar sua operação de IPTV sem complicação.</p></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{features.map(({ icon: Icon, title, text, gradient, iconColor }, index) => <div key={title} className="group relative overflow-hidden rounded-3xl border border-border bg-card p-8 transition-all duration-300 hover:-translate-y-2 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms`, animationFillMode: "backwards" }}><div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} /><div className="relative"><div className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} ${iconColor} transition-transform duration-300 group-hover:scale-110`}><Icon className="h-7 w-7" /></div><h3 className="mb-3 text-xl font-bold">{title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{text}</p></div></div>)}</div></section>
        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background py-20 text-center sm:py-24"><div className="relative mx-auto max-w-3xl px-4"><h2 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl">Pronto para automatizar<span className="block bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">sua gestão de IPTV?</span></h2><p className="mb-10 text-lg text-muted-foreground sm:text-xl">Comece agora e veja seus clientes sendo gerenciados sozinhos enquanto você foca em crescer.</p><div className="flex flex-wrap justify-center gap-4"><Button asChild size="lg" className="h-14 gap-2 rounded-xl px-8 text-base font-bold shadow-xl shadow-primary/25"><Link to="/auth"><Sparkles className="h-4 w-4" />Começar gratuitamente</Link></Button><Button asChild size="lg" variant="outline" className="h-14 rounded-xl border-2 bg-background/80 px-8 text-base font-bold"><Link to="/auth">Já tenho conta</Link></Button></div></div></section>
      </div>
      <footer className="mt-24 border-t border-border/40 bg-muted/30 py-8"><div className="mx-auto max-w-7xl px-4 text-center sm:px-6"><p className="text-sm text-muted-foreground">© 2024 IPTV Manager. Feito com dedicação para revendedores de IPTV.</p></div></footer>
    </main>
  );
}

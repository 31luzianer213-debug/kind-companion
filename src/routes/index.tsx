import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sigma Control — Gestão IPTV e Cobrança Automática" },
      { name: "description", content: "Gerencie clientes do Servidor Sigma e automatize cobranças pelo WhatsApp em um painel profissional e gratuito." },
      { property: "og:title", content: "Sigma Control — Gestão IPTV em nível profissional" },
      { property: "og:description", content: "Clientes, Servidor Sigma, cobrança Pix e WhatsApp em uma operação organizada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Users, title: "Clientes organizados", text: "Acessos, vencimentos, valores e contatos reunidos em uma visão objetiva." },
  { icon: MonitorPlay, title: "Servidor Sigma", text: "Sincronize clientes, renove acessos e crie testes sem alternar entre painéis." },
  { icon: MessageCircle, title: "WhatsApp integrado", text: "Envie lembretes, cobranças Pix e dados de acesso usando sua própria conexão." },
  { icon: BarChart3, title: "Visão financeira", text: "Acompanhe recebimentos, atrasos e o desempenho da operação com dados reais." },
];

const trustItems = ["Sem mensalidade", "Configuração guiada", "Dados protegidos"];

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
              <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Recebido</p>
              <p className="mt-2 font-display text-2xl font-bold text-primary">R$ 3.840</p>
              <p className="mt-1 text-[10px] font-bold text-primary">Mês atual</p>
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

function Index() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Sigma Control">
            <SigmaLogo size="sm" />
            <div><p className="font-display text-sm font-bold text-foreground sm:text-base">Sigma Control</p><p className="hidden text-[9px] font-bold uppercase tracking-[0.12em] text-primary sm:block">Operação IPTV</p></div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm"><Link to="/auth">Entrar</Link></Button>
            <Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/auth">Criar conta <ArrowRight /></Link></Button>
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_.98fr] lg:gap-20 lg:py-24">
          <div className="space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
              SIGMA CONTROL
            </div>
            <div className="space-y-5">
              <h1 className="max-w-2xl font-display text-4xl font-extrabold leading-[1.08] text-foreground sm:text-5xl lg:text-6xl">
                Gestão <span className="text-primary">IPTV</span> em nível profissional
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Organize clientes, integre seu Servidor Sigma e automatize cobranças pelo WhatsApp em uma operação simples e confiável.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-7"><Link to="/auth">Começar agora <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7"><a href="#recursos">Conhecer recursos</a></Button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-6">
              {trustItems.map((item) => <span key={item} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><span className="grid size-5 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-3" /></span>{item}</span>)}
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

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-8 rounded-lg border border-primary/20 bg-primary p-7 text-primary-foreground shadow-xl shadow-primary/15 sm:p-10 lg:grid-cols-[1fr_auto]">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">Pronto para começar?</p><h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Profissionalize sua gestão sem aumentar seus custos.</h2><p className="mt-3 max-w-2xl text-sm opacity-75">Crie sua conta e tenha clientes, Sigma, WhatsApp e cobranças em uma única rotina.</p></div>
          <Button asChild size="lg" variant="secondary" className="h-12 px-7"><Link to="/auth"><Zap /> Criar conta gratuita</Link></Button>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><span className="text-xs font-semibold text-foreground">Sigma Control</span></div>
          <p className="text-xs text-muted-foreground">© 2026. Feito para operações IPTV profissionais.</p>
        </div>
      </footer>
    </main>
  );
}

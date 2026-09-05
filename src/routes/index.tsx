import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Users, MessageCircle, BarChart3, Clock, MonitorPlay } from "lucide-react";

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
  },
  {
    icon: MonitorPlay,
    title: "Controle de listas",
    text: "Importe arquivos M3U, ative, desative e acompanhe a lotação de cada lista.",
  },
  {
    icon: MessageCircle,
    title: "Cobrança no WhatsApp",
    text: "Faturas e lembretes enviados direto no celular do cliente pela sua conexão Evolution.",
  },
  {
    icon: BarChart3,
    title: "Painel financeiro",
    text: "Veja em aberto, atrasados e recebidos do mês num resumo simples e atualizado.",
  },
];

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <img src={logo} alt="IPTV Manager" width={36} height={36} className="h-9 w-9" />
          IPTV Manager
        </span>
        <Button asChild variant="secondary">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-24 px-6 pb-24 pt-10 lg:gap-32">
        <section className="grid items-center gap-16 lg:grid-cols-2">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Feito para revendedores de IPTV
            </div>

            <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight lg:text-7xl">
              O controle total do seu{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                IPTV
              </span>{" "}
              em um só lugar.
            </h1>

            <p className="max-w-lg text-xl text-muted-foreground">
              Gerencie clientes, organize suas listas e automatize as cobranças pelo
              WhatsApp — todo mês, sem você precisar lembrar.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg" className="h-14 rounded-xl px-8 text-base font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95">
                <Link to="/auth">Criar minha conta</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 rounded-xl px-8 text-base font-bold"
              >
                <Link to="/auth">Já tenho conta</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary to-primary/30 opacity-20 blur-2xl" />
            <div className="relative rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-8 flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="h-3 w-3 rounded-full bg-muted" />
                  <span className="h-3 w-3 rounded-full bg-muted" />
                  <span className="h-3 w-3 rounded-full bg-muted" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  Prévia do painel
                </span>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                    <p className="mb-1 text-xs text-muted-foreground">Clientes ativos</p>
                    <p className="text-2xl font-bold">128</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <p className="mb-1 text-xs text-muted-foreground">Recebido no mês</p>
                    <p className="text-2xl font-bold">R$ 3.840</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                      <Clock className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Cobrança automática</p>
                      <p className="text-xs text-muted-foreground">
                        Enviando para 12 clientes...
                      </p>
                    </div>
                  </div>
                  <div className="h-2 w-16 rounded-full bg-primary/20">
                    <div className="h-2 w-10 rounded-full bg-primary" />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Lembrete enviado</p>
                      <p className="text-xs text-muted-foreground">
                        Vence amanhã — R$ 30,00
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                    Entregue
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="group rounded-3xl border border-border bg-card p-8 transition-all duration-300 hover:border-primary/30"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                <Icon className="h-6 w-6" />
              </div>
              <h2 className="mb-3 text-xl font-bold">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

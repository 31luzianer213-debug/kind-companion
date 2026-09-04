import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tv, Users, MessageCircle, CalendarClock } from "lucide-react";

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
    title: "Clientes organizados",
    text: "Cadastro com WhatsApp, valor, vencimento e a lista que cada pessoa usa.",
  },
  {
    icon: Tv,
    title: "Listas IPTV",
    text: "Importe, ative, desative e acompanhe a lotação de cada lista.",
  },
  {
    icon: MessageCircle,
    title: "Cobrança no WhatsApp",
    text: "Mensagens enviadas pela sua conexão Evolution, com histórico completo.",
  },
  {
    icon: CalendarClock,
    title: "No automático",
    text: "Avisos antes do vencimento, no dia e para quem está atrasado.",
  },
];

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <Tv className="h-5 w-5 text-primary" />
          IPTV Manager
        </span>
        <Button asChild variant="secondary">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Painel de gestão
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
          Suas listas de IPTV e a cobrança dos clientes num lugar só
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Cadastre clientes, organize as listas e deixe o sistema mandar a cobrança pelo
          WhatsApp na hora certa — todo mês, sem você lembrar.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Criar minha conta</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">Já tenho conta</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="border-border/60 bg-card/60">
              <CardContent className="space-y-3 p-6">
                <Icon className="h-6 w-6 text-primary" />
                <h2 className="font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

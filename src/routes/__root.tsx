import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import uiPolishCss from "../ui-polish.css?url";
import responsiveCss from "../responsive.css?url";
import { Toaster } from "@/components/ui/sonner";
import { PwaInstaller } from "@/components/PwaInstaller";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    try {
      reportLovableError(error, { boundary: "tanstack_root_error_component" });
    } catch {
      // Telemetry must never cause a second failure inside the error boundary.
    }
  }, [error]);

  const errorMessage =
    error instanceof Response
      ? `Falha HTTP ${error.status}`
      : error?.message || "Erro inesperado sem detalhes.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O sistema encontrou uma falha temporária. Tente novamente; se continuar, copie o detalhe abaixo.
        </p>
        <details className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-left">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">Ver detalhe técnico</summary>
          <code className="mt-2 block break-words text-xs text-muted-foreground">{errorMessage}</code>
        </details>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Sigma Control — Gestão de revenda IPTV e cobrança no WhatsApp" },
      { name: "description", content: "Painel para revendedores IPTV: clientes, painel Sigma, pedidos com Pix e cobranças automáticas no WhatsApp." },
      { name: "author", content: "Sigma Control" },
      { name: "theme-color", content: "#09090b" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Sigma Control" },
      { property: "og:title", content: "Sigma Control" },
      { property: "og:description", content: "Clientes, painel Sigma, pedidos Pix e cobrança automática no WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Sora:wght@600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: uiPolishCss },
      { rel: "stylesheet", href: responsiveCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" style={{ colorScheme: "light" }}>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased selection:bg-primary/20 selection:text-white">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <PwaInstaller />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { ResellerContextEnhancements } from "@/components/ResellerContextEnhancements";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { hydrateQueryCache } from "@/lib/query-cache-persist";

/**
 * Resolve o usuário logado priorizando a sessão local.
 *
 * Antes esta rota dependia de `getUser()` (chamada HTTP ao Supabase Auth). Se a
 * requisição falhasse (rede instável, preview, token em renovação), o usuário
 * era devolvido ao /auth mesmo tendo sessão válida — e a tela de login, ao ver
 * a sessão, mandava de volta ao /painel. Esse ping-pong é o que parecia
 * "o login não funciona".
 */
async function readSessionUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

async function resolveUser(): Promise<User | null> {
  let user = await readSessionUser();

  // O storage de preview pode responder com atraso na primeira leitura.
  if (!user) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    user = await readSessionUser();
  }

  if (user) {
    // Validação em segundo plano: mantém o token aquecido sem bloquear a navegação.
    void supabase.auth.getUser().catch(() => undefined);
    return user;
  }

  try {
    const { data } = await supabase.auth.refreshSession();
    return data.user ?? data.session?.user ?? null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const user = await resolveUser();
    if (!user) throw redirect({ to: "/auth", replace: true });

    // Restaura os dados persistidos antes das páginas autenticadas montarem.
    hydrateQueryCache(context.queryClient, user.id);

    return { user, email: user.email ?? null };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, email } = Route.useRouteContext();
  return (
    <AppLayout userId={user.id} email={email}>
      <ResellerContextEnhancements />
      <SubscriptionGate>
        <Outlet />
      </SubscriptionGate>
    </AppLayout>
  );
}

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { ResellerContextEnhancements } from "@/components/ResellerContextEnhancements";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { hydrateQueryCache } from "@/lib/query-cache-persist";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    // Preview connections can briefly fail while Lovable restores the brokered
    // session. Never let that transient failure reach the root error boundary.
    let user = null;

    try {
      const result = await supabase.auth.getUser();
      user = result.data.user;
    } catch {
      // A refresh attempt below covers network/token restoration failures.
    }

    if (!user) {
      try {
        const refreshed = await supabase.auth.refreshSession();
        user = refreshed.data.user;
      } catch {
        // The auth page is the safe fallback when the session cannot recover.
      }
    }

    if (!user) throw redirect({ to: "/auth", replace: true });
    // Restaura os dados persistidos antes das páginas autenticadas montarem.
    // Assim Sigma, clientes e cobranças aparecem imediatamente após reabrir o navegador.
    hydrateQueryCache(context.queryClient, user.id);
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppLayout userId={user.id}>
      <ResellerContextEnhancements />
      <SubscriptionGate>
        <Outlet />
      </SubscriptionGate>
    </AppLayout>
  );
}

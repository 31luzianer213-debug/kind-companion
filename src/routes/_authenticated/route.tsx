import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
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
    return { user };
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});

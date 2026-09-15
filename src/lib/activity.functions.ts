import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("activity_logs")
      .select("id,event_type,entity_type,entity_id,title,description,metadata,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.warn("Falha ao carregar atividades:", error.message);
      return { ok: false as const, activities: [], error: "Não foi possível carregar as atividades agora." };
    }

    return {
      ok: true as const,
      activities: Array.isArray(data) ? data : [],
      error: null,
    };
  });

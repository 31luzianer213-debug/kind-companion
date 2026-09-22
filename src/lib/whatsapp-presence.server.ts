import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tenantInstanceName } from "./evolution-tenant.server";

export type ConnectionSnapshot = {
  status: "open" | "connecting" | "close" | "none";
  number?: string | null;
  error?: string | null;
};

/**
 * Guarda no banco o estado real da conexão de cada revendedor.
 * Isso é o que permite identificar o dono da instância quando chega
 * uma mensagem pelo webhook e mostrar o número certo no painel.
 */
export async function persistConnectionState(userId: string, snapshot: ConnectionSnapshot) {
  if (!userId) return;
  const instance = tenantInstanceName(userId);
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    user_id: userId,
    instance_name: instance,
    connection_status: snapshot.status,
    last_connection_error: snapshot.error ?? null,
    updated_at: now,
  };

  if (snapshot.status === "open") {
    payload["connected_number"] = snapshot.number ?? null;
    payload["last_connected_at"] = now;
  }
  if (snapshot.status === "close" || snapshot.status === "none") {
    payload["last_disconnected_at"] = now;
  }

  const { error } = await supabaseAdmin
    .from("whatsapp_settings")
    .upsert(payload as any, { onConflict: "user_id" });

  if (error) console.warn("[WhatsApp] Falha ao salvar estado da conexão:", error.message);
}

/** Descobre o revendedor dono de uma instância `sigma_<id>` mesmo sem registro salvo. */
export async function findUserIdByInstance(instanceName: string): Promise<string | null> {
  const target = String(instanceName || "").trim();
  if (!target) return null;

  const { data: settings } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("user_id, instance_name")
    .eq("instance_name", target)
    .maybeSingle();
  if (settings?.user_id) return settings.user_id;

  const { data: profiles } = await supabaseAdmin.from("profiles").select("id");
  const match = (profiles ?? []).find((row: any) => tenantInstanceName(row.id) === target);
  return match?.id ?? null;
}

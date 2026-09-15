export type ActivityEvent = {
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Best-effort audit logging. Audit failures must never break the main action.
 * The caller must pass the authenticated server-side user id.
 */
export async function recordActivity(
  supabase: any,
  userId: string,
  event: ActivityEvent,
) {
  try {
    const { error } = await supabase.from("activity_logs").insert({
      user_id: userId,
      event_type: event.eventType,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      title: event.title,
      description: event.description ?? null,
      metadata: event.metadata ?? {},
    });
    if (error) console.warn("Falha ao registrar atividade:", error.message);
  } catch (error) {
    console.warn("Falha inesperada ao registrar atividade:", error);
  }
}

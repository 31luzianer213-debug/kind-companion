import { tenantSendText } from "./evolution-tenant.server";
import { recordActivity } from "./activity.server";

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateBr(value: string) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return day && month && year ? `${day}/${month}/${year}` : value;
}

function renderRuleTemplate(template: string, client: any, dueDate: string) {
  return String(template || "")
    .replaceAll("{nome}", String(client?.name || "Cliente"))
    .replaceAll("{cliente}", String(client?.name || "Cliente"))
    .replaceAll("{vencimento}", formatDateBr(dueDate))
    .replaceAll("{valor}", Number(client?.monthly_fee || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
}

async function ensureDefaultRules(supabase: any, userId: string) {
  const defaults = [
    [-3, "Olá {nome}! Sua mensalidade vence em 3 dias, em {vencimento}. Se precisar de ajuda, é só chamar."],
    [0, "Olá {nome}! Sua mensalidade vence hoje ({vencimento}). Se já realizou o pagamento, desconsidere esta mensagem."],
    [1, "Olá {nome}! Identificamos que sua mensalidade venceu ontem ({vencimento}). Posso te ajudar com a renovação?"],
    [5, "Olá {nome}! Sua mensalidade está vencida há 5 dias desde {vencimento}. Fale com a gente para regularizar seu acesso."],
  ] as const;

  const { data } = await supabase.from("billing_rules").select("offset_days").eq("user_id", userId);
  const rows = Array.isArray(data) ? data : [];
  const existing = new Set(rows.map((row: any) => Number(row.offset_days)));
  const missing = defaults.filter(([offset]) => !existing.has(offset));
  if (!missing.length) return;

  const { error } = await supabase.from("billing_rules").insert(
    missing.map(([offset_days, message_template]) => ({
      user_id: userId,
      offset_days,
      enabled: true,
      message_template,
    })),
  );
  if (error) console.warn("Falha ao criar regras padrão de cobrança:", error.message);
}

export async function runAutomaticBillingForUser(supabase: any, userId: string) {
  await ensureDefaultRules(supabase, userId);

  const [{ data: rulesData, error: rulesError }, { data: clientsData, error: clientsError }] = await Promise.all([
    supabase
      .from("billing_rules")
      .select("id,offset_days,enabled,message_template")
      .eq("user_id", userId)
      .eq("enabled", true),
    supabase
      .from("clients")
      .select("id,name,phone,monthly_fee,next_due_date,status")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  if (rulesError) throw new Error(`Falha ao carregar regras de cobrança: ${rulesError.message}`);
  if (clientsError) throw new Error(`Falha ao carregar clientes: ${clientsError.message}`);

  const rules = Array.isArray(rulesData) ? rulesData : [];
  const clients = Array.isArray(clientsData) ? clientsData : [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const client of clients) {
    if (!client?.next_due_date || !String(client.phone || "").replace(/\D/g, "")) {
      skipped++;
      continue;
    }

    const due = new Date(`${String(client.next_due_date).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(due.getTime())) {
      skipped++;
      continue;
    }

    const daysAfterDue = Math.round((today.getTime() - due.getTime()) / 86400000);
    const rule = rules.find((item: any) => Number(item.offset_days) === daysAfterDue);
    if (!rule) continue;

    // Claim this rule+client+due-date before sending. The unique constraint prevents concurrent duplicates.
    const claim = await supabase
      .from("billing_rule_sends")
      .insert({
        user_id: userId,
        rule_id: rule.id,
        client_id: client.id,
        due_date: iso(due),
        status: "processing",
      })
      .select("id")
      .single();

    if (claim.error) {
      if (String(claim.error.code || "") === "23505") {
        skipped++;
        continue;
      }
      failed++;
      if (errors.length < 5) errors.push(claim.error.message);
      continue;
    }

    const body = renderRuleTemplate(rule.message_template, client, iso(due));
    const sendResult = await tenantSendText(userId, client.phone, body);

    if (sendResult.ok) {
      sent++;
      await supabase
        .from("billing_rule_sends")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", claim.data.id)
        .eq("user_id", userId);

      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: client.id,
        phone: client.phone,
        body,
        status: "sent",
      });
    } else {
      failed++;
      const errorMessage = sendResult.error || "Falha ao enviar cobrança automática.";
      if (errors.length < 5) errors.push(errorMessage);

      // Release the unique claim after a failed send so a later run can retry safely.
      await supabase
        .from("billing_rule_sends")
        .delete()
        .eq("id", claim.data.id)
        .eq("user_id", userId);

      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: client.id,
        phone: client.phone,
        body,
        status: "failed",
        error: errorMessage,
      });
    }
  }

  await recordActivity(supabase, userId, {
    eventType: "billing.automatic_run",
    entityType: "billing",
    title: "Cobrança automática processada",
    description: `${sent} enviada(s), ${skipped} ignorada(s) e ${failed} falha(s).`,
    metadata: { sent, skipped, failed },
  });

  return { sent, skipped, failed, errors };
}

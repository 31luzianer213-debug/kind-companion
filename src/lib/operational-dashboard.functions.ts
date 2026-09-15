import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOperationalDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const [{ data: clientsData, error: clientsError }, { data: invoicesData, error: invoicesError }] = await Promise.all([
      supabase.from("clients").select("id,name,status,monthly_fee,next_due_date,created_at,phone").eq("user_id", context.userId),
      supabase.from("invoices").select("id,status,amount,due_date,client_id").eq("user_id", context.userId),
    ]);

    if (clientsError) throw new Error("Não foi possível carregar os clientes do painel.");
    if (invoicesError) console.warn("Falha ao carregar faturas no painel operacional:", invoicesError.message);

    const clients = Array.isArray(clientsData) ? clientsData : [];
    const invoices = Array.isArray(invoicesData) ? invoicesData : [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const next = new Date(now);
    next.setDate(next.getDate() + 7);
    const next7 = next.toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);

    const active = clients.filter((client: any) => client.status === "active");
    const blocked = clients.filter((client: any) => client.status === "blocked" || client.status === "inactive");
    const monthlyRevenue = active.reduce((sum: number, client: any) => sum + Number(client.monthly_fee || 0), 0);
    const overdueInvoices = invoices.filter((invoice: any) => invoice.status === "overdue" || (invoice.status === "pending" && String(invoice.due_date || "") < today));
    const overdueAmount = overdueInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.amount || 0), 0);
    const dueNext7 = active.filter((client: any) => client.next_due_date && String(client.next_due_date) >= today && String(client.next_due_date) <= next7);
    const newThisMonth = clients.filter((client: any) => String(client.created_at || "").slice(0, 7) === monthPrefix);
    const attention = active
      .filter((client: any) => !client.phone || (client.next_due_date && String(client.next_due_date) <= next7))
      .sort((a: any, b: any) => String(a.next_due_date || "9999").localeCompare(String(b.next_due_date || "9999")))
      .slice(0, 8);

    return {
      ok: true as const,
      metrics: {
        activeClients: active.length,
        monthlyRevenue,
        overdueCount: overdueInvoices.length,
        overdueAmount,
        dueNext7: dueNext7.length,
        newThisMonth: newThisMonth.length,
        blockedInactive: blocked.length,
      },
      attention,
      generatedAt: new Date().toISOString(),
    };
  });

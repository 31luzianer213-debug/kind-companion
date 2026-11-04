export type PendingBotOrderCandidate = {
  id: string;
  user_id: string;
  customer_phone: string;
  plan_name: string;
  amount: number;
  duration_months: number;
  status: string;
  type: string;
  target_username?: string | null;
  created_at: string;
};

export type PendingBotOrderQuery = {
  userId: string;
  phone: string;
  planName: string;
  amount: number;
  durationMonths: number;
  type: "new_access" | "renewal";
  targetUsername?: string;
  lookbackMinutes?: number;
};

/**
 * Reutiliza a cobrança pendente equivalente criada recentemente pelo bot.
 * A comparação inclui tenant e telefone para nunca cruzar revendedores.
 */
export function findReusablePendingBotOrder<T extends PendingBotOrderCandidate>(
  orders: T[],
  query: PendingBotOrderQuery,
  now = Date.now(),
): T | null {
  const phone = String(query.phone || "").replace(/\D/g, "");
  if (!phone || !query.planName || !Number.isFinite(query.amount) || query.amount <= 0) return null;

  const lookback = Math.max(1, Math.min(120, Number(query.lookbackMinutes) || 30)) * 60_000;
  const expectedTarget = String(query.targetUsername || "").trim().toLowerCase();

  return orders.find((order) => {
    if (order.status !== "pending" || order.type !== query.type) return false;
    if (String(order.user_id) !== query.userId || String(order.customer_phone || "").replace(/\D/g, "") !== phone) return false;
    if (String(order.plan_name || "") !== query.planName) return false;
    if (Math.abs(Number(order.amount) - query.amount) >= 0.01) return false;
    if (Number(order.duration_months) !== query.durationMonths) return false;

    if (query.type === "renewal") {
      if (String(order.target_username || "").trim().toLowerCase() !== expectedTarget) return false;
    }

    const createdAt = new Date(order.created_at).getTime();
    if (!Number.isFinite(createdAt) || createdAt > now + 60_000 || now - createdAt > lookback) return false;
    return true;
  }) ?? null;
}

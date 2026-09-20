import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OrderItem } from "./orders.server";

export type { OrderItem };

/** Lista os pedidos do revendedor autenticado */
export const getOrdersList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { listOrdersServer } = await import("./orders.server");
    const orders = await listOrdersServer(context.userId, data?.status);
    return { ok: true as const, orders };
  });

/** Aprova um pedido, libera no Sigma e dispara no WhatsApp */
export const approveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const { approveAndReleaseOrderServer } = await import("./orders.server");
    return approveAndReleaseOrderServer(context.userId, data.orderId);
  });

/** Cancela um pedido */
export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const { cancelOrderServer } = await import("./orders.server");
    return cancelOrderServer(context.userId, data.orderId);
  });

/** Cria um novo pedido manualmente pelo painel */
export const createManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      customer_name: string;
      customer_phone: string;
      plan_name: string;
      amount: number;
      duration_months?: number;
      screens?: number;
      type?: "new_access" | "renewal";
      target_username?: string;
      notes?: string;
    }) => {
      const phone = String(input.customer_phone ?? "").replace(/\D/g, "");
      if (phone.length < 10) throw new Error("Informe um telefone válido com DDD.");
      if (!String(input.plan_name ?? "").trim()) throw new Error("Informe o nome do plano.");
      if (!(Number(input.amount) > 0)) throw new Error("Informe um valor maior que zero.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { createOrderServer } = await import("./orders.server");
    const order = await createOrderServer(context.userId, data);
    return { ok: true as const, order };
  });

/** Exclui permanentemente um pedido */
export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const { deleteOrderServer } = await import("./orders.server");
    return deleteOrderServer(context.userId, data.orderId);
  });

/** Exclui múltiplos pedidos de uma vez */
export const bulkDeleteOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { bulkDeleteOrdersServer } = await import("./orders.server");
    return bulkDeleteOrdersServer(context.userId, data.orderIds);
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listOrdersServer,
  approveAndReleaseOrderServer,
  cancelOrderServer,
  type OrderItem,
} from "./orders.server";

export type { OrderItem };

/** Lista todos os pedidos do revendedor */
export const getOrdersList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const orders = await listOrdersServer(userId, data?.status);
    return { ok: true as const, orders };
  });

/** Aprova um pedido, libera no Sigma e dispara no WhatsApp */
export const approveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const result = await approveAndReleaseOrderServer(userId, data.orderId);
    return result;
  });

/** Cancela um pedido */
export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const result = await cancelOrderServer(userId, data.orderId);
    return result;
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
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { createOrderServer } = await import("./orders.server");
    const order = await createOrderServer(userId, data);
    return { ok: true as const, order };
  });


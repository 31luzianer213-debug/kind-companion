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
  .inputValidator((input: { status?: string }) => input)
  .handler(async ({ data }) => {
    let userId = "default";
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      const authHeader = request?.headers?.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claimsData } = await supabaseAdmin.auth.getClaims(token);
        if (claimsData?.claims?.sub) {
          userId = claimsData.claims.sub;
        }
      }
    } catch {}

    const orders = await listOrdersServer(userId, data?.status);
    console.log(`[getOrdersList] Retornando ${orders.length} pedidos (status: ${data?.status || "todos"})`);
    return { ok: true as const, orders };
  });

/** Aprova um pedido, libera no Sigma e dispara no WhatsApp */
export const approveOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    let userId = "default";
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      const authHeader = request?.headers?.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claimsData } = await supabaseAdmin.auth.getClaims(token);
        if (claimsData?.claims?.sub) {
          userId = claimsData.claims.sub;
        }
      }
    } catch {}

    const result = await approveAndReleaseOrderServer(userId, data.orderId);
    return result;
  });

/** Cancela um pedido */
export const cancelOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    let userId = "default";
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      const authHeader = request?.headers?.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claimsData } = await supabaseAdmin.auth.getClaims(token);
        if (claimsData?.claims?.sub) {
          userId = claimsData.claims.sub;
        }
      }
    } catch {}

    const result = await cancelOrderServer(userId, data.orderId);
    return result;
  });

/** Cria um novo pedido manualmente pelo painel */
export const createManualOrder = createServerFn({ method: "POST" })
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
  .handler(async ({ data }) => {
    let userId = "default";
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      const authHeader = request?.headers?.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claimsData } = await supabaseAdmin.auth.getClaims(token);
        if (claimsData?.claims?.sub) {
          userId = claimsData.claims.sub;
        }
      }
    } catch {}

    const { createOrderServer } = await import("./orders.server");
    const order = await createOrderServer(userId, data);
    return { ok: true as const, order };
  });


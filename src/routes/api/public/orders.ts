import { createFileRoute } from "@tanstack/react-router";
import { readLocalOrders } from "@/lib/orders.server";

export const Route = createFileRoute("/api/public/orders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const status = url.searchParams.get("status");
          let orders = readLocalOrders();
          if (status && status !== "all") {
            orders = orders.filter((o) => o.status === status);
          }
          return Response.json({ ok: true, orders }, { status: 200 });
        } catch (err: any) {
          return Response.json({ ok: false, orders: [], error: err?.message }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const orderId = url.searchParams.get("id");
          if (!orderId) {
            return Response.json({ ok: false, message: "ID do pedido não informado" }, { status: 400 });
          }
          const { deleteOrderServer } = await import("@/lib/orders.server");
          const result = await deleteOrderServer("default", orderId);
          return Response.json(result, { status: 200 });
        } catch (err: any) {
          return Response.json({ ok: false, message: err?.message }, { status: 500 });
        }
      },
    },
  },
});

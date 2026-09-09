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
    },
  },
});

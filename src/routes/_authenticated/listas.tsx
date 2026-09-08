import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/listas")({
  beforeLoad: () => {
    throw redirect({ to: "/clientes" });
  },
  component: () => null,
});

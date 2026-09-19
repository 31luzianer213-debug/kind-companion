import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { navigationGroups, type AppRoute } from "@/components/layout/navigation";

const extraPages: { to: AppRoute; label: string }[] = [
  { to: "/indicadores", label: "Indicadores" },
  { to: "/atividades", label: "Histórico de atividades" },
  { to: "/clientes-operacao", label: "Ações em massa" },
  { to: "/cobranca-automatica", label: "Regras automáticas" },
  { to: "/sigma-sincronizacao", label: "Sincronização Sigma" },
  { to: "/whatsapp-diagnostico", label: "Diagnóstico WhatsApp" },
  { to: "/mensagens", label: "Mensagens enviadas" },
  { to: "/pagamentos", label: "Pagamentos" },
];

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function GlobalSearch({ enableShortcut = true }: { enableShortcut?: boolean } = {}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  useEffect(() => {
    if (!enableShortcut) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enableShortcut]);

  const pages = useMemo(
    () => [
      ...navigationGroups.flatMap((group) => group.items.map((item) => ({ to: item.to, label: item.label }))),
      ...extraPages,
    ],
    [],
  );

  const clientsQuery = useQuery({
    queryKey: ["global-search-clients", term],
    enabled: open && term.trim().length >= 2,
    staleTime: 15_000,
    queryFn: async () => {
      const raw = term.trim();
      const digits = onlyDigits(raw);
      const filters = [`name.ilike.%${raw}%`, `iptv_username.ilike.%${raw}%`];
      if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
      const { data } = await supabase
        .from("clients")
        .select("id, name, phone, status, next_due_date")
        .or(filters.join(","))
        .limit(8);
      return Array.isArray(data) ? data : [];
    },
  });

  const clients = Array.isArray(clientsQuery.data) ? clientsQuery.data : [];

  function go(to: AppRoute) {
    setOpen(false);
    setTerm("");
    navigate({ to });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-xs text-muted-foreground"
        aria-label="Buscar no sistema"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Buscar</span>
        <span className="hidden rounded border border-border px-1 text-[10px] font-semibold md:inline">Ctrl K</span>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar cliente, telefone ou página..." value={term} onValueChange={setTerm} />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {clients.length > 0 ? (
            <CommandGroup heading="Clientes">
              {clients.map((client) => (
                <CommandItem key={client.id} value={`cliente-${client.id}-${client.name}`} onSelect={() => go("/clientes")}>
                  <span className="font-semibold">{client.name || "Cliente"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {client.phone || "sem telefone"}
                    {client.next_due_date ? ` · vence ${String(client.next_due_date).split("-").reverse().join("/")}` : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Páginas">
            {pages.map((page) => (
              <CommandItem key={page.to} value={page.label} onSelect={() => go(page.to)}>
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

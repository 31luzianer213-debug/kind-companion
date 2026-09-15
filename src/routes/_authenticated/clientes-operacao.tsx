import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, CheckCircle2, Filter, MessageCircle, RefreshCw, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { bulkSendClientReminders, bulkSetClientBlock, listOperationalClients } from "@/lib/client-operations.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes-operacao")({
  head: () => ({ meta: [{ title: "Operação de clientes — Sigma Control" }] }),
  component: ClientOperationsPage,
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function ClientOperationsPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(listOperationalClients);
  const blockMany = useServerFn(bulkSetClientBlock);
  const remindMany = useServerFn(bulkSendClientReminders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serverFilter, setServerFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ["operational-clients"],
    queryFn: () => load({}),
    retry: 1,
  });

  const clients = Array.isArray(query.data?.clients) ? query.data!.clients : [];
  const servers = Array.isArray(query.data?.servers) ? query.data!.servers : [];
  const today = todayIso();
  const next7 = addDaysIso(7);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter((client: any) => {
      const matchesTerm = !term || [client.name, client.phone, client.email, client.iptv_username]
        .some((value) => String(value || "").toLowerCase().includes(term));
      if (!matchesTerm) return false;
      if (serverFilter !== "all" && String(client.panel_id || "none") !== serverFilter) return false;

      if (statusFilter === "all") return true;
      if (statusFilter === "active") return client.status === "active";
      if (statusFilter === "blocked") return client.status === "blocked" || client.status === "inactive";
      if (statusFilter === "overdue") return client.status === "active" && client.next_due_date && String(client.next_due_date) < today;
      if (statusFilter === "today") return String(client.next_due_date || "") === today;
      if (statusFilter === "next7") return client.status === "active" && client.next_due_date && String(client.next_due_date) > today && String(client.next_due_date) <= next7;
      if (statusFilter === "no-phone") return !String(client.phone || "").replace(/\D/g, "");
      if (statusFilter === "no-sigma") return !client.sigma_customer_id;
      return true;
    });
  }, [clients, search, serverFilter, statusFilter, today, next7]);

  const visibleIds = filtered.map((client: any) => String(client.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const bulkBlock = useMutation({
    mutationFn: (blocked: boolean) => blockMany({ data: { clientIds: Array.from(selected), blocked } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`${result.updated} cliente(s) atualizado(s).`);
      else toast.error(result.error || "Falha na ação em massa.");
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["operational-clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  const bulkRemind = useMutation({
    mutationFn: () => remindMany({ data: { clientIds: Array.from(selected) } }),
    onSuccess: (result) => {
      if (result.sent) toast.success(`${result.sent} cobrança(s) enviada(s).`);
      if (result.failed) toast.error(`${result.failed} envio(s) falharam.`);
      if (result.skipped) toast.info(`${result.skipped} cliente(s) sem telefone foram ignorados.`);
      setSelected(new Set());
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Clientes</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Operação de clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Filtre, selecione e execute ações em massa com segurança.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={query.isFetching ? "animate-spin" : ""} /> Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px_220px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone, email ou usuário IPTV" className="pl-9" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><Filter className="size-4" /><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="all">Todos</SelectItem><SelectItem value="active">Ativos</SelectItem><SelectItem value="overdue">Vencidos</SelectItem><SelectItem value="today">Vencem hoje</SelectItem><SelectItem value="next7">Próximos 7 dias</SelectItem><SelectItem value="blocked">Bloqueados / inativos</SelectItem><SelectItem value="no-phone">Sem WhatsApp</SelectItem><SelectItem value="no-sigma">Sem vínculo Sigma</SelectItem>
          </SelectContent></Select>
          <Select value={serverFilter} onValueChange={setServerFilter}><SelectTrigger><SelectValue placeholder="Servidor" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os servidores</SelectItem><SelectItem value="none">Sem servidor</SelectItem>{servers.map((server: any) => <SelectItem key={server.id} value={server.id}>{server.name}</SelectItem>)}</SelectContent></Select>
        </CardContent>
      </Card>

      {selected.size > 0 ? (
        <div className="sticky top-16 z-20 flex flex-col gap-2 rounded-xl border border-primary/25 bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center">
          <Badge className="w-fit">{selected.size} selecionado(s)</Badge>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button size="sm" variant="outline" onClick={() => bulkRemind.mutate()} disabled={bulkRemind.isPending}><MessageCircle /> Cobrar selecionados</Button>
            <Button size="sm" variant="outline" onClick={() => bulkBlock.mutate(true)} disabled={bulkBlock.isPending}><Ban /> Bloquear</Button>
            <Button size="sm" variant="outline" onClick={() => bulkBlock.mutate(false)} disabled={bulkBlock.isPending}><CheckCircle2 /> Desbloquear</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X /> Limpar</Button>
          </div>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-3">{[0,1,2,3,4].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/60" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center"><Users className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Nenhum cliente encontrado</p><p className="mt-1 text-sm text-muted-foreground">Altere os filtros ou a busca para ver outros clientes.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground"><Checkbox checked={allVisibleSelected} onCheckedChange={(checked) => {
            const next = new Set(selected);
            visibleIds.forEach((id) => checked ? next.add(id) : next.delete(id));
            setSelected(next);
          }} /> Selecionar os {filtered.length} visíveis</div>
          {filtered.map((client: any) => {
            const server = servers.find((item: any) => item.id === client.panel_id);
            return <Card key={client.id}><CardContent className="flex gap-3 p-4">
              <Checkbox className="mt-1" checked={selected.has(client.id)} onCheckedChange={(checked) => { const next = new Set(selected); checked ? next.add(client.id) : next.delete(client.id); setSelected(next); }} />
              <div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="truncate font-semibold">{client.name || "Cliente"}</p><div className="flex flex-wrap gap-1.5"><Badge variant="outline">{client.status || "—"}</Badge>{server ? <Badge variant="outline">{server.name}</Badge> : null}{!client.sigma_customer_id ? <Badge variant="outline">Sem Sigma</Badge> : null}</div></div><p className="mt-1 truncate text-sm text-muted-foreground">{client.phone || "Sem telefone"} · {client.iptv_username || "Sem usuário IPTV"}</p><p className="mt-1 text-xs text-muted-foreground">Vencimento: {client.next_due_date ? new Date(`${client.next_due_date}T12:00:00`).toLocaleDateString("pt-BR") : "não informado"}</p></div>
            </CardContent></Card>;
          })}
        </div>
      )}
    </div>
  );
}

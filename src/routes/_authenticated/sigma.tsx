import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity, CheckCircle2, Crown, Eye, EyeOff, Loader2, Plus, RefreshCw,
  Server, Settings2, Trash2, Users, Wifi, WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteSigmaServer, listSigmaServers, saveSigmaServer, syncAllSigmaServers,
  syncSigmaServer, testSigmaServer, type SigmaServerInput,
} from "@/lib/sigma-servers.functions";

export const Route = createFileRoute("/_authenticated/sigma")({
  head: () => ({
    meta: [
      { title: "Servidores Sigma — Conexões & Sincronização" },
      { name: "description", content: "Gerencie e sincronize vários painéis Sigma na mesma operação." },
    ],
  }),
  component: SigmaServersPage,
});

const emptyForm: SigmaServerInput = {
  name: "",
  panel_url: "",
  streaming_dns: "",
  username: "",
  password: "",
  token: "",
  enabled: true,
  auto_renew: true,
  is_default: false,
};

function SigmaServersPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSigmaServers);
  const saveFn = useServerFn(saveSigmaServer);
  const deleteFn = useServerFn(deleteSigmaServer);
  const cleanupFn = useServerFn(cleanupOrphanSigmaClients);
  const testFn = useServerFn(testSigmaServer);
  const syncOneFn = useServerFn(syncSigmaServer);
  const syncAllFn = useServerFn(syncAllSigmaServers);

  const [form, setForm] = useState<SigmaServerInput>(emptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sigma-servers"],
    queryFn: () => listFn({}),
    staleTime: 30_000,
  });
  const servers = data?.ok ? data.servers : [];
  const activeCount = servers.filter((server) => server.enabled).length;
  const totalClients = servers.reduce((sum, server) => sum + Number((server as any).clients_count ?? 0), 0);

  function openNew() {
    setForm({ ...emptyForm, is_default: servers.length === 0 });
    setShowPassword(false);
    setEditorOpen(true);
  }

  function openEdit(server: any) {
    setForm({
      id: server.id,
      name: server.name,
      panel_url: server.panel_url,
      streaming_dns: server.streaming_dns ?? "",
      username: server.username ?? "",
      password: server.password ?? "",
      token: server.token ?? "",
      enabled: server.enabled,
      auto_renew: server.auto_renew,
      is_default: server.is_default,
    });
    setShowPassword(false);
    setEditorOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await saveFn({ data: form });
      if (!result.ok) return toast.error(result.error);
      toast.success(form.id ? "Servidor atualizado." : "Novo servidor Sigma adicionado.");
      setEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["sigma-servers"] });
      await queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const result = await testFn({ data: form });
      if (!result.ok) return toast.error(result.error);
      setForm((current) => ({
        ...current,
        token: result.token || current.token,
        name: current.name || result.serverName || "Servidor Sigma",
        streaming_dns: current.streaming_dns || result.streamingDns || "",
      }));
      toast.success(`Conexão aprovada: ${result.customersCount} cliente(s) encontrados.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível testar.");
    } finally {
      setTesting(false);
    }
  }

  async function syncOne(serverId: string) {
    setSyncingId(serverId);
    try {
      const result = await syncOneFn({ data: { serverId } });
      if (!result.ok) return toast.error(result.error);
      toast.success(`${result.serverName}: ${result.created} novo(s), ${result.updated} atualizado(s).`);
      queryClient.invalidateQueries();
    } finally {
      setSyncingId(null);
    }
  }

  async function syncAll() {
    setSyncingAll(true);
    try {
      const result = await syncAllFn({});
      if (result.results.length === 0) return toast.info("Nenhum servidor ativo para sincronizar.");
      if (result.ok) toast.success(`Todos os painéis sincronizados: ${result.created} novo(s) e ${result.updated} atualizado(s).`);
      else toast.warning(`Sincronização parcial: ${result.results.filter((item) => item.ok).length} de ${result.results.length} painéis concluídos.`);
      queryClient.invalidateQueries();
    } finally {
      setSyncingAll(false);
    }
  }

  async function remove(server: any) {
    if (!window.confirm(`Remover o servidor "${server.name}"? Todos os clientes, cobranças e históricos vinculados a ele também serão excluídos deste sistema. Esta ação não pode ser desfeita.`)) return;
    await cleanupFn({}).catch(() => null);
    const result = await deleteFn({ data: { serverId: server.id } });
    if (!result.ok) return toast.error(result.error);
    toast.success(result.deletedClients ? `Servidor removido com ${result.deletedClients} cliente(s) vinculado(s).` : "Servidor removido.");
    queryClient.invalidateQueries({ queryKey: ["sigma-servers"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <Server className="size-6 text-primary" /> Meus painéis Sigma
            </h1>
            <Badge variant={activeCount ? "success" : "secondary"}>{activeCount} ativo(s)</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Conecte quantos painéis precisar. Cada cliente permanece vinculado ao servidor correto para sincronização, renovação e bloqueio.
          </p>
        </div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row">
          <Button variant="outline" onClick={syncAll} disabled={syncingAll || activeCount === 0} className="gap-2">
            <RefreshCw className={`size-4 ${syncingAll ? "animate-spin" : ""}`} />
            Sincronizar todos
          </Button>
          <Button onClick={openNew} className="gap-2"><Plus className="size-4" /> Adicionar Sigma</Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center justify-between p-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Painéis cadastrados</p><p className="mt-1 text-2xl font-black">{servers.length}</p></div>
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Server className="size-5" /></span>
        </CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conexões ativas</p><p className="mt-1 text-2xl font-black">{activeCount}</p></div>
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500"><Wifi className="size-5" /></span>
        </CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clientes vinculados</p><p className="mt-1 text-2xl font-black">{totalClients || "—"}</p></div>
          <span className="grid size-10 place-items-center rounded-xl bg-sky-500/10 text-sky-500"><Users className="size-5" /></span>
        </CardContent></Card>
      </section>

      {isLoading ? (
        <div className="grid min-h-64 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>
      ) : servers.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Server className="size-7" /></span>
          <h2 className="text-lg font-bold">Adicione seu primeiro painel Sigma</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Depois você poderá adicionar Sigma 2, Sigma 3 e quantos servidores sua operação utilizar.</p>
          <Button onClick={openNew} className="mt-5 gap-2"><Plus className="size-4" /> Conectar primeiro painel</Button>
        </CardContent></Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {servers.map((server) => (
            <Card key={server.id} className="overflow-hidden">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${server.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      {server.enabled ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 truncate text-base">
                        {server.name}
                        {server.is_default && <Crown className="size-4 shrink-0 text-amber-500" />}
                      </CardTitle>
                      <CardDescription className="truncate font-mono text-[11px]">{server.panel_url}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={server.last_sync_status === "error" ? "destructive" : server.enabled ? "success" : "secondary"}>
                    {server.last_sync_status === "error" ? "Com erro" : server.enabled ? "Ativo" : "Pausado"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-muted/45 p-3"><p className="text-muted-foreground">Usuário</p><p className="mt-1 truncate font-bold">{server.username || "Token da API"}</p></div>
                  <div className="rounded-xl bg-muted/45 p-3"><p className="text-muted-foreground">Última sincronização</p><p className="mt-1 font-bold">{server.last_sync_at ? new Date(server.last_sync_at).toLocaleString("pt-BR") : "Nunca"}</p></div>
                </div>
                {server.last_sync_error && <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{server.last_sync_error}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => syncOne(server.id)} disabled={!server.enabled || syncingId === server.id} size="sm" className="flex-1 gap-2">
                    <RefreshCw className={`size-3.5 ${syncingId === server.id ? "animate-spin" : ""}`} /> Sincronizar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(server)} className="gap-2"><Settings2 className="size-3.5" /> Editar</Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(server)} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <div className="text-center"><Button asChild variant="ghost" size="sm"><Link to="/clientes">Ver todos os clientes sincronizados →</Link></Button></div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar painel Sigma" : "Adicionar painel Sigma"}</DialogTitle>
            <DialogDescription>Use os mesmos dados utilizados para entrar no painel de revenda.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome para identificar"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Sigma Principal" /></Field>
              <Field label="URL do painel"><Input required type="url" value={form.panel_url} onChange={(e) => setForm({ ...form, panel_url: e.target.value })} placeholder="https://painel.exemplo.com" /></Field>
              <Field label="Usuário"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" /></Field>
              <Field label="Senha">
                <div className="relative"><Input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" className="pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                </div>
              </Field>
              <Field label="DNS de streaming (opcional)"><Input value={form.streaming_dns} onChange={(e) => setForm({ ...form, streaming_dns: e.target.value })} placeholder="http://dns.exemplo.com:8080" /></Field>
              <Field label="Token da API (opcional)"><Input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Toggle label="Servidor ativo" checked={form.enabled ?? true} onChange={(checked) => setForm({ ...form, enabled: checked })} />
              <Toggle label="Renovação automática" checked={form.auto_renew ?? true} onChange={(checked) => setForm({ ...form, auto_renew: checked })} />
              <Toggle label="Servidor padrão" checked={form.is_default ?? false} onChange={(checked) => setForm({ ...form, is_default: checked })} />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={test} disabled={testing || saving} className="gap-2">
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Activity className="size-4" />} Testar conexão
              </Button>
              <Button type="submit" disabled={saving || testing} className="gap-2">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Salvar servidor
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><Label className="text-xs font-semibold">{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>;
}

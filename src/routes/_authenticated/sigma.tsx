import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteSigmaServer,
  listSigmaServers,
  saveSigmaServer,
  syncAllSigmaServers,
  syncSigmaServer,
  testSigmaServer,
  type SigmaServerInput,
} from "@/lib/sigma-servers.functions";

export const Route = createFileRoute("/_authenticated/sigma")({
  head: () => ({
    meta: [
      { title: "Sigma — Sigma Control" },
      { name: "description", content: "Conecte seu Sigma e traga os clientes automaticamente." },
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

type SyncStage = "idle" | "testing" | "saving" | "syncing";

function SigmaServersPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSigmaServers);
  const saveFn = useServerFn(saveSigmaServer);
  const deleteFn = useServerFn(deleteSigmaServer);
  const testFn = useServerFn(testSigmaServer);
  const syncOneFn = useServerFn(syncSigmaServer);
  const syncAllFn = useServerFn(syncAllSigmaServers);

  const [form, setForm] = useState<SigmaServerInput>(emptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncStage, setSyncStage] = useState<SyncStage>("idle");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [removeAction, setRemoveAction] = useState<"keep" | "move" | "delete">("keep");
  const [removeTargetPanel, setRemoveTargetPanel] = useState<string>("");
  const [recreateOnTarget, setRecreateOnTarget] = useState(true);
  const [removing, setRemoving] = useState(false);


  const { data, isLoading } = useQuery({
    queryKey: ["sigma-servers"],
    queryFn: async () => {
      const res = await listFn({});
      return res?.ok && Array.isArray(res.servers) ? res.servers : [];
    },
    staleTime: 30_000,
  });

  const servers = Array.isArray(data) ? data : [];
  const activeCount = servers.filter((server) => server.enabled).length;

  function openNew() {
    setForm({ ...emptyForm, is_default: servers.length === 0 });
    setShowPassword(false);
    setSyncStage("idle");
    setEditorOpen(true);
  }

  function openEdit(server: any) {
    setForm({
      id: server.id,
      name: server.name ?? "",
      panel_url: server.panel_url ?? server.url ?? "",
      streaming_dns: server.streaming_dns ?? "",
      username: server.username ?? "",
      password: server.password ?? "",
      token: server.token ?? "",
      enabled: server.enabled ?? true,
      auto_renew: server.auto_renew ?? true,
      is_default: server.is_default ?? false,
    });
    setShowPassword(false);
    setSyncStage("idle");
    setEditorOpen(true);
  }

  async function refreshAfterSync() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sigma-servers"] }),
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] }),
      queryClient.invalidateQueries({ queryKey: ["operational-dashboard"] }),
    ]);
  }

  async function saveAndSync(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSyncStage("testing");

    try {
      const tested = await testFn({ data: form });
      if (!tested.ok) {
        toast.error(tested.error || "Não foi possível conectar ao Sigma. Confira os dados e tente novamente.", {
          duration: 10000,
        });
        return;
      }

      const preparedForm: SigmaServerInput = {
        ...form,
        token: tested.token || form.token,
        name: form.name.trim() || tested.serverName || "Servidor Sigma",
        streaming_dns: form.streaming_dns?.trim() || tested.streamingDns || "",
      };
      setForm(preparedForm);

      setSyncStage("saving");
      const saved = await saveFn({ data: preparedForm });
      if (!saved.ok || !saved.server?.id) {
        toast.error(saved.error || "A conexão funcionou, mas não foi possível salvar o servidor.");
        return;
      }

      setSyncStage("syncing");
      const synced = await syncOneFn({ data: { serverId: saved.server.id } });
      if (!synced.ok) {
        await queryClient.invalidateQueries({ queryKey: ["sigma-servers"] });
        toast.error(`Servidor salvo, mas a sincronização falhou: ${synced.error || "tente sincronizar novamente."}`, {
          duration: 10000,
        });
        return;
      }

      await refreshAfterSync();
      setEditorOpen(false);
      setForm(emptyForm);
      toast.success(
        `Pronto! Conexão validada e ${synced.created} cliente(s) importado(s), ${synced.updated} atualizado(s).`,
        { duration: 7000 },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao conectar e sincronizar o Sigma.");
    } finally {
      setSaving(false);
      setSyncStage("idle");
    }
  }

  async function syncOne(serverId: string) {
    setSyncingId(serverId);
    try {
      const result = await syncOneFn({ data: { serverId } });
      if (!result.ok) {
        toast.error(result.error || "Falha ao sincronizar.");
        return;
      }
      await refreshAfterSync();
      toast.success(`${result.serverName}: ${result.created} novo(s) e ${result.updated} atualizado(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar.");
    } finally {
      setSyncingId(null);
    }
  }

  async function syncAll() {
    setSyncingAll(true);
    try {
      const result = await syncAllFn({});
      const results = Array.isArray(result.results) ? result.results : [];
      if (results.length === 0) {
        toast.info("Nenhum servidor ativo para sincronizar.");
        return;
      }
      await refreshAfterSync();
      if (result.ok) {
        toast.success(`Sincronização concluída: ${result.created} novo(s) e ${result.updated} atualizado(s).`);
      } else {
        toast.warning(`Alguns servidores não sincronizaram. ${results.filter((item) => item.ok).length} de ${results.length} concluídos.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar os servidores.");
    } finally {
      setSyncingAll(false);
    }
  }

  function remove(server: any) {
    setRemoveTarget(server);
    setRemoveAction("keep");
    setRemoveTargetPanel(servers.find((item) => item.id !== server.id)?.id ?? "");
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    if (removeAction === "move" && !removeTargetPanel) {
      toast.error("Escolha o painel de destino dos clientes.");
      return;
    }
    setRemoving(true);
    try {
      const result = await deleteFn({
        data: {
          serverId: removeTarget.id,
          clientAction: removeAction,
          targetPanelId: removeAction === "move" ? removeTargetPanel : null,
          recreateOnTarget: removeAction === "move" ? recreateOnTarget : false,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await refreshAfterSync();
      setRemoveTarget(null);
      toast.success(
        result.deletedClients
          ? `Servidor e ${result.deletedClients} cliente(s) removidos.`
          : result.movedClients
            ? `Servidor removido. ${result.movedClients} cliente(s) movidos${result.recreatedClients ? ` e ${result.recreatedClients} recriados no painel de destino` : ""}.`
            : result.keptClients
              ? `Servidor removido. ${result.keptClients} cliente(s) mantidos no sistema.`
              : "Servidor removido.",
      );
      if (result.failedCount) {
        toast.warning(`${result.failedCount} cliente(s) não puderam ser criados no painel de destino: ${result.failures.join(" • ")}`);
      }

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover o servidor.");
    } finally {
      setRemoving(false);
    }
  }


  const stageLabel = syncStage === "testing"
    ? "Testando conexão com o Sigma..."
    : syncStage === "saving"
      ? "Conexão aprovada. Salvando servidor..."
      : syncStage === "syncing"
        ? "Sincronizando clientes..."
        : "";

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-in fade-in duration-300">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <Server className="size-6 text-primary" /> Sigma
            </h1>
            <Badge variant={activeCount ? "success" : "secondary"}>{activeCount ? "Conectado" : "Não conectado"}</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Cadastre o servidor uma vez. Ao salvar, os clientes são sincronizados automaticamente e já aparecem no painel.
          </p>
        </div>

        <div className="flex gap-2">
          {activeCount > 1 && (
            <Button variant="outline" onClick={syncAll} disabled={syncingAll} className="gap-2">
              <RefreshCw className={`size-4 ${syncingAll ? "animate-spin" : ""}`} />
              {syncingAll ? "Sincronizando..." : "Sincronizar todos"}
            </Button>
          )}
          <Button onClick={openNew} className="gap-2">
            <Plus className="size-4" /> Adicionar Sigma
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="grid min-h-64 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>
      ) : servers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Server className="size-7" /></span>
            <h2 className="text-lg font-bold">Conecte seu Sigma</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Informe os dados do painel e clique em Salvar e sincronizar. O sistema testa a conexão antes e faz o restante sozinho.
            </p>
            <Button onClick={openNew} className="mt-5 gap-2"><Plus className="size-4" /> Conectar Sigma</Button>
          </CardContent>
        </Card>
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
                      <CardTitle className="truncate text-base">{server.name}</CardTitle>
                      <CardDescription className="truncate font-mono text-[11px]">{server.panel_url}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={server.enabled ? "success" : "secondary"}>{server.enabled ? "Ativo" : "Pausado"}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 p-4">
                <div className="rounded-xl bg-muted/45 p-3 text-xs">
                  <p className="text-muted-foreground">Última sincronização</p>
                  <p className="mt-1 font-bold">{server.last_sync_at ? new Date(server.last_sync_at).toLocaleString("pt-BR") : "Ainda não sincronizado"}</p>
                </div>

                {server.last_sync_error && (
                  <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{server.last_sync_error}</p>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => syncOne(server.id)} disabled={!server.enabled || syncingId === server.id} size="sm" className="flex-1 gap-2">
                    <RefreshCw className={`size-3.5 ${syncingId === server.id ? "animate-spin" : ""}`} />
                    {syncingId === server.id ? "Sincronizando clientes..." : "Sincronizar"}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => openEdit(server)} aria-label="Editar servidor"><Settings2 className="size-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(server)} aria-label="Remover servidor" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Dialog open={editorOpen} onOpenChange={(open) => !saving && setEditorOpen(open)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Sigma" : "Adicionar Sigma"}</DialogTitle>
            <DialogDescription>
              Use os mesmos dados do painel de revenda. Primeiro validamos a conexão; só depois salvamos e importamos os clientes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={saveAndSync} className="space-y-5">
            <div className="relative">
              {saving && (
                <div className="absolute inset-0 z-10 flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-primary/20 bg-background/95 px-6 text-center backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="relative mb-4 grid size-16 place-items-center rounded-full bg-primary/10">
                    <span className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                  <p className="text-sm font-bold text-foreground">{stageLabel}</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">Não feche esta janela. Isso pode levar alguns segundos dependendo da quantidade de clientes no servidor.</p>
                  <div className="mt-4 flex items-center gap-2">
                    {(["testing", "saving", "syncing"] as SyncStage[]).map((stage) => {
                      const order = { testing: 0, saving: 1, syncing: 2, idle: -1 } as Record<SyncStage, number>;
                      const done = order[stage] < order[syncStage];
                      const active = stage === syncStage;
                      return (
                        <span key={stage} className={`grid size-7 place-items-center rounded-full border text-[10px] font-bold transition-all ${done ? "border-emerald-500 bg-emerald-500 text-white" : active ? "border-primary bg-primary text-primary-foreground scale-110" : "border-border bg-muted text-muted-foreground"}`}>
                          {done ? <CheckCircle2 className="size-3.5" /> : order[stage] + 1}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`grid gap-4 sm:grid-cols-2 ${saving ? "pointer-events-none opacity-35" : ""}`}>
                <Field label="Nome do servidor"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Sigma Principal" /></Field>
                <Field label="URL do painel"><Input required type="url" value={form.panel_url} onChange={(e) => setForm({ ...form, panel_url: e.target.value })} placeholder="https://painel.exemplo.com" /></Field>
                <Field label="Usuário"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" /></Field>
                <Field label="Senha">
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" className="pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Token da API (opcional)"><Input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} /></Field>
                <Field label="DNS de streaming (opcional)"><Input value={form.streaming_dns} onChange={(e) => setForm({ ...form, streaming_dns: e.target.value })} placeholder="http://dns.exemplo.com:8080" /></Field>
              </div>
            </div>

            <div className={`grid gap-3 sm:grid-cols-2 ${saving ? "pointer-events-none opacity-35" : ""}`}>
              <Toggle label="Servidor ativo" checked={form.enabled ?? true} onChange={(checked) => setForm({ ...form, enabled: checked })} />
              <Toggle label="Renovação automática" checked={form.auto_renew ?? true} onChange={(checked) => setForm({ ...form, auto_renew: checked })} />
            </div>

            <div className="border-t border-border/60 pt-4">
              <Button type="submit" disabled={saving} className="w-full gap-2 sm:w-auto sm:min-w-52">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {saving ? stageLabel : "Salvar e sincronizar"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">A conexão é validada antes de salvar. Depois disso, os clientes aparecem automaticamente no Painel e em Clientes.</p>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeTarget} onOpenChange={(open) => !removing && !open && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Remover “{removeTarget?.name}”</DialogTitle>
            <DialogDescription>Escolha o que fazer com os clientes que estão neste servidor.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {[
              { value: "keep" as const, title: "Manter os clientes", desc: "Os clientes continuam no sistema, apenas sem servidor vinculado." },
              { value: "move" as const, title: "Mover para outro painel", desc: "Todos os clientes passam a pertencer ao painel escolhido." },
              { value: "delete" as const, title: "Apagar os clientes", desc: "Remove os clientes, cobranças e histórico deste servidor. Não tem volta." },
            ].map((option) => {
              const disabled = option.value === "move" && servers.length < 2;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled || removing}
                  onClick={() => setRemoveAction(option.value)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    removeAction === option.value ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"
                  } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
                >
                  <p className="text-sm font-bold">{option.title}</p>
                  <p className="text-xs text-muted-foreground">{disabled ? "Cadastre outro servidor para usar esta opção." : option.desc}</p>
                </button>
              );
            })}
          </div>

          {removeAction === "move" && servers.length > 1 && (
            <Field label="Painel de destino">
              <select
                value={removeTargetPanel}
                onChange={(e) => setRemoveTargetPanel(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione...</option>
                {servers.filter((item) => item.id !== removeTarget?.id).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </Field>
          )}

          {removeAction === "move" && servers.length > 1 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3">
              <input
                type="checkbox"
                checked={recreateOnTarget}
                onChange={(e) => setRecreateOnTarget(e.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="block text-sm font-bold">Criar os clientes no painel de destino</span>
                <span className="block text-xs text-muted-foreground">
                  Cada cliente é criado do zero no painel escolhido, mantendo o mesmo vencimento (os dias que já tinha), telas e telefone. Sem marcar, eles apenas passam a pertencer ao painel no sistema.
                </span>
              </span>
            </label>
          )}


          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>Cancelar</Button>
            <Button variant={removeAction === "delete" ? "destructive" : "default"} onClick={confirmRemove} disabled={removing} className="gap-2">
              {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {removing ? "Removendo..." : "Remover servidor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
      <Label className="text-xs font-semibold">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
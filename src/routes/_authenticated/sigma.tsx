import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  getSigmaSettings,
  saveSigmaSettings,
  syncSigmaClients,
  testSigmaConnection,
  renewSigmaClient,
  toggleSigmaClientBlock,
} from "@/lib/sigma.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import {
  Server,
  RefreshCw,
  Plug,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Zap,
  KeyRound,
  Eye,
  EyeOff,
  Users,
  Tv,
  CalendarPlus,
  Ban,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/sigma")({
  head: () => ({
    meta: [
      { title: "Painel Sigma — Servidor & Linhas IPTV" },
      { name: "description", content: "Gerencie a conexão do painel IPTV Sigma, teste a API, sincronize clientes e ative a renovação automática." },
    ],
  }),
  component: SigmaPage,
});

function SigmaPage() {
  const queryClient = useQueryClient();
  const getSigma = useServerFn(getSigmaSettings);
  const saveSigma = useServerFn(saveSigmaSettings);
  const testSigma = useServerFn(testSigmaConnection);
  const syncSigma = useServerFn(syncSigmaClients);
  const renewSigma = useServerFn(renewSigmaClient);
  const toggleBlock = useServerFn(toggleSigmaClientBlock);

  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({
    sigma_url: "",
    sigma_server_name: "",
    sigma_username: "",
    sigma_password: "",
    sigma_token: "",
    sigma_enabled: true,
    sigma_auto_renew: true,
  });

  const { data: sigmaData } = useQuery({
    queryKey: ["sigma-settings"],
    queryFn: async () => {
      const res = await getSigma({});
      return res.ok ? res.settings : null;
    },
  });

  // Clientes vinculados ao Sigma
  const { data: clientsData } = useQuery({
    queryKey: ["sigma-clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .not("sigma_customer_id", "is", null)
        .order("next_due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (sigmaData) {
      setForm({
        sigma_url: sigmaData.sigma_url || "",
        sigma_server_name: sigmaData.sigma_server_name || "",
        sigma_username: sigmaData.sigma_username || "",
        sigma_password: sigmaData.sigma_password || "",
        sigma_token: sigmaData.sigma_token || "",
        sigma_enabled: sigmaData.sigma_enabled ?? true,
        sigma_auto_renew: sigmaData.sigma_auto_renew ?? true,
      });
    }
  }, [sigmaData]);

  const isConfigured = Boolean(sigmaData?.isConfigured || (form.sigma_url && (form.sigma_username || form.sigma_token)));
  const serverDisplayName =
    form.sigma_server_name.trim() ||
    sigmaData?.sigma_server_display_name ||
    (form.sigma_url ? form.sigma_url.replace(/^https?:\/\//i, "").split("/")[0] : "Servidor Sigma");

  async function handleTest() {
    if (!form.sigma_url.trim()) {
      toast.warning("Preencha o endereço (URL) do painel Sigma para testar.");
      return;
    }
    if (!form.sigma_username.trim() && !form.sigma_token.trim()) {
      toast.warning("Preencha o usuário e senha ou o token da API para testar.");
      return;
    }

    setTesting(true);
    try {
      const res = await testSigma({
        data: {
          url: form.sigma_url,
          username: form.sigma_username,
          password: form.sigma_password,
          token: form.sigma_token,
        },
      });
      if (res.ok) {
        toast.success("Conexão com o Servidor Sigma realizada com sucesso! ✅");
        queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
      } else {
        toast.error(res.error ?? "Não foi possível conectar ao painel.");
      }
    } catch {
      toast.error("Erro inesperado ao testar conexão.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncSigma({
        data: {
          url: form.sigma_url,
          username: form.sigma_username,
          password: form.sigma_password,
          token: form.sigma_token,
        },
      });
      if (res.ok) {
        toast.success(`Sincronização concluída: ${res.created} novos clientes e ${res.updated} atualizados!`);
        queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
        queryClient.invalidateQueries({ queryKey: ["clients"] });
        queryClient.invalidateQueries({ queryKey: ["sigma-clients-list"] });
      } else {
        toast.error(res.error ?? "Falha ao sincronizar clientes do painel.");
      }
    } catch {
      toast.error("Erro de conexão durante a sincronização.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveSigma({
        data: {
          sigma_url: form.sigma_url,
          sigma_server_name: form.sigma_server_name,
          sigma_username: form.sigma_username,
          sigma_password: form.sigma_password,
          sigma_token: form.sigma_token,
          sigma_enabled: form.sigma_enabled,
          sigma_auto_renew: form.sigma_auto_renew,
        },
      });
      if (res.ok) {
        toast.success("Configurações do Servidor Sigma salvas com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
        queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
      }
    } catch {
      toast.error("Falha ao salvar configurações do Sigma.");
    } finally {
      setSaving(false);
    }
  }

  async function renovarLinha(clientId: string) {
    setActionBusyId(clientId);
    try {
      const res = await renewSigma({ data: { clientId, months: 1 } });
      if (res.ok) {
        toast.success(`Linha renovada no Sigma até ${formatDate(res.nextDueDate!)}!`);
        queryClient.invalidateQueries({ queryKey: ["sigma-clients-list"] });
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      } else {
        toast.error(res.error ?? "Falha ao renovar linha no Sigma.");
      }
    } catch {
      toast.error("Erro ao renovar linha.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function alternarBloqueioLinha(client: any) {
    setActionBusyId(client.id);
    const bloquear = client.status !== "blocked";
    try {
      const res = await toggleBlock({ data: { clientId: client.id, block: bloquear } });
      if (res.ok) {
        toast.success(bloquear ? "Linha bloqueada no Sigma." : "Linha desbloqueada no Sigma.");
        queryClient.invalidateQueries({ queryKey: ["sigma-clients-list"] });
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      } else {
        toast.error(res.error ?? "Falha ao alterar status no Sigma.");
      }
    } catch {
      toast.error("Erro ao alterar status.");
    } finally {
      setActionBusyId(null);
    }
  }

  const sigmaClients = clientsData ?? [];

  return (
    <div className="space-y-6 max-w-6xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Server className="size-6 text-primary" /> Painel Sigma & Servidores
            </h1>
            {isConfigured ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 text-xs">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs">
                Não configurado
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Integração direta com a API do Painel Sigma. Crie linhas, renove clientes e sincronize faturamento em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing}
            className="gap-1.5 shadow-sm"
          >
            {testing ? <Loader2 className="size-4 animate-spin text-primary" /> : <Plug className="size-4 text-primary" />}
            Testar Conexão
          </Button>

          <Button
            size="sm"
            onClick={handleSync}
            disabled={syncing || !isConfigured}
            className="gap-1.5 shadow-md bg-primary text-primary-foreground font-medium"
          >
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Sincronizar Clientes Agora
          </Button>
        </div>
      </div>

      {/* Cards de Status do Servidor */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="surface-card relative overflow-hidden border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-primary to-chart-2" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servidor Ativo</p>
              <p className="text-lg font-bold text-foreground mt-0.5 truncate max-w-[200px]" title={serverDisplayName}>
                {serverDisplayName}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
                {form.sigma_url || "Endereço não informado"}
              </p>
            </div>
            <div className="rounded-xl p-3 bg-primary/10 text-primary">
              <Server className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card relative overflow-hidden border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Linhas no Servidor</p>
              <p className="text-2xl font-bold text-emerald-400 mt-0.5">
                {sigmaClients.length}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Clientes sincronizados com o Sigma
              </p>
            </div>
            <div className="rounded-xl p-3 bg-emerald-500/10 text-emerald-400">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card relative overflow-hidden border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-purple-500 to-indigo-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Automação de Renovação</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`size-2 rounded-full ${form.sigma_auto_renew ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
                <p className="text-sm font-bold text-foreground">
                  {form.sigma_auto_renew ? "Ativada (Piloto Automático)" : "Desativada"}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {sigmaData?.sigma_last_sync_at
                  ? `Último sync: ${new Date(sigmaData.sigma_last_sync_at).toLocaleDateString("pt-BR")} às ${new Date(sigmaData.sigma_last_sync_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : "Nenhuma sincronização ainda"}
              </p>
            </div>
            <div className="rounded-xl p-3 bg-purple-500/10 text-purple-400">
              <Zap className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formulário de Configuração do Painel Sigma */}
      <Card className="surface-card border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Credenciais & Conexão do Painel
          </CardTitle>
          <CardDescription>
            Insira o link de acesso e os dados da sua conta de revenda no Sigma para habilitar a automação completa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Endereço do Painel (URL Completa) *</Label>
                <Input
                  type="text"
                  placeholder="Ex: http://painel.sigmatv.net:8080"
                  value={form.sigma_url}
                  onChange={(e) => setForm({ ...form, sigma_url: e.target.value })}
                  className="rounded-xl font-mono text-sm"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  O mesmo endereço que você digita no navegador para entrar no seu painel de revendedor.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome do Servidor (Apelido)</Label>
                <Input
                  type="text"
                  placeholder="Ex: Servidor Ouro 4K ou Servidor Principal"
                  value={form.sigma_server_name}
                  onChange={(e) => setForm({ ...form, sigma_server_name: e.target.value })}
                  className="rounded-xl text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Nome exibido nas mensagens automáticas de boas-vindas e cobrança do WhatsApp.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Usuário Revendedor (Login) *</Label>
                <Input
                  type="text"
                  placeholder="Seu usuário no painel"
                  value={form.sigma_username}
                  onChange={(e) => setForm({ ...form, sigma_username: e.target.value })}
                  className="rounded-xl text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Senha do Revendedor *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Sua senha no painel"
                    value={form.sigma_password}
                    onChange={(e) => setForm({ ...form, sigma_password: e.target.value })}
                    className="rounded-xl text-sm font-mono pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Token da API (Opcional se usuário e senha preenchidos)</Label>
              <Input
                type="text"
                placeholder="Token de acesso direto (Bearer / API Key) caso seu painel forneça"
                value={form.sigma_token}
                onChange={(e) => setForm({ ...form, sigma_token: e.target.value })}
                className="rounded-xl text-sm font-mono"
              />
            </div>

            {/* Switches de Comportamento */}
            <div className="pt-2 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">Habilitar Painel Sigma</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ativa a sincronização de clientes e geração de acessos pelo Sigma.
                  </p>
                </div>
                <Switch
                  checked={form.sigma_enabled}
                  onCheckedChange={(checked) => setForm({ ...form, sigma_enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">Renovação Automática de Linhas</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ao confirmar o pagamento da fatura (PIX/Cartão), estende 30 dias no Sigma automaticamente.
                  </p>
                </div>
                <Switch
                  checked={form.sigma_auto_renew}
                  onCheckedChange={(checked) => setForm({ ...form, sigma_auto_renew: checked })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing}
                className="gap-1.5"
              >
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                Testar Conexão
              </Button>

              <Button
                type="submit"
                disabled={saving}
                className="gap-1.5 font-semibold bg-primary text-primary-foreground"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Salvar Configurações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Linhas Sincronizadas no Servidor Sigma */}
      <Card className="surface-card border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="size-4 text-emerald-400" /> Linhas no Servidor Sigma
            </CardTitle>
            <CardDescription>
              Clientes cadastrados localmente e sincronizados diretamente no painel Sigma.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            {sigmaClients.length} linhas
          </Badge>
        </CardHeader>
        <CardContent>
          {sigmaClients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center space-y-3">
              <Server className="size-10 text-muted-foreground mx-auto opacity-50" />
              <div>
                <p className="text-sm font-semibold">Nenhuma linha sincronizada ainda</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clique no botão "Sincronizar Clientes Agora" acima para puxar todos os clientes da sua revenda Sigma.
                </p>
              </div>
              <Button size="sm" onClick={handleSync} disabled={syncing || !isConfigured} className="gap-1.5">
                <RefreshCw className="size-3.5" /> Sincronizar Agora
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Usuário Sigma</TableHead>
                    <TableHead>Telas</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações Rápidas no Sigma</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sigmaClients.map((client) => {
                    const isBusy = actionBusyId === client.id;
                    return (
                      <TableRow key={client.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground">
                          {client.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <KeyRound className="size-3 text-primary" />
                            {client.iptv_username || client.sigma_username || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Tv className="size-3" />
                            {client.screens || 1} tela{(client.screens || 1) > 1 ? "s" : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {formatDate(client.next_due_date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              client.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                                : client.status === "blocked"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/30 text-xs"
                                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30 text-xs"
                            }
                          >
                            {client.status === "active" ? "Ativo" : client.status === "blocked" ? "Bloqueado" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => renovarLinha(client.id)}
                              className="h-7 text-xs gap-1 text-emerald-400 hover:text-emerald-300"
                              title="Renovar +30 dias no Sigma"
                            >
                              {isBusy ? <Loader2 className="size-3 animate-spin" /> : <CalendarPlus className="size-3" />}
                              +30 dias
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => alternarBloqueioLinha(client)}
                              className={`h-7 text-xs gap-1 ${client.status === "blocked" ? "text-emerald-400" : "text-amber-400"}`}
                              title={client.status === "blocked" ? "Desbloquear no Sigma" : "Bloquear no Sigma"}
                            >
                              <Ban className="size-3" />
                              {client.status === "blocked" ? "Desbloquear" : "Bloquear"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getSigmaSettings,
  saveSigmaSettings,
  syncSigmaClients,
  testSigmaConnection,
} from "@/lib/sigma.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Server,
  RefreshCw,
  Plug,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Zap,
  Eye,
  EyeOff,
  Users,
  Activity,
  ArrowRight,
  Wifi,
  WifiOff,
  Clock,
  Sparkles,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/sigma")({
  head: () => ({
    meta: [
      { title: "Servidor Sigma — Conexão & Sincronização" },
      { name: "description", content: "Conecte sua conta de revendedor Sigma, teste a API em tempo real e sincronize suas linhas automaticamente." },
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

  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  const isInitialLoadRef = useRef(false);

  const [testResult, setTestResult] = useState<{
    ok: boolean;
    detectedServerName?: string | null;
    detectedDns?: string | null;
    credits?: number | null;
    packagesCount?: number;
    testedAt?: string;
  } | null>(() => {
    try {
      const cached = typeof window !== "undefined" ? sessionStorage.getItem("sigma_last_test_result") : null;
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [form, setForm] = useState({
    sigma_url: "",
    sigma_server_name: "",
    sigma_streaming_dns: "",
    sigma_username: "",
    sigma_password: "",
    sigma_token: "",
    sigma_enabled: true,
    sigma_auto_renew: true,
  });

  const { data: sigmaData, isLoading } = useQuery({
    queryKey: ["sigma-settings"],
    queryFn: async () => {
      const res = await getSigma({});
      return res.ok ? res.settings : null;
    },
  });

  // Quantidade de clientes sincronizados com o Sigma
  const { data: sigmaCount } = useQuery({
    queryKey: ["sigma-lines-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .not("sigma_customer_id", "is", null);
      if (error) return 0;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (sigmaData && !isInitialLoadRef.current) {
      isInitialLoadRef.current = true;
      setForm({
        sigma_url: sigmaData.sigma_url || "",
        sigma_server_name: sigmaData.sigma_server_name || "",
        sigma_streaming_dns: (sigmaData as any).sigma_streaming_dns || "",
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
    testResult?.detectedServerName ||
    sigmaData?.sigma_server_display_name ||
    (form.sigma_url ? form.sigma_url.replace(/^https?:\/\//i, "").split("/")[0] : "Servidor Sigma");

  async function handleTest() {
    if (!form.sigma_url.trim()) {
      toast.warning("Preencha o endereço (URL) do servidor Sigma.");
      return;
    }
    if (!form.sigma_username.trim() && !form.sigma_token.trim()) {
      toast.warning("Preencha o usuário e senha do revendedor para testar.");
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
        const detectedServer = (res as any).detectedServerName;
        const detectedDns = (res as any).detectedDns;
        const credits = (res as any).credits;
        const packagesCount = (res as any).packagesCount;

        const resultObj = {
          ok: true,
          detectedServerName: detectedServer,
          detectedDns: detectedDns,
          credits,
          packagesCount,
          testedAt: new Date().toLocaleTimeString(),
        };

        setTestResult(resultObj);
        try {
          sessionStorage.setItem("sigma_last_test_result", JSON.stringify(resultObj));
        } catch {}

        setForm((prev) => ({
          ...prev,
          ...(detectedServer ? { sigma_server_name: detectedServer } : {}),
          ...(detectedDns ? { sigma_streaming_dns: detectedDns } : {}),
        }));

        const serverInfo = detectedServer ? ` Servidor detectado: "${detectedServer}".` : "";
        const dnsInfo = detectedDns ? ` DNS: ${detectedDns}.` : "";
        toast.success(`Conexão estabelecida com sucesso! ✅${serverInfo}${dnsInfo}`);
        queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
      } else {
        setTestResult(null);
        try {
          sessionStorage.removeItem("sigma_last_test_result");
        } catch {}
        toast.error(res.error ?? "Não foi possível conectar ao servidor Sigma.", { duration: 9000 });
      }
    } catch {
      toast.error("Erro de rede ao testar conexão com o servidor.", { duration: 7000 });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveSigma({ data: form });
      if (res.ok) {
        toast.success("Configurações do Servidor Sigma salvas com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
        queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
      } else {
        toast.error((res as any).error ?? "Falha ao salvar configurações.");
      }
    } catch {
      toast.error("Erro inesperado ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncSigma({ data: {} });
      if (res.ok) {
        const detectedServer = (res as any).detectedServerName;
        const detectedDns = (res as any).detectedDns;
        if (detectedServer || detectedDns) {
          setForm((prev) => {
            const domainPart = prev.sigma_url ? prev.sigma_url.replace(/^https?:\/\//i, "").split("/")[0] || "" : "";
            const isGenericDns =
              !prev.sigma_streaming_dns ||
              prev.sigma_streaming_dns.includes("/sign-in") ||
              prev.sigma_streaming_dns.includes("#/") ||
              (domainPart && prev.sigma_streaming_dns.includes(domainPart));
            const isGenericServer =
              !prev.sigma_server_name ||
              prev.sigma_server_name.startsWith("http") ||
              prev.sigma_server_name.includes(".click") ||
              prev.sigma_server_name.includes(".com");

            return {
              ...prev,
              ...(detectedServer && (isGenericServer || !prev.sigma_server_name) ? { sigma_server_name: detectedServer } : {}),
              ...(detectedDns && (isGenericDns || !prev.sigma_streaming_dns) ? { sigma_streaming_dns: detectedDns } : {}),
            };
          });
        }

        if (res.created > 0) {
          const names = res.createdNames?.slice(0, 3).join(", ") || "";
          toast.success(
            res.created === 1
              ? `🎉 1 nova linha importada do Sigma: ${names}`
              : `🎉 ${res.created} novas linhas importadas do Sigma! (${names})`,
          );
        } else if (res.updated > 0) {
          toast.success(`${res.updated} linha(s) sincronizadas com os dados de dentro do painel.`);
        } else {
          toast.info("Tudo em dia! Dados de clientes e servidor sincronizados.");
        }
        queryClient.invalidateQueries({ queryKey: ["clients"] });
        queryClient.invalidateQueries({ queryKey: ["sigma-lines-count"] });
        queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
      } else {
        toast.error(res.error ?? "Falha ao sincronizar com o servidor.");
      }
    } catch {
      toast.error("Erro ao sincronizar com o servidor.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Server className="size-6 text-primary" /> Conexão do Servidor Sigma
            </h1>
            <Badge
              variant={isConfigured ? "success" : "secondary"}
              className="text-xs"
            >
              {isConfigured ? "Conectado ao Servidor" : "Não Configurado"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Conecte sua conta de revendedor Sigma. Todas as linhas de clientes são gerenciadas diretamente na tela de Clientes & Linhas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Link to="/clientes">
              <Users className="size-4 text-primary" />
              Ver Todas as Linhas
              <ArrowRight className="size-3 text-muted-foreground ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Cards de Status e Resumo */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Card 1: Status de Conexão */}
        <Card className="surface-card border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider">Status da API</p>
              <p className="text-base font-bold text-foreground flex items-center gap-1.5">
                {isConfigured ? (
                  <>
                    <Wifi className="size-4 text-emerald-500" />
                    Online & Ativo
                  </>
                ) : (
                  <>
                    <WifiOff className="size-4 text-muted-foreground" />
                    Desconectado
                  </>
                )}
              </p>
            </div>
            <div className={`p-2.5 rounded-xl border ${isConfigured ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}>
              <Activity className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Linhas Sincronizadas */}
        <Card className="surface-card border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider">Linhas no Servidor</p>
              <p className="text-base font-bold text-foreground font-mono">
                {sigmaCount ?? 0} ativas
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Servidor Ativo */}
        <Card className="surface-card border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5 max-w-[170px]">
              <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider">Nome do Servidor</p>
              <p className="text-sm font-bold text-foreground truncate" title={serverDisplayName}>
                {serverDisplayName}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Server className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resultado do Teste de Conexão - Fica SEMPRE visível e nunca some */}
      {testResult && testResult.ok && (
        <Card className="surface-card border-emerald-500/30 bg-emerald-500/10 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/20 pb-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground">Conexão com o Servidor Sigma Estabelecida</p>
                    <Badge variant="success" className="text-[10px] py-0 px-2 font-bold">
                      Online & Validado
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Todos os dados de revenda foram verificados e sincronizados com sucesso no sistema.
                  </p>
                </div>
              </div>
              {testResult.testedAt && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-background/60 px-2.5 py-1 rounded-md border border-border/50 self-start sm:self-center">
                  <Clock className="size-3.5 text-primary" /> Testado às {testResult.testedAt}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                <span className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider block">Servidor Detectado</span>
                <span className="text-xs sm:text-sm font-bold text-foreground truncate block mt-0.5" title={testResult.detectedServerName || serverDisplayName}>
                  {testResult.detectedServerName || serverDisplayName}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                <span className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider block">DNS de Streaming</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-foreground truncate block mt-0.5" title={testResult.detectedDns || "Detectado pelo Painel"}>
                  {testResult.detectedDns || "Mesmo do Painel"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                <span className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider block">Créditos de Revenda</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-emerald-400 block mt-0.5">
                  {testResult.credits != null ? `${testResult.credits} créditos` : "Não informado"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                <span className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider block">Pacotes Detectados</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-primary block mt-0.5">
                  {testResult.packagesCount && testResult.packagesCount > 0 ? `${testResult.packagesCount} disponíveis` : "Não detectados"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card de Configuração do Servidor Sigma */}
      <Card className="surface-card border-border/60 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="size-4 text-primary" /> Dados de Acesso ao Servidor Sigma
          </CardTitle>
          <CardDescription>
            Insira os dados da sua conta de revendedor Sigma para ativar o provisionamento e renovação automática.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Endereço do Painel (URL do Revendedor) *</Label>
                <Input
                  type="url"
                  placeholder="https://painel.seuservidor.com ou aplicativoz342.click"
                  value={form.sigma_url}
                  onChange={(e) => setForm({ ...form, sigma_url: e.target.value })}
                  className="rounded-xl text-sm font-mono"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  O link onde você faz login no painel de revenda.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">DNS de Transmissão dos Clientes (Opcional)</Label>
                <Input
                  type="text"
                  placeholder="Ex: http://dns.meuiptv.com:8080"
                  value={form.sigma_streaming_dns}
                  onChange={(e) => setForm({ ...form, sigma_streaming_dns: e.target.value })}
                  className="rounded-xl text-sm font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se vazio, usa o mesmo domínio do painel para gerar M3U e EPG.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome do Servidor / Pacote IPTV (Detectado Automaticamente)</Label>
                <Input
                  type="text"
                  placeholder="Extraído de dentro do painel Sigma ou digite um nome"
                  value={form.sigma_server_name}
                  onChange={(e) => setForm({ ...form, sigma_server_name: e.target.value })}
                  className="rounded-xl text-sm font-medium"
                />
                <p className="text-[11px] text-muted-foreground">
                  Puxado automaticamente de dentro do painel Sigma (ou digite para personalizar o nome enviado ao cliente).
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Usuário de Revendedor (Login) *</Label>
                <Input
                  type="text"
                  placeholder="Seu usuário no painel Sigma"
                  value={form.sigma_username}
                  onChange={(e) => setForm({ ...form, sigma_username: e.target.value })}
                  className="rounded-xl text-sm font-mono"
                  required={!form.sigma_token}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Senha do Revendedor *</Label>
                <div className="relative flex items-center">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Sua senha no painel"
                    value={form.sigma_password}
                    onChange={(e) => setForm({ ...form, sigma_password: e.target.value })}
                    className="rounded-xl text-sm font-mono pr-10"
                    required={!form.sigma_token}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 size-7 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Token da API (Recomendado para painéis com Cloudflare / Captcha)</Label>
                {form.sigma_token && (
                  <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 py-0 font-mono">
                    Token Ativo
                  </Badge>
                )}
              </div>
              <Input
                type="text"
                placeholder="Ex: Chave de API de revenda gerada no painel Sigma"
                value={form.sigma_token}
                onChange={(e) => setForm({ ...form, sigma_token: e.target.value })}
                className="rounded-xl text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                <strong className="text-foreground">Dica Importante:</strong> Se o seu painel estiver atrás de proteção Cloudflare (verificação antibot), o login por usuário e senha será bloqueado. Gere o seu <em>Token da API</em> no painel Sigma (em <em>Configurações &gt; API de Revenda / Integrações</em>) e cole aqui para sincronizar com 100% de sucesso.
              </p>
            </div>

            {/* Switches de Automação */}
            <div className="pt-2 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">Habilitar Servidor Sigma</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ativa a sincronização de clientes e criação de linhas pelo sistema.
                  </p>
                </div>
                <Switch
                  checked={form.sigma_enabled}
                  onCheckedChange={(checked) => setForm({ ...form, sigma_enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">Renovação Automática</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ao confirmar o pagamento da fatura, estende +30 dias no Sigma na hora.
                  </p>
                </div>
                <Switch
                  checked={form.sigma_auto_renew}
                  onCheckedChange={(checked) => setForm({ ...form, sigma_auto_renew: checked })}
                />
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing}
                className="gap-1.5 text-xs font-medium"
              >
                {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5 text-primary" />}
                Testar Conexão Agora
              </Button>

              <Button
                type="submit"
                disabled={saving}
                className="gap-1.5 font-semibold bg-primary text-primary-foreground text-xs shadow-sm hover-lift"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Salvar Configurações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Card de Sincronização em Massa */}
      <Card className="surface-card border-border/60">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="size-4 text-primary" /> Sincronização em Massa com o Painel
              </CardTitle>
              <CardDescription className="mt-0.5">
                Puxe todos os clientes da sua revenda Sigma para o sistema ou atualize o status dos vencimentos.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-foreground font-semibold flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> Auto-Sync em Segundo Plano
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O sistema já verifica automaticamente a cada 60 segundos e toda vez que você volta para a aba do site. 
              Para forçar uma sincronização completa imediata, clique ao lado:
            </p>
          </div>

          <Button
            type="button"
            onClick={handleSync}
            disabled={syncing || !isConfigured}
            className="shrink-0 gap-2 font-semibold bg-primary text-primary-foreground shadow-sm hover-lift"
          >
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Sincronizar Todas as Linhas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

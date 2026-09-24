import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Lock,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AdminOverviewCard } from "@/components/admin/AdminOverviewCard";
import { AdminConnectionsCard } from "@/components/admin/AdminConnectionsCard";
import { AdminPlansCard } from "@/components/admin/AdminPlansCard";
import { AdminResellerDetails } from "@/components/admin/AdminResellerDetails";
import { Checkbox } from "@/components/ui/checkbox";
import {
  bulkAdminResellers,
  createAdminReseller,
  deleteAdminReseller,
  getAdminSettings,
  listAdminSubscriptions,
  resetAdminResellerPassword,
  saveAdminSettings,
  startAdminTrial,
  testMercadoPagoToken,
  testMisticPayCreds,
  updateAdminSubscription,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Sigma Control" },
      { name: "description", content: "Gerencie assinaturas, plano e recebimento das mensalidades do Sigma Control." },
      { property: "og:title", content: "Administração — Sigma Control" },
      { property: "og:description", content: "Assinaturas, plano e recebimentos em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const getSettingsFn = useServerFn(getAdminSettings);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => getSettingsFn({}),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center" data-testid="admin-loading">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center" data-testid="admin-denied">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Área restrita</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Somente o administrador do sistema pode acessar esta página.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/painel">Voltar ao painel</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6 animate-in fade-in duration-300" data-testid="admin-page">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Crown className="size-6 text-primary" /> Administração
          </h1>
          <p className="text-sm text-muted-foreground">
            Assinaturas dos revendedores, plano vendido e conta que recebe as mensalidades.
          </p>
        </div>
        <Badge variant={(data.settings.saas_provider === "misticpay" ? (data.settings as any).has_mistic : data.settings.has_token) ? "success" : "secondary"} className="w-fit text-xs" data-testid="admin-token-status">
          {(data.settings.saas_provider === "misticpay" ? (data.settings as any).has_mistic : data.settings.has_token) ? "Recebimento configurado" : "Recebimento pendente"}
        </Badge>
      </div>

      <Tabs defaultValue="visao" className="space-y-5">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="visao" className="gap-1.5 text-xs sm:text-sm">
            <Sparkles className="size-4" /> Visão geral
          </TabsTrigger>
          <TabsTrigger value="assinaturas" className="gap-1.5 text-xs sm:text-sm">
            <Users className="size-4" /> Assinaturas
          </TabsTrigger>
          <TabsTrigger value="conexoes" className="gap-1.5 text-xs sm:text-sm">
            <MessageCircle className="size-4" /> Conexões
          </TabsTrigger>
          <TabsTrigger value="plano" className="gap-1.5 text-xs sm:text-sm">
            <Crown className="size-4" /> Plano
          </TabsTrigger>
          <TabsTrigger value="recebimento" className="gap-1.5 text-xs sm:text-sm">
            <Wallet className="size-4" /> Recebimento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-5">
          <AdminOverviewCard />
        </TabsContent>

        <TabsContent value="assinaturas" className="space-y-5">
          <SubscriptionsCard />
        </TabsContent>

        <TabsContent value="conexoes" className="space-y-5">
          <AdminConnectionsCard />
        </TabsContent>

        <TabsContent value="plano" className="space-y-5">
          <AdminPlansCard />
        </TabsContent>

        <TabsContent value="recebimento" className="space-y-5">
          <ProviderSwitch current={data.settings.saas_provider} hasMp={Boolean(data.settings.has_token)} hasMistic={Boolean((data.settings as any).has_mistic)} />
          <MisticPayCard hasInitial={Boolean((data.settings as any).has_mistic)} idHint={(data.settings as any).mistic_client_id_hint ?? ""} />
          <MercadoPagoCard hasTokenInitial={Boolean(data.settings.has_token)} />
          <WebhookCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProviderSwitch({ current, hasMp, hasMistic }: { current: string; hasMp: boolean; hasMistic: boolean }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveAdminSettings);
  const choose = useMutation({
    mutationFn: async (provider: "mercadopago" | "misticpay") => {
      const res = await saveFn({ data: { provider } });
      if (!res.ok) throw new Error(res.error || "Falha ao salvar.");
      return provider;
    },
    onSuccess: (p) => {
      toast.success(p === "misticpay" ? "Agora as assinaturas são pagas pela MisticPay." : "Agora as assinaturas são pagas pelo Mercado Pago.");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const options = [
    { id: "misticpay" as const, label: "MisticPay", ready: hasMistic },
    { id: "mercadopago" as const, label: "Mercado Pago", ready: hasMp },
  ];
  return (
    <Card className="surface-card border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Por onde você recebe as assinaturas</CardTitle>
        <CardDescription>Escolha a conta usada para gerar o Pix dos revendedores.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = (current || "mercadopago") === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={choose.isPending || active}
              onClick={() => (o.ready ? choose.mutate(o.id) : toast.error(`Salve as credenciais da ${o.label} primeiro.`))}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-colors ${active ? "border-primary bg-primary/10 text-foreground" : "border-border/70 text-muted-foreground hover:text-foreground"}`}
            >
              <span>{o.label}</span>
              <span className="text-xs font-medium">{active ? "Em uso" : o.ready ? "Usar esta" : "Não configurada"}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MisticPayCard({ hasInitial, idHint }: { hasInitial: boolean; idHint: string }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveAdminSettings);
  const testFn = useServerFn(testMisticPayCreds);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [has, setHas] = useState(hasInitial);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const webhookUrl = (typeof window !== "undefined" ? window.location.origin : "") + "/api/public/hooks/saas-misticpay";
  const ready = clientId.trim() && secret.trim();

  const save = useMutation({
    mutationFn: async () => {
      const res = await saveFn({ data: { misticpay_client_id: clientId, misticpay_client_secret: secret, provider: "misticpay" } });
      if (!res.ok) throw new Error(res.error || "Falha ao salvar.");
    },
    onSuccess: () => {
      toast.success("MisticPay salva e em uso para as assinaturas.");
      setClientId(""); setSecret(""); setHas(true);
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleTest() {
    setTesting(true); setStatus(null);
    try {
      const res = await testFn({ data: { clientId, clientSecret: secret } });
      setStatus(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
    } catch {
      setStatus({ ok: false, message: "Erro ao testar." });
    } finally { setTesting(false); }
  }

  return (
    <Card className="surface-card border-border/70">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-5 text-primary" /> MisticPay</CardTitle>
            <CardDescription className="mt-1">Pix com taxa fixa. Pegue as credenciais no painel da MisticPay em API → Chaves de Acesso.</CardDescription>
          </div>
          <Badge variant={has ? "success" : "secondary"} className="shrink-0 text-xs">{has ? "Configurado" : "Pendente"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Client ID (pk_…)</Label>
            <Input value={clientId} onChange={(e) => { setClientId(e.target.value); setStatus(null); }} placeholder={has ? `${idHint} (vazio mantém o atual)` : "pk_..."} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Client Secret (sk_…)</Label>
            <div className="relative flex items-center">
              <Input type={show ? "text" : "password"} value={secret} onChange={(e) => { setSecret(e.target.value); setStatus(null); }} placeholder={has ? "•••••••• (vazio mantém o atual)" : "sk_..."} className="pr-10 font-mono text-sm" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setShow(!show)} className="absolute right-1 size-7 text-muted-foreground">
                {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Ao criar a chave, marque a permissão de receber (cash-in). A credencial antiga ci_/cs_ também funciona, mas a MisticPay desliga ela em 30/09/2026.</p>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Endereço de confirmação (opcional)</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={webhookUrl} className="h-9 font-mono text-xs" />
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Endereço copiado!"); }}><Copy className="size-3.5" /></Button>
          </div>
          <p className="text-[11px] text-muted-foreground">O sistema já manda esse endereço em cada Pix. Mesmo sem ele, a tela do revendedor confere o pagamento sozinha a cada 5 segundos.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing || !ready} className="gap-2 text-xs">
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5 text-primary" />} Testar credenciais
          </Button>
          {status && (
            <div className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${status.ok ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
              {status.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}<span>{status.message}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-border/50 pt-3">
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || !ready} className="gap-1.5 px-6 font-semibold">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Salvar e usar MisticPay
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MercadoPagoCard({ hasTokenInitial }: { hasTokenInitial: boolean }) {
  const queryClient = useQueryClient();
  const saveSettingsFn = useServerFn(saveAdminSettings);
  const testFn = useServerFn(testMercadoPagoToken);

  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [hasToken, setHasToken] = useState(hasTokenInitial);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const res = await saveSettingsFn({ data: { mercadopago_token: token } });
      if (!res.ok) throw new Error(res.error || "Falha ao salvar.");
      return res;
    },
    onSuccess: () => {
      toast.success("Token salvo! Os Pix das assinaturas já usam essa conta.");
      setToken("");
      setHasToken(true);
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleTest() {
    if (!token.trim()) {
      toast.error("Cole o Access Token do Mercado Pago para testar.");
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const res = await testFn({ data: { token } });
      if (res.ok) {
        setStatus({ ok: true, message: res.message || "Token válido." });
        toast.success("Token do Mercado Pago validado!");
      } else {
        setStatus({ ok: false, message: res.error || "Token recusado." });
        toast.error(res.error || "Token recusado.");
      }
    } catch {
      setStatus({ ok: false, message: "Erro ao validar o token." });
      toast.error("Erro ao validar o token.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="surface-card border-border/70">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-5 text-primary" /> Conta que recebe as mensalidades
            </CardTitle>
            <CardDescription className="mt-1">
              Cole aqui o Access Token do Mercado Pago para gerar os Pix das assinaturas.
            </CardDescription>
          </div>
          <Badge variant={hasToken ? "success" : "secondary"} className="shrink-0 text-xs">
            {hasToken ? "Configurado" : "Pendente"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Lock className="size-3.5 text-primary" /> Access Token (APP_USR-...) *
            </Label>
            <a
              href="https://www.mercadopago.com.br/developers/panel/app"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Onde pegar? <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="relative flex items-center">
            <Input
              type={showToken ? "text" : "password"}
              placeholder={hasToken ? "•••••••••• (deixe vazio para manter o atual)" : "APP_USR-0000000000000000-..."}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setStatus(null);
              }}
              className="rounded-md pr-10 font-mono text-sm"
              data-testid="admin-token-input"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-1 size-7 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Use o <strong>Access Token de produção</strong> das suas credenciais (não a Public Key).
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !token.trim()}
            className="gap-2 text-xs font-medium"
            data-testid="admin-test-button"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5 text-primary" />}
            Testar token
          </Button>
          {status ? (
            <div
              className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                status.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
              data-testid="admin-test-result"
            >
              {status.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
              <span className="leading-snug">{status.message}</span>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-border/50 pt-3">
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || !token.trim()}
            className="gap-1.5 px-6 font-semibold"
            data-testid="admin-save-button"
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Salvar token
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WebhookCard() {
  const [copied, setCopied] = useState(false);
  const webhookUrl =
    (typeof window !== "undefined" ? window.location.origin : "") + "/api/public/hooks/saas-mercadopago";

  return (
    <Card className="surface-card border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-5 text-primary" /> Confirmação automática dos pagamentos
        </CardTitle>
        <CardDescription>
          No Mercado Pago, em <strong>Suas integrações → Webhooks</strong>, cadastre a URL abaixo (evento{" "}
          <strong>Pagamentos</strong>) para liberar as assinaturas na hora.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center gap-2">
          <Input readOnly value={webhookUrl} className="h-9 rounded-md font-mono text-xs" data-testid="admin-webhook-url" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              setCopied(true);
              toast.success("URL do webhook copiada!");
              setTimeout(() => setCopied(false), 2000);
            }}
            className="h-9 shrink-0 gap-1.5"
            data-testid="admin-copy-webhook"
          >
            {copied ? <CheckCircle2 className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            {copied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="size-3.5 text-primary" />
          O webhook só funciona com o app publicado online (HTTPS).
        </p>
      </CardContent>
    </Card>
  );
}

function SubscriptionsCard() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminSubscriptions);
  const updateFn = useServerFn(updateAdminSubscription);
  const createFn = useServerFn(createAdminReseller);
  const deleteFn = useServerFn(deleteAdminReseller);
  const resetFn = useServerFn(resetAdminResellerPassword);
  const trialFn = useServerFn(startAdminTrial);
  const bulkFn = useServerFn(bulkAdminResellers);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [days, setDays] = useState("30");
  const [term, setTerm] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDays, setNewDays] = useState("30");

  const { data, isLoading } = useQuery({ queryKey: ["admin-subscriptions"], queryFn: () => listFn({}), retry: false });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  }

  const update = useMutation({
    mutationFn: async (input: { userId: string; action: "grant" | "block" }) => {
      const res = await updateFn({ data: { ...input, days: Number(days) || 30 } });
      if (!res.ok) throw new Error(res.error || "Falha ao atualizar a assinatura.");
    },
    onSuccess: () => {
      toast.success("Assinatura atualizada.");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await createFn({
        data: { email: newEmail, password: newPassword, days: Number(newDays) || 30 },
      });
      if (!res.ok) throw new Error(res.error || "Falha ao criar o revendedor.");
    },
    onSuccess: () => {
      toast.success("Revendedor criado com assinatura ativa.");
      setNewEmail("");
      setNewPassword("");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => {
      const res = await deleteFn({ data: { userId } });
      if (!res.ok) throw new Error(res.error || "Falha ao excluir o revendedor.");
    },
    onSuccess: () => {
      toast.success("Revendedor excluído com todos os dados dele.");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetPassword = useMutation({
    mutationFn: async (input: { userId: string; password: string }) => {
      const res = await resetFn({ data: input });
      if (!res.ok) throw new Error(res.error || "Falha ao trocar a senha.");
    },
    onSuccess: () => toast.success("Senha alterada. Avise o revendedor."),
    onError: (err: Error) => toast.error(err.message),
  });

  const trial = useMutation({
    mutationFn: async (userId: string) => {
      const res = await trialFn({ data: { userId, days: 7 } });
      if (!res.ok) throw new Error(res.error || "Falha ao liberar o teste.");
    },
    onSuccess: () => {
      toast.success("Teste grátis de 7 dias liberado.");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulk = useMutation({
    mutationFn: async (action: "delete" | "grant" | "block" | "trial" | "suspend" | "unsuspend") => {
      const res = await bulkFn({ data: { userIds: [...selected], action, days: Number(days) || 30 } });
      if (!res.done && res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      if (res.failed) toast.warning(`${res.done} feito(s), ${res.failed} com falha.`);
      else toast.success(`${res.done} conta(s) atualizada(s).`);
      setSelected(new Set());
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function runBulk(action: "delete" | "grant" | "block" | "trial" | "suspend" | "unsuspend") {
    const n = selected.size;
    const msgs: Record<string, string> = {
      delete: `Excluir ${n} conta(s)? Todos os clientes, cobranças e configurações delas serão apagados.`,
      block: `Bloquear a assinatura de ${n} conta(s)?`,
      suspend: `Suspender o login de ${n} conta(s)? Elas não conseguirão entrar até você liberar.`,
    };
    if (msgs[action] && !window.confirm(msgs[action])) return;
    if (action === "delete" && window.prompt(`Para confirmar, digite EXCLUIR`) !== "EXCLUIR") return;
    bulk.mutate(action);
  }

  const busy = bulk.isPending || update.isPending || remove.isPending || trial.isPending || resetPassword.isPending;
  const rows = data?.ok && Array.isArray(data.rows) ? data.rows : [];

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "active").length;
    const trialCount = rows.filter((r) => r.status === "trialing" || r.status === "trial").length;
    const clients = rows.reduce((sum, r) => sum + Number(r.clients || 0), 0);
    return { total: rows.length, active, trial: trialCount, clients };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    const byStatus = rows.filter((r) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "trialing") return r.status === "trialing" || r.status === "trial";
      if (statusFilter === "blocked") return r.status === "blocked" || r.status === "canceled" || r.banned;
      if (statusFilter === "no_clients") return !r.clients;
      return r.status === statusFilter;
    });
    if (!q) return byStatus;
    return byStatus.filter((r) => String(r.email || "").toLowerCase().includes(q) || String(r.status || "").toLowerCase().includes(q));
  }, [rows, term, statusFilter]);

  const statusLabel: Record<string, string> = {
    active: "Ativa",
    trialing: "Teste",
    trial: "Teste",
    blocked: "Bloqueada",
    canceled: "Cancelada",
    past_due: "Vencida",
    sem_assinatura: "Sem assinatura",
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Revendedores", value: stats.total },
          { label: "Assinaturas ativas", value: stats.active, tone: "text-success" },
          { label: "Em teste", value: stats.trial, tone: "text-warning" },
          { label: "Clientes cadastrados", value: stats.clients },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border/60 bg-card/70 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${item.tone ?? "text-foreground"}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <Card className="surface-card border-border/70" data-testid="admin-new-reseller-card">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-5 text-primary" /> Criar novo revendedor
          </CardTitle>
          <CardDescription>Cria a conta de acesso já com assinatura liberada.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">E-mail</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="revendedor@email.com"
                data-testid="admin-new-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Senha</Label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="mínimo 6 caracteres"
                data-testid="admin-new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Dias</Label>
              <Input inputMode="numeric" value={newDays} onChange={(e) => setNewDays(e.target.value)} />
            </div>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !newEmail.trim() || newPassword.length < 6}
              className="gap-1.5 font-semibold"
              data-testid="admin-create-reseller"
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Criar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="surface-card border-border/70" data-testid="admin-subscriptions-card">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-5 text-primary" /> Assinaturas dos revendedores
          </CardTitle>
          <CardDescription>Libere dias, troque a senha, bloqueie ou exclua a conta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar por e-mail ou situação"
                className="h-9 pl-8 text-sm"
                data-testid="admin-sub-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap text-xs font-semibold">Dias a liberar</Label>
              <Input
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="h-9 w-20"
                data-testid="admin-sub-days"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              ["all", "Todas"],
              ["active", "Ativas"],
              ["trialing", "Em teste"],
              ["blocked", "Bloqueadas"],
              ["no_clients", "Sem clientes"],
            ].map(([value, label]) => (
              <Button key={value} size="sm" variant={statusFilter === value ? "default" : "outline"} className="h-7 text-xs" onClick={() => setStatusFilter(value)}>
                {label}
              </Button>
            ))}
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/30 p-2">
              <label className="flex items-center gap-2 px-1 text-xs font-semibold">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((r) => selected.has(r.user_id))}
                  onCheckedChange={(v) => setSelected(v ? new Set(filtered.map((r) => r.user_id)) : new Set())}
                  aria-label="Selecionar todos"
                />
                {selected.size ? `${selected.size} selecionada(s)` : "Selecionar todas"}
              </label>
              {selected.size > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => runBulk("grant")}>Liberar {Number(days) || 30} dias</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => runBulk("trial")}>Teste 7 dias</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => runBulk("unsuspend")}>Liberar login</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-warning" disabled={busy} onClick={() => runBulk("suspend")}>Suspender login</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" disabled={busy} onClick={() => runBulk("block")}>Bloquear assinatura</Button>
                  <Button size="sm" variant="destructive" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => runBulk("delete")}>
                    {bulk.isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Excluir selecionadas
                  </Button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="grid min-h-[12vh] place-items-center">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "Nenhuma assinatura encontrada ainda." : "Nenhum resultado para essa busca."}
            </p>
          ) : (
            <div className="divide-y divide-border/60 rounded-md border border-border/60">
              {filtered.map((row) => {
                const until = row.current_period_end || row.trial_ends_at;
                const isActive = row.status === "active";
                const isBlocked = row.status === "blocked" || row.status === "canceled";
                return (
                  <div key={row.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="flex min-w-0 items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(row.user_id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(row.user_id);
                        else next.delete(row.user_id);
                        setSelected(next);
                      }}
                      aria-label={`Selecionar ${row.email}`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{row.email}</p>
                        <Badge
                          variant={isActive ? "success" : isBlocked ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {statusLabel[row.status] ?? row.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {row.clients} clientes
                        {until ? ` · até ${new Date(until).toLocaleDateString("pt-BR")}` : ""}
                        {` · ${row.panels} servidor(es)`}
                        {` · WhatsApp ${row.whatsapp ? "conectado" : "desconectado"}`}
                        {row.last_sign_in_at ? ` · último acesso ${new Date(row.last_sign_in_at).toLocaleDateString("pt-BR")}` : " · nunca entrou"}
                        {row.banned ? " · login suspenso" : ""}
                      </p>
                    </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="default" className="gap-1.5" onClick={() => setDetailsId(row.user_id)}>
                        <Eye className="size-3.5" /> Ver dados
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => update.mutate({ userId: row.user_id, action: "grant" })}
                      >
                        Liberar {Number(days) || 30} dias
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => trial.mutate(row.user_id)}>
                        Teste 7 dias
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={busy}
                        onClick={() => {
                          const senha = window.prompt(`Nova senha para ${row.email} (mínimo 6 caracteres):`);
                          if (!senha) return;
                          resetPassword.mutate({ userId: row.user_id, password: senha });
                        }}
                      >
                        <KeyRound className="size-3.5" /> Senha
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => update.mutate({ userId: row.user_id, action: "block" })}
                      >
                        Bloquear
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Excluir ${row.email}? Todos os clientes, cobranças e configurações dessa conta serão apagados.`,
                            )
                          ) {
                            remove.mutate(row.user_id);
                          }
                        }}
                        data-testid="admin-delete-reseller"
                      >
                        <Trash2 className="size-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <AdminResellerDetails userId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

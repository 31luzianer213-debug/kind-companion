import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
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
import {
  getAdminPlan,
  getAdminSettings,
  listAdminSubscriptions,
  saveAdminPlan,
  saveAdminSettings,
  testMercadoPagoToken,
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
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-500">
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
        <Badge variant={data.settings.has_token ? "success" : "secondary"} className="w-fit text-xs" data-testid="admin-token-status">
          {data.settings.has_token ? "Recebimento configurado" : "Recebimento pendente"}
        </Badge>
      </div>

      <Tabs defaultValue="assinaturas" className="space-y-5">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="assinaturas" className="gap-1.5 text-xs sm:text-sm">
            <Users className="size-4" /> Assinaturas
          </TabsTrigger>
          <TabsTrigger value="plano" className="gap-1.5 text-xs sm:text-sm">
            <Crown className="size-4" /> Plano
          </TabsTrigger>
          <TabsTrigger value="recebimento" className="gap-1.5 text-xs sm:text-sm">
            <Wallet className="size-4" /> Recebimento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assinaturas" className="space-y-5">
          <SubscriptionsCard />
        </TabsContent>

        <TabsContent value="plano" className="space-y-5">
          <PlanEditorCard />
        </TabsContent>

        <TabsContent value="recebimento" className="space-y-5">
          <MercadoPagoCard hasTokenInitial={Boolean(data.settings.has_token)} />
          <WebhookCard />
        </TabsContent>
      </Tabs>
    </div>
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
              className="rounded-xl pr-10 font-mono text-sm"
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
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
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
          <Input readOnly value={webhookUrl} className="h-9 rounded-xl font-mono text-xs" data-testid="admin-webhook-url" />
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
            {copied ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
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

function PlanEditorCard() {
  const queryClient = useQueryClient();
  const getPlanFn = useServerFn(getAdminPlan);
  const savePlanFn = useServerFn(saveAdminPlan);
  const [form, setForm] = useState<{ id: string; name: string; description: string; price: string; maxClients: string; features: string } | null>(null);

  const { data } = useQuery({ queryKey: ["admin-plan"], queryFn: () => getPlanFn({}), retry: false });

  useEffect(() => {
    if (data?.ok && !form) {
      setForm({
        id: data.plan.id,
        name: data.plan.name,
        description: data.plan.description,
        price: String(data.plan.price_monthly),
        maxClients: data.plan.max_clients === null ? "" : String(data.plan.max_clients),
        features: data.plan.features.join("\n"),
      });
    }
  }, [data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("Plano não carregado.");
      const res = await savePlanFn({
        data: {
          id: form.id,
          name: form.name,
          description: form.description,
          price_monthly: Number(form.price.replace(",", ".")),
          max_clients: form.maxClients.trim() ? Number(form.maxClients) : null,
          features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
        },
      });
      if (!res.ok) throw new Error(res.error || "Falha ao salvar o plano.");
    },
    onSuccess: () => {
      toast.success("Plano atualizado! O novo valor já aparece no site e na tela de Assinatura.");
      queryClient.invalidateQueries({ queryKey: ["admin-plan"] });
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!form) {
    return (
      <div className="grid min-h-[20vh] place-items-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="surface-card border-border/70" data-testid="admin-plan-card">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown className="size-5 text-primary" /> Plano de assinatura
        </CardTitle>
        <CardDescription>Nome, valor mensal e o que está incluso para seus revendedores.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nome do plano</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="admin-plan-name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Valor mensal (R$)</Label>
            <Input
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              data-testid="admin-plan-price"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-semibold">Descrição</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Limite de clientes (vazio = ilimitado)</Label>
            <Input
              inputMode="numeric"
              value={form.maxClients}
              onChange={(e) => setForm({ ...form, maxClients: e.target.value })}
              placeholder="ilimitado"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Benefícios (um por linha)</Label>
          <Textarea rows={6} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
        </div>
        <div className="flex justify-end border-t border-border/50 pt-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5 px-6 font-semibold" data-testid="admin-plan-save">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Salvar plano
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionsCard() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminSubscriptions);
  const updateFn = useServerFn(updateAdminSubscription);
  const [days, setDays] = useState("30");
  const [term, setTerm] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["admin-subscriptions"], queryFn: () => listFn({}), retry: false });

  const update = useMutation({
    mutationFn: async (input: { userId: string; action: "grant" | "block" }) => {
      const res = await updateFn({ data: { ...input, days: Number(days) || 30 } });
      if (!res.ok) throw new Error(res.error || "Falha ao atualizar a assinatura.");
    },
    onSuccess: () => {
      toast.success("Assinatura atualizada.");
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = data?.ok && Array.isArray(data.rows) ? data.rows : [];

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "active").length;
    const trial = rows.filter((r) => r.status === "trialing" || r.status === "trial").length;
    const blocked = rows.filter((r) => r.status === "blocked" || r.status === "canceled").length;
    const clients = rows.reduce((sum, r) => sum + Number(r.clients || 0), 0);
    return { total: rows.length, active, trial, blocked, clients };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.email || "").toLowerCase().includes(q) || String(r.status || "").toLowerCase().includes(q));
  }, [rows, term]);

  const statusLabel: Record<string, string> = {
    active: "Ativa",
    trialing: "Teste",
    trial: "Teste",
    blocked: "Bloqueada",
    canceled: "Cancelada",
    past_due: "Vencida",
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Revendedores", value: stats.total },
          { label: "Assinaturas ativas", value: stats.active, tone: "text-emerald-600 dark:text-emerald-400" },
          { label: "Em teste", value: stats.trial, tone: "text-amber-600 dark:text-amber-400" },
          { label: "Clientes cadastrados", value: stats.clients },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border/60 bg-card/70 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${item.tone ?? "text-foreground"}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <Card className="surface-card border-border/70" data-testid="admin-subscriptions-card">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-5 text-primary" /> Assinaturas dos revendedores
          </CardTitle>
          <CardDescription>Libere dias de acesso manualmente ou bloqueie quem não pagou.</CardDescription>
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

          {isLoading ? (
            <div className="grid min-h-[12vh] place-items-center">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "Nenhuma assinatura encontrada ainda." : "Nenhum resultado para essa busca."}
            </p>
          ) : (
            <div className="divide-y divide-border/60 rounded-xl border border-border/60">
              {filtered.map((row) => {
                const until = row.current_period_end || row.trial_ends_at;
                const isActive = row.status === "active";
                const isBlocked = row.status === "blocked" || row.status === "canceled";
                return (
                  <div key={row.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
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
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ userId: row.user_id, action: "grant" })}
                      >
                        Liberar {Number(days) || 30} dias
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ userId: row.user_id, action: "block" })}
                      >
                        Bloquear
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

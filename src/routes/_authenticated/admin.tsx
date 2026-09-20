import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSettings, saveAdminSettings, testMercadoPagoToken } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administração — Sigma Control" }] }),
  component: AdminPage,
});

function AdminPage() {
  const queryClient = useQueryClient();
  const getSettingsFn = useServerFn(getAdminSettings);
  const saveSettingsFn = useServerFn(saveAdminSettings);
  const testFn = useServerFn(testMercadoPagoToken);

  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => getSettingsFn({}),
    retry: false,
  });

  useEffect(() => {
    if (data?.ok) setHasToken(Boolean(data.settings.has_token));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await saveSettingsFn({ data: { mercadopago_token: token } });
      if (!res.ok) throw new Error(res.error || "Falha ao salvar.");
      return res;
    },
    onSuccess: () => {
      toast.success("Token do Mercado Pago salvo! Os Pix das assinaturas já usam esse token.");
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

  const webhookUrl =
    (typeof window !== "undefined" ? window.location.origin : "") + "/api/public/hooks/saas-mercadopago";

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
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300" data-testid="admin-page">
      <div className="border-b border-border/60 pb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Crown className="size-6 text-primary" /> Administração do Sistema
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure o Mercado Pago que recebe os Pix das <strong>assinaturas</strong> dos revendedores.
        </p>
      </div>

      <Card className="surface-card border-border/70">
        <CardHeader className="border-b border-border/50 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="size-5 text-primary" /> Access Token do Mercado Pago
              </CardTitle>
              <CardDescription className="mt-1">
                É aqui que você cola seu token para gerar os códigos Pix e receber os pagamentos automaticamente.
              </CardDescription>
            </div>
            <Badge variant={hasToken ? "success" : "secondary"} className="text-xs" data-testid="admin-token-status">
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
              Use o <strong>Access Token de produção</strong> das suas credenciais do Mercado Pago (não a Public Key).
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
              disabled={save.isPending || (!token.trim() && !hasToken)}
              className="gap-1.5 px-6 font-semibold"
              data-testid="admin-save-button"
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Salvar token
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="surface-card border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-5 text-primary" /> Webhook de confirmação automática
          </CardTitle>
          <CardDescription>
            Recomendado. No painel do Mercado Pago, em <strong>Suas integrações → Webhooks</strong>, cadastre a URL abaixo
            (evento <strong>Pagamentos</strong>) para confirmar as assinaturas na hora. (O sistema também confere o Pix a
            cada 5s na tela de Assinatura.)
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
    </div>
  );
}

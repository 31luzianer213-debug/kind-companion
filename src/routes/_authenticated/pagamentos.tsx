import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getPaymentSettings,
  savePaymentSettings,
  testMercadoPagoConnection,
  testAsaasConnection,
  type PaymentSettingsPayload,
} from "@/lib/payment.functions";
import {
  CreditCard,
  QrCode,
  CheckCircle2,
  Loader2,
  Lock,
  Wallet,
  Building,
  Copy,
  Check,
  Zap,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({
    meta: [
      { title: "Formas de Pagamento — PIX & Gateways" },
      {
        name: "description",
        content: "Configure sua chave PIX, Mercado Pago e Asaas para recebimento e baixa automática com renovação no Sigma.",
      },
    ],
  }),
  component: PagamentosPage,
});

const defaults: PaymentSettingsPayload = {
  pix_key: "",
  pix_key_type: "aleatoria",
  pix_holder: "",
  payment_link: "",
  payment_provider: "pix",
  mercadopago_token: "",
  asaas_token: "",
  asaas_env: "production",
};

function PagamentosPage() {
  const queryClient = useQueryClient();
  const getSettingsFn = useServerFn(getPaymentSettings);
  const saveSettingsFn = useServerFn(savePaymentSettings);
  const testMpFn = useServerFn(testMercadoPagoConnection);
  const testAsaasFn = useServerFn(testAsaasConnection);

  const [form, setForm] = useState<PaymentSettingsPayload>(defaults);
  const [copiedPix, setCopiedPix] = useState(false);

  // Estados de teste de conexão dos gateways
  const [testingMp, setTestingMp] = useState(false);
  const [mpStatus, setMpStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const [testingAsaas, setTestingAsaas] = useState(false);
  const [asaasStatus, setAsaasStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const res = await getSettingsFn({});
      return res.ok ? res.settings : defaults;
    },
  });

  useEffect(() => {
    if (data) {
      setForm((prev) => ({
        pix_key: data.pix_key ?? prev.pix_key,
        pix_key_type: data.pix_key_type ?? prev.pix_key_type,
        pix_holder: data.pix_holder ?? prev.pix_holder,
        payment_link: data.payment_link ?? prev.payment_link,
        payment_provider: data.payment_provider ?? prev.payment_provider,
        mercadopago_token: data.mercadopago_token ?? prev.mercadopago_token,
        asaas_token: data.asaas_token ?? prev.asaas_token,
        asaas_env: data.asaas_env ?? prev.asaas_env,
      }));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (values: PaymentSettingsPayload) => {
      const res = await saveSettingsFn({ data: values });
      if (!res.ok) {
        throw new Error(res.error || "Falha ao salvar configurações de pagamento.");
      }
      return res;
    },
    onSuccess: () => {
      toast.success("Formas de pagamento salvas com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["payment-settings"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  async function handleTestMercadoPago() {
    if (!form.mercadopago_token?.trim()) {
      toast.error("Informe o Access Token do Mercado Pago antes de testar.");
      return;
    }
    setTestingMp(true);
    setMpStatus(null);
    try {
      const res = await testMpFn({ data: { token: form.mercadopago_token } });
      if (res.ok) {
        setMpStatus({ ok: true, message: `Conectado com sucesso! Conta: ${res.name} (${res.email})` });
        toast.success(`Mercado Pago autenticado: ${res.name}`);
      } else {
        setMpStatus({ ok: false, message: res.error || "Falha ao validar token." });
        toast.error(res.error || "Token do Mercado Pago recusado.");
      }
    } catch {
      setMpStatus({ ok: false, message: "Erro de conexão ao testar Mercado Pago." });
      toast.error("Erro ao validar com Mercado Pago.");
    } finally {
      setTestingMp(false);
    }
  }

  async function handleTestAsaas() {
    if (!form.asaas_token?.trim()) {
      toast.error("Informe a Chave de API do Asaas antes de testar.");
      return;
    }
    setTestingAsaas(true);
    setAsaasStatus(null);
    try {
      const res = await testAsaasFn({
        data: { token: form.asaas_token, env: form.asaas_env },
      });
      if (res.ok) {
        setAsaasStatus({ ok: true, message: `Conectado com sucesso! Conta: ${res.name} (${res.email})` });
        toast.success(`Asaas autenticado: ${res.name}`);
      } else {
        setAsaasStatus({ ok: false, message: res.error || "Token do Asaas recusado." });
        toast.error(res.error || "Token do Asaas recusado.");
      }
    } catch {
      setAsaasStatus({ ok: false, message: "Erro de conexão ao testar Asaas." });
      toast.error("Erro ao validar com Asaas.");
    } finally {
      setTestingAsaas(false);
    }
  }

  function handleCopyPix() {
    if (!form.pix_key) return;
    navigator.clipboard.writeText(form.pix_key);
    setCopiedPix(true);
    toast.info("Chave PIX copiada para a área de transferência!");
    setTimeout(() => setCopiedPix(false), 2000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(form);
  }

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <CreditCard className="size-6 text-primary" /> Formas de Pagamento & Gateways
            </h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
              PIX & Gateways
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure sua chave PIX e conecte com Mercado Pago ou Asaas para recebimento automatizado e renovação imediata no Sigma.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-sm hover-lift"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Salvar Alterações
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seletor do Provedor de Pagamento Ativo */}
        <Card className="surface-card border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="size-4 text-amber-400" /> Método de Cobrança Principal
            </CardTitle>
            <CardDescription>
              Escolha qual meio de pagamento será enviado nas mensagens automáticas de cobrança via WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Opção 1: PIX Direto */}
              <div
                onClick={() => setForm({ ...form, payment_provider: "pix" })}
                className={`cursor-pointer rounded-xl p-4 border transition-all ${
                  form.payment_provider === "pix"
                    ? "border-emerald-500/60 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/30"
                    : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <QrCode className="size-4 text-emerald-400" />
                    Chave PIX Direta
                  </div>
                  {form.payment_provider === "pix" ? (
                    <CheckCircle2 className="size-4 text-emerald-400" />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Envia sua chave PIX com nome do titular para transferência direta. Baixa manual ou comprovante.
                </p>
              </div>

              {/* Opção 2: Mercado Pago */}
              <div
                onClick={() => setForm({ ...form, payment_provider: "mercadopago" })}
                className={`cursor-pointer rounded-xl p-4 border transition-all ${
                  form.payment_provider === "mercadopago"
                    ? "border-sky-500/60 bg-sky-500/10 shadow-sm ring-1 ring-sky-500/30"
                    : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Wallet className="size-4 text-sky-400" />
                    Mercado Pago
                  </div>
                  {form.payment_provider === "mercadopago" ? (
                    <CheckCircle2 className="size-4 text-sky-400" />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  QR Code dinâmico do PIX ou checkout online. Baixa automática e renovação instantânea no Sigma.
                </p>
              </div>

              {/* Opção 3: Asaas */}
              <div
                onClick={() => setForm({ ...form, payment_provider: "asaas" })}
                className={`cursor-pointer rounded-xl p-4 border transition-all ${
                  form.payment_provider === "asaas"
                    ? "border-primary/60 bg-primary/10 shadow-sm ring-1 ring-primary/30"
                    : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Building className="size-4 text-primary" />
                    Asaas
                  </div>
                  {form.payment_provider === "asaas" ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cobranças bancárias completas (PIX, Boleto e Cartão) com confirmação via Webhook e baixa no Sigma.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seção 1: Chave PIX Principal */}
        <Card className="surface-card border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="size-4 text-emerald-400" /> Chave PIX (Envio Direto no WhatsApp)
              </CardTitle>
              {form.pix_key ? (
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs">
                  Configurada
                </Badge>
              ) : null}
            </div>
            <CardDescription>
              Esta chave é inserida automaticamente nas mensagens com a tag <code className="font-mono text-primary">&#123;pix&#125;</code> para os clientes realizarem a transferência.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tipo de Chave</Label>
                <Select
                  value={form.pix_key_type}
                  onValueChange={(val) => setForm({ ...form, pix_key_type: val })}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="celular">Telefone / Celular</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Chave PIX *</Label>
                <div className="relative flex items-center">
                  <Input
                    type="text"
                    placeholder="Cole sua chave PIX aqui"
                    value={form.pix_key}
                    onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                    className="rounded-xl font-mono text-sm pr-10"
                  />
                  {form.pix_key ? (
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                      title="Copiar Chave PIX"
                    >
                      {copiedPix ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome do Titular da Conta</Label>
                <Input
                  type="text"
                  placeholder="Ex: João da Silva ou Minha Revenda Ltda"
                  value={form.pix_holder}
                  onChange={(e) => setForm({ ...form, pix_holder: e.target.value })}
                  className="rounded-xl text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Aparece nas mensagens para ajudar o cliente a conferir o destinatário.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Link de Pagamento Externo (Opcional)</Label>
                <Input
                  type="url"
                  placeholder="https://mpago.la/exemplo ou https://seu-checkout.com"
                  value={form.payment_link}
                  onChange={(e) => setForm({ ...form, payment_link: e.target.value })}
                  className="rounded-xl text-sm font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Pode ser incluído nas mensagens com a tag <code className="font-mono text-primary">&#123;link&#125;</code>.
                </p>
              </div>
            </div>

            {/* Preview da Chave PIX */}
            {form.pix_key ? (
              <div className="mt-2 p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <QrCode className="size-3.5 text-emerald-400" />
                    Preview no WhatsApp:
                  </span>
                  <p className="font-mono text-muted-foreground text-[11px]">
                    PIX ({form.pix_key_type?.toUpperCase()}): {form.pix_key}
                    {form.pix_holder ? ` • Titular: ${form.pix_holder}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPix}
                  className="h-7 text-xs gap-1 shadow-sm"
                >
                  {copiedPix ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  {copiedPix ? "Copiado!" : "Testar Chave"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Seção 2: Gateways Automáticos (Mercado Pago e Asaas) */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Mercado Pago */}
          <Card className="surface-card border-border/60 flex flex-col justify-between">
            <div>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="size-4 text-sky-400" /> Mercado Pago
                  </CardTitle>
                  <Badge variant="outline" className="text-xs text-sky-400 border-sky-400/30">
                    Baixa Automática
                  </Badge>
                </div>
                <CardDescription>
                  Gera cobranças dinâmicas do Mercado Pago com baixa instantânea e renovação direta no Sigma.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Lock className="size-3 text-muted-foreground" /> Access Token de Produção
                  </Label>
                  <Input
                    type="password"
                    placeholder="APP_USR-..."
                    value={form.mercadopago_token}
                    onChange={(e) => {
                      setForm({ ...form, mercadopago_token: e.target.value });
                      setMpStatus(null);
                    }}
                    className="rounded-xl text-sm font-mono"
                  />
                  <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                    <span>Credencial da sua aplicação Mercado Pago.</span>
                    <a
                      href="https://www.mercadopago.com.br/developers/panel/app"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-0.5"
                    >
                      Obter Token <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>

                {/* Status do Teste do Mercado Pago */}
                {mpStatus ? (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                      mpStatus.ok
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    }`}
                  >
                    {mpStatus.ok ? (
                      <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-snug">{mpStatus.message}</span>
                  </div>
                ) : null}
              </CardContent>
            </div>

            <div className="p-6 pt-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestMercadoPago}
                disabled={testingMp || !form.mercadopago_token}
                className="w-full text-xs gap-1.5"
              >
                {testingMp ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5 text-sky-400" />}
                Testar Conexão Mercado Pago
              </Button>
            </div>
          </Card>

          {/* Asaas */}
          <Card className="surface-card border-border/60 flex flex-col justify-between">
            <div>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building className="size-4 text-emerald-400" /> Asaas
                  </CardTitle>
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                    Cobranças & PIX
                  </Badge>
                </div>
                <CardDescription>
                  Emita cobranças completas via Asaas com split, boletos e PIX com confirmação automática.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Lock className="size-3 text-muted-foreground" /> Chave de API (Token Asaas)
                  </Label>
                  <Input
                    type="password"
                    placeholder="$aact_..."
                    value={form.asaas_token}
                    onChange={(e) => {
                      setForm({ ...form, asaas_token: e.target.value });
                      setAsaasStatus(null);
                    }}
                    className="rounded-xl text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Ambiente</Label>
                  <Select
                    value={form.asaas_env}
                    onValueChange={(val) => {
                      setForm({ ...form, asaas_env: val });
                      setAsaasStatus(null);
                    }}
                  >
                    <SelectTrigger className="rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Produção (Ambiente Real)</SelectItem>
                      <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status do Teste do Asaas */}
                {asaasStatus ? (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                      asaasStatus.ok
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    }`}
                  >
                    {asaasStatus.ok ? (
                      <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-snug">{asaasStatus.message}</span>
                  </div>
                ) : null}
              </CardContent>
            </div>

            <div className="p-6 pt-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestAsaas}
                disabled={testingAsaas || !form.asaas_token}
                className="w-full text-xs gap-1.5"
              >
                {testingAsaas ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5 text-emerald-400" />}
                Testar Conexão Asaas
              </Button>
            </div>
          </Card>
        </div>

        {/* Rodapé com botão de salvar */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Todas as alterações são salvas com criptografia e sincronizadas com a régua de cobrança.
          </p>
          <Button
            type="submit"
            disabled={save.isPending}
            className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-md px-6 hover-lift"
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Salvar Formas de Pagamento
          </Button>
        </div>
      </form>
    </div>
  );
}

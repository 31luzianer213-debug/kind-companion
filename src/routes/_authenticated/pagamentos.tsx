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
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({
    meta: [
      { title: "Formas de Pagamento — PIX & Gateways" },
      {
        name: "description",
        content: "Configure sua chave PIX, Mercado Pago e Asaas para recebimento e renovação automática no Sigma.",
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
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [showMpToken, setShowMpToken] = useState(false);
  const [showAsaasToken, setShowAsaasToken] = useState(false);

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
        payment_provider: data.payment_provider ?? prev.payment_provider ?? "pix",
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
      toast.success("Forma de pagamento salva com sucesso!");
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
        setMpStatus({ ok: true, message: `Conectado com sucesso! Titular: ${res.name} (${res.email})` });
        toast.success(`Mercado Pago autenticado: ${res.name}`);
      } else {
        setMpStatus({ ok: false, message: res.error || "Token inválido ou sem permissão." });
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
    toast.info("Chave PIX copiada!");
    setTimeout(() => setCopiedPix(false), 2000);
  }

  function handleCopyWebhook(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedWebhook(true);
    toast.info("Link do Webhook copiado para a área de transferência!");
    setTimeout(() => setCopiedWebhook(false), 2000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(form);
  }

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://seusite.com";
  const mpWebhookUrl = `${currentOrigin}/api/public/hooks/mercadopago`;
  const asaasWebhookUrl = `${currentOrigin}/api/public/hooks/cobranca-diaria`;

  const activeProvider = form.payment_provider || "pix";

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <CreditCard className="size-6 text-primary" /> Formas de Pagamento
            </h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
              Simples & Direto
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Escolha como seus clientes irão pagar. Clique na opção desejada para preencher somente o que precisa.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-sm hover-lift"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Salvar Configurações
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seletor do Provedor de Pagamento - 3 opções claras */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Escolha seu método de recebimento:
          </Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Opção 1: Chave PIX Direta (Manual) */}
            <div
              onClick={() => setForm({ ...form, payment_provider: "pix" })}
              className={`cursor-pointer rounded-xl p-4 border transition-all relative ${
                activeProvider === "pix"
                  ? "border-white bg-white/10 shadow-md ring-2 ring-white/20 text-white"
                  : "border-white/10 bg-zinc-950 hover:bg-white/5 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 font-bold text-sm text-white">
                  <QrCode className="size-4 text-white" />
                  Chave PIX Direta
                </div>
                {activeProvider === "pix" ? (
                  <CheckCircle2 className="size-5 text-white" />
                ) : (
                  <Badge variant="outline" className="text-[10px] text-zinc-400 border-white/10">
                    Sem taxas
                  </Badge>
                )}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Você recebe direto na sua conta bancária. O cliente manda o comprovante e você confirma com 1 clique.
              </p>
            </div>

            {/* Opção 2: Mercado Pago (Automático) */}
            <div
              onClick={() => setForm({ ...form, payment_provider: "mercadopago" })}
              className={`cursor-pointer rounded-xl p-4 border transition-all relative ${
                activeProvider === "mercadopago"
                  ? "border-white bg-white/10 shadow-md ring-2 ring-white/20 text-white"
                  : "border-white/10 bg-zinc-950 hover:bg-white/5 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 font-bold text-sm text-white">
                  <Wallet className="size-4 text-white" />
                  Mercado Pago
                </div>
                {activeProvider === "mercadopago" ? (
                  <CheckCircle2 className="size-5 text-white" />
                ) : (
                  <Badge variant="outline" className="text-[10px] text-white border-white/20">
                    Automático
                  </Badge>
                )}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Renovação 100% automática no Sigma via Webhook assim que o cliente efetuar o pagamento.
              </p>
            </div>

            {/* Opção 3: Asaas */}
            <div
              onClick={() => setForm({ ...form, payment_provider: "asaas" })}
              className={`cursor-pointer rounded-xl p-4 border transition-all relative ${
                activeProvider === "asaas"
                  ? "border-white bg-white/10 shadow-md ring-2 ring-white/20 text-white"
                  : "border-white/10 bg-zinc-950 hover:bg-white/5 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 font-bold text-sm text-white">
                  <Building className="size-4 text-white" />
                  Asaas
                </div>
                {activeProvider === "asaas" ? (
                  <CheckCircle2 className="size-5 text-white" />
                ) : (
                  <Badge variant="outline" className="text-[10px] text-zinc-400 border-white/10">
                    Boleto/Cartão
                  </Badge>
                )}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Cobranças bancárias completas (PIX, Boleto e Cartão de Crédito) para empresas.
              </p>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------------------------- */}
        {/* VISÃO CONDICIONAL 1: SOMENTE PIX DIRETO                                            */}
        {/* -------------------------------------------------------------------------------- */}
        {activeProvider === "pix" && (
          <Card className="surface-card border-white/15 bg-zinc-950 shadow-sm animate-in fade-in duration-200">
            <CardHeader className="pb-3 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <QrCode className="size-5 text-white" />
                    Dados da sua Chave PIX
                  </CardTitle>
                  <CardDescription className="mt-1 text-zinc-400">
                    Preencha sua chave para que o robô envie diretamente aos clientes pelo WhatsApp.
                  </CardDescription>
                </div>
                {form.pix_key ? (
                  <Badge className="bg-white text-black font-extrabold border-0 text-xs">
                    Ativa
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tipo de Chave *</Label>
                  <Select
                    value={form.pix_key_type}
                    onValueChange={(val) => setForm({ ...form, pix_key_type: val })}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aleatoria">Chave Aleatória (EVP)</SelectItem>
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
                      placeholder="Ex: 123e4567-e89b-12d3-a456-426614174000 ou 11999999999"
                      value={form.pix_key}
                      onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                      className="rounded-xl font-mono text-sm pr-10"
                      required={activeProvider === "pix"}
                    />
                    {form.pix_key ? (
                      <button
                        type="button"
                        onClick={handleCopyPix}
                        className="absolute right-2.5 text-zinc-400 hover:text-white"
                        title="Copiar Chave PIX"
                      >
                        {copiedPix ? <Check className="size-4 text-white" /> : <Copy className="size-4" />}
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
                    placeholder="Ex: João da Silva ou Minha Revenda IPTV"
                    value={form.pix_holder}
                    onChange={(e) => setForm({ ...form, pix_holder: e.target.value })}
                    className="rounded-xl text-sm"
                  />
                  <p className="text-[11px] text-zinc-400">
                    Aparece na mensagem para o cliente saber o nome do recebedor antes de transferir.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Link de Pagamento Opcional</Label>
                  <Input
                    type="url"
                    placeholder="https://nubank.com.br/cobrar/... ou link do seu banco"
                    value={form.payment_link}
                    onChange={(e) => setForm({ ...form, payment_link: e.target.value })}
                    className="rounded-xl text-sm font-mono"
                  />
                  <p className="text-[11px] text-zinc-400">
                    Caso queira enviar um link direto do seu banco além da chave PIX.
                  </p>
                </div>
              </div>

              {/* Preview em Tempo Real */}
              {form.pix_key ? (
                <div className="mt-3 p-3.5 rounded-xl bg-zinc-900 border border-white/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <QrCode className="size-3.5" />
                      Como os clientes verão no WhatsApp:
                    </span>
                    <p className="font-mono text-zinc-400 text-[11px]">
                      PIX ({form.pix_key_type?.toUpperCase()}): <strong className="text-white">{form.pix_key}</strong>
                      {form.pix_holder ? ` • Titular: ${form.pix_holder}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyPix}
                    className="h-8 text-xs gap-1.5 shrink-0 self-start sm:self-auto border-white/20 text-white hover:bg-white/10"
                  >
                    {copiedPix ? <Check className="size-3 text-white" /> : <Copy className="size-3" />}
                    {copiedPix ? "Chave Copiada!" : "Testar Cópia"}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* -------------------------------------------------------------------------------- */}
        {/* VISÃO CONDICIONAL 2: SOMENTE MERCADO PAGO                                         */}
        {/* -------------------------------------------------------------------------------- */}
        {activeProvider === "mercadopago" && (
          <Card className="surface-card border-white/15 bg-zinc-950 shadow-sm animate-in fade-in duration-200">
            <CardHeader className="pb-3 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <Wallet className="size-5 text-white" />
                    Mercado Pago (Renovação Automática no Sigma)
                  </CardTitle>
                  <CardDescription className="mt-1 text-zinc-400">
                    Basta colar seu Access Token. O sistema gera cobranças e renova o acesso no Sigma na hora!
                  </CardDescription>
                </div>
                <Badge className="bg-white text-black font-extrabold border-0 text-xs">
                  Automático
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              {/* Campo do Token do Mercado Pago */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-white">
                    <Lock className="size-3.5 text-white" />
                    Access Token de Produção do Mercado Pago *
                  </Label>
                  <a
                    href="https://www.mercadopago.com.br/developers/panel/app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-zinc-300 hover:text-white underline flex items-center gap-1 font-medium"
                  >
                    Onde pegar meu Token? <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="relative flex items-center">
                  <Input
                    type={showMpToken ? "text" : "password"}
                    placeholder="APP_USR-0000000000000000-000000-..."
                    value={form.mercadopago_token}
                    onChange={(e) => {
                      setForm({ ...form, mercadopago_token: e.target.value });
                      setMpStatus(null);
                    }}
                    className="rounded-xl font-mono text-sm pr-20"
                    required={activeProvider === "mercadopago"}
                  />
                  <div className="absolute right-1 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMpToken(!showMpToken)}
                      className="h-7 px-2 text-zinc-400 hover:text-white"
                      title={showMpToken ? "Ocultar" : "Mostrar"}
                    >
                      {showMpToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Botão de Teste de Conexão */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestMercadoPago}
                  disabled={testingMp || !form.mercadopago_token}
                  className="gap-2 font-medium text-xs border-white/20 hover:bg-white/10 text-white"
                >
                  {testingMp ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                  Testar Conexão com Mercado Pago
                </Button>

                {mpStatus ? (
                  <div
                    className={`p-2 px-3 rounded-lg border text-xs flex items-center gap-2 flex-1 ${
                      mpStatus.ok
                        ? "bg-white/10 border-white/30 text-white"
                        : "bg-zinc-900 border-zinc-700 text-zinc-300"
                    }`}
                  >
                    {mpStatus.ok ? (
                      <CheckCircle2 className="size-4 shrink-0" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0" />
                    )}
                    <span className="leading-snug">{mpStatus.message}</span>
                  </div>
                ) : null}
              </div>

              {/* Passo a Passo: URL do Webhook */}
              <div className="rounded-xl bg-zinc-900/50 border border-white/10 p-4 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold text-xs">
                  <Sparkles className="size-4 text-white" />
                  Como ativar a renovação automática no Sigma quando o cliente pagar:
                </div>
                <p className="text-xs text-zinc-400">
                  No painel do <strong>Mercado Pago Developers</strong>, vá em <strong>Webhooks</strong> e cole o endereço abaixo marcando o evento <strong>Pagamentos (payments)</strong>:
                </p>

                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={mpWebhookUrl}
                    className="font-mono text-xs bg-black rounded-xl border-white/20 text-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyWebhook(mpWebhookUrl)}
                    className="shrink-0 text-xs gap-1.5 h-9 border-white/20 text-white hover:bg-white/10"
                  >
                    {copiedWebhook ? <Check className="size-3.5 text-white" /> : <Copy className="size-3.5" />}
                    {copiedWebhook ? "Copiado!" : "Copiar Webhook"}
                  </Button>
                </div>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <span className="text-white">💡</span>
                  Nota: Para o Mercado Pago enviar as notificações de pagamento aprovado automaticamente, seu site precisa estar publicado online com HTTPS (caso esteja rodando no localhost, use o link da sua hospedagem / Lovable Cloud).
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* -------------------------------------------------------------------------------- */}
        {/* VISÃO CONDICIONAL 3: SOMENTE ASAAS                                               */}
        {/* -------------------------------------------------------------------------------- */}
        {activeProvider === "asaas" && (
          <Card className="surface-card border-white/15 bg-zinc-950 shadow-sm animate-in fade-in duration-200">
            <CardHeader className="pb-3 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <Building className="size-5 text-white" />
                    Configuração do Asaas
                  </CardTitle>
                  <CardDescription className="mt-1 text-zinc-400">
                    Emita cobranças via Asaas com baixa automática por webhook.
                  </CardDescription>
                </div>
                <Badge className="bg-white/10 text-white border-white/20 text-xs">
                  Asaas API
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-white">
                    <Lock className="size-3.5 text-white" /> Chave de API (Token Asaas) *
                  </Label>
                  <div className="relative flex items-center">
                    <Input
                      type={showAsaasToken ? "text" : "password"}
                      placeholder="$aact_YTU5YTE0M2M6N2Z..."
                      value={form.asaas_token}
                      onChange={(e) => {
                        setForm({ ...form, asaas_token: e.target.value });
                        setAsaasStatus(null);
                      }}
                      className="rounded-xl font-mono text-sm pr-10"
                      required={activeProvider === "asaas"}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAsaasToken(!showAsaasToken)}
                      className="absolute right-1 size-7 text-zinc-400 hover:text-white"
                    >
                      {showAsaasToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </Button>
                  </div>
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
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Produção (Real)</SelectItem>
                      <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Testar Conexão Asaas */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestAsaas}
                  disabled={testingAsaas || !form.asaas_token}
                  className="gap-2 font-medium text-xs border-white/20 hover:bg-white/10 text-white"
                >
                  {testingAsaas ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                  Testar Conexão com Asaas
                </Button>

                {asaasStatus ? (
                  <div
                    className={`p-2 px-3 rounded-lg border text-xs flex items-center gap-2 flex-1 ${
                      asaasStatus.ok
                        ? "bg-white/10 border-white/30 text-white"
                        : "bg-zinc-900 border-zinc-700 text-zinc-300"
                    }`}
                  >
                    {asaasStatus.ok ? (
                      <CheckCircle2 className="size-4 shrink-0" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0" />
                    )}
                    <span className="leading-snug">{asaasStatus.message}</span>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rodapé com botão principal de Salvar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-white/10">
          <p className="text-xs text-zinc-400 flex items-center gap-1.5">
            <Info className="size-4 text-white shrink-0" />
            As alterações são salvas com criptografia e sincronizadas com a régua de cobrança.
          </p>
          <Button
            type="submit"
            disabled={save.isPending}
            className="gap-2 font-bold bg-white text-black hover:bg-zinc-200 border-0 shadow-md px-6"
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Salvar Forma de Pagamento
          </Button>
        </div>
      </form>
    </div>
  );
}

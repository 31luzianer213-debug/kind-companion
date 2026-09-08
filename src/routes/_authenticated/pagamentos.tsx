import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CreditCard,
  QrCode,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Zap,
  ExternalLink,
  Lock,
  Wallet,
  Building,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({
    meta: [
      { title: "Formas de Pagamento — PIX & Gateways" },
      { name: "description", content: "Configure sua chave PIX, Mercado Pago e Asaas para recebimento e baixa automática com renovação no Sigma." },
    ],
  }),
  component: PagamentosPage,
});

type PaymentSettings = {
  pix_key: string;
  pix_key_type: string;
  pix_holder: string;
  payment_link: string;
  payment_provider: string;
  mercadopago_token: string;
  asaas_token: string;
  asaas_env: string;
};

const defaults: PaymentSettings = {
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
  const [form, setForm] = useState<PaymentSettings>(defaults);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
      return data;
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
    mutationFn: async (values: PaymentSettings) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        user_id: auth.user!.id,
        pix_key: values.pix_key.trim(),
        pix_key_type: values.pix_key_type,
        pix_holder: values.pix_holder.trim(),
        payment_link: values.payment_link.trim(),
        payment_provider: values.payment_provider,
        mercadopago_token: values.mercadopago_token.trim(),
        asaas_token: values.asaas_token.trim(),
        asaas_env: values.asaas_env,
      };

      const { error } = await supabase
        .from("whatsapp_settings")
        .upsert(payload as any, { onConflict: "user_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Formas de pagamento salvas com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao salvar: ${err.message}`);
    },
  });

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
          </div>
          <p className="text-sm text-muted-foreground">
            Configure sua chave PIX e conecte com Mercado Pago ou Asaas para recebimento automatizado e renovação imediata no Sigma.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-sm"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Salvar Alterações
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seção 1: Chave PIX Principal */}
        <Card className="surface-card border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="size-4 text-emerald-400" /> Chave PIX (Envio Direto no WhatsApp)
            </CardTitle>
            <CardDescription>
              Esta chave será enviada nas mensagens de cobrança e lembretes para que os clientes realizem a transferência.
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
                <Input
                  type="text"
                  placeholder="Cole sua chave PIX aqui"
                  value={form.pix_key}
                  onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                  className="rounded-xl font-mono text-sm"
                />
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
                  Ajuda o cliente a conferir o destinatário na hora de pagar.
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
                  Se você tiver uma página externa ou checkout, ele pode ser incluído com a tag &#123;link&#125;.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seção 2: Gateways Automáticos (Mercado Pago e Asaas) */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Mercado Pago */}
          <Card className="surface-card border-border/60 flex flex-col justify-between">
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
                Gera QR Code dinâmico do PIX ou checkout de cartão com baixa instantânea e renovação no Sigma.
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
                  onChange={(e) => setForm({ ...form, mercadopago_token: e.target.value })}
                  className="rounded-xl text-sm font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Obtenha em: Mercado Pago Developers &gt; Suas Integrações &gt; Credenciais de Produção.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Asaas */}
          <Card className="surface-card border-border/60 flex flex-col justify-between">
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
                Emita cobranças via Asaas com split, boletos e PIX com confirmação automática via Webhook.
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
                  onChange={(e) => setForm({ ...form, asaas_token: e.target.value })}
                  className="rounded-xl text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Ambiente</Label>
                <Select
                  value={form.asaas_env}
                  onValueChange={(val) => setForm({ ...form, asaas_env: val })}
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
            </CardContent>
          </Card>
        </div>

        {/* Rodapé com botão de salvar */}
        <div className="flex justify-end gap-3 pt-3 border-t border-border/50">
          <Button
            type="submit"
            disabled={save.isPending}
            className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-md px-6"
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Salvar Formas de Pagamento
          </Button>
        </div>
      </form>
    </div>
  );
}

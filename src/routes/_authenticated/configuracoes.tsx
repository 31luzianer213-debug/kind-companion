import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendWhatsAppMessage, testWhatsAppConnection } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "WhatsApp — IPTV Manager" },
      { name: "description", content: "Conecte sua Evolution API e defina a mensagem de cobrança automática." },
      { property: "og:title", content: "WhatsApp — IPTV Manager" },
      { property: "og:description", content: "Configuração da cobrança automática pelo WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Configuracoes,
});

type Settings = {
  api_url: string;
  api_key: string;
  instance_name: string;
  message_template: string;
  reminder_days_before: number;
  send_on_due_day: boolean;
  overdue_reminder: boolean;
  auto_send_enabled: boolean;
};

const defaults: Settings = {
  api_url: "",
  api_key: "",
  instance_name: "",
  message_template:
    "Olá {nome}! Sua mensalidade de {valor} vence em {vencimento}. Qualquer dúvida é só chamar aqui. 😊",
  reminder_days_before: 3,
  send_on_due_day: true,
  overdue_reminder: true,
  auto_send_enabled: false,
};

function Configuracoes() {
  const queryClient = useQueryClient();
  const test = useServerFn(testWhatsAppConnection);
  const send = useServerFn(sendWhatsAppMessage);
  const [form, setForm] = useState<Settings>(defaults);
  const [testPhone, setTestPhone] = useState("");

  const { data } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setForm({
        api_url: data.api_url ?? "",
        api_key: data.api_key ?? "",
        instance_name: data.instance_name ?? "",
        message_template: data.message_template,
        reminder_days_before: data.reminder_days_before,
        send_on_due_day: data.send_on_due_day,
        overdue_reminder: data.overdue_reminder,
        auto_send_enabled: data.auto_send_enabled,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (values: Settings) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("whatsapp_settings")
        .upsert({ user_id: auth.user!.id, ...values }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configuração salva.");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function testar() {
    const result = await test({});
    if (result.ok) toast.success("Conexão respondeu com sucesso.");
    else toast.error(result.error ?? "Não foi possível conectar.");
  }

  async function enviarTeste() {
    if (!testPhone) {
      toast.error("Informe um número para o teste.");
      return;
    }
    const result = await send({
      data: { phone: testPhone, body: "Mensagem de teste do seu painel IPTV. ✅" },
    });
    if (result.ok) toast.success("Mensagem de teste enviada.");
    else toast.error(result.error ?? "Falha no envio.");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-gradient text-3xl font-bold tracking-tight">Cobrança no WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Conecte sua Evolution API e escolha como as mensagens são enviadas.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="text-base">Conexão</CardTitle>
            <CardDescription>Dados da sua instância da Evolution API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Endereço da API</Label>
              <Input
                placeholder="https://sua-evolution.com"
                value={form.api_url}
                onChange={(e) => setForm({ ...form, api_url: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Chave de acesso (apikey)</Label>
                <Input
                  type="password"
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome da instância</Label>
                <Input
                  value={form.instance_name}
                  onChange={(e) => setForm({ ...form, instance_name: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Button type="button" variant="outline" onClick={testar}>
                Testar conexão
              </Button>
              <div className="space-y-2">
                <Label>Enviar teste para</Label>
                <Input
                  placeholder="85999998888"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" onClick={enviarTeste}>
                Enviar mensagem de teste
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="text-base">Mensagem e regras</CardTitle>
            <CardDescription>
              Use {"{nome}"}, {"{valor}"}, {"{vencimento}"} e {"{dias}"} no texto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Modelo da mensagem</Label>
              <Textarea
                rows={4}
                value={form.message_template}
                onChange={(e) => setForm({ ...form, message_template: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Avisar quantos dias antes do vencimento</Label>
              <Input
                type="number"
                min={0}
                max={30}
                className="max-w-32"
                value={form.reminder_days_before}
                onChange={(e) => setForm({ ...form, reminder_days_before: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">Avisar também no dia do vencimento</span>
              <Switch
                checked={form.send_on_due_day}
                onCheckedChange={(checked) => setForm({ ...form, send_on_due_day: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">Cobrar quem está atrasado</span>
              <Switch
                checked={form.overdue_reminder}
                onCheckedChange={(checked) => setForm({ ...form, overdue_reminder: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">Cobrança automática ligada</span>
              <Switch
                checked={form.auto_send_enabled}
                onCheckedChange={(checked) => setForm({ ...form, auto_send_enabled: checked })}
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={save.isPending}>
          Salvar configuração
        </Button>
      </form>
    </div>
  );
}

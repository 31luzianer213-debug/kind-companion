import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Loader2, Play, Save, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listBillingRules, saveBillingRule } from "@/lib/billing-rules.functions";
import { runAutomaticBilling } from "@/lib/billing-automation.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/cobranca-automatica")({
  head: () => ({
    meta: [
      { title: "Cobrança automática — Sigma Control" },
      { name: "description", content: "Ligue o envio automático e escreva a mensagem de cada etapa da cobrança." },
      { property: "og:title", content: "Cobrança automática — Sigma Control" },
      { property: "og:description", content: "Ligue o envio automático e escreva a mensagem de cada etapa da cobrança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomaticBillingPage,
});

type EditableRule = {
  id?: string;
  offset_days: number;
  enabled: boolean;
  message_template: string;
};

function ruleLabel(days: number) {
  if (days === 0) return "No dia do vencimento";
  if (days < 0) return `${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"} antes`;
  return `${days} dia${days === 1 ? "" : "s"} depois`;
}

function RuleCard({ rule, onSaved }: { rule: EditableRule; onSaved: () => void }) {
  const saveRule = useServerFn(saveBillingRule);
  const [draft, setDraft] = useState(rule);

  useEffect(() => setDraft(rule), [rule]);

  const mutation = useMutation({
    mutationFn: async () => saveRule({
      data: {
        id: draft.id,
        offsetDays: draft.offset_days,
        enabled: draft.enabled,
        messageTemplate: draft.message_template,
      },
    }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Mensagem salva.");
        onSaved();
      } else {
        toast.error(result.error || "Não foi possível salvar a mensagem.");
      }
    },
    onError: () => toast.error("Não foi possível salvar a mensagem."),
  });

  return (
    <Card className="surface-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{ruleLabel(draft.offset_days)}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Use {"{nome}"}, {"{valor}"} e {"{vencimento}"} na mensagem.</p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))}
            aria-label={`Ativar aviso ${ruleLabel(draft.offset_days)}`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea
            value={draft.message_template}
            onChange={(event) => setDraft((current) => ({ ...current, message_template: event.target.value }))}
            rows={4}
          />
        </div>
        <Button className="w-full sm:w-auto" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar mensagem
        </Button>
      </CardContent>
    </Card>
  );
}

function AutomaticBillingPage() {
  const queryClient = useQueryClient();
  const loadRules = useServerFn(listBillingRules);
  const runNow = useServerFn(runAutomaticBilling);

  const query = useQuery({
    queryKey: ["billing-rules"],
    queryFn: async () => {
      const result = await loadRules({});
      return Array.isArray(result?.rules) ? result.rules : [];
    },
    retry: 1,
  });

  const settingsQuery = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
      return data;
    },
  });

  const settings = settingsQuery.data as any;
  const autoSend = settings?.auto_send_enabled ?? false;
  const trialReminder = settings?.trial_reminder_enabled ?? true;

  const toggleSetting = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("whatsapp_settings")
        .upsert({ user_id: auth.user!.id, ...patch } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferência salva.");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
    },
    onError: (error: Error) => toast.error(`Não foi possível salvar: ${error.message}`),
  });

  const executeNow = useMutation({
    mutationFn: async () => runNow({}),
    onSuccess: (result: any) => {
      if (result?.sent > 0) toast.success(`${result.sent} mensagem(ns) enviada(s) agora.`);
      else if (result?.failed > 0) toast.error("Nenhuma mensagem saiu. Verifique a conexão do WhatsApp.");
      else toast.info("Nenhum cliente se encaixa nas etapas hoje.");
    },
    onError: () => toast.error("Não foi possível executar a cobrança agora."),
  });

  const rules = Array.isArray(query.data) ? query.data : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Automação</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <BellRing className="size-6 text-primary" />
            Cobrança automática
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Tudo sobre cobrança fica aqui: ligar o envio, escolher as etapas e escrever cada mensagem. O sistema nunca repete a mesma etapa para o mesmo vencimento.
          </p>
        </div>
        <Button variant="outline" onClick={() => executeNow.mutate()} disabled={executeNow.isPending} className="gap-1.5">
          {executeNow.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Executar agora
        </Button>
      </div>

      <Card className="surface-card border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Zap className="size-4 text-primary" /> Envio automático</CardTitle>
          <CardDescription>Uma vez por dia o sistema confere os vencimentos e envia as mensagens ativadas abaixo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`flex items-center justify-between gap-3 rounded-md border p-3.5 transition-colors ${autoSend ? "border-primary/30 bg-primary/10" : "border-warning/40 bg-warning/10"}`}>
            <div>
              <p className="text-sm font-bold">Cobrar meus clientes automaticamente</p>
              <p className="text-xs text-muted-foreground">{autoSend ? "Ligado: as cobranças saem sozinhas todo dia." : "Desligado: nenhuma cobrança sai sozinha. Ligue para automatizar."}</p>
            </div>
            <Switch
              checked={autoSend}
              disabled={toggleSetting.isPending || settingsQuery.isLoading}
              onCheckedChange={(checked) => toggleSetting.mutate({ auto_send_enabled: checked })}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3.5">
            <div>
              <p className="text-sm font-bold">Avisar quem está em teste grátis</p>
              <p className="text-xs text-muted-foreground">Envia um convite para assinar pouco antes do teste expirar.</p>
            </div>
            <Switch
              checked={trialReminder}
              disabled={toggleSetting.isPending || settingsQuery.isLoading}
              onCheckedChange={(checked) => toggleSetting.mutate({ trial_reminder_enabled: checked })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Os dados de acesso e as boas-vindas ficam em{" "}
            <Link to="/mensagens" className="font-semibold text-primary underline-offset-2 hover:underline">Modelos de mensagem</Link>.
          </p>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-52 animate-pulse rounded-md bg-muted/60" />)}
        </div>
      ) : rules.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Não foi possível carregar as etapas agora.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rules.map((rule: any) => (
            <RuleCard
              key={rule.id || rule.offset_days}
              rule={rule}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["billing-rules"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

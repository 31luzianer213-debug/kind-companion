import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Clock,
  Sparkles,
  Server,
  MessageCircle,
  CreditCard,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Zap,
  Building,
  Bot,
  Download,
  Database,
  FileJson,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Ajustes & Automação — IPTV Manager Pro" },
      { name: "description", content: "Configurações gerais do sistema, régua de automação de cobranças e visão integrada de módulos." },
    ],
  }),
  component: ConfiguracoesPage,
});

type AutomationSettings = {
  business_name: string;
  reminder_days_before: number;
  send_on_due_day: boolean;
  overdue_reminder: boolean;
  auto_send_enabled: boolean;
};

const defaults: AutomationSettings = {
  business_name: "IPTV Manager Pro",
  reminder_days_before: 3,
  send_on_due_day: true,
  overdue_reminder: true,
  auto_send_enabled: true,
};

function ConfiguracoesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AutomationSettings>(defaults);
  const [exportingBackup, setExportingBackup] = useState(false);

  async function handleExportFullBackup() {
    setExportingBackup(true);
    try {
      // 1. Clientes
      const { data: clients } = await supabase.from("clients").select("*");
      // 2. Configurações WhatsApp
      const { data: wsSettings } = await supabase.from("whatsapp_settings").select("*");
      // 3. User metadata
      const { data: authUser } = await supabase.auth.getUser();

      const backupData = {
        version: "2.0",
        timestamp: new Date().toISOString(),
        exported_by: authUser?.user?.email || "admin",
        system: "IPTV Manager Pro",
        data: {
          clients: clients || [],
          whatsapp_settings: wsSettings || [],
          bot_settings: authUser?.user?.user_metadata?.bot_settings || null,
          sigma_settings: authUser?.user?.user_metadata?.sigma_settings || null,
        },
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_completo_iptv_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Backup completo (JSON) exportado com sucesso! 🛡️");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar backup dos dados.");
    } finally {
      setExportingBackup(false);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setForm({
        business_name: data.business_name ?? defaults.business_name,
        reminder_days_before: data.reminder_days_before ?? defaults.reminder_days_before,
        send_on_due_day: data.send_on_due_day ?? defaults.send_on_due_day,
        overdue_reminder: data.overdue_reminder ?? defaults.overdue_reminder,
        auto_send_enabled: data.auto_send_enabled ?? defaults.auto_send_enabled,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (values: AutomationSettings) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        user_id: auth.user!.id,
        business_name: values.business_name.trim(),
        reminder_days_before: Number(values.reminder_days_before || 3),
        send_on_due_day: values.send_on_due_day,
        overdue_reminder: values.overdue_reminder,
        auto_send_enabled: values.auto_send_enabled,
      };

      const { error } = await supabase
        .from("whatsapp_settings")
        .upsert(payload as any, { onConflict: "user_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajustes e regras de automação salvos com sucesso!");
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

  const hasSigma = Boolean(data?.sigma_url);
  const hasPix = Boolean(data?.pix_key);

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings className="size-6 text-primary" /> Ajustes Gerais & Automação
          </h1>
          <p className="text-sm text-muted-foreground">
            Defina o nome da sua revenda, horários e regras de envio do robô de cobrança automática.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-sm"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Salvar Ajustes
        </Button>
      </div>

      {/* Central de Módulos (Atalhos rápidos para as sessões dedicadas) */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Módulos Integrados do Sistema
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Link
            to="/sigma"
            className="group flex flex-col justify-between p-4 rounded-lg border border-border/60 bg-card/60 hover:bg-card hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-md bg-primary/10 text-primary border border-primary/20">
                <Server className="size-4" />
              </div>
              <Badge variant={hasSigma ? "success" : "secondary"} className="text-[10px]">
                {hasSigma ? "Configurado" : "Pendente"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                Painel Sigma
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Servidores, credenciais e renovação automática
              </p>
            </div>
            <div className="flex items-center justify-end text-xs font-semibold text-primary mt-3">
              <span>Gerenciar</span>
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            to="/whatsapp"
            className="group flex flex-col justify-between p-4 rounded-lg border border-border/60 bg-card/60 hover:bg-card hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <MessageCircle className="size-4" />
              </div>
              <Badge variant="success" className="text-[10px]">
                Conexão
              </Badge>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                WhatsApp
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                QR Code, conexão e disparo de teste
              </p>
            </div>
            <div className="flex items-center justify-end text-xs font-semibold text-primary mt-3">
              <span>Gerenciar</span>
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            to="/bot"
            className="group flex flex-col justify-between p-4 rounded-lg border border-border/60 bg-card/60 hover:bg-card hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Bot className="size-4" />
              </div>
              <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10 text-[10px]">
                24h Ativo
              </Badge>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                Robô WhatsApp
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Auto-atendimento, testes grátis e PIX no chat
              </p>
            </div>
            <div className="flex items-center justify-end text-xs font-semibold text-primary mt-3">
              <span>Gerenciar</span>
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            to="/pagamentos"
            className="group flex flex-col justify-between p-4 rounded-lg border border-border/60 bg-card/60 hover:bg-card hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CreditCard className="size-4" />
              </div>
              <Badge variant={hasPix ? "success" : "secondary"} className="text-[10px]">
                {hasPix ? "PIX Ativo" : "Configurar"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                Pagamentos
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Chave PIX, Mercado Pago e Asaas
              </p>
            </div>
            <div className="flex items-center justify-end text-xs font-semibold text-primary mt-3">
              <span>Gerenciar</span>
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            to="/mensagens"
            className="group flex flex-col justify-between p-4 rounded-lg border border-border/60 bg-card/60 hover:bg-card hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Sparkles className="size-4" />
              </div>
              <Badge variant="outline" className="text-[10px]">
                Modelos
              </Badge>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                Mensagens
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Modelos de cobrança e aviso de vencimento
              </p>
            </div>
            <div className="flex items-center justify-end text-xs font-semibold text-primary mt-3">
              <span>Gerenciar</span>
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seção: Identificação da Revenda */}
        <Card className="surface-card border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="size-4 text-primary" /> Identificação do Negócio
            </CardTitle>
            <CardDescription>
              Nome que aparecerá no cabeçalho das mensagens e faturas para seus clientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 max-w-md">
              <Label className="text-xs font-semibold">Nome da Sua Revenda / Empresa</Label>
              <Input
                type="text"
                placeholder="Ex: IPTV Turbo Brasil ou CinePlay 4K"
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className="rounded-xl text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Seção: Robô de Cobrança Automática */}
        <Card className="surface-card border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4 text-primary" /> Régua de Cobrança & Automação
            </CardTitle>
            <CardDescription>
              Defina quando o robô deve enviar mensagens automáticas de cobrança aos assinantes via WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Chave Mestre de Envio Automático */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-primary/30 bg-primary/10">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Zap className="size-4 text-primary" />
                  Envio Automático do Robô Ativado
                </p>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, o sistema verifica diariamente as faturas e dispara os lembretes automaticamente.
                </p>
              </div>
              <Switch
                checked={form.auto_send_enabled}
                onCheckedChange={(checked) => setForm({ ...form, auto_send_enabled: checked })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3 pt-2">
              {/* Lembrete Prévio */}
              <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-muted/20">
                <Label className="text-xs font-semibold">Dias Antes do Vencimento</Label>
                <Input
                  type="number"
                  min="1"
                  max="15"
                  value={form.reminder_days_before}
                  onChange={(e) => setForm({ ...form, reminder_days_before: Number(e.target.value) })}
                  className="rounded-xl font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Enviar lembrete preventivo X dias antes da data de corte.
                </p>
              </div>

              {/* No Dia do Vencimento */}
              <div className="flex flex-col justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Aviso no Dia do Vencimento</p>
                  <p className="text-[11px] text-muted-foreground">
                    Dispara lembrete na manhã do dia do vencimento.
                  </p>
                </div>
                <div className="pt-2 flex justify-end">
                  <Switch
                    checked={form.send_on_due_day}
                    onCheckedChange={(checked) => setForm({ ...form, send_on_due_day: checked })}
                  />
                </div>
              </div>

              {/* Lembrete Pós-Vencimento (Atraso) */}
              <div className="flex flex-col justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Cobrança de Atraso</p>
                  <p className="text-[11px] text-muted-foreground">
                    Alerta o cliente se a fatura vencer sem confirmação de pagamento.
                  </p>
                </div>
                <div className="pt-2 flex justify-end">
                  <Switch
                    checked={form.overdue_reminder}
                    onCheckedChange={(checked) => setForm({ ...form, overdue_reminder: checked })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border/50">
              <Button
                type="submit"
                disabled={save.isPending}
                className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-md px-6"
              >
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Salvar Ajustes & Automação
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Seção: Backup & Segurança Geral */}
        <Card className="surface-card border-border/60">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="size-4 text-emerald-400" /> Backup Completo & Segurança dos Dados
                </CardTitle>
                <CardDescription className="text-xs">
                  Gere um instantâneo JSON contendo seus clientes, credenciais IPTV, regras do robô e configurações.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-xs self-start sm:self-auto">
                🛡️ 100% Grátis & Ilimitado
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileJson className="size-3.5 text-primary" /> Arquivo de Backup Estruturado (.json)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Compatível com restauração rápida ou importação em qualquer banco de dados relacional.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleExportFullBackup}
                disabled={exportingBackup}
                className="gap-2 text-xs font-semibold rounded-xl border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 shrink-0"
              >
                {exportingBackup ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                {exportingBackup ? "Exportando..." : "Exportar Backup Completo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

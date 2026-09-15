import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, CheckCircle2, Loader2, Server, ShieldCheck, Zap } from "lucide-react";
import {
  getResellerTrialServerSettings,
  setResellerTrialServer,
} from "@/lib/reseller-settings.functions";

function TrialServerSelector() {
  const qc = useQueryClient();
  const getSettings = useServerFn(getResellerTrialServerSettings);
  const setServer = useServerFn(setResellerTrialServer);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["reseller-trial-server-settings"],
    queryFn: () => getSettings({}),
    staleTime: 20_000,
  });

  const servers = Array.isArray(data?.servers) ? data.servers : [];
  const selectedId = selected || data?.selectedServerId || "";
  const selectedServer = servers.find((server: any) => server.id === selectedId);

  async function save() {
    if (!selectedId) {
      toast.error("Cadastre e escolha um servidor Sigma para os testes.");
      return;
    }
    setSaving(true);
    try {
      const result = await setServer({ data: { serverId: selectedId } });
      if (!result?.ok) throw new Error(result?.error || "Não foi possível salvar o servidor de testes.");
      toast.success(`${result.serverName} definido como servidor dos testes do robô.`);
      setSelected(result.selectedServerId || selectedId);
      qc.invalidateQueries({ queryKey: ["reseller-trial-server-settings"] });
      qc.invalidateQueries({ queryKey: ["bot-settings"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar servidor de testes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="surface-card border-primary/25 bg-primary/5 mb-6">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Bot className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">Servidor padrão para testes do Robô WhatsApp</h2>
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  Opção 1 do bot
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Escolha em qual Sigma os testes automáticos serão criados. O cliente não escolhe servidor: você define uma vez e o robô usa esse servidor em todos os novos testes.
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[430px]">
            <Select value={selectedId} onValueChange={setSelected} disabled={isLoading || saving || servers.length === 0}>
              <SelectTrigger className="w-full rounded-xl sm:flex-1">
                <SelectValue placeholder={isLoading ? "Carregando servidores..." : "Escolha o servidor Sigma"} />
              </SelectTrigger>
              <SelectContent>
                {servers.map((server: any) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}{server.streaming_dns ? ` • ${server.streaming_dns}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={save} disabled={saving || isLoading || !selectedId} className="rounded-xl gap-2 whitespace-nowrap">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Usar nos testes
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {servers.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-amber-500">
              <Server className="size-3.5" /> Nenhum servidor Sigma ativo cadastrado. Adicione um servidor na área Sigma primeiro.
            </span>
          ) : selectedServer ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Server className="size-3.5 text-primary" /> Selecionado: <strong className="text-foreground">{selectedServer.name}</strong>
              </span>
              {selectedServer.streaming_dns ? (
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="size-3.5 text-primary" /> DNS: {selectedServer.streaming_dns}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function BillingAutomationNotice() {
  return (
    <Card className="surface-card border-emerald-500/25 bg-emerald-500/5 mb-6">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-foreground">Cobranças trabalham no automático</h2>
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">Monitor financeiro</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Use esta tela principalmente para acompanhar pendências, atrasos, pagamentos e falhas. Cobrar manualmente, reenviar mensagem ou dar baixa ficam como ações de exceção quando você realmente precisar intervir.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ResellerContextEnhancements() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname === "/bot") return <TrialServerSelector />;
  if (pathname === "/cobrancas") return <BillingAutomationNotice />;
  return null;
}

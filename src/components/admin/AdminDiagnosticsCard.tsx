import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runLaunchDiagnostics, type CheckArea, type CheckStatus } from "@/lib/diagnostics.functions";
import { cn } from "@/lib/utils";

const AREA_LABEL: Record<CheckArea, string> = {
  recebimento: "Recebimento",
  assinaturas: "Assinaturas",
  whatsapp: "WhatsApp",
  automacao: "Automação",
  dados: "Banco de dados",
};

const STATUS_STYLE: Record<CheckStatus, { icon: typeof CheckCircle2; tone: string; label: string }> = {
  ok: { icon: CheckCircle2, tone: "text-success", label: "OK" },
  warn: { icon: AlertTriangle, tone: "text-warning", label: "Atenção" },
  fail: { icon: XCircle, tone: "text-destructive", label: "Falha" },
};

export function AdminDiagnosticsCard() {
  const fn = useServerFn(runLaunchDiagnostics);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => fn({}),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const checks = data?.checks ?? [];
  const counts = data?.counts ?? { ok: 0, warn: 0, fail: 0 };
  const score = data?.score ?? 0;

  return (
    <Card className="surface-card border-border/70" data-testid="admin-diagnostics">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Testes de lançamento</CardTitle>
            <CardDescription className="mt-1">
              Confere de verdade cada peça que precisa estar no ar para vender assinaturas sem liberar ninguém na mão.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={isFetching}
            onClick={() => refetch()}
            data-testid="admin-diagnostics-refresh"
          >
            {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Rodar de novo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {isLoading ? (
          <div className="grid min-h-[16vh] place-items-center">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : !data?.ok ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {data?.error ?? "Não foi possível rodar os testes agora."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-2xl font-bold tabular-nums text-foreground">{score}%</p>
              <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", counts.fail ? "bg-destructive" : counts.warn ? "bg-warning" : "bg-success")}
                  style={{ width: `${score}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                <Badge variant="success" className="text-[10px]">{counts.ok} ok</Badge>
                {counts.warn > 0 && <Badge variant="secondary" className="text-[10px]">{counts.warn} atenção</Badge>}
                {counts.fail > 0 && <Badge variant="destructive" className="text-[10px]">{counts.fail} falha(s)</Badge>}
              </div>
            </div>

            <div className="space-y-3">
              {(Object.keys(AREA_LABEL) as CheckArea[]).map((area) => {
                const items = checks.filter((check) => check.area === area);
                if (!items.length) return null;
                return (
                  <div key={area} className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{AREA_LABEL[area]}</p>
                    <div className="divide-y divide-border/60 rounded-md border border-border/60">
                      {items.map((check) => {
                        const style = STATUS_STYLE[check.status];
                        const Icon = style.icon;
                        return (
                          <div key={check.id} className="flex items-start gap-2.5 p-3">
                            <Icon className={cn("mt-0.5 size-4 shrink-0", style.tone)} />
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                                {check.label}
                                <span className={cn("text-[10px] font-bold uppercase tracking-wide", style.tone)}>{style.label}</span>
                              </p>
                              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
                              {check.action && (
                                <p className="mt-1 rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[11px] font-medium text-foreground">
                                  {check.action}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Última verificação: {new Date(data.generatedAt).toLocaleString("pt-BR")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

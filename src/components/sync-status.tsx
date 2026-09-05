import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getSigmaConfig } from "@/lib/sigma.config";
import { syncSigmaClients } from "@/lib/sigma.sync";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  RefreshCw, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  Zap,
  ZapOff,
  Users
} from "lucide-react";

interface SyncStatusProps {
  onSyncComplete?: (result: any) => void;
  compact?: boolean;
}

export function SyncStatus({ onSyncComplete, compact = false }: SyncStatusProps) {
  const [config, setConfig] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const cfg = await getSigmaConfig();
    setConfig(cfg);
  };

  const handleSync = async () => {
    if (!config) {
      toast.error("Configure o painel Sigma primeiro");
      return;
    }

    setSyncing(true);

    try {
      const result = await syncSigmaClients();
      
      if (result.success) {
        toast.success(result.message, {
          description: result.details 
            ? `${result.details.newClients.length} novos, ${result.details.updatedClients.length} atualizados`
            : undefined,
        });
        setLastSync(new Date());
        onSyncComplete?.(result);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro na sincronização");
    } finally {
      setSyncing(false);
    }
  };

  if (!config) {
    return null;
  }

  if (compact) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={syncing}
      >
        {syncing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        <span className="ml-2">Sincronizar Sigma</span>
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card text-card-foreground p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          <span className="font-medium">Sincronização Sigma</span>
        </div>
        <Badge variant={config ? "default" : "secondary"}>
          {config ? (
            <>
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Conectado
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3 mr-1" />
              Não configurado
            </>
          )}
        </Badge>
      </div>

      {/* Info */}
      <div className="text-sm text-muted-foreground space-y-1">
        <p className="flex items-center gap-2">
          <span className="text-foreground font-medium">{config.sigma_url}</span>
        </p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            {config.auto_renew_on_payment ? (
              <Zap className="w-3 h-3 text-green-500" />
            ) : (
              <ZapOff className="w-3 h-3 text-muted-foreground" />
            )}
            Renovação auto: {config.auto_renew_on_payment ? "Sim" : "Não"}
          </span>
          {lastSync && (
            <span className="text-xs">
              Última: {lastSync.toLocaleTimeString("pt-BR")}
            </span>
          )}
        </div>
      </div>

      {/* Sync Button */}
      <Button
        onClick={handleSync}
        disabled={syncing}
        className="w-full"
      >
        {syncing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sincronizando...
          </>
        ) : (
          <>
            <Users className="w-4 h-4" />
            <span className="ml-2">Sincronizar Clientes do Sigma</span>
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Busca clientes no painel Sigma e cria/atualiza aqui
      </p>
    </div>
  );
}

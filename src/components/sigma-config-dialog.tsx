import { useState } from "react";
import { toast } from "sonner";
import { 
  saveSigmaConfig, 
  testSigmaConnection, 
  deleteSigmaConfig, 
  getSigmaConfig 
} from "@/lib/sigma.config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Settings, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Trash2,
  RefreshCw,
  Zap
} from "lucide-react";

interface SigmaConfigDialogProps {
  onConfigSaved?: () => void;
  trigger?: React.ReactNode;
}

export function SigmaConfigDialog({ onConfigSaved, trigger }: SigmaConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Form state
  const [sigmaUrl, setSigmaUrl] = useState("");
  const [sigmaToken, setSigmaToken] = useState("");
  const [autoSync, setAutoSync] = useState(false);
  const [autoRenew, setAutoRenew] = useState(true);
  const [syncInterval, setSyncInterval] = useState("24");
  
  // Test result
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    resellerInfo?: { name: string; email: string };
  } | null>(null);

  // Load existing config on open
  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const config = await getSigmaConfig();
      if (config) {
        setSigmaUrl(config.sigma_url);
        setSigmaToken(config.sigma_token);
        setAutoSync(config.auto_sync);
        setAutoRenew(config.auto_renew_on_payment);
        setSyncInterval(String(config.sync_interval_hours));
      }
      setTestResult(null);
    }
  };

  // Test connection
  const handleTest = async () => {
    if (!sigmaUrl || !sigmaToken) {
      toast.error("Preencha a URL e o Token");
      return;
    }

    setTesting(true);
    setTestResult(null);

    const result = await testSigmaConnection({
      sigma_url: sigmaUrl,
      sigma_token: sigmaToken,
    });

    setTestResult(result);
    setTesting(false);

    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  // Save config
  const handleSave = async () => {
    if (!sigmaUrl || !sigmaToken) {
      toast.error("Preencha a URL e o Token");
      return;
    }

    setLoading(true);

    const result = await saveSigmaConfig(
      { sigma_url: sigmaUrl, sigma_token: sigmaToken },
      {
        auto_sync: autoSync,
        auto_renew_on_payment: autoRenew,
        sync_interval_hours: parseInt(syncInterval),
      }
    );

    setLoading(false);

    if (result.success) {
      toast.success("Configurações do Sigma salvas!");
      setOpen(false);
      onConfigSaved?.();
    } else {
      toast.error(result.error || "Erro ao salvar configuração");
    }
  };

  // Delete config
  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja remover a integração com o Sigma?")) {
      return;
    }

    setDeleting(true);

    const result = await deleteSigmaConfig();

    setDeleting(false);

    if (result.success) {
      toast.success("Integração removida");
      setSigmaUrl("");
      setSigmaToken("");
      setTestResult(null);
      onConfigSaved?.();
    } else {
      toast.error(result.error || "Erro ao remover configuração");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configurar Sigma
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Integração com Painel Sigma
          </DialogTitle>
          <DialogDescription>
            Conecte sua conta de revenda do painel IPTV Sigma para sincronizar clientes e renovar automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* URL do Painel */}
          <div className="space-y-2">
            <Label htmlFor="sigma-url">URL do Painel</Label>
            <Input
              id="sigma-url"
              placeholder="https://seupainel.sigma.st"
              value={sigmaUrl}
              onChange={(e) => setSigmaUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Endereço do seu painel de revenda Sigma
            </p>
          </div>

          {/* Token API */}
          <div className="space-y-2">
            <Label htmlFor="sigma-token">Token / Chave de API</Label>
            <Input
              id="sigma-token"
              type="password"
              placeholder="Cole seu token aqui"
              value={sigmaToken}
              onChange={(e) => setSigmaToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Encontre em: Configurações → API do seu painel Sigma
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg flex items-start gap-2 ${
              testResult.success 
                ? "bg-green-500/10 border border-green-500/20" 
                : "bg-red-500/10 border border-red-500/20"
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  testResult.success ? "text-green-500" : "text-red-500"
                }`}>
                  {testResult.success ? "Conexão OK!" : "Falha na conexão"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {testResult.message}
                </p>
                {testResult.resellerInfo && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {testResult.resellerInfo.name}
                    </Badge>
                    {testResult.resellerInfo.email && (
                      <span className="text-xs text-muted-foreground">
                        {testResult.resellerInfo.email}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Opções Avançadas */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Opções Avançadas</h4>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-renew" className="text-sm">
                  Renovar automaticamente ao pagar
                </Label>
                <p className="text-xs text-muted-foreground">
                  Quando uma cobrança for marcada como paga, renova no Sigma
                </p>
              </div>
              <Switch
                id="auto-renew"
                checked={autoRenew}
                onCheckedChange={setAutoRenew}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-sync" className="text-sm">
                  Sincronização automática
                </Label>
                <p className="text-xs text-muted-foreground">
                  Sincroniza clientes do Sigma periodicamente
                </p>
              </div>
              <Switch
                id="auto-sync"
                checked={autoSync}
                onCheckedChange={setAutoSync}
              />
            </div>

            {autoSync && (
              <div className="space-y-2">
                <Label htmlFor="sync-interval">Intervalo de sincronização</Label>
                <Select value={syncInterval} onValueChange={setSyncInterval}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">A cada 6 horas</SelectItem>
                    <SelectItem value="12">A cada 12 horas</SelectItem>
                    <SelectItem value="24">A cada 24 horas</SelectItem>
                    <SelectItem value="48">A cada 2 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {sigmaUrl && sigmaToken && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing}
              className="flex-1 sm:flex-none"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-2">Testar Conexão</span>
            </Button>
          )}
          
          <div className="flex gap-2 w-full sm:w-auto">
            {sigmaUrl && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            )}
            
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              <span className="ml-2">Salvar</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

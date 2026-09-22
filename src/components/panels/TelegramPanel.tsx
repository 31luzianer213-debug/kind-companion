import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, CheckCircle2, AlertCircle, Link2Off, Loader2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getTelegramConnection,
  connectTelegramBot,
  disconnectTelegramBot,
  toggleTelegramBot,
  testTelegramBot,
} from "@/lib/telegram.functions";

export function TelegramPanel() {
  const queryClient = useQueryClient();
  const getConnection = useServerFn(getTelegramConnection);
  const connect = useServerFn(connectTelegramBot);
  const disconnect = useServerFn(disconnectTelegramBot);
  const toggle = useServerFn(toggleTelegramBot);
  const test = useServerFn(testTelegramBot);

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["telegram-connection"],
    queryFn: () => getConnection(),
    refetchInterval: 30000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["telegram-connection"] });

  const handleConnect = async () => {
    if (!token.trim()) {
      toast.error("Cole o token que o @BotFather enviou para você.");
      return;
    }
    setBusy("connect");
    try {
      const res = await connect({ data: { token: token.trim() } });
      if (res.ok) {
        setToken("");
        toast.success("Telegram conectado! Seu robô já responde por lá.");
        refresh();
      } else {
        toast.error(res.error);
      }
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível conectar o Telegram.");
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      await disconnect();
      toast.success("Telegram desconectado.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao desconectar.");
    } finally {
      setBusy(null);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setBusy("toggle");
    try {
      await toggle({ data: { enabled } });
      toast.success(enabled ? "Atendimento no Telegram ligado." : "Atendimento no Telegram pausado.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao alterar.");
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    try {
      const res = await test({ data: {} });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (e: any) {
      toast.error(e?.message || "Falha no teste.");
    } finally {
      setBusy(null);
    }
  };

  const connected = Boolean(status?.connected);

  return (
    <Card className="surface-card border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Send className="size-4 text-primary" /> Atendimento pelo Telegram
          </CardTitle>
          {connected ? (
            <Badge variant="success" className="gap-1 text-[11px]">
              <CheckCircle2 className="size-3" /> Conectado{status?.botUsername ? ` · @${status.botUsername}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground">
              <AlertCircle className="size-3" /> Não conectado
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          O mesmo robô do WhatsApp também responde no Telegram: teste grátis, planos, renovação com Pix e reenvio de acesso.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!connected && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Como pegar seu token:</strong> no Telegram, abra a conversa com o{" "}
            <span className="font-semibold text-foreground">@BotFather</span>, envie <em>/newbot</em>, escolha um nome e
            um usuário para o seu robô e copie o código que ele responde.
          </div>
        )}

        {connected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Power className="size-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Responder mensagens no Telegram</p>
                  <p className="text-[11px] text-muted-foreground">Desligue para pausar sem desconectar.</p>
                </div>
              </div>
              <Switch
                checked={status?.enabled !== false}
                disabled={busy === "toggle"}
                onCheckedChange={handleToggle}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleTest} disabled={busy === "test"} className="gap-2">
                {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Enviar teste
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisconnect}
                disabled={busy === "disconnect"}
                className="gap-2 text-destructive"
              >
                {busy === "disconnect" ? <Loader2 className="size-4 animate-spin" /> : <Link2Off className="size-4" />}
                Desconectar
              </Button>
            </div>

            {status?.botUsername && (
              <p className="text-[11px] text-muted-foreground">
                Divulgue para seus clientes: t.me/{status.botUsername}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="telegram-token" className="text-xs">
              Token do seu robô
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="telegram-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AAE..."
                autoComplete="off"
                className="font-mono text-xs"
              />
              <Button onClick={handleConnect} disabled={busy === "connect"} className="gap-2 sm:w-44">
                {busy === "connect" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Conectar
              </Button>
            </div>
            {status?.lastError && <p className="text-[11px] text-destructive">{status.lastError}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

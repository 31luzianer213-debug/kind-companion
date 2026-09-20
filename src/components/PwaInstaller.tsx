import { useEffect, useMemo, useState } from "react";
import { Download, Share2, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function PwaInstaller() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isIos = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    setInstalled(isStandalone());
    try {
      setDismissed(sessionStorage.getItem("pwa-install-dismissed") === "1");
    } catch {}

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.warn("[PWA] Falha ao registrar service worker:", error);
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || dismissed) return null;
  if (!installPrompt && !isIos) return null;

  async function install() {
    if (isIos && !installPrompt) {
      setShowIosHelp(true);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setInstallPrompt(null);
  }

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem("pwa-install-dismissed", "1");
    } catch {}
  }

  return (
    <div className="fixed inset-x-3 bottom-[5.5rem] z-[60] md:bottom-5 md:left-auto md:right-5 md:w-[390px]">
      <div className="rounded-2xl border border-border/70 bg-background/95 p-3.5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-foreground">Instalar Sigma Control</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Use o painel como aplicativo, direto da tela inicial do celular.
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Fechar aviso de instalação"
              >
                <X className="size-4" />
              </button>
            </div>

            {showIosHelp ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/35 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">No iPhone:</p>
                <p className="mt-1 flex items-center gap-1.5">
                  <Share2 className="size-3.5" /> Toque em Compartilhar e depois em <strong>Adicionar à Tela de Início</strong>.
                </p>
              </div>
            ) : null}

            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={install} className="h-9 flex-1 gap-1.5 rounded-xl font-semibold">
                {isIos && !installPrompt ? <Share2 className="size-4" /> : <Download className="size-4" />}
                {isIos && !installPrompt ? "Como instalar" : "Instalar app"}
              </Button>
              <Button size="sm" variant="outline" onClick={dismiss} className="h-9 rounded-xl px-3">
                Agora não
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

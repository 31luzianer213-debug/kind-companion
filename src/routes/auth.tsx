import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import logo from "@/assets/logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  ShieldCheck,
  User,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — IPTV Manager" },
      { name: "description", content: "Acesse o painel de clientes, listas IPTV e cobranças." },
      { property: "og:title", content: "Entrar — IPTV Manager" },
      { property: "og:description", content: "Acesse seu painel de gestão de IPTV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState("login");
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    (async () => {
      // Quando o usuário clica no link de confirmação do e-mail, o Supabase
      // devolve para /auth com ?code=... — troca pelo session de verdade.
      const url = new URL(window.location.href);
      if (url.searchParams.has("code")) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        // Limpa o ?code= da URL para não tentar trocar de novo no refresh.
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        if (!error) {
          toast.success("E-mail confirmado! Bem-vindo ao painel.");
          navigate({ to: "/painel" });
          return;
        }
        // Se a troca falhar (link expirado etc.), cai para o fluxo normal abaixo.
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/painel" });
    })();
  }, [navigate]);

  function goToTab(tabName: string) {
    setTab(tabName);
  }

  function dismissPending() {
    setPendingConfirmEmail(null);
    setTab("login");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      const needsConfirm =
        code === "email_not_confirmed" || /confirm|verif/i.test(error.message);
      if (needsConfirm) {
        setPendingConfirmEmail(email);
        toast.error("Confirme seu e-mail antes de entrar. Enviamos um novo link agora.");
        void resendConfirmation(email);
        return;
      }
      toast.error(error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/painel" });
  }

  async function resendConfirmation(targetEmail = email) {
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      toast.error("Digite um e-mail válido para reenviar a confirmação.");
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: targetEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setResending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Link de confirmação reenviado para ${targetEmail}.`);
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { display_name: name },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setPendingConfirmEmail(email);
      toast.success(`Conta criada! Confirme o e-mail que enviamos para ${email}.`);
      return;
    }
    toast.success("Conta criada com sucesso!");
    navigate({ to: "/painel" });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/painel" });
  }

  return (
    <main className="relative flex min-h-screen min-h-dvh flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 app-aurora opacity-60" />
      <header className="relative flex shrink-0 items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-sm font-bold"><img src={logo} alt="IPTV Manager" width={32} height={32} className="h-8 w-8" /> IPTV Manager</Link>
        <div className="flex items-center gap-2"><Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Início</Link><ThemeToggle /></div>
      </header>
      <div className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-[420px] min-w-0 rounded-2xl border bg-card p-6 shadow-lg sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <img src={logo} alt="IPTV Manager" width={48} height={48} className="h-12 w-12" />
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight">{tab === "login" ? "Bem-vindo de volta" : "Crie sua conta"}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{tab === "login" ? "Entre para acessar o painel." : "Comece em menos de 1 minuto."}</p>
          </div>
            <Tabs value={tab} onValueChange={goToTab} className="w-full">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted p-1">
                <TabsTrigger value="login" className="rounded-lg text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm">Criar conta</TabsTrigger>
              </TabsList>

              {pendingConfirmEmail && (
                <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                  <MailCheck className="h-4 w-4" />
                  <AlertTitle className="flex items-center gap-1.5 text-sm font-bold">
                    <AlertCircle className="h-4 w-4" /> E-mail não confirmado
                  </AlertTitle>
                  <AlertDescription className="mt-1 space-y-3 text-[13px] leading-relaxed">
                    <p>
                      Enviamos um link de confirmação para <strong>{pendingConfirmEmail}</strong>. Abra seu e-mail e clique
                      no link para liberar o acesso, depois volte aqui e entre normalmente.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-xl bg-card text-xs font-bold"
                        disabled={resending}
                        onClick={() => resendConfirmation(pendingConfirmEmail)}
                      >
                        {resending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reenviando...
                          </>
                        ) : (
                          <>
                            <Mail className="h-3.5 w-3.5" /> Reenviar e-mail
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 rounded-xl text-xs font-semibold"
                        onClick={dismissPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Já confirmei, ir para login
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <TabsContent value="login" className="mt-6">
                <form onSubmit={signIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">E-mail</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="email" type="email" required autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl bg-card pl-10 text-sm shadow-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => toast.info("Entre em contato com o suporte para redefinir sua senha.")}>Esqueceu a senha?</button>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="password" type={showPass ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl bg-card pl-10 pr-10 text-sm shadow-sm" />
                      <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    </div>
                  </div>
                  <Button type="submit" className="h-11 w-full rounded-xl text-sm font-bold shadow-md shadow-primary/20" disabled={loading}>{loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Entrando...</> : "Entrar no painel"}</Button>
                  <p className="text-center text-xs text-muted-foreground">Protegido <ShieldCheck className="inline h-3 w-3" /></p>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={signUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">Seu nome</Label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="name" required autoComplete="name" placeholder="Ex: João Silva" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl bg-card pl-10 text-sm shadow-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2" className="text-sm font-medium">E-mail</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="email2" type="email" required autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl bg-card pl-10 text-sm shadow-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2" className="text-sm font-medium">Crie uma senha</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="password2" type={showPass ? "text" : "password"} required minLength={6} autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl bg-card pl-10 pr-10 text-sm shadow-sm" />
                      <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    </div>
                    <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
                  </div>
                  <Button type="submit" className="h-11 w-full rounded-xl text-sm font-bold shadow-md shadow-primary/20" disabled={loading}>{loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : "Criar minha conta"}</Button>
                </form>
              </TabsContent>
            </Tabs>
            <div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">ou</span><span className="h-px flex-1 bg-border" /></div>
            <Button variant="outline" className="h-11 w-full rounded-xl bg-card text-sm font-semibold shadow-sm" onClick={google}>
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continuar com o Google
            </Button>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {tab === "login" ? <>Ainda não tem conta? <button type="button" onClick={() => goToTab("signup")} className="font-semibold text-primary hover:underline">Criar conta</button></> : <>Já tem conta? <button type="button" onClick={() => goToTab("login")} className="font-semibold text-primary hover:underline">Entrar</button></>}
            </p>
        </div>
      </div>
      <p className="shrink-0 px-4 pb-6 text-center text-xs text-muted-foreground sm:px-6">© {new Date().getFullYear()} IPTV Manager</p>
    </main>
  );
}

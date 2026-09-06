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
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
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
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      if (url.searchParams.has("code")) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        if (!error) {
          toast.success("E-mail confirmado! Bem-vindo ao painel.");
          navigate({ to: "/painel" });
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/painel" });
    })();
  }, [navigate]);

  function goToTab(tabName: string) {
    setTab(tabName);
  }

  function handleOtpChange(value: string) {
    setOtp(value.replace(/\D/g, "").slice(0, 6));
  }

  function dismissPending() {
    setPendingConfirmEmail(null);
    setTab("login");
  }

  async function verifyOTP(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6 || !pendingConfirmEmail) return;

    setVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: pendingConfirmEmail,
      token: otp,
      type: "signup" as any,
    });
    setVerifying(false);

    if (error) {
      if (error.message.includes("Token has expired") || error.message.includes("Invalid")) {
        toast.error("Código inválido ou expirado. Tente novamente.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    // Recarrega a sessão do usuário e atualiza o estado do app após confirmação
    await supabase.auth.refreshSession();
    const { data: { session } } = await supabase.auth.getSession();

    if (data.session || session) {
      toast.success("E-mail confirmado com sucesso!");
      navigate({ to: "/painel" });
    } else {
      toast.success("E-mail confirmado! Agora você pode acessar sua conta.");
      setPendingConfirmEmail(null);
      setTab("login");
    }
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
        toast.error("Confirme seu e-mail antes de entrar. Se necessário, digite o código recém-enviado.");
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
    toast.success(`Novo código de confirmação enviado para ${targetEmail}.`);
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
      toast.success(`Conta criada! Enviamos um código para ${email}.`);
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
    <main className="relative flex min-h-screen bg-background text-foreground">
      {/* Banner Esquerdo (Desktop) */}
      <div className="hidden lg:flex w-1/2 relative flex-col justify-between overflow-hidden bg-zinc-950 p-12 text-white">
        <div className="absolute inset-0 bg-primary/20 pointer-events-none" />
        <div className="absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[140px]" />

        <div className="relative z-10 flex items-center gap-3 text-xl font-bold">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 p-2 backdrop-blur-sm border border-white/20">
            <img src={logo} alt="IPTV Manager" className="h-full w-full object-contain" />
          </div>
          IPTV Manager
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <h2 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            Sua operação de IPTV <br /> mais inteligente.
          </h2>
          <p className="text-lg text-zinc-300">
            Gerencie clientes, configure listas e automatize cobranças pelo WhatsApp 
            para focar no que importa: crescer de forma escalável.
          </p>
          <div className="flex items-center gap-4 text-sm font-medium text-zinc-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Ambiente Seguro
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Cobrança Automatizada
            </span>
          </div>
        </div>
      </div>

      {/* Painel Direito (Login/Signup/OTP) */}
      <div className="flex w-full flex-col lg:w-1/2 p-6 sm:p-10">
        <header className="flex items-center justify-between mb-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> 
            <span className="hidden sm:inline">Voltar ao Início</span>
          </Link>
          <div className="flex items-center gap-4">
            <img src={logo} alt="IPTV Manager" className="h-8 w-8 lg:hidden" />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex w-full flex-1 flex-col items-center justify-center pt-8 pb-12">
          <div className="w-full max-w-[400px]">
            {pendingConfirmEmail ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
                <div className="mb-6 flex flex-col space-y-2 text-center sm:text-left">
                  <h1 className="text-3xl font-extrabold tracking-tight">Confirme seu e-mail</h1>
                  <p className="text-sm text-muted-foreground">
                    Enviamos um código de 6 dígitos para o e-mail <br className="hidden sm:block" />
                    <strong className="font-semibold text-foreground">{pendingConfirmEmail}</strong>.
                  </p>
                </div>

                <form onSubmit={verifyOTP} className="space-y-6">
                  <div className="flex flex-col space-y-3">
                    <Label className="font-medium text-center sm:text-left text-foreground">
                      Digite o código de 6 dígitos
                    </Label>
                    <div className="flex justify-center sm:justify-start">
                      <InputOTP maxLength={6} value={otp} onChange={handleOtpChange} disabled={verifying}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button type="submit" className="h-12 flex-1 rounded-xl font-bold shadow-md" disabled={verifying || otp.length < 6}>
                      {verifying ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando...</>
                      ) : (
                        <><MailCheck className="mr-2 h-4 w-4" /> Verificar código</>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 flex-1 sm:flex-none px-6 rounded-xl border-border bg-background hover:bg-muted"
                      disabled={resending}
                      onClick={() => resendConfirmation(pendingConfirmEmail)}
                    >
                      {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reenviar"}
                    </Button>
                  </div>

                  <div className="text-center sm:text-left mt-2">
                    <button type="button" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline" onClick={dismissPending}>
                      Voltar para o login
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
                <div className="mb-8 flex flex-col space-y-2 text-center sm:text-left">
                  <h1 className="text-3xl font-extrabold tracking-tight">
                    {tab === "login" ? "Acessar Plataforma" : "Criar sua conta"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {tab === "login" 
                      ? "Insira seus dados para entrar no painel e gerenciar seu negócio." 
                      : "Preencha os dados abaixo e comece a escalar suas vendas em instantes."}
                  </p>
                </div>

                <Tabs value={tab} onValueChange={goToTab} className="w-full">
                  <TabsList className="grid h-12 w-full grid-cols-2 rounded-xl bg-muted p-1 mb-6">
                    <TabsTrigger value="login" className="rounded-lg font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      Acesso
                    </TabsTrigger>
                    <TabsTrigger value="signup" className="rounded-lg font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      Cadastro
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="login" className="space-y-5">
                    <form onSubmit={signIn} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="font-medium">E-mail de acesso</Label>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input 
                            id="email" type="email" required autoComplete="email" placeholder="seu@email.com" 
                            value={email} onChange={(e) => setEmail(e.target.value)} 
                            className="h-12 rounded-xl pl-10" 
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password" className="font-medium">Senha</Label>
                          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => toast.info("Entre em contato com o suporte para redefinir sua senha.")}>
                            Esqueceu a senha?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input 
                            id="password" type={showPass ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••" 
                            value={password} onChange={(e) => setPassword(e.target.value)} 
                            className="h-12 rounded-xl pl-10 pr-10" 
                          />
                          <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <Button type="submit" className="h-12 w-full rounded-xl text-base font-bold shadow-md" disabled={loading}>
                        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando...</> : "Entrar no sistema"}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup" className="space-y-5">
                    <form onSubmit={signUp} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="font-medium">Nome completo</Label>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input 
                            id="name" required autoComplete="name" placeholder="Ex: João da Silva" 
                            value={name} onChange={(e) => setName(e.target.value)} 
                            className="h-12 rounded-xl pl-10" 
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email2" className="font-medium">E-mail</Label>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input 
                            id="email2" type="email" required autoComplete="email" placeholder="seu@email.com" 
                            value={email} onChange={(e) => setEmail(e.target.value)} 
                            className="h-12 rounded-xl pl-10" 
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password2" className="font-medium">Crie uma senha</Label>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input 
                            id="password2" type={showPass ? "text" : "password"} required minLength={6} autoComplete="new-password" placeholder="Mínimo 6 caracteres" 
                            value={password} onChange={(e) => setPassword(e.target.value)} 
                            className="h-12 rounded-xl pl-10 pr-10" 
                          />
                          <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <Button type="submit" className="h-12 w-full rounded-xl text-base font-bold shadow-md" disabled={loading}>
                        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando conta...</> : "Criar minha conta"}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>

                <div className="my-8 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium uppercase text-muted-foreground">Ou continuar com</span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <Button variant="outline" className="h-12 w-full rounded-xl border-border bg-background text-sm font-semibold hover:bg-muted" onClick={google}>
                  <svg viewBox="0 0 24 24" className="mr-2 h-[18px] w-[18px]">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-auto pt-6 text-center text-xs text-muted-foreground">
          Ao continuar, você concorda com nossos{" "}
          <Link to="/" className="underline hover:text-foreground">Termos de Serviço</Link> e{" "}
          <Link to="/" className="underline hover:text-foreground">Política de Privacidade</Link>.
        </p>
      </div>
    </main>
  );
}

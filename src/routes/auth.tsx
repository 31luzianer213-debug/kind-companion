import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useId } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import logo from "@/assets/logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  Sparkles,
  Check,
  X,
  KeyRound,
  Send,
  Star,
  MessageCircle,
  Zap,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar ou Cadastrar — IPTV Manager" },
      { name: "description", content: "Acesse o painel de clientes, listas IPTV e cobranças automáticas pelo WhatsApp." },
      { property: "og:title", content: "Entrar — IPTV Manager" },
      { property: "og:description", content: "Acesse seu painel inteligente de gestão e automação IPTV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function getFriendlyErrorMessage(errorMsg: string): string {
  if (!errorMsg) return "Ocorreu um erro inesperado. Tente novamente.";
  if (errorMsg.includes("Invalid login credentials") || errorMsg.includes("invalid_grant")) {
    return "E-mail ou senha incorretos. Verifique seus dados e tente novamente.";
  }
  if (errorMsg.includes("User already registered") || errorMsg.includes("already registered")) {
    return "Este e-mail já está cadastrado. Tente entrar ou recupere sua senha.";
  }
  if (errorMsg.includes("Password should be at least") || errorMsg.includes("password is too short")) {
    return "A senha deve conter no mínimo 6 caracteres.";
  }
  if (errorMsg.includes("Email not confirmed")) {
    return "E-mail ainda não confirmado. Verifique a caixa de entrada ou spam.";
  }
  if (errorMsg.includes("rate limit") || errorMsg.includes("over_email_send_rate_limit")) {
    return "Muitas tentativas em pouco tempo. Aguarde um instante antes de tentar novamente.";
  }
  return errorMsg;
}

function evaluatePassword(password: string) {
  if (!password) return { score: 0, label: "", color: "bg-muted" };
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[A-Z]/.test(password) || /[^a-zA-Z0-9]/.test(password)) score += 1;

  if (score === 1) return { score: 1, label: "Fraca", color: "bg-red-500", text: "text-red-500" };
  if (score === 2) return { score: 2, label: "Média", color: "bg-amber-500", text: "text-amber-500" };
  if (score === 3) return { score: 3, label: "Forte", color: "bg-emerald-500", text: "text-emerald-500" };
  return { score: 4, label: "Excelente", color: "bg-emerald-500", text: "text-emerald-500" };
}

function AuthPage() {
  const navigate = useNavigate();
  const rememberId = useId();

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // Status & toggles
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [tab, setTab] = useState("login");

  // Forgot password dialog
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);

      // Check for password recovery callback
      if (url.searchParams.get("type") === "recovery" || url.hash.includes("type=recovery")) {
        toast.info("Você está acessando pelo link de recuperação de senha.");
      }

      // Check for Supabase confirmation code
      if (url.searchParams.has("code")) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        if (!error) {
          toast.success("E-mail confirmado com sucesso! Bem-vindo ao painel.");
          navigate({ to: "/painel" });
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/painel" });
    })();
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      const isInvalidCredentials =
        error.message.includes("Invalid login credentials") || error.message.includes("invalid_grant");
      const isEmailNotConfirmed =
        error.message.includes("Email not confirmed") || error.message.includes("not confirmed");

      if (isInvalidCredentials) {
        toast.error("E-mail ou senha incorretos.", {
          description: "Não lembra sua senha? Clique em 'Recuperar' para receber um link.",
          action: {
            label: "Recuperar",
            onClick: () => {
              if (email.trim()) setForgotEmail(email.trim());
              setForgotOpen(true);
            },
          },
        });
      } else if (isEmailNotConfirmed) {
        toast.error("E-mail ainda não confirmado.", {
          description: "Verifique sua caixa de entrada e spam, ou reenvie o e-mail.",
          action: {
            label: "Reenviar",
            onClick: async () => {
              const res = await supabase.auth.resend({ type: "signup", email: email.trim() });
              if (res.error) toast.error(getFriendlyErrorMessage(res.error.message));
              else toast.success("E-mail de confirmação reenviado!");
            },
          },
        });
      } else {
        toast.error(getFriendlyErrorMessage(error.message));
      }
      return;
    }

    toast.success("Bem-vindo de volta!");
    navigate({ to: "/painel" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Por favor, digite seu nome completo.");
      return;
    }

    if (!email.trim()) {
      toast.error("Por favor, informe seu e-mail.");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem. Verifique a confirmação.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim() },
      },
    });

    if (error) {
      setLoading(false);
      const isAlreadyRegistered =
        error.message.includes("User already registered") || error.message.includes("already registered");

      if (isAlreadyRegistered) {
        toast.info("Este e-mail já possui uma conta!", {
          description: "Redirecionamos você para a aba de login. Não lembra a senha?",
          action: {
            label: "Recuperar Senha",
            onClick: () => {
              if (email.trim()) setForgotEmail(email.trim());
              setForgotOpen(true);
            },
          },
        });
        setTab("login");
      } else {
        toast.error(getFriendlyErrorMessage(error.message));
      }
      return;
    }

    if (!data.session) {
      setLoading(false);
      toast.success("Conta criada! Se o seu projeto exigir confirmação por e-mail, verifique sua caixa de entrada.");
      return;
    }

    await supabase.from("profiles").upsert({
      id: data.session.user.id,
      display_name: name.trim(),
    });

    setLoading(false);
    toast.success("Conta criada com sucesso! Bem-vindo ao painel.");
    navigate({ to: "/painel" });
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
      });

      if (result.error) {
        toast.error("Não foi possível entrar com o Google.");
        return;
      }

      if (!result.redirected) {
        navigate({ to: "/painel" });
      }
    } catch {
      toast.error("Erro ao autenticar com o Google.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Digite o e-mail da sua conta.");
      return;
    }

    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/auth?reset=true`,
    });
    setForgotLoading(false);

    if (error) {
      toast.error(getFriendlyErrorMessage(error.message));
      return;
    }

    setForgotSent(true);
    toast.success("E-mail de recuperação enviado com sucesso!");
  }

  const strength = evaluatePassword(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <main className="relative flex min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Lado Esquerdo - Showcase Visual & Prova Social (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-zinc-950 p-12 text-white lg:flex xl:p-16">
        {/* Background Gradients & Glow Mesh */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(99,102,241,0.15),transparent_50%)]" />
        <div className="absolute -left-36 -top-36 h-[560px] w-[560px] rounded-full bg-primary/25 blur-[140px] pointer-events-none" />
        <div className="absolute -bottom-36 -right-36 h-[560px] w-[560px] rounded-full bg-indigo-500/20 blur-[150px] pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,black_70%,transparent_100%)]" />

        {/* Top Header - Logo */}
        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="group flex items-center gap-3 text-xl font-bold tracking-tight">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 p-2.5 shadow-lg shadow-black/40 backdrop-blur-md transition-transform duration-300 group-hover:scale-105">
              <img src={logo} alt="IPTV Manager" className="h-full w-full object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold leading-none text-white">IPTV Manager</span>
              <span className="text-[11px] font-medium text-zinc-400">Gestão & Cobrança Automática</span>
            </div>
          </Link>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Disparos WhatsApp Ativos
          </div>
        </div>

        {/* Center - Value Proposition & Live Simulated Notification Card */}
        <div className="relative z-10 my-auto max-w-xl space-y-8 py-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span>Versão 2.0 • Painel em Tempo Real</span>
          </div>

          <h2 className="text-4xl font-black leading-[1.12] tracking-tight sm:text-5xl">
            Sua operação de IPTV{" "}
            <span className="block bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              100% no automático.
            </span>
          </h2>

          <p className="text-base leading-relaxed text-zinc-300 sm:text-lg">
            Esqueça o estresse de conferir comprovantes e cobrar clientes um por um.
            Automatize faturas Pix e lembretes amigáveis no WhatsApp em segundos.
          </p>

          {/* Floating Showcase Cards */}
          <div className="space-y-3.5 pt-2">
            {/* Card 1: Simulação WhatsApp */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">Notificação de Cobrança</p>
                      <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                        WhatsApp
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300">
                      "Olá Carlos, sua mensalidade vence hoje. Pague via Pix copia e cola em 1 clique!"
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">Agora</span>
              </div>
            </div>

            {/* Card 2: Metrics / Highlights */}
            <div className="grid grid-cols-2 gap-3.5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Inadimplência
                </div>
                <p className="mt-1 text-2xl font-bold text-white">-68%</p>
                <p className="text-[11px] text-zinc-400">com alertas automáticos</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <Zap className="h-4 w-4 text-amber-400" />
                  Tempo Economizado
                </div>
                <p className="mt-1 text-2xl font-bold text-white">+18 hrs</p>
                <p className="text-[11px] text-zinc-400">livres toda semana</p>
              </div>
            </div>

            {/* Card 3: Testimonial */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-sm">
              <div className="flex items-center gap-1 text-amber-400 mb-1.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-xs italic text-zinc-300 leading-relaxed">
                "Antes eu passava o dia cobrando no WhatsApp. Agora o sistema faz tudo sozinho e meus clientes adoram o Pix instantâneo."
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-zinc-400">
                — Lucas R., revendedor com +380 clientes ativos
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Trust Badges */}
        <div className="relative z-10 flex flex-wrap items-center gap-6 border-t border-white/10 pt-6 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Criptografia de Ponta a Ponta
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-blue-400" />
            Backup Diário na Nuvem
          </span>
        </div>
      </div>

      {/* Lado Direito - Formulários de Autenticação */}
      <div className="flex w-full flex-col p-6 sm:p-10 lg:w-1/2 lg:overflow-y-auto subtle-scrollbar">
        {/* Header Superior */}
        <header className="flex items-center justify-between">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="group gap-2 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <Link to="/">
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              <span>Voltar ao Início</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card p-1.5 lg:hidden">
              <img src={logo} alt="IPTV Manager" className="h-full w-full object-contain" />
            </div>
            <ThemeToggle />
          </div>
        </header>

        {/* Card Principal */}
        <div className="mx-auto my-auto flex w-full max-w-[420px] flex-col justify-center py-8">
          {/* Título & Descrição com animação suave */}
          <div className="mb-6 space-y-1.5 text-center sm:text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h1 className="text-3xl font-black tracking-tight text-foreground">
              {tab === "login" ? "Acessar Plataforma" : "Criar sua conta"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {tab === "login"
                ? "Insira seus dados para entrar no painel de gestão."
                : "Preencha as informações para automatizar suas cobranças."}
            </p>
          </div>

          {/* Abas Alternadoras */}
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="mb-6 grid h-12 w-full grid-cols-2 rounded-2xl bg-muted/70 p-1 border border-border/50">
              <TabsTrigger
                value="login"
                className="rounded-xl font-semibold data-[state=checked]:bg-background data-[state=checked]:shadow-sm transition-all"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-xl font-semibold data-[state=checked]:bg-background data-[state=checked]:shadow-sm transition-all"
              >
                Cadastrar
              </TabsTrigger>
            </TabsList>

            {/* ABA DE LOGIN */}
            <TabsContent value="login" className="mt-0 focus-visible:outline-none">
              <form onSubmit={signIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    E-mail
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </span>
                    <Input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      autoComplete="email"
                      className="h-12 rounded-xl pl-10 transition-colors focus-visible:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Senha
                    </Label>
                    <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            if (email.trim()) setForgotEmail(email.trim());
                          }}
                          className="text-xs font-semibold text-primary hover:underline transition-colors focus:outline-none"
                        >
                          Esqueceu a senha?
                        </button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md rounded-2xl">
                        <DialogHeader>
                          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                            <KeyRound className="h-6 w-6" />
                          </div>
                          <DialogTitle className="text-center text-xl font-bold">
                            Recuperar Senha
                          </DialogTitle>
                          <DialogDescription className="text-center text-sm text-muted-foreground">
                            Informe seu e-mail cadastrado. Enviaremos um link seguro para redefinir sua senha.
                          </DialogDescription>
                        </DialogHeader>

                        {forgotSent ? (
                          <div className="space-y-4 py-4 text-center animate-in fade-in zoom-in-95">
                            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-500">
                              <Check className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium text-foreground">
                              E-mail de recuperação enviado para <br />
                              <strong className="text-primary">{forgotEmail}</strong>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Verifique sua caixa de entrada e spam. Siga as instruções no e-mail para definir uma nova senha.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full rounded-xl"
                              onClick={() => {
                                setForgotSent(false);
                                setForgotOpen(false);
                              }}
                            >
                              Fechar
                            </Button>
                          </div>
                        ) : (
                          <form onSubmit={handleForgotPassword} className="space-y-4 pt-2">
                            <div className="space-y-2">
                              <Label htmlFor="forgot-email">Seu e-mail</Label>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                  <Mail className="h-4 w-4" />
                                </span>
                                <Input
                                  id="forgot-email"
                                  type="email"
                                  required
                                  value={forgotEmail}
                                  onChange={(e) => setForgotEmail(e.target.value)}
                                  placeholder="seu@email.com"
                                  className="h-12 rounded-xl pl-10"
                                />
                              </div>
                            </div>

                            <Button
                              type="submit"
                              className="h-12 w-full rounded-xl font-bold gap-2 shadow-lg shadow-primary/20"
                              disabled={forgotLoading}
                            >
                              {forgotLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                              {forgotLoading ? "Enviando..." : "Enviar link de recuperação"}
                            </Button>
                          </form>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Lock className="h-4 w-4" />
                    </span>
                    <Input
                      id="login-password"
                      type={showPass ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="h-12 rounded-xl pl-10 pr-11 transition-colors focus-visible:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      title={showPass ? "Ocultar senha" : "Ver senha"}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id={rememberId}
                    checked={rememberMe}
                    onCheckedChange={(c) => setRememberMe(c === true)}
                  />
                  <Label
                    htmlFor={rememberId}
                    className="text-xs font-normal text-muted-foreground cursor-pointer select-none"
                  >
                    Manter-me conectado neste dispositivo
                  </Label>
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-xl font-bold text-base shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {loading ? "Entrando..." : "Entrar no sistema"}
                </Button>
              </form>
            </TabsContent>

            {/* ABA DE CADASTRO */}
            <TabsContent value="signup" className="mt-0 focus-visible:outline-none">
              <form onSubmit={signUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nome Completo
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <User className="h-4 w-4" />
                    </span>
                    <Input
                      id="signup-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      autoComplete="name"
                      className="h-12 rounded-xl pl-10 transition-colors focus-visible:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    E-mail
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </span>
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      autoComplete="email"
                      className="h-12 rounded-xl pl-10 transition-colors focus-visible:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signup-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Crie uma Senha
                    </Label>
                    {password && (
                      <span className={`text-[11px] font-semibold ${strength.text}`}>
                        Força: {strength.label}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Lock className="h-4 w-4" />
                    </span>
                    <Input
                      id="signup-password"
                      type={showPass ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      autoComplete="new-password"
                      className="h-12 rounded-xl pl-10 pr-11 transition-colors focus-visible:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      title={showPass ? "Ocultar senha" : "Ver senha"}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Barra de Força da Senha */}
                  {password.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="flex h-1.5 w-full gap-1 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full flex-1 rounded-full transition-all ${strength.score >= 1 ? strength.color : "bg-transparent"}`} />
                        <div className={`h-full flex-1 rounded-full transition-all ${strength.score >= 2 ? strength.color : "bg-transparent"}`} />
                        <div className={`h-full flex-1 rounded-full transition-all ${strength.score >= 3 ? strength.color : "bg-transparent"}`} />
                        <div className={`h-full flex-1 rounded-full transition-all ${strength.score >= 4 ? strength.color : "bg-transparent"}`} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Use 8+ caracteres misturando letras maiúsculas, minúsculas e números.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signup-confirm-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Confirme sua Senha
                    </Label>
                    {passwordsMatch && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                        <Check className="h-3.5 w-3.5" /> Senhas conferem
                      </span>
                    )}
                    {passwordsMismatch && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500">
                        <X className="h-3.5 w-3.5" /> Senhas não coincidem
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Lock className="h-4 w-4" />
                    </span>
                    <Input
                      id="signup-confirm-password"
                      type={showConfirmPass ? "text" : "password"}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita sua senha"
                      autoComplete="new-password"
                      className={`h-12 rounded-xl pl-10 pr-11 transition-colors focus-visible:ring-primary ${
                        passwordsMismatch ? "border-red-500 focus-visible:ring-red-500" : ""
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      title={showConfirmPass ? "Ocultar senha" : "Ver senha"}
                    >
                      {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-xl font-bold text-base shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {loading ? "Criando conta..." : "Criar minha conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Divisor Social */}
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border/70" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Ou acesse com
            </span>
            <span className="h-px flex-1 bg-border/70" />
          </div>

          {/* Botão Oficial do Google */}
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full gap-3 rounded-xl border-border/80 bg-card hover:bg-muted/50 font-semibold transition-all hover:shadow-sm"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <GoogleIcon className="h-5 w-5 shrink-0" />
            )}
            <span>Continuar com o Google</span>
          </Button>
        </div>

        {/* Rodapé de Termos */}
        <p className="mt-auto pt-6 text-center text-xs text-muted-foreground">
          Ao continuar, você concorda com os{" "}
          <Link to="/" className="font-medium text-foreground underline hover:text-primary transition-colors">
            Termos de Serviço
          </Link>{" "}
          e com a{" "}
          <Link to="/" className="font-medium text-foreground underline hover:text-primary transition-colors">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

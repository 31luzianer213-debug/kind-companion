import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, KeyRound, Loader2, Lock, Mail, Send, ShieldCheck, User, X } from "lucide-react";
import { toast } from "sonner";
import { AuthField } from "@/components/auth/AuthField";
import { AuthShowcase } from "@/components/auth/AuthShowcase";
import { SigmaLogo } from "@/components/SigmaLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acessar — Sigma Control" },
      { name: "description", content: "Entre ou crie sua conta no Sigma Control e teste grátis por 7 dias." },
      { property: "og:title", content: "Acessar — Sigma Control" },
      { property: "og:description", content: "Gestão de clientes e cobranças automáticas em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.3-4.8 3.3-8.2Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1a6.4 6.4 0 0 1-6.2-4.5H2.2V17A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.6-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.5 4.2 1.6l3.2-3.1A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.8 6.1l3.6 2.8A6.4 6.4 0 0 1 12 5.4Z" />
    </svg>
  );
}

function friendlyError(message: string) {
  if (/Invalid login credentials|invalid_grant/i.test(message)) return "E-mail ou senha incorretos.";
  if (/already registered/i.test(message)) return "Este e-mail já possui uma conta.";
  if (/Password should be at least|password is too short/i.test(message)) return "Use uma senha com pelo menos 6 caracteres.";
  if (/pwned|leaked|known to be weak|easy to guess|weak_password/i.test(message))
    return "Essa senha é muito comum e já apareceu em vazamentos. Escolha outra, com letras, números e símbolos.";
  if (/invalid format|Unable to validate email|invalid email/i.test(message)) return "E-mail inválido. Confira o endereço digitado.";
  if (/Email not confirmed|not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
  if (/rate limit|over_email_send_rate_limit/i.test(message)) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  return message || "Não foi possível concluir. Tente novamente.";
}

/**
 * Erro que não veio do Supabase (rede, DNS, certificado, configuração ausente).
 * Antes essas falhas escapavam do try/catch, o botão ficava travado em
 * "Entrando…" e nada era mostrado ao usuário — parecia que o login não funcionava.
 */
const NETWORK_MESSAGE =
  "Não foi possível falar com o servidor de acesso agora. Verifique sua conexão e tente novamente.";

function describeThrown(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/Missing Supabase environment variable/i.test(message)) {
    return "A conexão com o banco não está configurada neste ambiente. Avise o suporte.";
  }
  if (/Failed to fetch|NetworkError|Network request failed|load failed|timeout/i.test(message)) {
    return NETWORK_MESSAGE;
  }
  return friendlyError(message) || NETWORK_MESSAGE;
}

function passwordStrength(password: string) {
  const checks = [
    password.length >= 6,
    password.length >= 8,
    /[0-9]/.test(password),
    /[A-Z]|[^a-zA-Z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  return {
    score,
    label: ["", "Fraca", "Boa", "Forte", "Excelente"][score],
    color: score <= 1 ? "bg-destructive" : score === 2 ? "bg-warning" : "bg-success",
  };
}

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const isRecovery = url.searchParams.get("reset") === "true" || hashParams.get("type") === "recovery";

        if (url.searchParams.has("code")) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          url.searchParams.delete("code");
          url.searchParams.delete("state");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
          if (!error && isRecovery) {
            setResetMode(true);
            return;
          }
          if (!error) {
            toast.success("E-mail confirmado. Sua conta está pronta!");
            navigate({ to: "/painel" });
            return;
          }
        }

        if (isRecovery) {
          // O Supabase cria a sessão de recuperação a partir do link do e-mail.
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            setResetMode(true);
            return;
          }
          toast.error("Link de recuperação inválido ou expirado. Solicite um novo.");
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) navigate({ to: "/painel" });
      } catch (error) {
        // Nunca deixar a tela de login morrer em silêncio.
        console.error("[auth] falha ao preparar a sessão", error);
      }
    })();
  }, [navigate]);

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 6) return toast.error("A nova senha precisa ter pelo menos 6 caracteres.");
    if (newPassword !== newPasswordConfirmation) return toast.error("As senhas não coincidem.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(friendlyError(error.message));
        return;
      }
      toast.success("Senha atualizada! Você já está conectado.");
      window.history.replaceState({}, "", "/auth");
      navigate({ to: "/painel" });
    } catch (error) {
      toast.error(describeThrown(error));
    } finally {
      setLoading(false);
    }
  }

  function openRecovery() {
    if (email.trim()) setForgotEmail(email.trim());
    setForgotSent(false);
    setForgotOpen(true);
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return toast.error("Preencha seu e-mail e senha.");

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

      if (error) {
        if (/Invalid login credentials|invalid_grant/i.test(error.message)) {
          toast.error("E-mail ou senha incorretos.", {
            description: "Confira os dados ou recupere sua senha.",
            action: { label: "Recuperar", onClick: openRecovery },
          });
        } else if (/Email not confirmed|not confirmed/i.test(error.message)) {
          toast.error("Seu e-mail ainda não foi confirmado.", {
            action: {
              label: "Reenviar",
              onClick: async () => {
                const result = await supabase.auth.resend({ type: "signup", email: email.trim() });
                result.error ? toast.error(friendlyError(result.error.message)) : toast.success("Confirmação reenviada!");
              },
            },
          });
        } else toast.error(friendlyError(error.message));
        return;
      }

      // Sem sessão retornada não há como entrar: avisa em vez de navegar em falso.
      if (!data.session) {
        toast.error("Não foi possível abrir sua sessão agora. Tente novamente em instantes.");
        return;
      }

      toast.success("Bem-vindo de volta!");
      await navigate({ to: "/painel", replace: true });
    } catch (error) {
      toast.error(describeThrown(error), { duration: 8_000 });
    } finally {
      setLoading(false);
    }
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return toast.error("Informe seu e-mail.");
    if (password.length < 6) return toast.error("A senha precisa ter pelo menos 6 caracteres.");
    if (confirmation && password !== confirmation) return toast.error("As senhas não coincidem.");

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim() || email.trim().split("@")[0] } },
      });

      if (error) {
        if (/already registered/i.test(error.message)) {
          setTab("login");
          toast.info("Este e-mail já possui uma conta.", {
            action: { label: "Recuperar senha", onClick: openRecovery },
          });
        } else toast.error(friendlyError(error.message));
        return;
      }

      let session = data.session;
      if (!session) {
        const signIn = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signIn.error) {
          toast.error(
            /Email not confirmed|not confirmed/i.test(signIn.error.message)
              ? "Enviamos um link de confirmação para o seu e-mail. Confirme para entrar."
              : friendlyError(signIn.error.message),
          );
          return;
        }
        session = signIn.data.session;
      }

      if (session) {
        await supabase.from("profiles").upsert({
          id: session.user.id,
          display_name: name.trim() || email.trim().split("@")[0],
        });
      }

      if (!session) {
        setTab("login");
        toast.success("Conta criada! Confirme o e-mail que enviamos para entrar.");
        return;
      }

      toast.success("Conta criada com sucesso!");
      await navigate({ to: "/painel", replace: true });
    } catch (error) {
      toast.error(describeThrown(error), { duration: 8_000 });
    } finally {
      setLoading(false);
    }
  }


  async function signInWithGoogle() {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (result.error) toast.error("Não foi possível entrar com o Google.", { description: describeThrown(result.error) });
      else if (!result.redirected) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          toast.error("A conta Google foi autorizada, mas a sessão não abriu. Tente novamente.");
          return;
        }
        await navigate({ to: "/painel", replace: true });
      }
    } catch (error) {
      toast.error("Erro ao autenticar com o Google.", { description: describeThrown(error) });
    } finally {
      setGoogleLoading(false);
    }
  }

  async function recoverPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!forgotEmail.trim()) return toast.error("Digite o e-mail da sua conta.");
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });
      if (error) {
        toast.error(friendlyError(error.message));
        return;
      }
      setForgotSent(true);
    } catch (error) {
      toast.error(describeThrown(error));
    } finally {
      setForgotLoading(false);
    }
  }

  const strength = passwordStrength(password);
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const matches = confirmation.length > 0 && password === confirmation;

  return (
    <main className="auth-page min-h-[100dvh] bg-background text-foreground lg:flex">
      <AuthShowcase />

      <section className="relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden">
        <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-8">
          <Button asChild variant="ghost" size="sm" className="gap-2 rounded-md text-muted-foreground">
            <Link to="/"><ArrowLeft className="size-4" /> Voltar</Link>
          </Button>
          <ThemeToggle />
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center px-4 pb-8 pt-2 sm:px-8 sm:pb-12">
          <div className="mb-7 md:hidden">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <SigmaLogo size="md" />
              <div>
                <p className="text-sm font-black tracking-tight">Sigma Control</p>
                <p className="text-[10px] font-medium text-muted-foreground">Gestão e automação</p>
              </div>
            </Link>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-[0_20px_60px_-42px_color-mix(in_oklch,var(--foreground)_45%,transparent)] sm:p-7">
            {resetMode ? (
              <form onSubmit={updatePassword} className="space-y-4" data-testid="reset-password-form">
                <div className="mb-2">
                  <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary"><KeyRound className="size-3.5" /> Redefinir senha</p>
                  <h1 className="font-display text-2xl font-bold sm:text-3xl">Crie uma nova senha</h1>
                  <p className="mt-2 text-sm text-muted-foreground">Escolha uma senha forte para voltar a acessar sua conta.</p>
                </div>
                <AuthField id="reset-password" label="Nova senha" icon={<Lock className="size-4" />} type={showPassword ? "text" : "password"} required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete="new-password" revealable revealed={showPassword} onReveal={() => setShowPassword((value) => !value)} />
                <AuthField id="reset-password-confirmation" label="Confirme a nova senha" icon={<Lock className="size-4" />} type={showPassword ? "text" : "password"} required minLength={6} value={newPasswordConfirmation} onChange={(e) => setNewPasswordConfirmation(e.target.value)} placeholder="Repita a senha" autoComplete="new-password" invalid={newPasswordConfirmation.length > 0 && newPassword !== newPasswordConfirmation} />
                <Button type="submit" disabled={loading} className="h-12 w-full rounded-md text-sm font-bold" data-testid="reset-password-submit">
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {loading ? "Salvando…" : "Salvar nova senha"}
                </Button>
              </form>
            ) : (
            <>
            <div className="mb-6">
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                <ShieldCheck className="size-3.5" /> Acesso seguro
              </p>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">
                {tab === "login" ? "Que bom ter você de volta" : "Teste grátis por 7 dias"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {tab === "login" ? "Entre para continuar gerenciando sua operação." : "Crie sua conta e configure seu painel em poucos minutos."}
              </p>
            </div>

            <Tabs value={tab} onValueChange={(value) => { setTab(value); setPassword(""); setConfirmation(""); }} className="w-full">
              <TabsList className="mb-6 grid h-12 w-full grid-cols-2 rounded-lg border border-border bg-muted/60 p-1">
                <TabsTrigger value="login" className="rounded-lg font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-0">
                <form onSubmit={signIn} className="space-y-4">
                  <AuthField id="login-email" label="E-mail" icon={<Mail className="size-4" />} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" />
                  <AuthField
                    id="login-password"
                    label="Senha"
                    icon={<Lock className="size-4" />}
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    revealable
                    revealed={showPassword}
                    onReveal={() => setShowPassword((value) => !value)}
                    hint={<button type="button" onClick={openRecovery} className="text-xs font-bold text-primary hover:underline">Esqueci minha senha</button>}
                  />
                  <Button type="submit" disabled={loading} className="h-12 w-full rounded-md text-sm font-bold shadow-lg shadow-primary/15">
                    {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {loading ? "Entrando…" : "Entrar no painel"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={signUp} className="space-y-4">
                  <AuthField id="signup-name" label="Seu nome" icon={<User className="size-4" />} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como podemos te chamar" autoComplete="name" />
                  <AuthField id="signup-email" label="E-mail" icon={<Mail className="size-4" />} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" />
                  <AuthField
                    id="signup-password"
                    label="Crie uma senha"
                    icon={<Lock className="size-4" />}
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    autoComplete="new-password"
                    revealable
                    revealed={showPassword}
                    onReveal={() => setShowPassword((value) => !value)}
                    hint={password ? <span className="text-[11px] font-bold text-muted-foreground">{strength.label}</span> : null}
                  />
                  {password && (
                    <div className="grid grid-cols-4 gap-1" aria-label={`Força da senha: ${strength.label}`}>
                      {[1, 2, 3, 4].map((level) => <span key={level} className={cn("h-1 rounded-full bg-muted", strength.score >= level && strength.color)} />)}
                    </div>
                  )}
                  <AuthField
                    id="signup-confirmation"
                    label="Confirme a senha"
                    icon={<Lock className="size-4" />}
                    type={showConfirmation ? "text" : "password"}
                    required
                    minLength={6}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    revealable
                    revealed={showConfirmation}
                    onReveal={() => setShowConfirmation((value) => !value)}
                    invalid={mismatch}
                    hint={
                      confirmation && matches
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success"><Check className="size-3" /> Senhas iguais</span>
                        : mismatch
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive"><X className="size-3" /> Diferentes</span>
                          : null
                    }
                  />

                  <Button type="submit" disabled={loading} className="h-12 w-full rounded-md text-sm font-bold shadow-lg shadow-primary/15">
                    {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {loading ? "Criando conta…" : "Criar minha conta"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ou</span><span className="h-px flex-1 bg-border" /></div>

            <Button type="button" variant="outline" onClick={signInWithGoogle} disabled={googleLoading} className="h-12 w-full gap-3 rounded-md bg-background/55 font-bold">
              {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
              {googleLoading ? "Conectando…" : "Continuar com Google"}
            </Button>
            </>
            )}
          </div>

          <p className="px-4 pt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Ao continuar, você concorda com os <Link to="/termos" className="font-semibold text-primary hover:underline">Termos de Uso</Link> e a <Link to="/privacidade" className="font-semibold text-primary hover:underline">Política de Privacidade</Link>.
          </p>
        </div>
      </section>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="w-[calc(100%_-_2rem)] rounded-lg sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <span className="mx-auto mb-2 grid size-12 place-items-center rounded-lg bg-primary/10 text-primary"><KeyRound className="size-5" /></span>
            <DialogTitle>Recuperar senha</DialogTitle>
            <DialogDescription>Enviaremos um link seguro para o e-mail da sua conta.</DialogDescription>
          </DialogHeader>
          {forgotSent ? (
            <div className="space-y-4 py-2 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-success/10 text-success"><Check className="size-5" /></span>
              <p className="text-sm">Link enviado para <strong>{forgotEmail}</strong>.</p>
              <p className="text-xs text-muted-foreground">Confira também sua caixa de spam.</p>
              <Button variant="outline" className="w-full" onClick={() => setForgotOpen(false)}>Entendi</Button>
            </div>
          ) : (
            <form onSubmit={recoverPassword} className="space-y-4 pt-2">
              <AuthField id="forgot-email" label="E-mail da conta" icon={<Mail className="size-4" />} type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" />
              <Button type="submit" disabled={forgotLoading} className="h-12 w-full gap-2 rounded-md font-bold">
                {forgotLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {forgotLoading ? "Enviando…" : "Enviar link de recuperação"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

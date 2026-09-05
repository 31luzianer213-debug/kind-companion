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
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/painel" });
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
      toast.success("Conta criada! Confirme o e-mail que enviamos para entrar.");
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
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-[#1e3a8a]" />
        <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`, backgroundSize: "28px 28px" }} />
        <div className="absolute -top-32 -right-32 h-[520px] w-[520px] rounded-full bg-white/10 blur-[80px]" />
        <div className="relative flex h-full flex-col p-10 xl:p-12">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-lg"><img src={logo} alt="IPTV Manager" width={28} height={28} className="h-7 w-7 object-contain" /></span>
              <span className="text-[17px] font-bold tracking-tight">IPTV Manager</span>
            </Link>
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-white/15"><ArrowLeft className="h-3.5 w-3.5" /> Voltar</Link>
          </div>
          <div className="mt-16 max-w-[520px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur"><Sparkles className="h-3.5 w-3.5" /> Para revendedores IPTV</div>
            <h1 className="mt-6 text-[38px] font-extrabold leading-[0.95] tracking-tight text-white xl:text-[44px]">O controle total<br />do seu IPTV<br /><span className="text-white/70">em um só lugar.</span></h1>
            <p className="mt-4 text-[15px] leading-relaxed text-white/75">Gerencie clientes, organize listas e envie cobranças automáticas no WhatsApp.</p>
            <ul className="mt-8 space-y-3">
              {["Clientes e vencimentos em tempo real","Cobrança automática no WhatsApp","Integração com painel Sigma"].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm font-medium text-white/90"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-primary"><Check className="h-3.5 w-3.5" /></span>{item}</li>
              ))}
            </ul>
          </div>
          <div className="mt-auto">
            <div className="rounded-[24px] border border-white/15 bg-white/10 p-6 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-widest text-white/60">Prévia</p><span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-bold text-emerald-950">Ao vivo</span></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white p-4"><div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-4 w-4" /></div><p className="text-[11px] text-muted-foreground">Clientes</p><p className="text-xl font-extrabold">128</p></div>
                <div className="rounded-2xl bg-white p-4"><div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><Wallet className="h-4 w-4" /></div><p className="text-[11px] text-muted-foreground">Recebido</p><p className="text-xl font-extrabold">R$ 3.840</p></div>
                <div className="rounded-2xl bg-white p-4"><div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><Zap className="h-4 w-4" /></div><p className="text-[11px] text-muted-foreground">Cobranças</p><p className="text-xl font-extrabold">12 envios</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="relative flex min-h-screen flex-col bg-background">
        <div className="pointer-events-none absolute inset-0 hidden lg:block app-aurora opacity-60" />
        <div className="relative flex items-center justify-between px-6 py-5 lg:px-10">
          <Link to="/" className="flex items-center gap-2 text-sm font-bold lg:hidden"><img src={logo} alt="IPTV Manager" width={32} height={32} className="h-8 w-8" /> IPTV Manager</Link>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2"><Link to="/" className="hidden lg:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Início</Link><ThemeToggle /></div>
        </div>
        <div className="relative flex flex-1 items-center justify-center px-6 py-8 lg:px-10">
          <div className="w-full max-w-[420px]">
            <div className="mb-8"><h2 className="text-[28px] font-extrabold tracking-tight">{tab === "login" ? "Bem-vindo de volta" : "Crie sua conta"}</h2><p className="mt-2 text-sm text-muted-foreground">{tab === "login" ? "Entre para acessar o painel." : "Comece em menos de 1 minuto."}</p></div>
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted p-1">
                <TabsTrigger value="login" className="rounded-lg text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm">Criar conta</TabsTrigger>
              </TabsList>

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
              {tab === "login" ? <>Ainda não tem conta? <button onClick={() => setTab("signup")} className="font-semibold text-primary hover:underline">Criar conta</button></> : <>Já tem conta? <button onClick={() => setTab("login")} className="font-semibold text-primary hover:underline">Entrar</button></>}
            </p>
          </div>
        </div>
        <p className="px-6 pb-6 text-center text-xs text-muted-foreground lg:px-10">© {new Date().getFullYear()} IPTV Manager</p>
      </div>
    </main>
  );
}

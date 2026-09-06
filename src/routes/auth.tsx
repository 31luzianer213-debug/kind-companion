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
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Entrar — IPTV Manager" },
    { name: "description", content: "Acesse o painel de clientes, listas IPTV e cobranças." },
    { property: "og:title", content: "Entrar — IPTV Manager" },
    { property: "og:description", content: "Acesse seu painel de gestão de IPTV." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
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
      options: { data: { display_name: name } },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setLoading(false);
      toast.error("O cadastro foi criado, mas o Lovable Cloud ainda exige confirmação de e-mail. Desative essa exigência nas configurações de autenticação do Cloud.");
      return;
    }
    await supabase.from("profiles").upsert({ id: data.session.user.id, display_name: name });
    setLoading(false);
    toast.success("Conta criada com sucesso! Bem-vindo ao painel.");
    navigate({ to: "/painel" });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
    if (!result.redirected) navigate({ to: "/painel" });
  }

  const field = (id: string, type: string, value: string, setValue: (v: string) => void, placeholder: string, icon: React.ReactNode, extra = {}) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
      <Input id={id} type={type} required value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} className="h-12 rounded-xl pl-10" {...extra} />
    </div>
  );

  return <main className="relative flex min-h-screen bg-background text-foreground">
    <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-zinc-950 p-12 text-white lg:flex">
      <div className="absolute inset-0 bg-primary/20" />
      <div className="absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[140px]" />
      <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[140px]" />
      <div className="relative z-10 flex items-center gap-3 text-xl font-bold"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 p-2"><img src={logo} alt="IPTV Manager" className="h-full w-full object-contain" /></div>IPTV Manager</div>
      <div className="relative z-10 max-w-lg space-y-6"><h2 className="text-4xl font-extrabold leading-[1.1] sm:text-5xl">Sua operação de IPTV <br />mais inteligente.</h2><p className="text-lg text-zinc-300">Gerencie clientes, configure listas e automatize cobranças pelo WhatsApp para focar no que importa: crescer de forma escalável.</p><div className="flex gap-4 text-sm text-zinc-400"><span><ShieldCheck className="mr-1 inline h-4 w-4" />Ambiente Seguro</span><span><CheckCircle2 className="mr-1 inline h-4 w-4" />Cobrança Automatizada</span></div></div>
    </div>
    <div className="flex w-full flex-col p-6 sm:p-10 lg:w-1/2">
      <header className="mb-auto flex items-center justify-between"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Voltar ao Início</span></Link><div className="flex items-center gap-4"><img src={logo} alt="IPTV Manager" className="h-8 w-8 lg:hidden" /><ThemeToggle /></div></header>
      <div className="flex w-full flex-1 flex-col items-center justify-center pb-12 pt-8"><div className="w-full max-w-[400px]">
        <div className="mb-8 space-y-2 text-center sm:text-left"><h1 className="text-3xl font-extrabold">{tab === "login" ? "Acessar Plataforma" : "Criar sua conta"}</h1><p className="text-sm text-muted-foreground">{tab === "login" ? "Insira seus dados para entrar no painel e gerenciar seu negócio." : "Preencha os dados abaixo e comece a escalar suas vendas em instantes."}</p></div>
        <Tabs value={tab} onValueChange={setTab}><TabsList className="mb-6 grid h-12 w-full grid-cols-2 rounded-xl bg-muted p-1"><TabsTrigger value="login">Acesso</TabsTrigger><TabsTrigger value="signup">Cadastro</TabsTrigger></TabsList>
          <TabsContent value="login"><form onSubmit={signIn} className="space-y-4"><div className="space-y-2"><Label>E-mail de acesso</Label>{field("email", "email", email, setEmail, "seu@email.com", <Mail className="h-4 w-4" />, { autoComplete: "email" })}</div><div className="space-y-2"><Label>Senha</Label><div className="relative">{field("password", showPass ? "text" : "password", password, setPassword, "••••••••", <Lock className="h-4 w-4" />, { autoComplete: "current-password" })}<button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div><Button type="submit" className="h-12 w-full rounded-xl font-bold" disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{loading ? "Entrando..." : "Entrar no sistema"}</Button></form></TabsContent>
          <TabsContent value="signup"><form onSubmit={signUp} className="space-y-4"><div className="space-y-2"><Label>Nome completo</Label>{field("name", "text", name, setName, "Ex: João da Silva", <User className="h-4 w-4" />, { autoComplete: "name" })}</div><div className="space-y-2"><Label>E-mail</Label>{field("email2", "email", email, setEmail, "seu@email.com", <Mail className="h-4 w-4" />, { autoComplete: "email" })}</div><div className="space-y-2"><Label>Crie uma senha</Label><div className="relative">{field("password2", showPass ? "text" : "password", password, setPassword, "Mínimo 6 caracteres", <Lock className="h-4 w-4" />, { minLength: 6, autoComplete: "new-password" })}<button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div><Button type="submit" className="h-12 w-full rounded-xl font-bold" disabled={loading}>{loading ? "Criando conta..." : "Criar minha conta"}</Button></form></TabsContent>
        </Tabs>
        <div className="my-8 flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="text-xs uppercase text-muted-foreground">Ou continuar com</span><span className="h-px flex-1 bg-border" /></div><Button variant="outline" className="h-12 w-full rounded-xl" onClick={google}>Google</Button>
      </div></div><p className="mt-auto pt-6 text-center text-xs text-muted-foreground">Ao continuar, você concorda com nossos <Link to="/" className="underline">Termos de Serviço</Link> e <Link to="/" className="underline">Política de Privacidade</Link>.</p></div>
  </main>;
}

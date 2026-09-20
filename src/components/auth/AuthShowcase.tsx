import { Link } from "@tanstack/react-router";
import { CheckCircle2, MessageCircle, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { SigmaLogo } from "@/components/SigmaLogo";

const benefits = [
  { icon: Zap, title: "Cobranças automáticas", text: "Lembretes e Pix enviados no momento certo." },
  { icon: MessageCircle, title: "WhatsApp integrado", text: "Atenda e cobre sem trocar de ferramenta." },
  { icon: ShieldCheck, title: "Operação organizada", text: "Clientes, acessos e pagamentos em um só lugar." },
];

export function AuthShowcase() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden border-r border-primary/15 bg-primary text-primary-foreground lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-10 xl:p-14">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--primary-foreground)_6%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--primary-foreground)_6%,transparent)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

      <Link to="/" className="relative z-10 flex w-fit items-center gap-3">
        <SigmaLogo size="lg" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight">Sigma Control</span>
          </div>
          <span className="text-[11px] font-medium text-primary-foreground/60">Gestão que trabalha por você</span>
        </div>
      </Link>

      <div className="relative z-10 my-12 max-w-xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1.5 text-xs font-bold text-primary-foreground">
          <Sparkles className="size-3.5" /> Sua operação em piloto automático
        </span>
        <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.08] xl:text-5xl">
          Menos tarefas repetidas.
          <span className="mt-2 block text-primary-foreground/75">
            Mais tempo para vender.
          </span>
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-primary-foreground/70">
          Controle clientes, acessos, cobranças e WhatsApp em um painel rápido, claro e preparado para crescer com você.
        </p>

        <div className="mt-9 grid gap-3">
          {benefits.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3 rounded-lg border border-primary-foreground/15 bg-primary-foreground/[0.07] p-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary-foreground/15 bg-primary-foreground/10">
                <Icon className="size-[18px] text-primary-foreground" />
              </span>
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="text-xs text-primary-foreground/60">{text}</p>
              </div>
              <CheckCircle2 className="ml-auto size-4 shrink-0 text-emerald-300" />
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-primary-foreground/15 pt-5 text-[11px] text-primary-foreground/55">
        <span>Seguro e simples de usar</span>
        <span>© {new Date().getFullYear()} Sigma Control</span>
      </div>
    </aside>
  );
}

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
    <aside className="relative hidden min-h-screen overflow-hidden border-r border-white/10 bg-[#07090f] text-white lg:flex lg:w-[48%] lg:flex-col lg:justify-between lg:p-10 xl:p-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(99,102,241,.30),transparent_34%),radial-gradient(circle_at_90%_85%,rgba(16,185,129,.14),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

      <Link to="/" className="relative z-10 flex w-fit items-center gap-3">
        <SigmaLogo size="lg" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight">Painel Sigma</span>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black tracking-wider text-emerald-300">
              GRÁTIS
            </span>
          </div>
          <span className="text-[11px] font-medium text-white/50">Gestão que trabalha por você</span>
        </div>
      </Link>

      <div className="relative z-10 my-12 max-w-xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1.5 text-xs font-bold text-indigo-100">
          <Sparkles className="size-3.5" /> Sua operação em piloto automático
        </span>
        <h1 className="mt-6 text-4xl font-black leading-[1.08] tracking-[-0.05em] xl:text-5xl">
          Menos tarefas repetidas.
          <span className="mt-2 block bg-gradient-to-r from-indigo-300 via-white to-emerald-200 bg-clip-text text-transparent">
            Mais tempo para vender.
          </span>
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-white/62">
          Controle clientes, acessos, cobranças e WhatsApp em um painel rápido, claro e preparado para crescer com você.
        </p>

        <div className="mt-9 grid gap-3">
          {benefits.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3.5 backdrop-blur-sm">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10">
                <Icon className="size-[18px] text-indigo-200" />
              </span>
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="text-xs text-white/50">{text}</p>
              </div>
              <CheckCircle2 className="ml-auto size-4 shrink-0 text-emerald-300" />
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-5 text-[11px] text-white/40">
        <span>Seguro e simples de usar</span>
        <span>© {new Date().getFullYear()} Painel Sigma</span>
      </div>
    </aside>
  );
}

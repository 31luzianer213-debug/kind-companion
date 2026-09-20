import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/SigmaLogo";

export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5"><SigmaLogo size="sm" /><span className="font-display text-sm font-bold">Sigma Control</span></Link>
          <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="size-4" /> Voltar</Link></Button>
        </div>
      </header>
      <article className="legal-content mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Última atualização: {updatedAt}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc">{children}</div>
      </article>
    </main>
  );
}

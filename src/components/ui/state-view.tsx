import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Base = { className?: string };

export function EmptyView({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: Base & { title: string; description?: string; icon?: LucideIcon; action?: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center",
        className,
      )}
    >
      <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorView({
  title = "Não foi possível carregar",
  description = "Verifique sua conexão e tente novamente.",
  onRetry,
  className,
}: Base & { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center",
        className,
      )}
    >
      <span className="grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-1 gap-1.5">
          <RotateCw className="size-3.5" aria-hidden /> Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function LoadingView({ rows = 3, label = "Carregando", className }: Base & { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-2.5", className)}>
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InlineSpinner({ className }: Base) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden />;
}

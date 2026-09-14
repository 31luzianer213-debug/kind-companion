import type { InputHTMLAttributes, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: ReactNode;
  hint?: ReactNode;
  invalid?: boolean;
  revealable?: boolean;
  revealed?: boolean;
  onReveal?: () => void;
}

export function AuthField({
  label,
  icon,
  hint,
  invalid,
  revealable,
  revealed,
  onReveal,
  className,
  id,
  ...props
}: AuthFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <Label htmlFor={id} className="text-xs font-bold text-foreground">
          {label}
        </Label>
        {hint}
      </div>
      <div className="group relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary">
          {icon}
        </span>
        <Input
          id={id}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-12 rounded-xl border-border/80 bg-background/70 pl-10 text-[16px] shadow-sm transition-all placeholder:text-muted-foreground/55 focus-visible:border-primary/55 focus-visible:ring-4 focus-visible:ring-primary/10 sm:text-sm",
            revealable && "pr-12",
            invalid && "border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/10",
            className,
          )}
          {...props}
        />
        {revealable && (
          <button
            type="button"
            onClick={onReveal}
            className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

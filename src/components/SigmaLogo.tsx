import logoImg from "@/assets/logo.png";
import { cn } from "@/lib/utils";

interface SigmaLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showGlow?: boolean;
}

const sizeMap = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-10 w-10 rounded-xl",
  lg: "h-12 w-12 rounded-2xl",
  xl: "h-16 w-16 rounded-3xl",
};

export function SigmaLogo({ className, size = "md", showGlow = true }: SigmaLogoProps) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-zinc-950 border border-cyan-500/30",
        sizeMap[size],
        showGlow && "shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-500/25",
        className,
      )}
    >
      <img
        src={logoImg}
        alt="Painel Sigma Pro"
        className="h-full w-full object-cover scale-105 select-none"
      />
      {/* Subtle glass reflection highlight */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent" />
    </div>
  );
}

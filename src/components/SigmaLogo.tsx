import { cn } from "@/lib/utils";

interface SigmaLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showGlow?: boolean;
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

export function SigmaLogo({
  className,
  size = "md",
  showGlow = true,
}: SigmaLogoProps) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center select-none",
        sizeClasses[size],
        className,
      )}
      title="Painel Sigma Pro — Gestão IPTV"
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          "h-full w-full",
          showGlow && "filter drop-shadow-[0_0_12px_rgba(6,182,212,0.25)]",
        )}
      >
        <defs>
          {/* Fundo ultra-escuro de alta densidade */}
          <linearGradient id="sigmaBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0b1120" />
            <stop offset="50%" stopColor="#060913" />
            <stop offset="100%" stopColor="#020408" />
          </linearGradient>

          {/* Borda metálica em degradê ciano elétrico e índigo */}
          <linearGradient id="sigmaBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="35%" stopColor="#06b6d4" />
            <stop offset="70%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>

          {/* Gradiente do símbolo Sigma principal */}
          <linearGradient id="sigmaGlyph" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="45%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>

          {/* Gradiente do botão/triângulo de streaming */}
          <linearGradient id="sigmaPlay" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>

          {/* Reflexo de vidro na parte superior */}
          <linearGradient id="sigmaGlass" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Brilho neon sutil */}
          <filter id="sigmaNeon" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Base Squircle com Borda Gradiente */}
        <rect
          x="2.5"
          y="2.5"
          width="43"
          height="43"
          rx="12"
          fill="url(#sigmaBg)"
          stroke="url(#sigmaBorder)"
          strokeWidth="1.5"
        />

        {/* Linhas de circuito/alta fidelidade decorativas */}
        <path
          d="M 2.5 16 H 45.5 M 2.5 32 H 45.5"
          stroke="#38bdf8"
          strokeOpacity="0.04"
          strokeWidth="1"
        />
        <path
          d="M 16 2.5 V 45.5 M 32 2.5 V 45.5"
          stroke="#38bdf8"
          strokeOpacity="0.04"
          strokeWidth="1"
        />

        {/* Reflexo de vidro diagonal superior */}
        <path
          d="M 3 14 C 3 7.9 7.9 3 14 3 L 34 3 C 24 10 9 23 3 34 Z"
          fill="url(#sigmaGlass)"
        />

        {/* Símbolo Sigma Principal (Σ) com curvatura perfeita */}
        <path
          d="M 33 14.2 H 15.5 L 24.5 24 L 15.5 33.8 H 33"
          stroke="url(#sigmaGlyph)"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#sigmaNeon)"
        />

        {/* Triângulo de Play / Streaming no centro */}
        <polygon
          points="27,20.2 33.8,24 27,27.8"
          fill="url(#sigmaPlay)"
          stroke="#060913"
          strokeWidth="0.8"
        />

        {/* Indicador de Sinal IPTV Ativo (Led Verde Neon no canto superior direito) */}
        <circle cx="37.5" cy="10.5" r="1.8" fill="#22c55e" />
        <circle
          cx="37.5"
          cy="10.5"
          r="3.2"
          stroke="#22c55e"
          strokeWidth="0.7"
          strokeOpacity="0.5"
        />
      </svg>
    </div>
  );
}


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
          showGlow && "filter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]",
        )}
      >
        <defs>
          {/* Fundo preto puro de alta densidade */}
          <linearGradient id="sigmaBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#18181b" />
            <stop offset="50%" stopColor="#09090b" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>

          {/* Borda cromada em degradê branco e prata */}
          <linearGradient id="sigmaBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#d4d4d8" />
            <stop offset="80%" stopColor="#71717a" />
            <stop offset="100%" stopColor="#27272a" />
          </linearGradient>

          {/* Gradiente do símbolo Sigma principal */}
          <linearGradient id="sigmaGlyph" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f4f4f5" />
            <stop offset="100%" stopColor="#a1a1aa" />
          </linearGradient>

          {/* Gradiente do botão/triângulo de streaming */}
          <linearGradient id="sigmaPlay" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </linearGradient>

          {/* Reflexo de vidro na parte superior */}
          <linearGradient id="sigmaGlass" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Brilho neon sutil branco */}
          <filter id="sigmaNeon" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.0" result="blur" />
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

        {/* Linhas de circuito monocromáticas decorativas */}
        <path
          d="M 2.5 16 H 45.5 M 2.5 32 H 45.5"
          stroke="#ffffff"
          strokeOpacity="0.06"
          strokeWidth="1"
        />
        <path
          d="M 16 2.5 V 45.5 M 32 2.5 V 45.5"
          stroke="#ffffff"
          strokeOpacity="0.06"
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
          stroke="#09090b"
          strokeWidth="0.8"
        />

        {/* Indicador de Sinal IPTV Ativo (Led Branco no canto superior direito) */}
        <circle cx="37.5" cy="10.5" r="1.8" fill="#ffffff" />
        <circle
          cx="37.5"
          cy="10.5"
          r="3.2"
          stroke="#ffffff"
          strokeWidth="0.7"
          strokeOpacity="0.5"
        />
      </svg>
    </div>
  );
}


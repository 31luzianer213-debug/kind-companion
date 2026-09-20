import { useId } from "react";
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

export function SigmaLogo({ className, size = "md", showGlow = true }: SigmaLogoProps) {
  const uid = useId().replace(/:/g, "");
  const backgroundId = `sigma-background-${uid}`;
  const accentId = `sigma-accent-${uid}`;
  const glowId = `sigma-glow-${uid}`;

  return (
    <div
      className={cn("relative flex shrink-0 select-none items-center justify-center", sizeClasses[size], className)}
      title="Sigma Control — Gestão de revenda IPTV"
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("h-full w-full", showGlow && "drop-shadow-[0_8px_16px_rgba(15,118,110,0.22)]")}
        role="img"
        aria-label="Logo Sigma Control"
      >
        <defs>
          <linearGradient id={backgroundId} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#13263D" />
            <stop offset="1" stopColor="#07111F" />
          </linearGradient>
          <linearGradient id={accentId} x1="12" y1="10" x2="38" y2="39" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5EEAD4" />
            <stop offset="0.52" stopColor="#14B8A6" />
            <stop offset="1" stopColor="#0F766E" />
          </linearGradient>
          <filter id={glowId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${backgroundId})`} />
        <rect x="2.75" y="2.75" width="42.5" height="42.5" rx="12.25" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="1.5" />
        <path d="M5 15C10 8 17 5 26 5H34C25 9 17 15 11 24L5 33V15Z" fill="#FFFFFF" fillOpacity="0.055" />

        <path
          d="M33.5 13.5H15.2L24.4 23.9L15.2 34.5H33.5"
          stroke={`url(#${accentId})`}
          strokeWidth="4.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
        />
        <path d="M27.2 19.7L34.7 24L27.2 28.3V19.7Z" fill="#F8FAFC" />
        <circle cx="37.8" cy="10.3" r="2.1" fill="#2DD4BF" />
        <circle cx="37.8" cy="10.3" r="3.8" stroke="#2DD4BF" strokeOpacity="0.25" />
      </svg>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * O tema é a fonte da verdade no DOM (`<html class="dark">`).
 * Antes cada botão guardava o próprio estado: com dois alternadores na tela
 * (cabeçalho e menu), eles divergiam e o primeiro clique não fazia nada.
 */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("tema-v2") as Theme | null;
    const initial: Theme = stored ?? "dark";
    setTheme(initial);
    apply(initial);
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    localStorage.setItem("tema-v2", next);
  }

  return { theme: currentTheme(), toggle };
}

export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  if (withLabel) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={toggle}
        className={cn("w-full justify-start gap-2 text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground", className)}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {dark ? "Modo claro" : "Modo escuro"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={dark ? "Modo claro" : "Modo escuro"}
      className={cn("rounded-lg text-muted-foreground hover:text-foreground", className)}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </Button>
  );
}

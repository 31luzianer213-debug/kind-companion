import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-sm hover:bg-rose-500/20",
        success:
          "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm hover:bg-emerald-500/20",
        warning:
          "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-sm hover:bg-amber-500/20",
        info:
          "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm hover:bg-blue-500/20",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

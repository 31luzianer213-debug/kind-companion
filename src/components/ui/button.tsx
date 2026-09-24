import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-bold cursor-pointer transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out active:scale-[0.97] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-2 border-foreground bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        destructive: "border-2 border-foreground bg-destructive text-destructive-foreground shadow-[3px_3px_0_0_var(--foreground)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--foreground)] active:shadow-none",
        outline: "border-2 border-foreground/70 bg-card hover:border-foreground hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--primary)] active:shadow-none",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:-translate-y-0.5",
        ghost: "hover:bg-accent/70 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-sm px-3.5 text-xs",
        lg: "h-12 rounded-sm px-8 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };

import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition-[background-color,border-color,color,opacity,transform] duration-[120ms] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90 active:opacity-80",
  secondary: "border border-border-strong bg-transparent text-fg hover:bg-chip active:bg-track",
  ghost: "bg-transparent text-fg-2 hover:bg-chip hover:text-fg active:bg-track",
  danger:
    "border border-danger/50 bg-transparent text-danger hover:bg-danger/10 active:bg-danger/15",
};

const sizes: Record<ButtonSize, string> = {
  sm: "hit-44 h-9 px-3 text-caption",
  md: "h-11 px-4 text-body",
  lg: "h-13 px-5 text-title",
};

export interface ButtonProps extends ComponentProps<"button"> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  /** Acción en curso: desactiva el botón y atenúa la etiqueta, sin spinner. */
  readonly pending?: boolean;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  /** Pista de atajo de teclado, por ejemplo "N". */
  readonly kbd?: string;
  readonly asChild?: boolean;
}

export const Button = ({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  pending = false,
  leading,
  trailing,
  kbd,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) => {
  const classes = cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);

  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled === true || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {leading}
      <span className={cn("min-w-0 truncate", pending && "animate-skeleton")}>{children}</span>
      {trailing}
      {kbd != null && (
        <kbd
          aria-hidden="true"
          className={cn(
            "ml-1 hidden rounded-[5px] px-1.5 py-px num text-micro lg:inline-block",
            variant === "primary" ? "bg-on-accent/15" : "bg-chip text-fg-2",
          )}
        >
          {kbd}
        </kbd>
      )}
    </button>
  );
};

export interface IconButtonProps extends Omit<ComponentProps<"button">, "aria-label"> {
  /** Obligatorio: un botón de icono no tiene texto visible. */
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: "sm" | "md";
}

export const IconButton = ({
  label,
  variant = "ghost",
  size = "md",
  className,
  type,
  children,
  ...props
}: IconButtonProps) => (
  <button
    type={type ?? "button"}
    aria-label={label}
    title={label}
    className={cn(
      base,
      variants[variant],
      size === "md" ? "size-11" : "hit-44 size-9",
      "px-0",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

export interface FabProps extends Omit<ComponentProps<"button">, "aria-label"> {
  readonly label: string;
}

/** Botón principal flotante: 52×52, radio 16 y fondo de acento. */
export const Fab = ({ label, className, type, children, ...props }: FabProps) => (
  <button
    type={type ?? "button"}
    aria-label={label}
    className={cn(
      "inline-flex size-13 shrink-0 items-center justify-center rounded-fab bg-accent text-on-accent transition-[opacity,transform] duration-[120ms] hover:opacity-90 active:scale-95",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

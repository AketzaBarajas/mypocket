import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

export type CardTone = "default" | "accent" | "warning" | "danger";

const toneBorder: Record<CardTone, string> = {
  default: "border-border",
  accent: "border-accent",
  warning: "border-warning",
  danger: "border-danger",
};

const paddings = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
} as const;

export interface CardProps extends ComponentProps<"div"> {
  readonly tone?: CardTone;
  readonly padding?: keyof typeof paddings;
  /** Añade estados hover/active para tarjetas que navegan o abren algo. */
  readonly interactive?: boolean;
  /** Renderiza el hijo (un Link o un button) con el estilo de la tarjeta. */
  readonly asChild?: boolean;
}

/** Superficie base: plana, borde de 1 px y radio 14. */
export const Card = ({
  tone = "default",
  padding = "md",
  interactive = false,
  asChild = false,
  className,
  ...props
}: CardProps) => {
  const Component = asChild ? Slot.Root : "div";
  return (
    <Component
      className={cn(
        "block rounded-card border bg-surface text-left",
        toneBorder[tone],
        paddings[padding],
        interactive &&
          "transition-colors hover:border-border-strong active:bg-chip disabled:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
};

/** Tarjeta protagonista: radio 16 y más aire. */
export const HeroCard = ({ className, padding = "lg", ...props }: CardProps) => (
  <Card padding={padding} className={cn("rounded-hero", className)} {...props} />
);

export interface StatTileProps extends Omit<CardProps, "children" | "title"> {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children?: ReactNode;
}

/** Baldosa de dato: etiqueta, cifra y una línea de contexto. */
export const StatTile = ({
  label,
  value,
  hint,
  leading,
  trailing,
  children,
  className,
  ...props
}: StatTileProps) => (
  <Card className={cn("flex min-w-0 flex-col gap-2", className)} {...props}>
    <div className="flex min-w-0 items-center gap-2">
      {leading}
      <span className="min-w-0 flex-1 truncate text-caption text-fg-2">{label}</span>
      {trailing}
    </div>
    <div className="min-w-0 truncate num text-h2 text-fg">{value}</div>
    {hint != null && <div className="min-w-0 truncate text-caption text-fg-2">{hint}</div>}
    {children}
  </Card>
);

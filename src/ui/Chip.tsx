import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

export interface ChipProps extends ComponentProps<"button"> {
  readonly selected?: boolean;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly size?: "sm" | "md";
}

/** Píldora interactiva de radio 8: filtros, cuenta, fecha, «+ Más». */
export const Chip = ({
  selected = false,
  leading,
  trailing,
  size = "md",
  className,
  children,
  type,
  ...props
}: ChipProps) => (
  <button
    type={type ?? "button"}
    aria-pressed={props.role == null ? selected : undefined}
    className={cn(
      "hit-44 inline-flex shrink-0 items-center gap-1.5 rounded-chip border text-caption font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-40",
      size === "md" ? "h-9 px-3" : "h-7 px-2",
      selected
        ? "border-border-strong bg-surface text-fg"
        : "border-border bg-chip text-fg-2 hover:border-border-strong hover:text-fg active:bg-track",
      className,
    )}
    {...props}
  >
    {leading}
    <span className="max-w-[16ch] truncate">{children}</span>
    {trailing}
  </button>
);

export interface BadgeProps extends ComponentProps<"span"> {
  readonly tone?: "neutral" | "accent" | "warning" | "danger";
}

const badgeTones = {
  neutral: "bg-chip text-fg-2 border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  warning: "bg-warning/10 text-warning border-transparent",
  danger: "bg-danger/10 text-danger border-transparent",
} as const;

/** Etiqueta de estado no interactiva: «Pendiente», «Vencido», contadores. */
export const Badge = ({ tone = "neutral", className, ...props }: BadgeProps) => (
  <span
    className={cn(
      "inline-flex h-5 shrink-0 items-center rounded-[6px] border px-1.5 text-micro font-semibold whitespace-nowrap",
      badgeTones[tone],
      className,
    )}
    {...props}
  />
);

export interface EmojiChipProps extends ComponentProps<"span"> {
  readonly emoji: string;
  readonly size?: "sm" | "md" | "lg";
}

const emojiSizes = {
  sm: "size-8 text-[15px]",
  md: "size-9 text-[17px]",
  lg: "size-10 text-[19px]",
} as const;

/** Chip cuadrado que identifica categorías y cuentas con su emoji. */
export const EmojiChip = ({ emoji, size = "md", className, ...props }: EmojiChipProps) => (
  <span
    aria-hidden="true"
    className={cn(
      "inline-flex shrink-0 items-center justify-center rounded-chip border border-border bg-chip leading-none",
      emojiSizes[size],
      className,
    )}
    {...props}
  >
    {emoji}
  </span>
);

import { motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { ReactNode } from "react";

import type { Cents } from "@/domain/types";

import { Money } from "./AnimatedNumber";
import { Button } from "./Button";
import { Badge, EmojiChip } from "./Chip";
import { cn } from "./cn";
import { haptic } from "./motion";

/* ───────────────────────── Deslizar ───────────────────────── */

export interface SwipeAction {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly tone?: "accent" | "danger" | "neutral";
  readonly onTrigger: () => void;
}

export interface SwipeRowProps {
  /** Acción al deslizar hacia la derecha (aparece a la izquierda). */
  readonly leading?: SwipeAction | undefined;
  /** Acción al deslizar hacia la izquierda (aparece a la derecha). */
  readonly trailing?: SwipeAction | undefined;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

const THRESHOLD = 88;

const swipeTones = {
  accent: "text-accent",
  danger: "text-danger",
  neutral: "text-fg-2",
} as const;

/**
 * Fila deslizable para móvil. Soltar más allá del umbral ejecuta la acción.
 * Las mismas acciones deben existir también como botón o menú: el gesto es un
 * atajo, no la única vía.
 */
export const SwipeRow = ({
  leading,
  trailing,
  disabled = false,
  className,
  children,
}: SwipeRowProps) => {
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const leadingOpacity = useTransform(x, [0, THRESHOLD], [0, 1]);
  const trailingOpacity = useTransform(x, [-THRESHOLD, 0], [1, 0]);

  if (disabled || (leading === undefined && trailing === undefined)) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {leading !== undefined && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: leadingOpacity }}
          className={cn(
            "absolute inset-y-0 left-0 flex items-center gap-2 pl-4 text-caption font-semibold",
            swipeTones[leading.tone ?? "accent"],
          )}
        >
          {leading.icon}
          {leading.label}
        </motion.div>
      )}
      {trailing !== undefined && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: trailingOpacity }}
          className={cn(
            "absolute inset-y-0 right-0 flex items-center gap-2 pr-4 text-caption font-semibold",
            swipeTones[trailing.tone ?? "danger"],
          )}
        >
          {trailing.label}
          {trailing.icon}
        </motion.div>
      )}
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragSnapToOrigin
        dragConstraints={{
          left: trailing === undefined ? 0 : -THRESHOLD * 1.5,
          right: leading === undefined ? 0 : THRESHOLD * 1.5,
        }}
        dragElastic={0.12}
        dragTransition={reduceMotion ? { bounceStiffness: 2000, bounceDamping: 100 } : {}}
        onDragEnd={(_, info) => {
          if (leading !== undefined && info.offset.x > THRESHOLD) {
            haptic();
            leading.onTrigger();
          } else if (trailing !== undefined && info.offset.x < -THRESHOLD) {
            haptic();
            trailing.onTrigger();
          }
        }}
        className="relative touch-pan-y bg-surface"
      >
        {children}
      </motion.div>
    </div>
  );
};

/* ───────────────────────── Movimiento ───────────────────────── */

export type RowKind = "expense" | "income" | "transfer";

export interface TransactionRowProps {
  readonly emoji: string;
  readonly title: string;
  /** "categoría · #etiquetas · cuenta" */
  readonly subtitle: string;
  readonly amount: Cents;
  readonly kind: RowKind;
  readonly status?: "pending" | "overdue" | undefined;
  readonly trailing?: ReactNode;
  readonly className?: string;
}

/** Importe con el signo y el color de su tipo de movimiento. */
export const RowAmount = ({
  amount,
  kind,
  className,
}: {
  readonly amount: Cents;
  readonly kind: RowKind;
  readonly className?: string;
}) => (
  <span
    className={cn(
      "shrink-0 num text-body font-medium whitespace-nowrap",
      kind === "income" ? "text-accent" : kind === "transfer" ? "text-fg-2" : "text-fg",
      className,
    )}
  >
    {kind === "income" ? "+" : kind === "expense" ? "−" : ""}
    <Money value={amount} sign="never" />
  </span>
);

/** Fila de movimiento: chip de emoji, concepto, contexto e importe. */
export const TransactionRow = ({
  emoji,
  title,
  subtitle,
  amount,
  kind,
  status,
  trailing,
  className,
}: TransactionRowProps) => (
  <div className={cn("flex min-h-15 min-w-0 items-center gap-3 px-4 py-2.5", className)}>
    <EmojiChip emoji={emoji} />
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-body text-fg">{title}</span>
        {status === "pending" && <Badge>Pendiente</Badge>}
        {status === "overdue" && <Badge tone="warning">Vencido</Badge>}
      </div>
      <div className="truncate text-caption text-fg-2">{subtitle}</div>
    </div>
    <RowAmount amount={amount} kind={kind} />
    {trailing}
  </div>
);

/* ───────────────────────── Pendiente ───────────────────────── */

export interface PendingRowProps {
  readonly emoji: string;
  readonly name: string;
  /** "mañana", "en 3 días", "hace 2 días" */
  readonly when: string;
  readonly account: string;
  readonly amount: Cents;
  readonly kind: RowKind;
  readonly overdue?: boolean;
  readonly onApprove: () => void;
  readonly onSkip: () => void;
  readonly className?: string;
}

/** Cargo recurrente por aprobar, con las acciones Aprobar y Omitir. */
export const PendingRow = ({
  emoji,
  name,
  when,
  account,
  amount,
  kind,
  overdue = false,
  onApprove,
  onSkip,
  className,
}: PendingRowProps) => (
  <div className={cn("flex min-w-0 flex-col gap-2.5 px-4 py-3", className)}>
    <div className="flex min-w-0 items-center gap-3">
      <EmojiChip emoji={emoji} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-body text-fg">{name}</span>
          {overdue && <Badge tone="warning">Vencido</Badge>}
        </div>
        <div className="truncate text-caption text-fg-2">
          {when} · {account}
        </div>
      </div>
      <RowAmount amount={amount} kind={kind} />
    </div>
    <div className="flex gap-2 pl-12">
      <Button size="sm" variant="secondary" className="flex-1" onClick={onApprove}>
        Aprobar
      </Button>
      <Button size="sm" variant="ghost" className="flex-1" onClick={onSkip}>
        Omitir
      </Button>
    </div>
  </div>
);

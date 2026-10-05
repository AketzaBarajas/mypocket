import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

export interface EmptyStateProps {
  /** Emoji o icono que acompaña al mensaje. */
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  /** Botones de acción: el estado vacío es una invitación. */
  readonly actions?: ReactNode;
  readonly compact?: boolean;
  readonly className?: string;
}

export const EmptyState = ({
  icon,
  title,
  description,
  actions,
  compact = false,
  className,
}: EmptyStateProps) => (
  <div
    className={cn(
      "mx-auto flex max-w-sm flex-col items-center text-center",
      compact ? "gap-2 py-6" : "gap-3 py-12",
      className,
    )}
  >
    {icon != null && (
      <div
        aria-hidden="true"
        className="mb-1 inline-flex size-12 items-center justify-center rounded-card border border-border bg-chip text-[22px] text-fg-2"
      >
        {icon}
      </div>
    )}
    <h2 className="text-title text-fg">{title}</h2>
    {description != null && <p className="text-body text-fg-2">{description}</p>}
    {actions != null && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
  </div>
);

/** Bloque de carga. Se usa en lugar de spinners y reserva el espacio final. */
export const Skeleton = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    aria-hidden="true"
    className={cn("animate-skeleton rounded-[8px] bg-track", className)}
    {...props}
  />
);

/** Envoltorio accesible para un grupo de skeletons. */
export const SkeletonGroup = ({
  label = "Cargando",
  className,
  children,
}: {
  readonly label?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) => (
  <div role="status" aria-busy="true" aria-label={label} className={className}>
    {children}
  </div>
);

export interface NoticeProps {
  readonly tone?: "neutral" | "accent" | "warning" | "danger";
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

const noticeTones = {
  neutral: "border-border text-fg-2",
  accent: "border-accent/40 text-fg",
  warning: "border-warning/50 text-fg",
  danger: "border-danger/50 text-fg",
} as const;

const noticeIconTones = {
  neutral: "text-fg-2",
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
} as const;

/** Aviso en línea, discreto y no bloqueante. */
export const Notice = ({ tone = "neutral", icon, children, action, className }: NoticeProps) => (
  <div
    className={cn(
      "flex min-w-0 items-center gap-3 rounded-card border bg-surface px-4 py-3 text-body",
      noticeTones[tone],
      className,
    )}
  >
    {icon != null && (
      <span aria-hidden="true" className={cn("inline-flex shrink-0", noticeIconTones[tone])}>
        {icon}
      </span>
    )}
    <div className="min-w-0 flex-1">{children}</div>
    {action}
  </div>
);

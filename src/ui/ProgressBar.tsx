import { cn } from "./cn";

export type ProgressState = "ok" | "warning" | "danger" | "neutral";

const fills: Record<ProgressState, string> = {
  ok: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-fg-2",
};

export interface ProgressBarProps {
  /** Proporción completada. Se pinta recortada a [0, 1]. */
  readonly value: number;
  readonly state?: ProgressState;
  /** Marca de referencia en [0, 1], por ejemplo el ideal 50/30/20. */
  readonly marker?: number | undefined;
  /** Descripción para lectores de pantalla: "Necesidades: 620 € de 900 €". */
  readonly label: string;
  readonly size?: "sm" | "md";
  readonly className?: string;
}

/** Barra de progreso cuyo color comunica estado, nunca decora. */
export const ProgressBar = ({
  value,
  state = "ok",
  marker,
  label,
  size = "md",
  className,
}: ProgressBarProps) => {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round((Number.isFinite(value) ? Math.max(0, value) : 0) * 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, percent)}
      aria-valuetext={`${percent} %`}
      className={cn("relative w-full", className)}
    >
      <div className={cn("overflow-hidden rounded-full bg-track", size === "md" ? "h-1.5" : "h-1")}>
        <div
          className={cn(
            "h-full origin-left rounded-full transition-[width] duration-[600ms]",
            fills[state],
          )}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
      {marker !== undefined && marker > 0 && marker <= 1 && (
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fg"
          style={{ left: `${marker * 100}%` }}
        />
      )}
    </div>
  );
};

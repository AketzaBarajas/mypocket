import { curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import { line } from "@visx/shape";

import { cn } from "../cn";

export interface SparklineProps {
  readonly values: ReadonlyArray<number>;
  readonly width?: number;
  readonly height?: number;
  /** "accent" para lo positivo o vital; "muted" para contexto neutro. */
  readonly tone?: "accent" | "muted" | "danger";
  /** Si se indica, la minigráfica se anuncia a lectores de pantalla. */
  readonly ariaLabel?: string;
  readonly className?: string;
}

const strokes = {
  accent: "var(--accent)",
  muted: "var(--text-2)",
  danger: "var(--danger)",
} as const;

/** Minigráfica de tendencia sin ejes. */
export const Sparkline = ({
  values,
  width = 96,
  height = 32,
  tone = "muted",
  ariaLabel,
  className,
}: SparklineProps) => {
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = scaleLinear({ domain: [0, Math.max(1, values.length - 1)], range: [pad, width - pad] });
  const y = scaleLinear({
    domain: min === max ? [min - 1, max + 1] : [min, max],
    range: [height - pad, pad],
  });
  const path =
    values.length < 2
      ? `M${pad},${height / 2}H${width - pad}`
      : (line<number>({ x: (_, index) => x(index), y: (value) => y(value), curve: curveMonotoneX })(
          [...values],
        ) ?? "");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role={ariaLabel === undefined ? undefined : "img"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel === undefined ? true : undefined}
      className={cn("shrink-0", className)}
    >
      <path
        d={path}
        fill="none"
        stroke={strokes[tone]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

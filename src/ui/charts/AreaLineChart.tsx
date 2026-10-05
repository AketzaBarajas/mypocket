import { AxisBottom, AxisRight } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import { GridRows } from "@visx/grid";
import { ParentSize } from "@visx/responsive";
import { scaleLinear, scaleTime } from "@visx/scale";
import { area, line } from "@visx/shape";
import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState, type PointerEvent } from "react";

import { formatDayMonth, formatShortDate, toDate } from "@/domain/dates";
import { cents, formatMoney } from "@/domain/money";
import type { Cents, IsoDate } from "@/domain/types";

import { cn } from "../cn";
import { DURATION, EASE } from "../motion";
import {
  AXIS_TICK,
  axisMargin,
  ChartTable,
  ChartTooltip,
  edgeAnchor,
  GRID_OPACITY,
  GRID_STROKE,
} from "./shared";

const compact = (value: number): string => formatMoney(cents(Math.round(value)), { compact: true });

export interface AreaPoint {
  readonly date: IsoDate;
  readonly value: Cents;
}

export interface AreaLineChartProps {
  readonly data: ReadonlyArray<AreaPoint>;
  /** Resumen para lectores de pantalla. */
  readonly ariaLabel: string;
  readonly height?: number;
  /** Muestra ejes y rejilla. Sin ellos queda la línea desnuda del hero. */
  readonly axes?: boolean;
  /** Cambia para volver a dibujar la línea (por ejemplo, al cambiar de rango). */
  readonly drawKey?: string;
  readonly className?: string;
}

interface InnerProps extends AreaLineChartProps {
  readonly width: number;
  readonly height: number;
}

const Inner = ({ data, width, height, axes = true, drawKey }: InnerProps) => {
  const gradientId = useId();
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const extremes = data.map((point) => compact(point.value));
  const margin = axes
    ? { top: 12, right: axisMargin(extremes), bottom: 24, left: 0 }
    : { top: 8, right: 0, bottom: 4, left: 0 };
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const { xScale, yScale, linePath, areaPath, points } = useMemo(() => {
    const first = data[0];
    const last = data[data.length - 1];
    const values = data.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min;
    const pad = spread === 0 ? Math.max(Math.abs(max) * 0.1, 100) : spread * 0.12;

    const x = scaleTime({
      domain: first && last ? [toDate(first.date), toDate(last.date)] : [new Date(0), new Date(1)],
      range: [0, innerWidth],
    });
    const y = scaleLinear({
      domain: [min - pad, max + pad],
      range: [innerHeight, 0],
    });
    const px = (point: AreaPoint) => (data.length === 1 ? innerWidth / 2 : x(toDate(point.date)));
    const py = (point: AreaPoint) => y(point.value);

    return {
      xScale: x,
      yScale: y,
      points: data.map((point) => ({ x: px(point), y: py(point) })),
      linePath: line<AreaPoint>({ x: px, y: py, curve: curveMonotoneX })([...data]) ?? "",
      areaPath:
        area<AreaPoint>({ x: px, y0: innerHeight, y1: py, curve: curveMonotoneX })([...data]) ?? "",
    };
  }, [data, innerWidth, innerHeight]);

  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const distance = Math.abs(point.x - pointerX);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setActiveIndex(nearest);
  };

  const active = activeIndex === null ? undefined : data[activeIndex];
  const activePoint = activeIndex === null ? undefined : points[activeIndex];
  const draw = !reduceMotion;

  if (width === 0 || data.length === 0) return null;

  return (
    <>
      <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
        {/* Única excepción al «sin degradados»: área muy tenue bajo la línea. */}
        <LinearGradient
          id={gradientId}
          from="var(--accent)"
          to="var(--accent)"
          fromOpacity={0.1}
          toOpacity={0}
        />
        <g transform={`translate(${margin.left},${margin.top})`}>
          {axes && (
            <GridRows
              scale={yScale}
              width={innerWidth}
              numTicks={4}
              stroke={GRID_STROKE}
              strokeOpacity={GRID_OPACITY}
            />
          )}
          <motion.path
            key={`area-${drawKey ?? ""}`}
            d={areaPath}
            fill={`url(#${gradientId})`}
            initial={draw ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.chart, ease: EASE, delay: 0.15 }}
          />
          <motion.path
            key={`line-${drawKey ?? ""}`}
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={draw ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: DURATION.chart, ease: EASE }}
          />
          {axes && (
            <>
              <AxisRight
                scale={yScale}
                left={innerWidth}
                numTicks={4}
                hideAxisLine
                hideTicks
                tickFormat={(value) => compact(Number(value))}
                tickLabelProps={{ ...AXIS_TICK, dx: 6, dy: 4, textAnchor: "start" }}
              />
              <AxisBottom
                scale={xScale}
                top={innerHeight}
                numTicks={Math.max(2, Math.min(5, Math.floor(innerWidth / 96)))}
                hideAxisLine
                hideTicks
                tickFormat={(value) =>
                  value instanceof Date
                    ? value.toLocaleDateString("es-ES", { day: "numeric", month: "short" })
                    : ""
                }
                tickLabelProps={(_, index, ticks) => ({
                  ...AXIS_TICK,
                  dy: 4,
                  textAnchor: edgeAnchor(index, ticks.length),
                })}
              />
            </>
          )}
          {activePoint && (
            <g pointerEvents="none">
              <line
                x1={activePoint.x}
                x2={activePoint.x}
                y1={0}
                y2={innerHeight}
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={4.5}
                fill="var(--bg)"
                stroke="var(--accent)"
                strokeWidth={2}
              />
            </g>
          )}
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            className="touch-pan-y"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setActiveIndex(null)}
            onPointerCancel={() => setActiveIndex(null)}
          />
        </g>
      </svg>
      {active && activePoint && (
        <ChartTooltip
          left={margin.left + activePoint.x}
          top={margin.top + activePoint.y - 12}
          align={activePoint.x < 72 ? "start" : activePoint.x > innerWidth - 72 ? "end" : "center"}
        >
          <div className="num text-micro text-fg-2">{formatShortDate(active.date)}</div>
          <div className="num text-caption font-semibold text-fg">{formatMoney(active.value)}</div>
        </ChartTooltip>
      )}
    </>
  );
};

/** Línea de 2 px en acento sobre un área muy tenue. Responsive y accesible. */
export const AreaLineChart = ({ height = 220, className, ...props }: AreaLineChartProps) => (
  <div
    role="img"
    aria-label={props.ariaLabel}
    className={cn("relative w-full", className)}
    style={{ height }}
  >
    <ParentSize debounceTime={50}>
      {({ width }) => <Inner {...props} width={width} height={height} />}
    </ParentSize>
    <ChartTable
      caption={props.ariaLabel}
      headers={["Fecha", "Valor"]}
      rows={props.data.map((point) => [formatDayMonth(point.date), formatMoney(point.value)])}
    />
  </div>
);

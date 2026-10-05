import { AxisBottom, AxisRight } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { formatMonthShort, formatMonthYear } from "@/domain/dates";
import { cents, formatMoney } from "@/domain/money";
import type { Cents, YearMonth } from "@/domain/types";

import { cn } from "../cn";
import { DURATION, EASE } from "../motion";
import {
  AXIS_TICK,
  axisMargin,
  ChartTable,
  ChartTooltip,
  GRID_OPACITY,
  GRID_STROKE,
  topRoundedRect,
} from "./shared";

export interface CashflowDatum {
  readonly month: YearMonth;
  readonly income: Cents;
  readonly expense: Cents;
}

export interface CashflowBarsProps {
  readonly data: ReadonlyArray<CashflowDatum>;
  readonly ariaLabel: string;
  readonly height?: number;
  readonly className?: string;
}

interface InnerProps extends CashflowBarsProps {
  readonly width: number;
  readonly height: number;
}

const Inner = ({ data, width, height }: InnerProps) => {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState<YearMonth | null>(null);
  const peak = Math.max(1, ...data.flatMap((datum) => [datum.income, datum.expense]));
  const margin = {
    top: 12,
    right: axisMargin([formatMoney(cents(peak), { compact: true }), "0,0 mil €"]),
    bottom: 24,
    left: 0,
  };
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const { xScale, yScale } = useMemo(() => {
    const max = Math.max(1, ...data.flatMap((datum) => [datum.income, datum.expense]));
    return {
      xScale: scaleBand({
        domain: data.map((datum) => datum.month),
        range: [0, innerWidth],
        paddingInner: 0.32,
        paddingOuter: 0.1,
      }),
      yScale: scaleLinear({ domain: [0, max], range: [innerHeight, 0], nice: true }),
    };
  }, [data, innerWidth, innerHeight]);

  if (width === 0) return null;

  const band = xScale.bandwidth();
  const gap = Math.min(4, band * 0.12);
  const barWidth = Math.max(1, (band - gap) / 2);
  const activeDatum = data.find((datum) => datum.month === active);
  const activeX = activeDatum ? (xScale(activeDatum.month) ?? 0) + band / 2 : 0;

  return (
    <>
      <svg width={width} height={height} aria-hidden="true" className="block">
        <g transform={`translate(${margin.left},${margin.top})`}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            numTicks={4}
            stroke={GRID_STROKE}
            strokeOpacity={GRID_OPACITY}
          />
          <motion.g
            // Las barras crecen desde la línea base.
            style={{ originX: 0, originY: 1 }}
            initial={reduceMotion ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: DURATION.chart, ease: EASE }}
          >
            {data.map((datum) => {
              const x = xScale(datum.month) ?? 0;
              const dimmed = active !== null && active !== datum.month;
              return (
                <g key={datum.month} opacity={dimmed ? 0.45 : 1}>
                  <path
                    d={topRoundedRect(
                      x,
                      yScale(datum.income),
                      barWidth,
                      innerHeight - yScale(datum.income),
                      4,
                    )}
                    fill="var(--accent)"
                  />
                  <path
                    d={topRoundedRect(
                      x + barWidth + gap,
                      yScale(datum.expense),
                      barWidth,
                      innerHeight - yScale(datum.expense),
                      4,
                    )}
                    fill="var(--text-3)"
                  />
                </g>
              );
            })}
          </motion.g>
          <AxisRight
            scale={yScale}
            left={innerWidth}
            numTicks={4}
            hideAxisLine
            hideTicks
            tickFormat={(value) => formatMoney(cents(Math.round(Number(value))), { compact: true })}
            tickLabelProps={{ ...AXIS_TICK, dx: 6, dy: 4, textAnchor: "start" }}
          />
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            hideAxisLine
            hideTicks
            tickValues={
              data.length > 8 && innerWidth < 420
                ? data.filter((_, index) => index % 2 === data.length % 2).map((d) => d.month)
                : data.map((datum) => datum.month)
            }
            tickFormat={(value) => formatMonthShort(value)}
            tickLabelProps={{ ...AXIS_TICK, dy: 4, textAnchor: "middle" }}
          />
          {data.map((datum) => (
            <rect
              key={datum.month}
              x={(xScale(datum.month) ?? 0) - (xScale.step() - band) / 2}
              y={0}
              width={xScale.step()}
              height={innerHeight}
              fill="transparent"
              onPointerEnter={() => setActive(datum.month)}
              onPointerDown={() => setActive(datum.month)}
              onPointerLeave={() => setActive(null)}
            />
          ))}
        </g>
      </svg>
      {activeDatum && (
        <ChartTooltip
          left={margin.left + activeX}
          top={margin.top + 4}
          align={activeX < 96 ? "start" : activeX > innerWidth - 96 ? "end" : "center"}
        >
          <div className="text-micro text-fg-2">{formatMonthYear(activeDatum.month)}</div>
          <div className="flex items-center gap-2 num text-caption">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-accent" />
            <span className="text-fg-2">Ingresos</span>
            <span className="ml-auto pl-3 font-semibold text-fg">
              {formatMoney(activeDatum.income)}
            </span>
          </div>
          <div className="flex items-center gap-2 num text-caption">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-fg-3" />
            <span className="text-fg-2">Gastos</span>
            <span className="ml-auto pl-3 font-semibold text-fg">
              {formatMoney(activeDatum.expense)}
            </span>
          </div>
        </ChartTooltip>
      )}
    </>
  );
};

/** Barras agrupadas de ingresos (acento) y gastos (--text-3) por mes. */
export const CashflowBars = ({ height = 220, className, ...props }: CashflowBarsProps) => (
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
      headers={["Mes", "Ingresos", "Gastos"]}
      rows={props.data.map((datum) => [
        formatMonthYear(datum.month),
        formatMoney(datum.income),
        formatMoney(datum.expense),
      ])}
    />
  </div>
);

/** Leyenda compartida de las gráficas de flujo. */
export const CashflowLegend = ({ className }: { readonly className?: string }) => (
  <div className={cn("flex items-center gap-4 text-caption text-fg-2", className)}>
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="size-2 rounded-[2px] bg-accent" />
      Ingresos
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="size-2 rounded-[2px] bg-fg-3" />
      Gastos
    </span>
  </div>
);

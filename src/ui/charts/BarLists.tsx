import { scaleLinear } from "@visx/scale";
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { formatMoney, formatPercent } from "@/domain/money";
import type { Cents } from "@/domain/types";

import { EmojiChip } from "../Chip";
import { cn } from "../cn";
import { DURATION, EASE } from "../motion";

/* ───────────────────────── Barras horizontales ───────────────────────── */

export interface HBarItem {
  readonly id: string;
  readonly emoji: string;
  readonly label: string;
  readonly value: Cents;
}

export interface HBarListProps {
  readonly items: ReadonlyArray<HBarItem>;
  /** Total sobre el que se calcula el porcentaje de cada fila. */
  readonly total: Cents;
  readonly ariaLabel: string;
  /** Si se indica, las filas son botones (bajar a subcategorías). */
  readonly onSelect?: ((id: string) => void) | undefined;
  readonly className?: string;
}

const GrowBar = ({
  percent,
  className,
}: {
  readonly percent: number;
  readonly className: string;
}) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={cn("h-full rounded-full", className)}
      initial={reduceMotion ? false : { width: 0 }}
      animate={{ width: `${percent}%` }}
      transition={{ duration: DURATION.chart, ease: EASE }}
    />
  );
};

/**
 * Lista de barras horizontales ordenadas por importe. Es HTML semántico: la
 * propia lista es la alternativa textual de la gráfica.
 */
export const HBarList = ({ items, total, ariaLabel, onSelect, className }: HBarListProps) => {
  const max = Math.max(1, ...items.map((item) => item.value));
  const scale = scaleLinear({ domain: [0, max], range: [0, 100] });

  return (
    <ul aria-label={ariaLabel} className={cn("flex flex-col", className)}>
      {items.map((item) => {
        const share = total > 0 ? item.value / total : 0;
        const body = (
          <>
            <EmojiChip emoji={item.emoji} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-body text-fg">{item.label}</span>
                <span className="shrink-0 text-right num text-body font-medium text-fg">
                  {formatMoney(item.value)}
                </span>
              </span>
              <span className="mt-1.5 flex items-center gap-3">
                <span className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-track">
                  <GrowBar percent={scale(item.value)} className="bg-fg-2" />
                </span>
                <span className="w-10 shrink-0 text-right num text-caption text-fg-2">
                  {formatPercent(share)}
                </span>
              </span>
            </span>
            {onSelect !== undefined && (
              <ChevronRight
                aria-hidden="true"
                size={16}
                strokeWidth={1.75}
                className="shrink-0 text-fg-3"
              />
            )}
          </>
        );
        return (
          <li key={item.id}>
            {onSelect === undefined ? (
              <div className="flex min-h-14 min-w-0 items-center gap-3 py-2">{body}</div>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] min-w-0 items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-chip"
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/* ───────────────────────── Comparativa ───────────────────────── */

export interface BarCompareItem {
  readonly id: string;
  readonly emoji: string;
  readonly label: string;
  readonly current: Cents;
  readonly previous: Cents;
  /** Variación ya formateada: "+12 %", "−40,00 €". */
  readonly delta: string;
  /** El gasto sube ("up", en danger), baja ("down", en acento) o no cambia. */
  readonly trend: "up" | "down" | "flat";
}

export interface BarCompareProps {
  readonly items: ReadonlyArray<BarCompareItem>;
  readonly ariaLabel: string;
  readonly currentLabel: string;
  readonly previousLabel: string;
  readonly className?: string;
}

const trendTones = { up: "text-danger", down: "text-accent", flat: "text-fg-2" } as const;

/** Barras agrupadas: periodo actual (--text) frente al anterior (--text-3). */
export const BarCompare = ({
  items,
  ariaLabel,
  currentLabel,
  previousLabel,
  className,
}: BarCompareProps) => {
  const max = Math.max(1, ...items.flatMap((item) => [item.current, item.previous]));
  const scale = scaleLinear({ domain: [0, max], range: [0, 100] });

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-4 text-caption text-fg-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-[2px] bg-fg" />
          {currentLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-[2px] bg-fg-3" />
          {previousLabel}
        </span>
      </div>
      <ul aria-label={ariaLabel} className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex min-h-14 min-w-0 items-center gap-3 py-1.5">
            <EmojiChip emoji={item.emoji} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-body text-fg">{item.label}</span>
                <span
                  className={cn("shrink-0 num text-caption font-semibold", trendTones[item.trend])}
                >
                  {item.delta}
                </span>
              </div>
              <div className="mt-1.5 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-track">
                    <GrowBar percent={scale(item.current)} className="bg-fg" />
                  </div>
                  <span className="w-20 shrink-0 text-right num text-caption text-fg">
                    <span className="sr-only">{currentLabel}: </span>
                    {formatMoney(item.current)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-track">
                    <GrowBar percent={scale(item.previous)} className="bg-fg-3" />
                  </div>
                  <span className="w-20 shrink-0 text-right num text-caption text-fg-2">
                    <span className="sr-only">{previousLabel}: </span>
                    {formatMoney(item.previous)}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

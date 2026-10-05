import { ChevronLeft, ChevronRight } from "lucide-react";

import { addMonthsYm, formatMonthYear } from "@/domain/dates";
import type { YearMonth } from "@/domain/types";
import { cn, IconButton } from "@/ui";

export interface MonthSwitcherProps {
  readonly value: YearMonth;
  readonly onChange: (month: YearMonth) => void;
  /** Último mes al que se puede avanzar. */
  readonly max?: YearMonth;
  /** Texto alternativo al nombre del mes (por ejemplo, un año). */
  readonly label?: string;
  /** Meses que avanza cada pulsación (12 para navegar por años). */
  readonly step?: number;
  readonly className?: string;
}

/** Selector de mes: ‹ Octubre 2026 › */
export const MonthSwitcher = ({ value, onChange, max, label, step = 1, className }: MonthSwitcherProps) => {
  const next = addMonthsYm(value, step);
  const text = label ?? formatMonthYear(value);
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <IconButton
        label={step === 12 ? "Año anterior" : "Mes anterior"}
        variant="secondary"
        onClick={() => onChange(addMonthsYm(value, -step))}
      >
        <ChevronLeft aria-hidden="true" size={18} strokeWidth={1.75} />
      </IconButton>
      <div aria-live="polite" className="text-title text-fg min-w-36 px-2 text-center">
        {text}
      </div>
      <IconButton
        label={step === 12 ? "Año siguiente" : "Mes siguiente"}
        variant="secondary"
        disabled={max !== undefined && next > max}
        onClick={() => onChange(next)}
      >
        <ChevronRight aria-hidden="true" size={18} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
};

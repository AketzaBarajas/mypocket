import { ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "radix-ui";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  addDaysIso,
  addMonthsIso,
  addMonthsYm,
  daysInMonth,
  formatLongDate,
  formatMonthYear,
  makeIsoDate,
  mondayOf,
  monthOf,
  startOfMonthIso,
  yearOf,
} from "@/domain/dates";
import type { IsoDate, YearMonth } from "@/domain/types";

import { IconButton } from "./Button";
import { cn } from "./cn";

const WEEKDAYS = [
  { short: "L", long: "lunes" },
  { short: "M", long: "martes" },
  { short: "X", long: "miércoles" },
  { short: "J", long: "jueves" },
  { short: "V", long: "viernes" },
  { short: "S", long: "sábado" },
  { short: "D", long: "domingo" },
] as const;

/** Semanas (de lunes a domingo) que cubren un mes. */
const weeksOfMonth = (month: YearMonth): ReadonlyArray<ReadonlyArray<IsoDate>> => {
  const first = startOfMonthIso(month);
  const last = makeIsoDate(yearOf(month), Number(month.slice(5, 7)), daysInMonth(month)) ?? first;
  const weeks: IsoDate[][] = [];
  for (let monday = mondayOf(first); monday <= last; monday = addDaysIso(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDaysIso(monday, index)));
  }
  return weeks;
};

export interface CalendarProps {
  readonly value: IsoDate;
  readonly onChange: (value: IsoDate) => void;
  readonly today: IsoDate;
  readonly min?: IsoDate | undefined;
  readonly max?: IsoDate | undefined;
}

/** Calendario mensual en español con la semana empezando en lunes. */
export const Calendar = ({ value, onChange, today, min, max }: CalendarProps) => {
  const [focused, setFocused] = useState<IsoDate>(value);
  const gridRef = useRef<HTMLDivElement>(null);
  const month = monthOf(focused);
  const weeks = weeksOfMonth(month);

  const isDisabled = (date: IsoDate) =>
    (min !== undefined && date < min) || (max !== undefined && date > max);

  const focusDate = (date: IsoDate) => {
    setFocused(date);
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => IsoDate> = {
      ArrowLeft: () => addDaysIso(focused, -1),
      ArrowRight: () => addDaysIso(focused, 1),
      ArrowUp: () => addDaysIso(focused, -7),
      ArrowDown: () => addDaysIso(focused, 7),
      PageUp: () => addMonthsIso(focused, -1),
      PageDown: () => addMonthsIso(focused, 1),
      Home: () => mondayOf(focused),
      End: () => addDaysIso(mondayOf(focused), 6),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusDate(move());
  };

  return (
    <div className="w-[17.5rem] select-none">
      <div className="flex items-center justify-between pb-2">
        <IconButton
          label="Mes anterior"
          size="sm"
          onClick={() => setFocused(startOfMonthIso(addMonthsYm(month, -1)))}
        >
          <ChevronLeft aria-hidden="true" size={18} strokeWidth={1.75} />
        </IconButton>
        <div aria-live="polite" className="text-title text-fg">
          {formatMonthYear(month)}
        </div>
        <IconButton
          label="Mes siguiente"
          size="sm"
          onClick={() => setFocused(startOfMonthIso(addMonthsYm(month, 1)))}
        >
          <ChevronRight aria-hidden="true" size={18} strokeWidth={1.75} />
        </IconButton>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={formatMonthYear(month)}
        onKeyDown={onKeyDown}
        className="grid gap-y-0.5"
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday.long}
              role="columnheader"
              aria-label={weekday.long}
              className="flex h-8 items-center justify-center text-micro text-fg-2"
            >
              {weekday.short}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7">
            {week.map((date) => {
              const selected = date === value;
              const outside = monthOf(date) !== month;
              return (
                <div
                  key={date}
                  role="gridcell"
                  aria-selected={selected}
                  className="flex justify-center"
                >
                  <button
                    type="button"
                    data-date={date}
                    tabIndex={date === focused ? 0 : -1}
                    disabled={isDisabled(date)}
                    aria-label={formatLongDate(date)}
                    aria-current={date === today ? "date" : undefined}
                    onClick={() => onChange(date)}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-[9px] num text-caption transition-colors disabled:opacity-30",
                      selected
                        ? "bg-accent font-semibold text-on-accent"
                        : cn(
                            "hover:bg-chip",
                            outside ? "text-fg-3" : "text-fg",
                            date === today && "border border-border-strong",
                          ),
                    )}
                  >
                    {Number(date.slice(8, 10))}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export interface DatePickerProps extends CalendarProps {
  /** Disparador del selector; recibe las props de un botón. */
  readonly children: ReactNode;
  readonly align?: "start" | "center" | "end";
}

/** Calendario en un popover con accesos directos a hoy y ayer. */
export const DatePicker = ({
  children,
  align = "start",
  onChange,
  ...calendar
}: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const pick = (date: IsoDate) => {
    onChange(date);
    setOpen(false);
  };
  const yesterday = addDaysIso(calendar.today, -1);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] animate-pop-in rounded-card border border-border bg-raised p-3 shadow-(--shadow-raised)"
        >
          {/* `key` reinicia el mes visible cada vez que cambia la fecha elegida. */}
          <Calendar key={calendar.value} onChange={pick} {...calendar} />
          <div className="mt-2 flex gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => pick(calendar.today)}
              className="h-9 flex-1 rounded-[8px] text-caption font-semibold text-fg-2 transition-colors hover:bg-chip hover:text-fg"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => pick(yesterday)}
              className="h-9 flex-1 rounded-[8px] text-caption font-semibold text-fg-2 transition-colors hover:bg-chip hover:text-fg"
            >
              Ayer
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

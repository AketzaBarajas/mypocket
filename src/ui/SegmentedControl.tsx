import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "./cn";
import { DURATION, EASE } from "./motion";

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  /** Texto accesible cuando `label` no es texto plano. */
  readonly ariaLabel?: string;
  readonly badge?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: ReadonlyArray<SegmentedOption<T>>;
  readonly ariaLabel: string;
  readonly size?: "sm" | "md";
  readonly fullWidth?: boolean;
  readonly className?: string;
}

/** Selector segmentado con indicador deslizante. Semántica de grupo de radio. */
export const SegmentedControl = <T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  size = "md",
  fullWidth = true,
  className,
}: SegmentedControlProps<T>) => {
  const layoutId = useId();
  const reduceMotion = useReducedMotion();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = options.findIndex((option) => option.value === value);
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = current + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = current - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    const index = (next + options.length) % options.length;
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    refs.current[index]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={move}
      className={cn(
        "relative grid auto-cols-fr grid-flow-col gap-0.5 rounded-control border border-border bg-chip p-0.5",
        fullWidth ? "w-full" : "inline-grid",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "relative z-0 inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[8px] px-3 font-semibold transition-colors",
              size === "md" ? "h-10 text-body" : "h-8 text-caption",
              selected ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-[8px] border border-border-strong bg-surface"
                transition={
                  reduceMotion ? { duration: 0 } : { duration: DURATION.base, ease: EASE }
                }
              />
            )}
            <span className="truncate">{option.label}</span>
            {option.badge}
          </button>
        );
      })}
    </div>
  );
};

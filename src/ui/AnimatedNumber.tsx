import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { cents, splitMoney } from "@/domain/money";
import type { Cents } from "@/domain/types";

import { cn } from "./cn";
import { DURATION, EASE } from "./motion";

export interface AnimatedNumberProps {
  readonly value: Cents;
  readonly sign?: "auto" | "always" | "never";
  /** Pinta los céntimos y el símbolo en --text-2 (cifras display). */
  readonly dimFraction?: boolean;
  /** Desactiva el rodaje aunque el usuario permita animaciones. */
  readonly animated?: boolean;
  readonly className?: string;
}

/**
 * Importe que rueda desde el valor anterior al nuevo en 900 ms. La animación
 * escribe directamente en el DOM para no renderizar React en cada fotograma.
 */
export const AnimatedNumber = ({
  value,
  sign = "auto",
  dimFraction = false,
  animated = true,
  className,
}: AnimatedNumberProps) => {
  const reduceMotion = useReducedMotion();
  const integerRef = useRef<HTMLSpanElement>(null);
  const fractionRef = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  const parts = splitMoney(value, sign);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === null || from === value || !animated || reduceMotion) return;

    const paint = (current: number) => {
      const next = splitMoney(cents(Math.round(current)), sign);
      if (integerRef.current) integerRef.current.textContent = `${next.sign}${next.integer}`;
      if (fractionRef.current) fractionRef.current.textContent = `${next.fraction}${next.symbol}`;
    };
    const controls = animate(from, value, {
      duration: DURATION.number,
      ease: EASE,
      onUpdate: paint,
      onComplete: () => paint(value),
    });
    return () => controls.stop();
  }, [value, sign, animated, reduceMotion]);

  return (
    <span className={cn("num whitespace-nowrap", className)}>
      <span ref={integerRef}>
        {parts.sign}
        {parts.integer}
      </span>
      <span ref={fractionRef} className={cn(dimFraction && "text-fg-2")}>
        {parts.fraction}
        {parts.symbol}
      </span>
    </span>
  );
};

export interface MoneyProps {
  readonly value: Cents;
  readonly sign?: "auto" | "always" | "never";
  readonly dimFraction?: boolean;
  readonly className?: string;
}

/** Importe estático con la misma tipografía que `AnimatedNumber`. */
export const Money = ({ value, sign = "auto", dimFraction = false, className }: MoneyProps) => {
  const parts = splitMoney(value, sign);
  return (
    <span className={cn("num whitespace-nowrap", className)}>
      {parts.sign}
      {parts.integer}
      <span className={cn(dimFraction && "text-fg-2")}>
        {parts.fraction}
        {parts.symbol}
      </span>
    </span>
  );
};

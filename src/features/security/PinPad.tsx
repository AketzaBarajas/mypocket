import { motion, useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent } from "react";

import { PIN_LENGTH } from "@/security/pin";
import { cn, type KeypadKey, keypadKeyFromEvent, NumericKeypad } from "@/ui";

export interface PinPadProps {
  /** Dígitos tecleados hasta ahora. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Se llama al completar los 6 dígitos. */
  readonly onComplete: (pin: string) => void;
  readonly disabled?: boolean;
  /** Estado de comprobación: atenúa los puntos mientras se deriva la clave. */
  readonly busy?: boolean;
  /** Cambia para lanzar la sacudida de error. */
  readonly errorKey?: number;
  readonly label: string;
  readonly className?: string;
}

/** Entrada de PIN de 6 dígitos con teclado propio y soporte de teclado físico. */
export const PinPad = ({
  value,
  onChange,
  onComplete,
  disabled = false,
  busy = false,
  errorKey = 0,
  label,
  className,
}: PinPadProps) => {
  const reduceMotion = useReducedMotion();

  const press = (key: KeypadKey) => {
    if (disabled || busy || key === ",") return;
    if (key === "backspace") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= PIN_LENGTH) return;
    const next = value + key;
    onChange(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // No interfiere con campos de texto que haya en la misma pantalla.
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const key = keypadKeyFromEvent(event.key);
    if (key === null) return;
    event.preventDefault();
    press(key);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className={cn("flex w-full max-w-xs flex-col items-center gap-6", className)}>
      <motion.div
        key={errorKey}
        role="img"
        aria-label={`${label}: ${value.length} de ${PIN_LENGTH} dígitos`}
        className="flex h-4 items-center gap-3.5"
        animate={errorKey > 0 && !reduceMotion ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.32 }}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            className={cn(
              "size-3 rounded-full border transition-colors duration-100",
              index < value.length ? "border-fg bg-fg" : "border-border-strong bg-transparent",
              busy && "animate-skeleton",
            )}
          />
        ))}
      </motion.div>
      <NumericKeypad onKey={press} disabled={disabled || busy} digitsOnly className="w-full" />
    </div>
  );
};

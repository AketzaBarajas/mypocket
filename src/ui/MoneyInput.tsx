import { useState, type ComponentProps } from "react";

import { centsToInputValue, parseMoney } from "@/domain/money";
import type { Cents } from "@/domain/types";

import { cn } from "./cn";
import { controlClass } from "./Input";

export interface MoneyInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode"
> {
  readonly value: Cents | null;
  readonly onValueChange: (value: Cents | null) => void;
  /** Permite importes negativos (por defecto no). */
  readonly allowNegative?: boolean;
}

/**
 * Campo de importe en euros. Acepta coma o punto al escribir, guarda céntimos
 * enteros y normaliza el texto al salir ("12,5" → "12,50").
 */
export const MoneyInput = ({
  value,
  onValueChange,
  allowNegative = false,
  className,
  onBlur,
  onFocus,
  placeholder,
  ...props
}: MoneyInputProps) => {
  // Mientras el campo tiene el foco manda lo que escribe el usuario.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value === null ? "" : centsToInputValue(value));

  return (
    <div className={cn("relative flex min-w-0 items-center", className)}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder ?? "0,00"}
        className={cn(controlClass, "pr-8 text-right num")}
        value={display}
        onFocus={(event) => {
          setDraft(display);
          event.currentTarget.select();
          onFocus?.(event);
        }}
        onChange={(event) => {
          const text = event.currentTarget.value;
          if (!/^[-−]?[\d.,\s]*$/.test(text)) return;
          setDraft(text);
          const parsed = parseMoney(text);
          if (parsed === null) onValueChange(null);
          else onValueChange(!allowNegative && parsed < 0 ? null : parsed);
        }}
        onBlur={(event) => {
          setDraft(null);
          onBlur?.(event);
        }}
        {...props}
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 num text-fg-2">
        €
      </span>
    </div>
  );
};

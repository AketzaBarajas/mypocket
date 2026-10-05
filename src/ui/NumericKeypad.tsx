import { Delete } from "lucide-react";

import { cn } from "./cn";
import { KEYPAD_KEYS, type KeypadKey } from "./keypad";
import { haptic } from "./motion";

export interface NumericKeypadProps {
  readonly onKey: (key: KeypadKey) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

const labels: Partial<Record<KeypadKey, string>> = {
  ",": "Coma decimal",
  backspace: "Borrar",
};

/** Teclado numérico propio 3×4 para el alta rápida en móvil. */
export const NumericKeypad = ({ onKey, disabled = false, className }: NumericKeypadProps) => (
  <div
    role="group"
    aria-label="Teclado numérico"
    className={cn("grid grid-cols-3 gap-1.5", className)}
  >
    {KEYPAD_KEYS.map((key) => (
      <button
        key={key}
        type="button"
        disabled={disabled}
        aria-label={labels[key]}
        // Evita que el botón robe el foco y cierre un teclado o mueva el scroll.
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          haptic();
          onKey(key);
        }}
        className="inline-flex h-13 items-center justify-center rounded-control border border-border bg-key num text-h2 font-medium text-fg transition-colors duration-75 select-none hover:border-border-strong active:bg-track disabled:opacity-40"
      >
        {key === "backspace" ? <Delete aria-hidden="true" size={22} strokeWidth={1.75} /> : key}
      </button>
    ))}
  </div>
);

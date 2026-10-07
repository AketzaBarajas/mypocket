import { Check, Minus } from "lucide-react";
import { Checkbox as RadixCheckbox } from "radix-ui";

import { cn } from "./cn";

export interface CheckboxProps {
  /** "indeterminate" representa una selección parcial (cabecera de una tabla). */
  readonly checked: boolean | "indeterminate";
  readonly onCheckedChange: (checked: boolean) => void;
  /** Obligatorio: la casilla no lleva texto visible propio. */
  readonly label: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** Casilla de 20 px con objetivo táctil de 44 px. Marcada usa el acento. */
export const Checkbox = ({
  checked,
  onCheckedChange,
  label,
  id,
  disabled = false,
  className,
}: CheckboxProps) => (
  <RadixCheckbox.Root
    id={id}
    checked={checked}
    onCheckedChange={(next) => onCheckedChange(next === true)}
    disabled={disabled}
    aria-label={label}
    className={cn(
      "hit-44 inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border border-border-strong bg-surface text-on-accent transition-colors hover:border-fg-3 disabled:opacity-40 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
      className,
    )}
  >
    <RadixCheckbox.Indicator className="inline-flex">
      {checked === "indeterminate" ? (
        <Minus aria-hidden="true" size={14} strokeWidth={2.5} />
      ) : (
        <Check aria-hidden="true" size={14} strokeWidth={2.5} />
      )}
    </RadixCheckbox.Indicator>
  </RadixCheckbox.Root>
);

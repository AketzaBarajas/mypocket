import { Check, ChevronsUpDown } from "lucide-react";
import { Select as RadixSelect } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "./cn";
import { controlClass } from "./Input";

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly emoji?: string | undefined;
  readonly disabled?: boolean;
}

export interface SelectGroup<T extends string> {
  readonly label: string;
  readonly options: ReadonlyArray<SelectOption<T>>;
}

export interface SelectProps<T extends string> {
  readonly value: T | null;
  readonly onValueChange: (value: T) => void;
  readonly options?: ReadonlyArray<SelectOption<T>>;
  readonly groups?: ReadonlyArray<SelectGroup<T>>;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly size?: "sm" | "md";
  readonly className?: string;
  readonly "aria-describedby"?: string | undefined;
  readonly "aria-invalid"?: boolean | undefined;
}

const Item = <T extends string>({ option }: { readonly option: SelectOption<T> }): ReactNode => (
  <RadixSelect.Item
    value={option.value}
    disabled={option.disabled ?? false}
    className="relative flex h-10 cursor-pointer items-center gap-2 rounded-[8px] pr-8 pl-2 text-body text-fg outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-chip"
  >
    {option.emoji !== undefined && <span aria-hidden="true">{option.emoji}</span>}
    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
    <RadixSelect.ItemIndicator className="absolute right-2 inline-flex text-accent">
      <Check aria-hidden="true" size={16} strokeWidth={1.75} />
    </RadixSelect.ItemIndicator>
  </RadixSelect.Item>
);

/** Desplegable sobre Radix Select, con opciones planas o agrupadas. */
export const Select = <T extends string>({
  value,
  onValueChange,
  options,
  groups,
  placeholder = "Elegir",
  ariaLabel,
  id,
  disabled = false,
  size = "md",
  className,
  ...aria
}: SelectProps<T>) => (
  <RadixSelect.Root
    // Radix trata "" como «sin valor» y muestra el placeholder.
    value={value ?? ""}
    onValueChange={(next) => onValueChange(next as T)}
    disabled={disabled}
  >
    <RadixSelect.Trigger
      id={id}
      aria-label={ariaLabel}
      className={cn(
        controlClass,
        "inline-flex items-center justify-between gap-2 text-left data-[placeholder]:text-fg-3",
        size === "sm" && "h-9 px-2.5 text-caption",
        className,
      )}
      {...aria}
    >
      <span className="min-w-0 truncate">
        <RadixSelect.Value placeholder={placeholder} />
      </span>
      <RadixSelect.Icon className="shrink-0 text-fg-3">
        <ChevronsUpDown aria-hidden="true" size={16} strokeWidth={1.75} />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
    <RadixSelect.Portal>
      <RadixSelect.Content
        position="popper"
        sideOffset={6}
        collisionPadding={12}
        className="z-[70] max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) animate-pop-in overflow-hidden rounded-card border border-border bg-raised shadow-(--shadow-raised)"
      >
        <RadixSelect.Viewport className="p-1">
          {options?.map((option) => (
            <Item key={option.value} option={option} />
          ))}
          {groups?.map((group) => (
            <RadixSelect.Group key={group.label}>
              <RadixSelect.Label className="px-2 pt-2 pb-1 text-micro text-fg-2">
                {group.label}
              </RadixSelect.Label>
              {group.options.map((option) => (
                <Item key={option.value} option={option} />
              ))}
            </RadixSelect.Group>
          ))}
        </RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  </RadixSelect.Root>
);

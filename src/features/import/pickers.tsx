import { ChevronDown } from "lucide-react";
import { Popover } from "radix-ui";
import { useState, type ComponentProps, type ReactNode } from "react";

import { useAccounts, useLedger } from "@/data";
import { type CategoryKind, TRANSACTION_TYPES, type TransactionType } from "@/domain/types";
import { useCategoryOptions } from "@/features/transactions/pickers";
import { TYPE_LABELS } from "@/features/transactions/view";
import { cn, Combobox, Menu } from "@/ui";

export interface PickerButtonProps extends ComponentProps<"button"> {
  /** "warning" señala un dato que falta por elegir. */
  readonly tone?: "default" | "warning";
  /** "cell" se funde con la fila de una tabla; "chip" se usa en tarjetas y barras. */
  readonly look?: "cell" | "chip" | undefined;
  readonly trailing?: ReactNode;
}

/** Disparador de los desplegables de la vista previa: muestra el valor actual. */
export const PickerButton = ({
  tone = "default",
  look = "cell",
  trailing,
  className,
  children,
  ...props
}: PickerButtonProps) => (
  <button
    type="button"
    className={cn(
      "flex min-w-0 items-center gap-1.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-40",
      look === "cell"
        ? "h-8 w-full rounded-[6px] border border-transparent px-2 text-body hover:border-border hover:bg-chip data-[state=open]:border-border-strong data-[state=open]:bg-chip"
        : "hit-44 h-9 max-w-full rounded-chip border border-border bg-chip px-3 text-caption font-semibold hover:border-border-strong data-[state=open]:border-border-strong",
      tone === "warning" ? "text-warning" : "text-fg",
      className,
    )}
    {...props}
  >
    <span className="min-w-0 flex-1 truncate">{children}</span>
    {trailing}
    <ChevronDown aria-hidden="true" size={12} strokeWidth={1.75} className="shrink-0 text-fg-3" />
  </button>
);

interface PickerLook {
  readonly look?: "cell" | "chip" | undefined;
  readonly className?: string | undefined;
}

export const TypePicker = ({
  value,
  onChange,
  look,
  className,
}: PickerLook & {
  readonly value: TransactionType;
  readonly onChange: (type: TransactionType) => void;
}) => (
  <Menu
    align="start"
    actions={TRANSACTION_TYPES.map((type) => ({
      label: TYPE_LABELS[type],
      onSelect: () => onChange(type),
    }))}
  >
    <PickerButton aria-label={`Tipo: ${TYPE_LABELS[value]}`} look={look} className={className}>
      {TYPE_LABELS[value]}
    </PickerButton>
  </Menu>
);

export const AccountPicker = ({
  value,
  onChange,
  label,
  placeholder,
  exclude,
  prefix = "",
  action = false,
  look,
  className,
}: PickerLook & {
  readonly value: string | null;
  readonly onChange: (accountId: string) => void;
  /** Nombre del dato para lectores de pantalla: «Cuenta», «Cuenta de destino». */
  readonly label: string;
  readonly placeholder: string;
  /** Cuenta que no se ofrece (la de origen, al elegir destino). */
  readonly exclude?: string | null | undefined;
  readonly prefix?: string;
  /** Acción de la edición masiva: no hay valor que mostrar ni que echar en falta. */
  readonly action?: boolean;
}) => {
  const { accountById } = useLedger();
  const accounts = useAccounts();
  const current = value === null ? undefined : accountById.get(value);
  return (
    <Menu
      align="start"
      actions={accounts
        .filter((account) => account.id !== exclude)
        .map((account) => ({
          label: account.name,
          icon: <span>{account.emoji}</span>,
          onSelect: () => onChange(account.id),
        }))}
    >
      <PickerButton
        aria-label={action ? label : `${label}: ${current?.name ?? "sin elegir"}`}
        tone={current || action ? "default" : "warning"}
        look={look}
        className={className}
      >
        {prefix}
        {current ? `${current.emoji} ${current.name}` : placeholder}
      </PickerButton>
    </Menu>
  );
};

const CategorySearch = ({
  kind,
  value,
  onSelect,
}: {
  readonly kind: CategoryKind;
  readonly value: string | null;
  readonly onSelect: (categoryId: string) => void;
}) => {
  const options = useCategoryOptions(kind);
  return (
    <Combobox
      ariaLabel="Buscar categoría"
      placeholder="Buscar categoría"
      options={options}
      selected={value === null ? [] : [value]}
      autoFocus
      className="h-72"
      onSelect={onSelect}
    />
  );
};

/**
 * Buscador de categorías hoja en un popover. El contenido solo se monta al
 * abrirlo: en una tabla con miles de filas cada celda cuesta un botón.
 */
export const CategoryPicker = ({
  kind,
  value,
  onChange,
  children,
}: {
  readonly kind: CategoryKind;
  readonly value: string | null;
  readonly onChange: (categoryId: string) => void;
  /** Disparador: un único elemento que acepte ref. */
  readonly children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-72 animate-pop-in rounded-card border border-border bg-raised p-2 shadow-(--shadow-raised)"
        >
          <CategorySearch
            kind={kind}
            value={value}
            onSelect={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

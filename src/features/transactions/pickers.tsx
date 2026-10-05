import { ChevronDown, Hash, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useState, type ReactNode } from "react";

import { useLedger, useRepo } from "@/data";
import { leafCategories, parentOf } from "@/domain/categories";
import { mostUsedCategories } from "@/domain/transactions";
import type { Account, Category, CategoryKind, Tag } from "@/domain/types";
import { BottomSheet, Chip, cn, Combobox, Menu, type ComboboxOption } from "@/ui";

/* ───────────────────────── Categorías ───────────────────────── */

/** Opciones de categoría hoja para un buscador, con su madre como pista. */
export const useCategoryOptions = (kind: CategoryKind): ReadonlyArray<ComboboxOption> => {
  const { index } = useLedger();
  return useMemo(
    () =>
      leafCategories(index, kind).map((category) => {
        const parent = parentOf(index, category);
        return {
          value: category.id,
          label: category.name,
          emoji: category.emoji,
          hint: parent?.name,
          keywords: parent?.name,
        };
      }),
    [index, kind],
  );
};

/** Categorías hoja más usadas de un tipo, completadas con el resto del catálogo. */
export const useFrequentCategories = (kind: CategoryKind, limit = 10): ReadonlyArray<Category> => {
  const { index, transactions } = useLedger();
  return useMemo(() => {
    const leaves = leafCategories(index, kind);
    const byId = new Map(leaves.map((category) => [category.id, category]));
    const frequent = mostUsedCategories(transactions, kind, limit).flatMap((id) => {
      const category = byId.get(id);
      return category ? [category] : [];
    });
    const seen = new Set(frequent.map((category) => category.id));
    for (const category of leaves) {
      if (frequent.length >= limit) break;
      if (!seen.has(category.id)) frequent.push(category);
    }
    return frequent;
  }, [index, transactions, kind, limit]);
};

export interface CategoryChipRowProps {
  readonly kind: CategoryKind;
  readonly value: string | null;
  readonly onChange: (categoryId: string) => void;
  /** Indica que la categoría actual la eligió una regla. */
  readonly byRule?: boolean;
  readonly invalid?: boolean;
}

/** Fila desplazable de categorías frecuentes, con «Todas» para buscar. */
export const CategoryChipRow = ({
  kind,
  value,
  onChange,
  byRule = false,
  invalid = false,
}: CategoryChipRowProps) => {
  const { index } = useLedger();
  const frequent = useFrequentCategories(kind);
  const options = useCategoryOptions(kind);
  const [searching, setSearching] = useState(false);

  // La categoría elegida siempre se ve, aunque no esté entre las frecuentes.
  const selected = value === null ? undefined : index.byId.get(value);
  const chips =
    selected && !frequent.some((category) => category.id === selected.id)
      ? [selected, ...frequent]
      : frequent;

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Categoría"
        aria-invalid={invalid || undefined}
        className={cn(
          "-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 py-1 sm:-mx-5 sm:px-5",
          invalid && "[&>button]:border-danger/60",
        )}
      >
        {chips.map((category) => {
          const isSelected = category.id === value;
          return (
            <Chip
              key={category.id}
              role="radio"
              aria-checked={isSelected}
              selected={isSelected}
              leading={<span aria-hidden="true">{category.emoji}</span>}
              trailing={
                isSelected && byRule ? (
                  <span className="text-micro text-accent">regla</span>
                ) : undefined
              }
              onClick={() => onChange(category.id)}
            >
              {category.name}
            </Chip>
          );
        })}
        <Chip onClick={() => setSearching(true)}>Todas</Chip>
      </div>
      <BottomSheet open={searching} onOpenChange={setSearching} title="Elegir categoría" size="sm">
        <Combobox
          ariaLabel="Buscar categoría"
          placeholder="Buscar categoría"
          options={options}
          selected={value === null ? [] : [value]}
          autoFocus
          className="h-[min(60dvh,26rem)]"
          onSelect={(id) => {
            onChange(id);
            setSearching(false);
          }}
        />
      </BottomSheet>
    </>
  );
};

/* ───────────────────────── Cuentas ───────────────────────── */

export interface AccountChipProps {
  readonly accounts: ReadonlyArray<Account>;
  readonly value: string | null;
  readonly onChange: (accountId: string) => void;
  readonly label: string;
  readonly prefix?: ReactNode;
  readonly placeholder?: string;
  readonly invalid?: boolean;
}

/** Chip que muestra una cuenta y abre un menú para cambiarla. */
export const AccountChip = ({
  accounts,
  value,
  onChange,
  label,
  prefix,
  placeholder = "Cuenta",
  invalid = false,
}: AccountChipProps) => {
  const current = accounts.find((account) => account.id === value);
  return (
    <Menu
      align="start"
      actions={accounts.map((account) => ({
        label: account.name,
        icon: <span>{account.emoji}</span>,
        onSelect: () => onChange(account.id),
      }))}
    >
      <Chip
        aria-label={`${label}: ${current?.name ?? "sin elegir"}`}
        className={cn(invalid && "border-danger/60")}
        leading={
          <>
            {prefix}
            <span aria-hidden="true">{current?.emoji ?? "💳"}</span>
          </>
        }
        trailing={<ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} />}
      >
        {current?.name ?? placeholder}
      </Chip>
    </Menu>
  );
};

/* ───────────────────────── Etiquetas ───────────────────────── */

export interface TagPickerProps {
  readonly value: ReadonlyArray<string>;
  readonly onChange: (tagIds: ReadonlyArray<string>) => void;
}

/** Etiquetas del movimiento, con autocompletado y creación al vuelo. */
export const TagPicker = ({ value, onChange }: TagPickerProps) => {
  const { tags } = useLedger();
  const repo = useRepo();
  const [open, setOpen] = useState(false);
  const selected = value.flatMap((id): Tag[] => {
    const tag = tags.find((item) => item.id === id);
    return tag ? [tag] : [];
  });

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((tag) => (
        <Chip
          key={tag.id}
          size="sm"
          aria-label={`Quitar la etiqueta ${tag.name}`}
          trailing={<X aria-hidden="true" size={12} strokeWidth={1.75} />}
          onClick={() => toggle(tag.id)}
        >
          #{tag.name}
        </Chip>
      ))}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Chip size="sm" leading={<Hash aria-hidden="true" size={12} strokeWidth={1.75} />}>
            Etiqueta
          </Chip>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className="z-[60] w-64 animate-pop-in rounded-card border border-border bg-raised p-2 shadow-(--shadow-raised)"
          >
            <Combobox
              ariaLabel="Buscar o crear etiqueta"
              placeholder="Buscar o crear"
              emptyText="Escribe para crear una etiqueta"
              options={tags.map((tag) => ({ value: tag.id, label: `#${tag.name}` }))}
              selected={value}
              autoFocus
              className="h-56"
              onSelect={toggle}
              createLabel={(query) => `Crear #${query}`}
              onCreate={(name) => {
                const id = repo.ensureTag(name, tags);
                if (id !== null && !value.includes(id)) onChange([...value, id]);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
};

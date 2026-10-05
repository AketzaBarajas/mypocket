import { Check, Plus, Search } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "./cn";

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  readonly emoji?: string | undefined;
  /** Texto secundario a la derecha (por ejemplo, la categoría madre). */
  readonly hint?: string | undefined;
  /** Términos extra por los que también se encuentra la opción. */
  readonly keywords?: string | undefined;
}

export interface ComboboxProps {
  readonly options: ReadonlyArray<ComboboxOption>;
  /** Valores seleccionados (uno o varios). */
  readonly selected: ReadonlyArray<string>;
  readonly onSelect: (value: string) => void;
  /** Si se indica, ofrece crear una opción con el texto escrito. */
  readonly onCreate?: ((label: string) => void) | undefined;
  readonly createLabel?: (query: string) => string;
  readonly placeholder?: string;
  readonly ariaLabel: string;
  readonly emptyText?: string;
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly footer?: ReactNode;
}

const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/**
 * Buscador con lista de resultados (patrón combobox de ARIA). Se usa en línea,
 * dentro de hojas y popovers: no gestiona su propia capa flotante.
 */
export const Combobox = ({
  options,
  selected,
  onSelect,
  onCreate,
  createLabel = (query) => `Crear «${query}»`,
  placeholder = "Buscar",
  ariaLabel,
  emptyText = "Sin resultados",
  autoFocus = false,
  className,
  footer,
}: ComboboxProps) => {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const needle = fold(query);
  const filtered = useMemo(
    () =>
      needle === ""
        ? options
        : options.filter((option) =>
            fold(`${option.label} ${option.hint ?? ""} ${option.keywords ?? ""}`).includes(needle),
          ),
    [options, needle],
  );
  const canCreate =
    onCreate !== undefined &&
    needle !== "" &&
    !options.some((option) => fold(option.label) === needle);
  const total = filtered.length + (canCreate ? 1 : 0);
  const activeIndex = Math.min(active, Math.max(0, total - 1));
  const optionId = (index: number) => `${listId}-${index}`;

  const scrollTo = (index: number) => {
    setActive(index);
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`#${CSS.escape(optionId(index))}`)?.scrollIntoView({
        block: "nearest",
      });
    });
  };

  const choose = (index: number) => {
    const option = filtered[index];
    if (option) {
      onSelect(option.value);
      return;
    }
    if (canCreate && index === filtered.length) {
      onCreate(query.trim());
      setQuery("");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      scrollTo(total === 0 ? 0 : (activeIndex + 1) % total);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      scrollTo(total === 0 ? 0 : (activeIndex - 1 + total) % total);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <div className="relative flex shrink-0 items-center">
        <Search
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 text-fg-3"
        />
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={total > 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          // El buscador es el único propósito de la hoja que lo contiene.
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-control border border-border bg-surface pr-3 pl-9 text-fg transition-colors hover:border-border-strong focus:border-border-strong"
        />
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {filtered.map((option, index) => {
          const isSelected = selected.includes(option.value);
          return (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={isSelected}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
              className={cn(
                "flex h-11 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-body text-fg select-none",
                index === activeIndex && "bg-chip",
              )}
            >
              {option.emoji !== undefined && (
                <span aria-hidden="true" className="w-5 text-center">
                  {option.emoji}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint !== undefined && (
                <span className="max-w-[40%] truncate text-caption text-fg-2">{option.hint}</span>
              )}
              {isSelected && (
                <Check aria-hidden="true" size={16} strokeWidth={1.75} className="text-accent" />
              )}
            </li>
          );
        })}
        {canCreate && (
          <li
            id={optionId(filtered.length)}
            role="option"
            aria-selected={false}
            onPointerMove={() => setActive(filtered.length)}
            onClick={() => choose(filtered.length)}
            className={cn(
              "flex h-11 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-body text-fg select-none",
              activeIndex === filtered.length && "bg-chip",
            )}
          >
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} className="w-5 text-fg-2" />
            <span className="min-w-0 flex-1 truncate">{createLabel(query.trim())}</span>
          </li>
        )}
        {total === 0 && (
          <li role="presentation" className="px-2 py-6 text-center text-caption text-fg-2">
            {emptyText}
          </li>
        )}
      </ul>
      {footer}
    </div>
  );
};

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { useLedger } from "@/data";
import { formatNumericDate } from "@/domain/dates";
import { type PreviewRow, type RowPatch, summarize } from "@/domain/importing/pipeline";
import {
  commonType,
  filterPreview,
  type PreviewFilter,
  PREVIEW_FILTERS,
  previewFilterCounts,
} from "@/domain/importing/session";
import type { TransactionType } from "@/domain/types";
import { useScrollMargin } from "@/features/shared/useScrollMargin";
import { TYPE_LABELS } from "@/features/transactions/view";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  cn,
  EmptyState,
  Input,
  Menu,
  RowAmount,
  useIsDesktop,
} from "@/ui";

import { AccountPicker, CategoryPicker, PickerButton, TypePicker } from "./pickers";
import type { ResolveTarget } from "./types";
import { UnknownNames } from "./UnknownNames";

const FILTER_LABELS: Record<PreviewFilter, string> = {
  all: "Todas",
  new: "Nuevas",
  duplicate: "Duplicadas",
  error: "Con error",
  uncategorized: "Sin categoría",
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

type PatchRows = (indices: ReadonlyArray<number>, patch: RowPatch) => void;

/* ───────────────────────── Celdas ───────────────────────── */

const StatusBadge = ({ row }: { readonly row: PreviewRow }) =>
  row.status === "error" ? (
    <Badge tone="danger">Error</Badge>
  ) : row.status === "duplicate" ? (
    <Badge>Duplicado</Badge>
  ) : (
    <Badge tone="accent">Nuevo</Badge>
  );

interface CellProps {
  readonly row: PreviewRow;
  readonly onPatch: (patch: RowPatch) => void;
  readonly look?: "cell" | "chip";
}

/** Categoría de un gasto o ingreso; en una transferencia, su cuenta de destino. */
const CategoryCell = ({ row, onPatch, look }: CellProps) => {
  const { index } = useLedger();
  if (row.type === "transfer") {
    return (
      <AccountPicker
        label="Cuenta de destino"
        value={row.toAccountId}
        exclude={row.accountId}
        prefix="→ "
        placeholder={row.unknownToAccount ? `«${row.unknownToAccount}»` : "Elegir destino"}
        look={look}
        onChange={(toAccountId) => onPatch({ toAccountId })}
      />
    );
  }
  const category = row.categoryId === null ? undefined : index.byId.get(row.categoryId);
  return (
    <CategoryPicker
      kind={row.type}
      value={row.categoryId}
      onChange={(categoryId) => onPatch({ categoryId })}
    >
      <PickerButton
        aria-label={`Categoría: ${category?.name ?? "sin elegir"}`}
        tone={row.categoryId === null ? "warning" : "default"}
        look={look}
        trailing={
          row.ruleId !== null && <span className="shrink-0 text-micro text-accent">regla</span>
        }
      >
        {category
          ? `${category.emoji} ${category.name}`
          : row.categoryId !== null
            ? "…"
            : row.unknownCategory
              ? `«${row.unknownCategory}»`
              : "Elegir categoría"}
      </PickerButton>
    </CategoryPicker>
  );
};

const AccountCell = ({ row, onPatch, look }: CellProps) => (
  <AccountPicker
    label={row.type === "transfer" ? "Cuenta de origen" : "Cuenta"}
    value={row.accountId}
    placeholder={row.unknownAccount ? `«${row.unknownAccount}»` : "Elegir cuenta"}
    look={look}
    onChange={(accountId) => onPatch({ accountId })}
  />
);

const Amount = ({ row }: { readonly row: PreviewRow }) =>
  row.amount === null ? (
    <span className="num text-body text-fg-3">—</span>
  ) : (
    <RowAmount amount={row.amount} kind={row.type} />
  );

/* ───────────────────────── Filas ───────────────────────── */

interface RowProps {
  readonly row: PreviewRow;
  readonly selected: boolean;
  readonly offset: number;
  readonly rowIndex: number;
  readonly onPatch: PatchRows;
  readonly onToggleSelect: (index: number, range: boolean) => void;
  /** Solo las tarjetas: su altura varía y el virtualizador la mide. */
  readonly measure?: (element: HTMLElement | null) => void;
}

const stop = (event: MouseEvent) => event.stopPropagation();

const selectOnSpace =
  (row: PreviewRow, onToggleSelect: RowProps["onToggleSelect"]) =>
  (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === " " && event.target === event.currentTarget) {
      event.preventDefault();
      onToggleSelect(row.index, event.shiftKey);
    }
  };

const GRID =
  "grid grid-cols-[2.25rem_5rem_5.75rem_minmax(0,1.5fr)_7.25rem_8rem_minmax(0,1.5fr)_minmax(0,1.4fr)] items-center gap-2 px-3";

const TableRow = ({ row, selected, offset, rowIndex, onPatch, onToggleSelect }: RowProps) => {
  const patch = (change: RowPatch) => onPatch([row.index], change);
  const dimmed = !row.include && "opacity-55";
  return (
    <div
      role="row"
      aria-rowindex={rowIndex + 2}
      aria-selected={selected}
      tabIndex={0}
      onClick={(event) => onToggleSelect(row.index, event.shiftKey)}
      onKeyDown={selectOnSpace(row, onToggleSelect)}
      style={{ transform: `translateY(${offset}px)` }}
      className={cn(
        GRID,
        "absolute inset-x-0 top-0 h-11 cursor-default border-b border-border -outline-offset-2 transition-colors",
        selected ? "bg-accent-soft" : "hover:bg-chip",
      )}
    >
      <div role="cell" className="flex justify-center" onClick={stop}>
        <Checkbox
          label={`Importar ${row.concept === "" ? `la fila ${row.index + 1}` : row.concept}`}
          checked={row.include}
          disabled={row.status === "error"}
          onCheckedChange={(include) => patch({ include })}
        />
      </div>
      <div role="cell">
        <StatusBadge row={row} />
      </div>
      <div role="cell" className={cn("truncate num text-caption text-fg-2", dimmed)}>
        {row.date === null ? "—" : formatNumericDate(row.date)}
      </div>
      <div role="cell" className={cn("min-w-0 leading-tight", dimmed)}>
        <div className="truncate text-body text-fg">
          {row.concept === "" ? "Sin concepto" : row.concept}
        </div>
        {row.error !== null && <div className="truncate text-micro text-danger">{row.error}</div>}
      </div>
      <div role="cell" className={cn("text-right", dimmed)}>
        <Amount row={row} />
      </div>
      <div role="cell" className="min-w-0" onClick={stop}>
        <TypePicker value={row.type} onChange={(type) => patch({ type })} />
      </div>
      <div role="cell" className="min-w-0" onClick={stop}>
        <CategoryCell row={row} onPatch={patch} />
      </div>
      <div role="cell" className="min-w-0" onClick={stop}>
        <AccountCell row={row} onPatch={patch} />
      </div>
    </div>
  );
};

const CardRow = ({
  row,
  selected,
  offset,
  rowIndex,
  onPatch,
  onToggleSelect,
  measure,
}: RowProps) => {
  const patch = (change: RowPatch) => onPatch([row.index], change);
  const dimmed = !row.include && "opacity-55";
  return (
    <div
      ref={measure}
      data-index={rowIndex}
      role="listitem"
      tabIndex={0}
      onClick={(event) => onToggleSelect(row.index, event.shiftKey)}
      onKeyDown={selectOnSpace(row, onToggleSelect)}
      style={{ transform: `translateY(${offset}px)` }}
      className="absolute inset-x-0 top-0 pb-2 -outline-offset-2"
    >
      <div
        className={cn(
          "flex flex-col gap-2 rounded-card border p-3 transition-colors",
          selected ? "border-accent bg-accent-soft" : "border-border bg-surface",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-6 items-center" onClick={stop}>
            <Checkbox
              label={`Importar ${row.concept === "" ? `la fila ${row.index + 1}` : row.concept}`}
              checked={row.include}
              disabled={row.status === "error"}
              onCheckedChange={(include) => patch({ include })}
            />
          </span>
          <div className={cn("min-w-0 flex-1", dimmed)}>
            <div className="truncate text-body text-fg">
              {row.concept === "" ? "Sin concepto" : row.concept}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <span className="num text-caption text-fg-2">
                {row.date === null ? "—" : formatNumericDate(row.date)}
              </span>
              <StatusBadge row={row} />
              {selected && <span className="sr-only">Seleccionada</span>}
              {row.error !== null && (
                <span className="truncate text-caption text-danger">{row.error}</span>
              )}
            </div>
          </div>
          <span className={cn(dimmed)}>
            <Amount row={row} />
          </span>
        </div>
        <div className="flex flex-wrap gap-2" onClick={stop}>
          <TypePicker look="chip" value={row.type} onChange={(type) => patch({ type })} />
          <CategoryCell look="chip" row={row} onPatch={patch} />
          <AccountCell look="chip" row={row} onPatch={patch} />
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────── Listas virtualizadas ───────────────────────── */

interface ListProps {
  readonly rows: ReadonlyArray<PreviewRow>;
  readonly selected: ReadonlySet<number>;
  readonly onPatch: PatchRows;
  readonly onToggleSelect: (index: number, range: boolean) => void;
}

const PreviewTable = ({ rows, selected, onPatch, onToggleSelect }: ListProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useScrollMargin(listRef);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 44,
    getItemKey: (index) => rows[index]?.index ?? index,
    overscan: 20,
    scrollMargin,
  });
  const included = rows.filter((row) => row.include).length;
  const selectable = rows.filter((row) => row.status !== "error");

  return (
    <div
      role="table"
      aria-label="Filas del archivo"
      aria-rowcount={rows.length + 1}
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <div role="rowgroup">
        <div role="row" className={cn(GRID, "h-10 border-b border-border text-caption text-fg-2")}>
          <div role="columnheader" className="flex justify-center">
            <Checkbox
              label="Importar todas las filas visibles"
              checked={
                included === 0 ? false : included === selectable.length ? true : "indeterminate"
              }
              disabled={selectable.length === 0}
              onCheckedChange={(include) =>
                onPatch(
                  selectable.map((row) => row.index),
                  { include },
                )
              }
            />
          </div>
          <div role="columnheader">Estado</div>
          <div role="columnheader">Fecha</div>
          <div role="columnheader">Concepto</div>
          <div role="columnheader" className="text-right">
            Importe
          </div>
          <div role="columnheader" className="pl-2">
            Tipo
          </div>
          <div role="columnheader" className="pl-2">
            Categoría
          </div>
          <div role="columnheader" className="pl-2">
            Cuenta
          </div>
        </div>
      </div>
      <div
        ref={listRef}
        role="rowgroup"
        className="relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtual) => {
          const row = rows[virtual.index];
          if (!row) return null;
          return (
            <TableRow
              key={virtual.key}
              row={row}
              rowIndex={virtual.index}
              selected={selected.has(row.index)}
              offset={virtual.start - virtualizer.options.scrollMargin}
              onPatch={onPatch}
              onToggleSelect={onToggleSelect}
            />
          );
        })}
      </div>
    </div>
  );
};

const PreviewCards = ({ rows, selected, onPatch, onToggleSelect }: ListProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useScrollMargin(listRef);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 124,
    getItemKey: (index) => rows[index]?.index ?? index,
    overscan: 8,
    scrollMargin,
  });

  return (
    <div
      ref={listRef}
      role="list"
      aria-label="Filas del archivo"
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtual) => {
        const row = rows[virtual.index];
        if (!row) return null;
        return (
          <CardRow
            key={virtual.key}
            row={row}
            rowIndex={virtual.index}
            selected={selected.has(row.index)}
            offset={virtual.start - virtualizer.options.scrollMargin}
            measure={virtualizer.measureElement}
            onPatch={onPatch}
            onToggleSelect={onToggleSelect}
          />
        );
      })}
    </div>
  );
};

/* ───────────────────────── Edición masiva ───────────────────────── */

const BulkBar = ({
  rows,
  visibleCount,
  onPatch,
  onSelectVisible,
  onClear,
}: {
  readonly rows: ReadonlyArray<PreviewRow>;
  readonly visibleCount: number;
  readonly onPatch: (patch: RowPatch) => void;
  readonly onSelectVisible: () => void;
  readonly onClear: () => void;
}) => {
  const type = commonType(rows);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-caption text-fg-2">
          Toca una fila para seleccionarla y editar varias a la vez.
        </p>
        <Button size="sm" variant="ghost" disabled={visibleCount === 0} onClick={onSelectVisible}>
          Seleccionar las {visibleCount} visibles
        </Button>
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Editar las filas seleccionadas"
      className="-mx-4 no-scrollbar flex min-h-11 items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      <span className="shrink-0 text-caption text-fg">
        <span className="num">{rows.length}</span>{" "}
        {rows.length === 1 ? "seleccionada" : "seleccionadas"}
      </span>
      <Menu
        align="start"
        actions={(["expense", "income", "transfer"] satisfies TransactionType[]).map((value) => ({
          label: TYPE_LABELS[value],
          onSelect: () => onPatch({ type: value }),
        }))}
      >
        <PickerButton look="chip">Tipo</PickerButton>
      </Menu>
      {type === "transfer" ? (
        <AccountPicker
          look="chip"
          action
          label="Cuenta de destino"
          value={null}
          placeholder="Destino"
          onChange={(toAccountId) => onPatch({ toAccountId })}
        />
      ) : type === null ? (
        <PickerButton look="chip" disabled title="La selección mezcla tipos de movimiento">
          Categoría
        </PickerButton>
      ) : (
        <CategoryPicker kind={type} value={null} onChange={(categoryId) => onPatch({ categoryId })}>
          <PickerButton look="chip">Categoría</PickerButton>
        </CategoryPicker>
      )}
      <AccountPicker
        look="chip"
        action
        label="Cuenta"
        value={null}
        placeholder="Cuenta"
        onChange={(accountId) => onPatch({ accountId })}
      />
      <Chip onClick={() => onPatch({ include: true })}>Incluir</Chip>
      <Chip onClick={() => onPatch({ include: false })}>Excluir</Chip>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Quitar selección
      </Button>
    </div>
  );
};

/* ───────────────────────── Paso ───────────────────────── */

export interface PreviewStepProps {
  readonly rows: ReadonlyArray<PreviewRow>;
  /** Se están recalculando los duplicados tras una edición. */
  readonly hashing: boolean;
  readonly onPatch: PatchRows;
  readonly onResolve: (target: ResolveTarget) => void;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

/** Paso 3: revisar cada fila, resolver lo que falta y decidir qué se importa. */
export const PreviewStep = ({
  rows,
  hashing,
  onPatch,
  onResolve,
  onBack,
  onContinue,
}: PreviewStepProps) => {
  const isDesktop = useIsDesktop();
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const anchor = useRef<number | null>(null);

  const summary = useMemo(() => summarize(rows), [rows]);
  const counts = useMemo(() => previewFilterCounts(rows), [rows]);
  const visible = useMemo(() => filterPreview(rows, filter, query), [rows, filter, query]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.index)),
    [rows, selected],
  );

  const toggleSelect = (index: number, range: boolean) => {
    const from = anchor.current;
    anchor.current = index;
    setSelected((current) => {
      const next = new Set(current);
      const start = from === null ? -1 : visible.findIndex((row) => row.index === from);
      const end = visible.findIndex((row) => row.index === index);
      if (range && start !== -1 && end !== -1) {
        for (const row of visible.slice(Math.min(start, end), Math.max(start, end) + 1)) {
          next.add(row.index);
        }
      } else if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const left = rows.length - summary.ready;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-title text-fg">
            {summary.ready === 0
              ? "Todavía no hay nada que importar"
              : `Se ${summary.ready === 1 ? "importará" : "importarán"} ${plural(summary.ready, "movimiento", "movimientos")}`}
          </h2>
          <p className="mt-1 text-body text-fg-2">
            {left === 0
              ? `Las ${rows.length} filas del archivo están listas.`
              : `${plural(left, "fila se queda", "filas se quedan")} fuera: duplicadas, con error, sin categoría o desmarcadas.`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={onBack}>
            Atrás
          </Button>
          <Button
            variant="primary"
            pending={hashing}
            disabled={summary.ready === 0}
            onClick={onContinue}
          >
            Revisar e importar
          </Button>
        </div>
      </Card>

      <UnknownNames rows={rows} onResolve={onResolve} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label="Filtrar filas"
            className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0"
          >
            {PREVIEW_FILTERS.map((value) => (
              <Chip
                key={value}
                selected={filter === value}
                disabled={value !== "all" && counts[value] === 0 && filter !== value}
                trailing={
                  <span className={cn("num", filter === value ? "text-fg-2" : "text-fg-3")}>
                    {counts[value]}
                  </span>
                }
                onClick={() => setFilter(value)}
              >
                {FILTER_LABELS[value]}
              </Chip>
            ))}
          </div>
          <Input
            type="search"
            aria-label="Buscar en las filas"
            placeholder="Buscar por concepto"
            autoComplete="off"
            leading={<Search aria-hidden="true" size={16} strokeWidth={1.75} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="lg:w-72"
          />
        </div>
        <BulkBar
          rows={selectedRows}
          visibleCount={visible.length}
          onPatch={(patch) =>
            onPatch(
              selectedRows.map((row) => row.index),
              patch,
            )
          }
          onSelectVisible={() => setSelected(new Set(visible.map((row) => row.index)))}
          onClear={() => setSelected(new Set())}
        />
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon="🔎"
            title="Ninguna fila coincide"
            description="Prueba con otro filtro o con otra búsqueda."
            actions={
              <Button
                variant="secondary"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Ver todas
              </Button>
            }
          />
        </Card>
      ) : isDesktop ? (
        <PreviewTable
          rows={visible}
          selected={selected}
          onPatch={onPatch}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <PreviewCards
          rows={visible}
          selected={selected}
          onPatch={onPatch}
          onToggleSelect={toggleSelect}
        />
      )}
    </div>
  );
};

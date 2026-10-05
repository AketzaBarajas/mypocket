import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Check, Ellipsis, Pencil, SkipForward, Trash2 } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useLedger } from "@/data";
import { formatDayHeader, formatNumericDate } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { groupByDay } from "@/domain/transactions";
import type { Cents, IsoDate, Transaction } from "@/domain/types";
import { useToday } from "@/features/shell/useToday";
import {
  Badge,
  Button,
  cn,
  EmojiChip,
  IconButton,
  Menu,
  type MenuAction,
  RowAmount,
  RowContextMenu,
  SwipeRow,
  TransactionRow,
} from "@/ui";

import type { TransactionActions } from "./useTransactionActions";
import { describeTransaction, type TransactionView } from "./view";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

const menuActions = (transaction: Transaction, actions: TransactionActions): MenuAction[] => [
  ...(transaction.status === "pending"
    ? [
        {
          label: "Aprobar",
          icon: <Check {...ICON} />,
          onSelect: () => actions.approve(transaction),
        },
        {
          label: "Omitir",
          icon: <SkipForward {...ICON} />,
          onSelect: () => actions.skip(transaction),
        },
      ]
    : []),
  { label: "Editar", icon: <Pencil {...ICON} />, onSelect: () => actions.edit(transaction) },
  {
    label: "Borrar",
    icon: <Trash2 {...ICON} />,
    tone: "danger",
    onSelect: () => actions.remove(transaction),
  },
];

/** Mide la distancia de un elemento al inicio del documento, para el virtualizador. */
const useScrollMargin = (ref: React.RefObject<HTMLElement | null>): number => {
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setMargin(element.getBoundingClientRect().top + window.scrollY);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);
  return margin;
};

/* ───────────────────────── Lista agrupada (móvil y tablet) ───────────────────────── */

type ListItem =
  | { readonly kind: "header"; readonly key: string; readonly date: IsoDate; readonly net: Cents }
  | {
      readonly kind: "row";
      readonly key: string;
      readonly transaction: Transaction;
      readonly last: boolean;
    };

export interface TransactionListProps {
  readonly transactions: ReadonlyArray<Transaction>;
  readonly actions: TransactionActions;
}

/** Lista virtualizada agrupada por día, con el total neto de cada día. */
export const GroupedTransactionList = ({ transactions, actions }: TransactionListProps) => {
  const ledger = useLedger();
  const today = useToday();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useScrollMargin(listRef);

  const items = useMemo<ReadonlyArray<ListItem>>(
    () =>
      groupByDay(transactions).flatMap((group): ListItem[] => [
        { kind: "header", key: `h-${group.date}`, date: group.date, net: group.net },
        ...group.transactions.map((transaction, index): ListItem => ({
          kind: "row",
          key: transaction.id,
          transaction,
          last: index === group.transactions.length - 1,
        })),
      ]),
    [transactions],
  );

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (index) => {
      const item = items[index];
      if (!item || item.kind === "header") return 40;
      return item.transaction.status === "pending" ? 108 : 60;
    },
    getItemKey: (index) => items[index]?.key ?? index,
    overscan: 12,
    scrollMargin,
  });

  return (
    <div
      ref={listRef}
      role="list"
      aria-label="Movimientos"
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtual) => {
        const item = items[virtual.index];
        if (!item) return null;
        const style = {
          transform: `translateY(${virtual.start - virtualizer.options.scrollMargin}px)`,
        };

        if (item.kind === "header") {
          return (
            <div
              key={virtual.key}
              data-index={virtual.index}
              ref={virtualizer.measureElement}
              role="presentation"
              style={style}
              className="absolute inset-x-0 top-0 flex h-10 items-end justify-between px-1 pb-1.5"
            >
              <h2 className="text-caption text-fg-2">{formatDayHeader(item.date, today)}</h2>
              <span className="num text-caption text-fg-2">
                {item.net === 0 ? "" : formatMoney(item.net, { sign: "always" })}
              </span>
            </div>
          );
        }

        const { transaction } = item;
        const view = describeTransaction(transaction, ledger, today);
        const pending = transaction.status === "pending";
        return (
          <div
            key={virtual.key}
            data-index={virtual.index}
            ref={virtualizer.measureElement}
            role="listitem"
            style={style}
            className="absolute inset-x-0 top-0"
          >
            <SwipeRow
              className={cn(
                "border-x border-border bg-surface",
                virtual.index > 0 && items[virtual.index - 1]?.kind === "header"
                  ? "rounded-t-card border-t"
                  : "border-t",
                item.last && "rounded-b-card border-b",
              )}
              leading={
                pending
                  ? {
                      label: "Aprobar",
                      icon: <Check {...ICON} />,
                      onTrigger: () => actions.approve(transaction),
                    }
                  : {
                      label: "Editar",
                      icon: <Pencil {...ICON} />,
                      tone: "neutral",
                      onTrigger: () => actions.edit(transaction),
                    }
              }
              trailing={
                pending
                  ? {
                      label: "Omitir",
                      icon: <SkipForward {...ICON} />,
                      tone: "neutral",
                      onTrigger: () => actions.skip(transaction),
                    }
                  : {
                      label: "Borrar",
                      icon: <Trash2 {...ICON} />,
                      onTrigger: () => actions.remove(transaction),
                    }
              }
            >
              <button
                type="button"
                onClick={() => actions.edit(transaction)}
                className="block w-full text-left transition-colors hover:bg-chip"
              >
                <TransactionRow
                  emoji={view.emoji}
                  title={view.title}
                  subtitle={view.subtitle}
                  amount={transaction.amount}
                  kind={view.kind}
                  status={view.status}
                />
              </button>
              {pending && (
                <div className="flex gap-2 px-4 pb-3 pl-16">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => actions.approve(transaction)}
                  >
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => actions.skip(transaction)}
                  >
                    Omitir
                  </Button>
                </div>
              )}
            </SwipeRow>
          </div>
        );
      })}
    </div>
  );
};

/* ───────────────────────── Tabla densa (escritorio) ───────────────────────── */

type SortKey = "date" | "concept" | "category" | "account" | "amount";
interface Sort {
  readonly key: SortKey;
  readonly direction: "asc" | "desc";
}

const COLUMNS: ReadonlyArray<{
  readonly key: SortKey;
  readonly label: string;
  readonly align?: "right";
}> = [
  { key: "date", label: "Fecha" },
  { key: "concept", label: "Concepto" },
  { key: "category", label: "Categoría" },
  { key: "account", label: "Cuenta" },
  { key: "amount", label: "Importe", align: "right" },
];

const GRID =
  "grid grid-cols-[7.5rem_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_8.5rem_2.75rem] items-center gap-3 px-4";

/** Tabla virtualizada con columnas ordenables y menú contextual. */
export const TransactionTable = ({ transactions, actions }: TransactionListProps) => {
  const ledger = useLedger();
  const today = useToday();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useScrollMargin(listRef);
  const [sort, setSort] = useState<Sort>({ key: "date", direction: "desc" });

  const rows = useMemo(() => {
    const described = transactions.map((transaction) => ({
      transaction,
      view: describeTransaction(transaction, ledger, today),
    }));
    // Por fecha descendente ya viene ordenado desde el dominio.
    if (sort.key === "date" && sort.direction === "desc") return described;

    const compare: Record<
      SortKey,
      (a: (typeof described)[number], b: (typeof described)[number]) => number
    > = {
      date: (a, b) => a.transaction.date.localeCompare(b.transaction.date),
      concept: (a, b) => a.view.title.localeCompare(b.view.title, "es"),
      category: (a, b) => a.view.categoryName.localeCompare(b.view.categoryName, "es"),
      account: (a, b) => a.view.accountName.localeCompare(b.view.accountName, "es"),
      amount: (a, b) => a.transaction.amount - b.transaction.amount,
    };
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...described].sort((a, b) => compare[sort.key](a, b) * direction);
  }, [transactions, ledger, today, sort]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 44,
    getItemKey: (index) => rows[index]?.transaction.id ?? index,
    overscan: 20,
    scrollMargin,
  });

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "date" || key === "amount" ? "desc" : "asc" },
    );

  return (
    <div
      role="table"
      aria-label="Movimientos"
      aria-rowcount={rows.length + 1}
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <div role="rowgroup">
        <div role="row" className={cn(GRID, "h-10 border-b border-border")}>
          {COLUMNS.map((column) => {
            const active = sort.key === column.key;
            const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
            return (
              <div
                key={column.key}
                role="columnheader"
                aria-sort={
                  active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
                }
                className={cn("min-w-0", column.align === "right" && "text-right")}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-[6px] text-caption transition-colors hover:text-fg",
                    active ? "text-fg" : "text-fg-2",
                  )}
                >
                  {column.label}
                  {active && <Arrow aria-hidden="true" size={12} strokeWidth={1.75} />}
                </button>
              </div>
            );
          })}
          <div role="columnheader" className="sr-only">
            Acciones
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
              transaction={row.transaction}
              view={row.view}
              actions={actions}
              rowIndex={virtual.index}
              offset={virtual.start - virtualizer.options.scrollMargin}
            />
          );
        })}
      </div>
    </div>
  );
};

const TableRow = ({
  transaction,
  view,
  actions,
  rowIndex,
  offset,
}: {
  readonly transaction: Transaction;
  readonly view: TransactionView;
  readonly actions: TransactionActions;
  readonly rowIndex: number;
  readonly offset: number;
}) => {
  const items = menuActions(transaction, actions);
  return (
    <RowContextMenu actions={items}>
      <div
        role="row"
        aria-rowindex={rowIndex + 2}
        tabIndex={0}
        onClick={() => actions.edit(transaction)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target === event.currentTarget)
            actions.edit(transaction);
        }}
        style={{ transform: `translateY(${offset}px)` }}
        className={cn(
          GRID,
          "absolute inset-x-0 top-0 h-11 cursor-pointer border-b border-border -outline-offset-2 transition-colors hover:bg-chip",
        )}
      >
        <div role="cell" className="truncate num text-caption text-fg-2">
          {formatNumericDate(transaction.date)}
        </div>
        <div role="cell" className="flex min-w-0 items-center gap-2.5">
          <EmojiChip emoji={view.emoji} size="sm" className="size-7 text-[13px]" />
          <span className="truncate text-body text-fg">{view.title}</span>
          {view.status === "pending" && <Badge>Pendiente</Badge>}
          {view.status === "overdue" && <Badge tone="warning">Vencido</Badge>}
        </div>
        <div role="cell" className="truncate text-body text-fg-2">
          {view.kind === "transfer" ? view.subtitle : view.categoryName}
        </div>
        <div role="cell" className="truncate text-body text-fg-2">
          {view.accountName}
        </div>
        <div role="cell" className="text-right">
          <RowAmount amount={transaction.amount} kind={view.kind} />
        </div>
        <div role="cell" className="flex justify-end" onClick={(event) => event.stopPropagation()}>
          <Menu actions={items}>
            <IconButton label={`Acciones de ${view.title}`} size="sm">
              <Ellipsis aria-hidden="true" {...ICON} />
            </IconButton>
          </Menu>
        </div>
      </div>
    </RowContextMenu>
  );
};

/* ───────────────────────── Lista corta (detalle de cuenta, Inicio) ───────────────────────── */

/** Lista sin virtualizar para un número pequeño de movimientos. */
export const SimpleTransactionList = ({ transactions, actions }: TransactionListProps) => {
  const ledger = useLedger();
  const today = useToday();
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {transactions.map((transaction) => {
        const view = describeTransaction(transaction, ledger, today);
        return (
          <li key={transaction.id}>
            <button
              type="button"
              onClick={() => actions.edit(transaction)}
              className="block w-full text-left transition-colors hover:bg-chip"
            >
              <TransactionRow
                emoji={view.emoji}
                title={view.title}
                subtitle={`${formatDayHeader(transaction.date, today)} · ${view.subtitle}`}
                amount={transaction.amount}
                kind={view.kind}
                status={view.status}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
};

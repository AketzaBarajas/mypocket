import { Link } from "@tanstack/react-router";
import { ChevronDown, Plus, Search, SlidersHorizontal, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAccounts, useLedger, useTransactions } from "@/data";
import { topLevelCategories } from "@/domain/categories";
import { formatMonthName, formatShortDate, monthOf } from "@/domain/dates";
import { cashflowOf, monthRangeOf } from "@/domain/spending";
import { pendingTransactions } from "@/domain/transactions";
import { type IsoDate, TRANSACTION_TYPES } from "@/domain/types";
import { useUi } from "@/features/shell/uiStore";
import { useToday } from "@/features/shell/useToday";
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  DatePicker,
  EmptyState,
  IconButton,
  Input,
  Menu,
  Money,
  PageHeader,
  useIsDesktop,
} from "@/ui";

import { advancedFilterCount, hasAnyFilter, toFilter, type TransactionsSearch } from "./search";
import { GroupedTransactionList, TransactionTable } from "./TransactionList";
import { useTransactionActions } from "./useTransactionActions";
import { TYPE_LABELS } from "./view";

export interface TransactionsPageProps {
  readonly search: TransactionsSearch;
  /** Actualiza los parámetros de la URL. `replace` evita llenar el historial al teclear. */
  readonly onSearchChange: (patch: Partial<TransactionsSearch>, replace?: boolean) => void;
  readonly onNew: () => void;
}

const toggle = <T extends string>(
  list: ReadonlyArray<T> | undefined,
  value: T,
): T[] | undefined => {
  const current = list ?? [];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return next.length === 0 ? undefined : next;
};

const FilterGroup = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="mb-2 text-caption text-fg-2">{title}</legend>
    <div className="flex flex-wrap gap-2">{children}</div>
  </fieldset>
);

const DateChip = ({
  label,
  value,
  today,
  onChange,
}: {
  readonly label: string;
  readonly value: IsoDate | undefined;
  readonly today: IsoDate;
  readonly onChange: (value: IsoDate | undefined) => void;
}) => (
  <span className="inline-flex items-center gap-1">
    <DatePicker value={value ?? today} today={today} onChange={onChange}>
      <Chip selected={value !== undefined}>
        {label}: {value === undefined ? "cualquiera" : formatShortDate(value)}
      </Chip>
    </DatePicker>
    {value !== undefined && (
      <IconButton
        label={`Quitar ${label.toLowerCase()}`}
        size="sm"
        onClick={() => onChange(undefined)}
      >
        <X aria-hidden="true" size={14} strokeWidth={1.75} />
      </IconButton>
    )}
  </span>
);

export const TransactionsPage = ({ search, onSearchChange, onNew }: TransactionsPageProps) => {
  const ledger = useLedger();
  const accounts = useAccounts({ includeArchived: true });
  const today = useToday();
  const isDesktop = useIsDesktop();
  const actions = useTransactionActions();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const consumeSearchFocus = useUi((state) => state.consumeSearchFocus);
  const focusRequested = useUi((state) => state.searchFocusRequested);

  // Atajo «/»: enfoca el buscador, también al llegar desde otra pantalla.
  useEffect(() => {
    if (focusRequested && consumeSearchFocus()) searchRef.current?.focus();
  }, [focusRequested, consumeSearchFocus]);

  const filter = useMemo(() => toFilter(search), [search]);
  const transactions = useTransactions(filter);
  const pendingCount = useMemo(
    () => pendingTransactions(ledger.transactions, today).length,
    [ledger.transactions, today],
  );
  const month = monthOf(today);
  const monthNet = useMemo(
    () => cashflowOf(ledger.transactions, monthRangeOf(month)).net,
    [ledger.transactions, month],
  );

  const hasTransactions = ledger.transactions.some((transaction) => !transaction.isDeleted);
  const filtered = hasAnyFilter(search);
  const advanced = advancedFilterCount(search);
  const singleAccount =
    search.cuentas?.length === 1 ? ledger.accountById.get(search.cuentas[0] ?? "") : undefined;
  const expenseCategories = topLevelCategories(ledger.index, "expense");
  const incomeCategories = topLevelCategories(ledger.index, "income");

  const clearAll = () =>
    onSearchChange({
      q: undefined,
      estado: undefined,
      cuentas: undefined,
      tipos: undefined,
      categorias: undefined,
      etiquetas: undefined,
      desde: undefined,
      hasta: undefined,
    });

  return (
    <>
      <PageHeader
        title="Movimientos"
        subtitle={
          <>
            Balance de {formatMonthName(month)}:{" "}
            <Money
              value={monthNet}
              sign="always"
              className={monthNet > 0 ? "text-accent" : "text-fg"}
            />
          </>
        }
        actions={
          <div className="hidden items-center gap-2 lg:flex">
            <Button variant="secondary" asChild>
              <Link to="/importar">
                <Upload aria-hidden="true" size={16} strokeWidth={1.75} />
                Importar CSV
              </Link>
            </Button>
            <Button
              variant="primary"
              kbd="N"
              leading={<Plus aria-hidden="true" size={16} strokeWidth={2} />}
              onClick={onNew}
            >
              Nuevo movimiento
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 pb-4">
        <Input
          ref={searchRef}
          type="search"
          aria-label="Buscar movimientos"
          placeholder="Concepto, #etiqueta o >50"
          autoComplete="off"
          enterKeyHint="search"
          leading={<Search aria-hidden="true" size={16} strokeWidth={1.75} />}
          value={search.q ?? ""}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onSearchChange({ q: value === "" ? undefined : value }, true);
          }}
          className="lg:max-w-md"
        />
        <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
          <Chip
            selected={search.estado === undefined}
            onClick={() => onSearchChange({ estado: undefined })}
          >
            Todos
          </Chip>
          <Chip
            selected={search.estado === "pendientes"}
            trailing={pendingCount > 0 ? <Badge tone="accent">{pendingCount}</Badge> : undefined}
            onClick={() =>
              onSearchChange({ estado: search.estado === "pendientes" ? undefined : "pendientes" })
            }
          >
            Pendientes
          </Chip>
          <Menu
            align="start"
            actions={[
              {
                label: "Todas las cuentas",
                onSelect: () => onSearchChange({ cuentas: undefined }),
              },
              ...accounts.map((account) => ({
                label: account.name,
                icon: <span>{account.emoji}</span>,
                onSelect: () => onSearchChange({ cuentas: [account.id] }),
              })),
            ]}
          >
            <Chip
              selected={(search.cuentas?.length ?? 0) > 0}
              trailing={<ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} />}
            >
              {singleAccount?.name ??
                ((search.cuentas?.length ?? 0) > 1
                  ? `${search.cuentas?.length} cuentas`
                  : "Cuenta")}
            </Chip>
          </Menu>
          <Chip
            selected={advanced > 0}
            leading={<SlidersHorizontal aria-hidden="true" size={14} strokeWidth={1.75} />}
            trailing={advanced > 0 ? <Badge tone="accent">{advanced}</Badge> : undefined}
            onClick={() => setFiltersOpen(true)}
          >
            Filtros
          </Chip>
        </div>
      </div>

      {transactions.length === 0 ? (
        hasTransactions || filtered ? (
          <EmptyState
            icon="🔎"
            title="Nada coincide con estos filtros"
            description="Prueba con otra búsqueda o quita algún filtro."
            actions={
              <Button variant="secondary" onClick={clearAll}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon="🧾"
            title="Apunta tu primer gasto"
            description="Tardas tres segundos: importe, categoría y guardar."
            actions={
              <>
                <Button variant="primary" onClick={onNew}>
                  Nuevo movimiento
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/importar">Importar CSV</Link>
                </Button>
              </>
            }
          />
        )
      ) : isDesktop ? (
        <TransactionTable transactions={transactions} actions={actions} />
      ) : (
        <GroupedTransactionList transactions={transactions} actions={actions} />
      )}

      <BottomSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filtros"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={clearAll}>
              Limpiar
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setFiltersOpen(false)}>
              Ver {transactions.length} {transactions.length === 1 ? "movimiento" : "movimientos"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5 pt-2">
          <FilterGroup title="Fechas">
            <DateChip
              label="Desde"
              value={search.desde}
              today={today}
              onChange={(desde) => onSearchChange({ desde })}
            />
            <DateChip
              label="Hasta"
              value={search.hasta}
              today={today}
              onChange={(hasta) => onSearchChange({ hasta })}
            />
          </FilterGroup>
          <FilterGroup title="Tipo">
            {TRANSACTION_TYPES.map((type) => (
              <Chip
                key={type}
                selected={search.tipos?.includes(type) ?? false}
                onClick={() => onSearchChange({ tipos: toggle(search.tipos, type) })}
              >
                {TYPE_LABELS[type]}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Cuentas">
            {accounts.map((account) => (
              <Chip
                key={account.id}
                selected={search.cuentas?.includes(account.id) ?? false}
                leading={<span aria-hidden="true">{account.emoji}</span>}
                onClick={() => onSearchChange({ cuentas: toggle(search.cuentas, account.id) })}
              >
                {account.name}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Categorías">
            {[...expenseCategories, ...incomeCategories].map((category) => (
              <Chip
                key={category.id}
                selected={search.categorias?.includes(category.id) ?? false}
                leading={<span aria-hidden="true">{category.emoji}</span>}
                onClick={() =>
                  onSearchChange({ categorias: toggle(search.categorias, category.id) })
                }
              >
                {category.name}
              </Chip>
            ))}
          </FilterGroup>
          {ledger.tags.length > 0 && (
            <FilterGroup title="Etiquetas">
              {ledger.tags.map((tag) => (
                <Chip
                  key={tag.id}
                  selected={search.etiquetas?.includes(tag.id) ?? false}
                  onClick={() => onSearchChange({ etiquetas: toggle(search.etiquetas, tag.id) })}
                >
                  #{tag.name}
                </Chip>
              ))}
            </FilterGroup>
          )}
        </div>
      </BottomSheet>
    </>
  );
};

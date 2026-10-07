import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, Plus, Search, SkipForward, Upload } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";

import { useLedger } from "@/data";
import { isOverdue, netWorth } from "@/domain/balances";
import {
  addMonthsYm,
  formatLongDate,
  formatMonthName,
  formatRelativeDay,
  monthOf,
  monthRange,
} from "@/domain/dates";
import { planSummary } from "@/domain/groups";
import { cushion, dailyAllowance, savingsRate, SAVINGS_RATE_TARGET } from "@/domain/metrics";
import { formatMoney, formatPercent } from "@/domain/money";
import type { Cents } from "@/domain/types";
import { netWorthChange, netWorthSeries, type SeriesRange } from "@/domain/networthSeries";
import { cashflowOf, monthlyCashflow, monthRangeOf } from "@/domain/spending";
import { compareNewestFirst, pendingTransactions } from "@/domain/transactions";
import { BackupReminder } from "@/features/home/BackupReminder";
import { GroupTile } from "@/features/plan/GroupTile";
import { RangeTabs } from "@/features/shared/RangeTabs";
import { SyncIndicator } from "@/features/shell/StatusFooter";
import { useUi } from "@/features/shell/uiStore";
import { useToday } from "@/features/shell/useToday";
import { SimpleTransactionList } from "@/features/transactions/TransactionList";
import { useTransactionActions } from "@/features/transactions/useTransactionActions";
import { describeTransaction } from "@/features/transactions/view";
import {
  AnimatedNumber,
  Button,
  Card,
  cn,
  DURATION,
  EASE,
  EmptyState,
  HeroCard,
  Input,
  Money,
  PendingRow,
  STAGGER,
  SwipeRow,
} from "@/ui";
import { AreaLineChart, CashflowBars, CashflowLegend } from "@/ui/charts";

/* ───────────────────────── Bento ───────────────────────── */

/** Celda del bento con entrada escalonada (420 ms, 40 ms entre celdas). */
const Cell = ({
  index,
  className,
  children,
}: {
  readonly index: number;
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={cn("min-w-0", className)}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.bento, ease: EASE, delay: index * STAGGER }}
    >
      {children}
    </motion.div>
  );
};

/* ───────────────────────── Piezas ───────────────────────── */

const ChangeChip = ({
  amount,
  ratio,
}: {
  readonly amount: Cents;
  readonly ratio: number | null;
}) => (
  <span
    className={cn(
      "inline-flex h-6 items-center gap-1 rounded-[6px] px-2 num text-caption font-semibold",
      amount > 0
        ? "bg-accent-soft text-accent"
        : amount < 0
          ? "bg-danger/10 text-danger"
          : "bg-chip text-fg-2",
    )}
  >
    {formatMoney(amount, { sign: "always" })}
    {ratio !== null && <span>· {formatPercent(ratio, 1)}</span>}
    <span className="font-medium text-fg-2">30 días</span>
  </span>
);

const FlowBar = ({
  label,
  amount,
  max,
  className,
}: {
  readonly label: string;
  readonly amount: Cents;
  readonly max: number;
  readonly className: string;
}) => (
  <div className="flex items-center gap-3">
    <span className="w-16 shrink-0 text-caption text-fg-2">{label}</span>
    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-track">
      <div
        className={cn("h-full rounded-full transition-[width] duration-[600ms]", className)}
        style={{ width: `${max > 0 ? (amount / max) * 100 : 0}%` }}
      />
    </div>
    <span className="w-24 shrink-0 text-right num text-body font-medium text-fg">
      {formatMoney(amount)}
    </span>
  </div>
);

export const HomePage = () => {
  const ledger = useLedger();
  const { settings, index } = ledger;
  const today = useToday();
  const navigate = useNavigate();
  const actions = useTransactionActions();
  const requestSearchFocus = useUi((state) => state.requestSearchFocus);
  const [range, setRange] = useState<SeriesRange>("1M");
  const [query, setQuery] = useState("");

  const month = monthOf(today);
  const total = useMemo(() => netWorth(ledger, today), [ledger, today]);
  const series = useMemo(() => netWorthSeries(ledger, range, today), [ledger, range, today]);
  const change = useMemo(() => netWorthChange(ledger, today, 30), [ledger, today]);
  const plan = useMemo(() => planSummary(ledger, index, month), [ledger, index, month]);
  const allowance = useMemo(() => dailyAllowance(ledger, index, today), [ledger, index, today]);
  const pending = useMemo(
    () => pendingTransactions(ledger.transactions, today),
    [ledger.transactions, today],
  );
  const flow = useMemo(
    () => cashflowOf(ledger.transactions, monthRangeOf(month)),
    [ledger.transactions, month],
  );
  const yearFlow = useMemo(
    () => monthlyCashflow(ledger.transactions, monthRange(addMonthsYm(month, -11), month)),
    [ledger.transactions, month],
  );
  const rate = useMemo(() => savingsRate(ledger.transactions, month), [ledger.transactions, month]);
  const buffer = useMemo(() => cushion(ledger, today), [ledger, today]);
  const recent = useMemo(
    () =>
      ledger.transactions
        .filter((transaction) => !transaction.isDeleted)
        .sort(compareNewestFirst)
        .slice(0, 10),
    [ledger.transactions],
  );

  const openQuickAdd = () =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, nuevo: "gasto" as const }) });
  const hasData = ledger.transactions.some((transaction) => !transaction.isDeleted);
  const flowMax = Math.max(flow.income, flow.expense);

  /* ── Tarjetas ── */

  const hero = (
    <HeroCard className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link to="/cuentas" className="group min-w-0 rounded-[10px]">
          <span className="inline-flex items-center gap-1 text-caption text-fg-2 transition-colors group-hover:text-fg">
            Patrimonio neto
            <ChevronRight aria-hidden="true" size={14} strokeWidth={1.75} />
          </span>
          <AnimatedNumber value={total} dimFraction className="block text-display text-fg" />
        </Link>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div>
        <ChangeChip amount={change.amount} ratio={change.ratio} />
      </div>
      <AreaLineChart
        data={series}
        drawKey={range}
        height={200}
        className="mt-auto"
        ariaLabel={`Evolución del patrimonio neto: de ${formatMoney(series[0]?.value ?? total)} a ${formatMoney(total)}`}
      />
    </HeroCard>
  );

  const allowanceTile = (
    <Card tone="accent" className="flex h-full min-w-0 flex-col gap-2">
      <h3 className="text-caption text-fg-2">Hoy puedes gastar</h3>
      {allowance.kind === "no-budget" ? (
        <>
          <p className="text-body text-fg">
            Crea tus presupuestos para saber cuánto puedes gastar cada día.
          </p>
          <Button size="sm" variant="secondary" className="mt-auto self-start" asChild>
            <Link to="/plan">Crear presupuestos</Link>
          </Button>
        </>
      ) : allowance.kind === "over" ? (
        <>
          <Money value={allowance.excess} className="block truncate text-h1 text-danger" />
          <p className="text-caption text-danger">Te has pasado {formatMoney(allowance.excess)}</p>
          <p className="text-caption text-fg-2">
            {allowance.daysLeft === 1
              ? "Queda 1 día de mes"
              : `Quedan ${allowance.daysLeft} días de mes`}
          </p>
        </>
      ) : (
        <>
          <AnimatedNumber value={allowance.perDay} className="block truncate text-h1 text-accent" />
          <p className="text-caption text-fg-2">
            quedan {formatMoney(allowance.remaining)} ·{" "}
            {allowance.daysLeft === 1 ? "1 día" : `${allowance.daysLeft} días`}
          </p>
        </>
      )}
    </Card>
  );

  const metricsTile = (
    <Card className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-caption text-fg-2">Tasa de ahorro</h3>
        <span
          className={cn(
            "num text-title",
            rate === null ? "text-fg-2" : rate < 0 ? "text-danger" : "text-fg",
          )}
        >
          {rate === null ? "—" : formatPercent(rate)}
        </span>
      </div>
      <p className="text-caption text-fg-2">
        {rate === null
          ? "Sin ingresos este mes"
          : `Objetivo ${formatPercent(SAVINGS_RATE_TARGET)} ${rate >= SAVINGS_RATE_TARGET ? "✓" : "✗"}`}
      </p>
      <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
        <h3 className="text-caption text-fg-2">Colchón</h3>
        <span className="num text-title text-fg">
          {buffer.months === null
            ? "—"
            : `${buffer.months.toLocaleString("es-ES", { minimumFractionDigits: 1 })} meses`}
        </span>
      </div>
      <p className="text-caption text-fg-2">Líquido: {formatMoney(buffer.liquid)}</p>
    </Card>
  );

  const pendingCard = pending.length > 0 && (
    <section aria-labelledby="home-pending" className="flex h-full flex-col gap-2">
      <h2 id="home-pending" className="px-1 text-title text-fg">
        Por aprobar
      </h2>
      <Card padding="none" className="divide-y divide-border overflow-hidden">
        {pending.slice(0, 5).map((transaction) => {
          const view = describeTransaction(transaction, ledger, today);
          return (
            <SwipeRow
              key={transaction.id}
              leading={{
                label: "Aprobar",
                icon: <Check size={16} strokeWidth={1.75} />,
                onTrigger: () => actions.approve(transaction),
              }}
              trailing={{
                label: "Omitir",
                icon: <SkipForward size={16} strokeWidth={1.75} />,
                tone: "neutral",
                onTrigger: () => actions.skip(transaction),
              }}
            >
              <PendingRow
                emoji={view.emoji}
                name={view.title}
                when={formatRelativeDay(transaction.date, today)}
                account={view.accountName}
                amount={transaction.amount}
                kind={view.kind}
                overdue={isOverdue(transaction, today)}
                onApprove={() => actions.approve(transaction)}
                onSkip={() => actions.skip(transaction)}
              />
            </SwipeRow>
          );
        })}
      </Card>
      {pending.length > 5 && (
        <Link
          to="/movimientos"
          search={{ estado: "pendientes" }}
          className="px-1 text-caption font-semibold text-fg-2 hover:text-fg"
        >
          Ver los {pending.length} pendientes
        </Link>
      )}
    </section>
  );

  const monthFlowCard = (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-title text-fg">Flujo de {formatMonthName(month)}</h2>
        <span
          className={cn(
            "num text-caption",
            rate !== null && rate < 0 ? "text-danger" : "text-fg-2",
          )}
        >
          {rate === null ? "Tasa de ahorro —" : `Tasa de ahorro ${formatPercent(rate)}`}
        </span>
      </div>
      <FlowBar label="Ingresos" amount={flow.income} max={flowMax} className="bg-accent" />
      <FlowBar label="Gastos" amount={flow.expense} max={flowMax} className="bg-fg-3" />
    </Card>
  );

  const yearFlowCard = (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title text-fg">Flujo de caja · 12 meses</h2>
        <CashflowLegend />
      </div>
      <CashflowBars
        data={yearFlow}
        height={220}
        ariaLabel="Ingresos y gastos de los últimos 12 meses"
        className="mt-auto"
      />
    </Card>
  );

  /* ── Página ── */

  return (
    <div className="pb-4">
      {/* Cabecera móvil y tablet */}
      <header className="flex items-center gap-3 pt-4 pb-4 lg:hidden">
        <Link
          to="/ajustes"
          aria-label="Ajustes"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-chip text-caption font-semibold text-fg transition-colors hover:border-border-strong"
        >
          {settings.profileInitials}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-caption text-fg-2">{formatLongDate(today)}</p>
          <h1 className="truncate text-h1 text-fg">Hola, {settings.profileName}</h1>
        </div>
        <SyncIndicator />
      </header>

      {/* Cabecera de escritorio */}
      <header className="hidden items-center gap-4 pt-8 pb-6 lg:flex">
        <div className="min-w-0 flex-1">
          <p className="text-caption text-fg-2">{formatLongDate(today)}</p>
          <h1 className="truncate text-h1 text-fg">Hola, {settings.profileName}</h1>
        </div>
        <form
          role="search"
          className="w-72"
          onSubmit={(event) => {
            event.preventDefault();
            requestSearchFocus();
            void navigate({ to: "/movimientos", search: query.trim() === "" ? {} : { q: query } });
          }}
        >
          <Input
            type="search"
            aria-label="Buscar movimientos"
            placeholder="Buscar"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            leading={<Search aria-hidden="true" size={16} strokeWidth={1.75} />}
          />
        </form>
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
          onClick={openQuickAdd}
        >
          Nuevo movimiento
        </Button>
      </header>

      {hasData && <BackupReminder className="mb-3" />}

      {/*
        Bento. El orden del DOM es el de escritorio (12 columnas); en móvil y
        tablet se reordena con `order` para seguir el recorrido de arriba abajo.
      */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-12">
        <Cell
          index={0}
          className="order-1 col-span-2 sm:col-span-4 lg:order-none lg:col-span-8 lg:row-span-2"
        >
          {hero}
        </Cell>
        <Cell index={1} className="order-5 lg:order-none lg:col-span-4">
          {allowanceTile}
        </Cell>
        <Cell index={2} className="order-8 col-span-2 sm:col-span-4 lg:order-none lg:col-span-4">
          {metricsTile}
        </Cell>

        <Cell index={3} className="order-2 lg:order-none lg:col-span-4">
          <GroupTile summary={plan.needs} className="h-full" />
        </Cell>
        <Cell index={4} className="order-3 lg:order-none lg:col-span-4">
          <GroupTile summary={plan.wants} className="h-full" />
        </Cell>
        <Cell index={5} className="order-4 lg:order-none lg:col-span-4">
          <GroupTile summary={plan.savings} className="h-full" />
        </Cell>

        <Cell index={6} className="order-7 col-span-2 sm:col-span-4 lg:hidden">
          {monthFlowCard}
        </Cell>
        <Cell
          index={6}
          className={cn("hidden lg:block", pendingCard ? "lg:col-span-7" : "lg:col-span-12")}
        >
          {yearFlowCard}
        </Cell>
        {pendingCard && (
          <Cell index={7} className="order-6 col-span-2 sm:col-span-4 lg:order-none lg:col-span-5">
            {pendingCard}
          </Cell>
        )}

        {recent.length > 0 && (
          <Cell index={8} className="hidden lg:col-span-12 lg:block">
            <section aria-labelledby="home-recent" className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h2 id="home-recent" className="text-title text-fg">
                  Últimos movimientos
                </h2>
                <Link
                  to="/movimientos"
                  className="text-caption font-semibold text-fg-2 hover:text-fg"
                >
                  Ver todos
                </Link>
              </div>
              <SimpleTransactionList transactions={recent} actions={actions} />
            </section>
          </Cell>
        )}
      </div>

      {!hasData && (
        <EmptyState
          icon="🧾"
          title="Apunta tu primer gasto"
          description="Tu panel se llena solo: importe, categoría y guardar."
          actions={
            <>
              <Button variant="primary" onClick={openQuickAdd}>
                Nuevo movimiento
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/importar">Importar CSV</Link>
              </Button>
            </>
          }
        />
      )}
    </div>
  );
};

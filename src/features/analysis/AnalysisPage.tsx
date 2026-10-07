import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { useLedger } from "@/data";
import { netWorth } from "@/domain/balances";
import { childrenOfCategory } from "@/domain/categories";
import { compareMonths, compareYears, type Delta, tagCosts } from "@/domain/compare";
import {
  addMonthsYm,
  formatMonthName,
  formatMonthYear,
  formatShortDate,
  monthOf,
  yearOf,
} from "@/domain/dates";
import { cushion, savingsRate, SAVINGS_RATE_TARGET } from "@/domain/metrics";
import { formatMoney, formatPercent, ZERO_CENTS } from "@/domain/money";
import { netWorthSeries, seriesChange, type SeriesRange } from "@/domain/networthSeries";
import { monthRangeOf, spendingByCategory, yearRangeOf } from "@/domain/spending";
import type { YearMonth } from "@/domain/types";
import { ColorDot } from "@/features/shared/ColorPicker";
import { MonthSwitcher } from "@/features/shared/MonthSwitcher";
import { RangeTabs } from "@/features/shared/RangeTabs";
import { useToday } from "@/features/shell/useToday";
import {
  AnimatedNumber,
  Button,
  Card,
  cn,
  EmptyState,
  HeroCard,
  Money,
  PageHeader,
  SegmentedControl,
} from "@/ui";
import { AreaLineChart, BarCompare, type BarCompareItem, HBarList } from "@/ui/charts";

import type { AnalysisTab, Period } from "./params";

const TAB_OPTIONS = [
  { value: "patrimonio", label: "Patrimonio" },
  { value: "categorias", label: "Categorías" },
  { value: "comparar", label: "Comparar" },
  { value: "etiquetas", label: "Etiquetas" },
] as const;

const PERIOD_OPTIONS = [
  { value: "mes", label: "Mes" },
  { value: "ano", label: "Año" },
] as const;

/* ───────────────────────── Tarjetas siempre visibles ───────────────────────── */

const Metrics = ({ month }: { readonly month: YearMonth }) => {
  const ledger = useLedger();
  const today = useToday();
  const rate = useMemo(() => savingsRate(ledger.transactions, month), [ledger.transactions, month]);
  const buffer = useMemo(() => cushion(ledger, today), [ledger, today]);
  const onTarget = rate !== null && rate >= SAVINGS_RATE_TARGET;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="flex min-w-0 flex-col gap-1">
        <h2 className="truncate text-caption text-fg-2">
          Tasa de ahorro · {formatMonthName(month)}
        </h2>
        <span
          className={cn(
            "num text-h1",
            rate === null ? "text-fg-2" : rate < 0 ? "text-danger" : "text-fg",
          )}
        >
          {rate === null ? "—" : formatPercent(rate)}
        </span>
        <p
          className={cn(
            "text-caption",
            rate === null ? "text-fg-2" : onTarget ? "text-accent" : "text-fg-2",
          )}
        >
          {rate === null
            ? "Sin ingresos en el mes"
            : `Objetivo ${formatPercent(SAVINGS_RATE_TARGET)} ${onTarget ? "✓" : "✗"}`}
        </p>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1">
        <h2 className="truncate text-caption text-fg-2">Meses de colchón</h2>
        <span className={cn("num text-h1", buffer.months === null ? "text-fg-2" : "text-fg")}>
          {buffer.months === null
            ? "—"
            : buffer.months.toLocaleString("es-ES", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
        </span>
        <p className="truncate text-caption text-fg-2">Líquido: {formatMoney(buffer.liquid)}</p>
      </Card>
    </div>
  );
};

/* ───────────────────────── Patrimonio ───────────────────────── */

const NetWorthTab = () => {
  const ledger = useLedger();
  const today = useToday();
  const [range, setRange] = useState<SeriesRange>("1A");
  const total = useMemo(() => netWorth(ledger, today), [ledger, today]);
  const series = useMemo(() => netWorthSeries(ledger, range, today), [ledger, range, today]);
  const change = seriesChange(series);
  const first = series[0];

  return (
    <HeroCard className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-caption text-fg-2">Patrimonio neto</h2>
          <AnimatedNumber value={total} dimFraction className="block text-display text-fg" />
          <p
            className={cn(
              "mt-1 num text-caption",
              change.amount === 0 ? "text-fg-2" : change.amount > 0 ? "text-accent" : "text-danger",
            )}
          >
            {formatMoney(change.amount, { sign: "always" })}
            {change.ratio !== null && ` · ${formatPercent(change.ratio, 1)}`}
            {first && <span className="text-fg-2"> desde el {formatShortDate(first.date)}</span>}
          </p>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <AreaLineChart
        data={series}
        drawKey={range}
        height={320}
        ariaLabel={`Evolución del patrimonio neto: de ${formatMoney(first?.value ?? total)} a ${formatMoney(total)}`}
      />
    </HeroCard>
  );
};

/* ───────────────────────── Selector de periodo ───────────────────────── */

const PeriodControls = ({
  period,
  month,
  maxMonth,
  onPeriodChange,
  onMonthChange,
}: {
  readonly period: Period;
  readonly month: YearMonth;
  readonly maxMonth: YearMonth;
  readonly onPeriodChange: (period: Period) => void;
  readonly onMonthChange: (month: YearMonth) => void;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <SegmentedControl
      ariaLabel="Periodo"
      size="sm"
      fullWidth={false}
      value={period}
      onValueChange={onPeriodChange}
      options={PERIOD_OPTIONS}
    />
    <MonthSwitcher
      value={month}
      onChange={onMonthChange}
      max={maxMonth}
      step={period === "ano" ? 12 : 1}
      {...(period === "ano" ? { label: String(yearOf(month)) } : {})}
    />
  </div>
);

/* ───────────────────────── Categorías ───────────────────────── */

const CategoriesTab = ({
  period,
  month,
}: {
  readonly period: Period;
  readonly month: YearMonth;
}) => {
  const ledger = useLedger();
  const [openId, setOpenId] = useState<string | null>(null);
  const range = period === "ano" ? yearRangeOf(yearOf(month)) : monthRangeOf(month);
  const totals = useMemo(
    () => spendingByCategory(ledger.transactions, ledger.index, range),
    // El rango depende solo del periodo y del mes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledger.transactions, ledger.index, period, month],
  );

  const parent = openId === null ? undefined : ledger.index.byId.get(openId);
  const children = parent ? childrenOfCategory(ledger.index, parent.id) : [];
  const drill = parent !== undefined && children.length > 0;

  const items = drill
    ? children
        .map((child) => ({
          id: child.id,
          emoji: child.emoji,
          label: child.name,
          value: totals.byLeaf.get(child.id) ?? ZERO_CENTS,
        }))
        .filter((item) => item.value > 0)
    : [...totals.byTopLevel].flatMap(([id, value]) => {
        const category = ledger.index.byId.get(id);
        return category ? [{ id, emoji: category.emoji, label: category.name, value }] : [];
      });
  items.sort((a, b) => b.value - a.value);

  const total = drill ? (totals.byTopLevel.get(parent.id) ?? ZERO_CENTS) : totals.total;
  const canDrill = (id: string) => childrenOfCategory(ledger.index, id).length > 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {drill && (
          <Button
            size="sm"
            variant="ghost"
            className="-ml-2"
            leading={<ArrowLeft aria-hidden="true" size={14} strokeWidth={1.75} />}
            onClick={() => setOpenId(null)}
          >
            Todas
          </Button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-title text-fg">
          {drill ? `${parent.emoji} ${parent.name}` : "Gasto por categoría"}
        </h2>
        <Money value={total} className="text-title text-fg" />
      </div>
      {items.length === 0 ? (
        <EmptyState compact icon="📊" title="Sin gastos en este periodo" />
      ) : (
        <HBarList
          ariaLabel={
            drill
              ? `Gasto de ${parent.name} por subcategoría`
              : "Gasto por categoría, de mayor a menor"
          }
          items={items}
          total={total}
          onSelect={drill ? undefined : (id) => (canDrill(id) ? setOpenId(id) : undefined)}
        />
      )}
    </Card>
  );
};

/* ───────────────────────── Comparar ───────────────────────── */

const deltaText = (delta: Delta): string =>
  delta.amount === 0
    ? "sin cambios"
    : delta.ratio === null
      ? formatMoney(delta.amount, { sign: "always", whole: true })
      : `${delta.amount > 0 ? "+" : "−"}${formatPercent(Math.abs(delta.ratio), 1)}`;

const CompareTab = ({ period, month }: { readonly period: Period; readonly month: YearMonth }) => {
  const ledger = useLedger();
  const year = yearOf(month);
  const comparison = useMemo(
    () =>
      period === "ano"
        ? compareYears(ledger.transactions, ledger.index, year)
        : compareMonths(ledger.transactions, ledger.index, month),
    [ledger.transactions, ledger.index, period, month, year],
  );
  const currentLabel = period === "ano" ? String(year) : formatMonthYear(month);
  const previousLabel =
    period === "ano" ? String(year - 1) : formatMonthYear(addMonthsYm(month, -1));

  const items = comparison.categories.map((item): BarCompareItem => ({
    id: item.category.id,
    emoji: item.category.emoji,
    label: item.category.name,
    current: item.current,
    previous: item.previous,
    delta: deltaText(item),
    trend: item.amount > 0 ? "up" : item.amount < 0 ? "down" : "flat",
  }));
  const total = comparison.total;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-title text-fg">Gasto total</h2>
        <p className="num text-body text-fg">
          {formatMoney(total.current)}
          <span className="text-fg-2"> frente a {formatMoney(total.previous)}</span>
          <span
            className={cn(
              "ml-2 font-semibold",
              total.amount > 0 ? "text-danger" : total.amount < 0 ? "text-accent" : "text-fg-2",
            )}
          >
            {formatMoney(total.amount, { sign: "always" })}
            {total.ratio !== null && ` · ${deltaText(total)}`}
          </span>
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState compact icon="⚖️" title="Sin gastos que comparar en estos periodos" />
      ) : (
        <BarCompare
          ariaLabel={`Gasto por categoría: ${currentLabel} frente a ${previousLabel}`}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          items={items}
        />
      )}
    </Card>
  );
};

/* ───────────────────────── Etiquetas ───────────────────────── */

const TagsTab = () => {
  const ledger = useLedger();
  const costs = useMemo(
    () => tagCosts(ledger.tags, ledger.transactionTags, ledger.transactions),
    [ledger.tags, ledger.transactionTags, ledger.transactions],
  );

  if (costs.length === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon="#️⃣"
          title="Etiqueta para saber cuánto cuesta algo"
          description="Un viaje, una reforma o un proyecto: añade una etiqueta al apuntar y verás aquí su coste total."
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className="divide-y divide-border overflow-hidden">
      {costs.map((cost) => (
        <Link
          key={cost.tag.id}
          to="/movimientos"
          search={{ etiquetas: [cost.tag.id] }}
          className="flex min-h-15 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-chip"
        >
          <ColorDot color={cost.tag.color} className="size-2.5" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body text-fg">#{cost.tag.name}</div>
            <div className="truncate text-caption text-fg-2">
              {cost.count === 0
                ? "Sin gastos"
                : `${cost.count} ${cost.count === 1 ? "movimiento" : "movimientos"}${
                    cost.firstDate !== null && cost.lastDate !== null
                      ? cost.firstDate === cost.lastDate
                        ? ` · ${formatShortDate(cost.firstDate)}`
                        : ` · ${formatShortDate(cost.firstDate)} – ${formatShortDate(cost.lastDate)}`
                      : ""
                  }`}
            </div>
          </div>
          <Money value={cost.total} className="text-body font-medium text-fg" />
        </Link>
      ))}
    </Card>
  );
};

/* ───────────────────────── Página ───────────────────────── */

export interface AnalysisPageProps {
  readonly tab: AnalysisTab;
  readonly period: Period;
  readonly month: YearMonth | undefined;
  readonly onChange: (patch: {
    readonly pestana?: AnalysisTab;
    readonly periodo?: Period;
    readonly mes?: YearMonth;
  }) => void;
}

export const AnalysisPage = ({ tab, period, month, onChange }: AnalysisPageProps) => {
  const today = useToday();
  const currentMonth = monthOf(today);
  const selected = month ?? currentMonth;
  const usesPeriod = tab === "categorias" || tab === "comparar";

  return (
    <>
      <PageHeader title="Análisis" />
      <div className="flex flex-col gap-4">
        <Metrics month={usesPeriod ? selected : currentMonth} />
        <SegmentedControl
          ariaLabel="Sección del análisis"
          value={tab}
          onValueChange={(pestana) => onChange({ pestana })}
          options={TAB_OPTIONS}
          size="sm"
          className="lg:max-w-xl"
        />
        {usesPeriod && (
          <PeriodControls
            period={period}
            month={selected}
            maxMonth={currentMonth}
            onPeriodChange={(periodo) => onChange({ periodo })}
            onMonthChange={(mes) => onChange({ mes })}
          />
        )}
        {tab === "patrimonio" && <NetWorthTab />}
        {tab === "categorias" && (
          <CategoriesTab key={`${period}-${selected}`} period={period} month={selected} />
        )}
        {tab === "comparar" && <CompareTab period={period} month={selected} />}
        {tab === "etiquetas" && <TagsTab />}
      </div>
    </>
  );
};

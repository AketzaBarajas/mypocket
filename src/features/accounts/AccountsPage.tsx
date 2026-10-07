import { Link } from "@tanstack/react-router";
import { ChevronRight, Plus, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { useLedger } from "@/data";
import {
  accountBalances,
  archivedWithBalance,
  netWorthBreakdown,
  sectionOf,
  valuationChange,
} from "@/domain/balances";
import { ACCOUNT_TYPE_LABELS } from "@/domain/catalog";
import { formatShortDate } from "@/domain/dates";
import { cents, formatMoney, formatPercent, ZERO_CENTS } from "@/domain/money";
import type { Account, Cents } from "@/domain/types";
import { useToday } from "@/features/shell/useToday";
import {
  AnimatedNumber,
  Button,
  Card,
  cn,
  EmojiChip,
  EmptyState,
  HeroCard,
  Money,
  Notice,
  PageHeader,
} from "@/ui";
import { Sparkline } from "@/ui/charts";

import { AccountFormSheet, ValuationSheet } from "./AccountSheets";

/** Reparto del patrimonio. Los tonos son neutros: aquí el color no indica estado. */
const SEGMENTS = [
  { key: "daily", label: "Líquido", className: "bg-fg" },
  { key: "investment", label: "Inversión", className: "bg-fg-2" },
  { key: "receivable", label: "Por cobrar", className: "bg-fg-3" },
] as const;

const AccountRowLink = ({
  account,
  balance,
}: {
  readonly account: Account;
  readonly balance: Cents;
}) => (
  <Link
    to="/cuentas/$id"
    params={{ id: account.id }}
    className="flex min-h-15 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-chip"
  >
    <EmojiChip emoji={account.emoji} />
    <div className="min-w-0 flex-1">
      <div className="truncate text-body text-fg">{account.name}</div>
      <div className="truncate text-caption text-fg-2">{ACCOUNT_TYPE_LABELS[account.type]}</div>
    </div>
    <Money value={balance} className="text-body font-medium text-fg" />
    <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0 text-fg-3" />
  </Link>
);

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-2">
    <h2 className="px-1 text-title text-fg">{title}</h2>
    {children}
  </section>
);

export const AccountsPage = () => {
  const ledger = useLedger();
  const today = useToday();
  const [creating, setCreating] = useState(false);
  const [valuing, setValuing] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const balances = useMemo(() => accountBalances(ledger, today), [ledger, today]);
  const breakdown = useMemo(() => netWorthBreakdown(ledger, today), [ledger, today]);
  const flagged = useMemo(() => archivedWithBalance(ledger, today), [ledger, today]);
  const balanceOf = (account: Account) => balances.get(account.id) ?? ZERO_CENTS;

  const active = ledger.accounts.filter((account) => !account.archived);
  const archived = ledger.accounts.filter((account) => account.archived);
  const daily = active.filter((account) => sectionOf(account) === "daily");
  const investments = active.filter((account) => sectionOf(account) === "investment");
  const receivables = active.filter((account) => sectionOf(account) === "receivable");

  // La barra reparte solo las partes positivas.
  const positive = SEGMENTS.map((segment) => ({
    ...segment,
    value: Math.max(0, breakdown[segment.key]),
  }));
  const positiveTotal = positive.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <>
      <PageHeader
        title="Cuentas"
        actions={
          <Button
            variant="secondary"
            leading={<Plus aria-hidden="true" size={16} strokeWidth={1.75} />}
            onClick={() => setCreating(true)}
          >
            Nueva cuenta
          </Button>
        }
      />

      {ledger.accounts.length === 0 ? (
        <EmptyState
          icon="💳"
          title="Añade tu primera cuenta"
          description="Con una cuenta ya puedes apuntar gastos y ver tu patrimonio."
          actions={
            <Button variant="primary" onClick={() => setCreating(true)}>
              Nueva cuenta
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <HeroCard className="flex flex-col gap-4">
            <div>
              <div className="text-caption text-fg-2">Patrimonio neto</div>
              <AnimatedNumber
                value={breakdown.total}
                dimFraction
                className="text-display text-fg"
              />
            </div>
            <div
              role="img"
              aria-label={`Reparto del patrimonio: ${positive
                .map((segment) => `${segment.label} ${formatMoney(cents(segment.value))}`)
                .join(", ")}`}
              className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-track"
            >
              {positiveTotal > 0 &&
                positive.map(
                  (segment) =>
                    segment.value > 0 && (
                      <span
                        key={segment.key}
                        className={cn("h-full", segment.className)}
                        style={{ width: `${(segment.value / positiveTotal) * 100}%` }}
                      />
                    ),
                )}
            </div>
            <dl className="grid grid-cols-3 gap-3">
              {SEGMENTS.map((segment) => (
                <div key={segment.key} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-caption text-fg-2">
                    <span
                      aria-hidden="true"
                      className={cn("size-2 shrink-0 rounded-[2px]", segment.className)}
                    />
                    <span className="truncate">{segment.label}</span>
                  </dt>
                  <dd className="mt-0.5 truncate">
                    <Money
                      value={breakdown[segment.key]}
                      className="text-body font-medium text-fg"
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </HeroCard>

          {flagged.length > 0 && (
            <Notice tone="warning" icon={<TriangleAlert size={18} strokeWidth={1.75} />}>
              {flagged.length === 1
                ? `«${flagged[0]?.account.name}» está archivada pero tiene saldo (${formatMoney(flagged[0]?.balance ?? ZERO_CENTS)}). No cuenta en el patrimonio.`
                : `${flagged.length} cuentas archivadas tienen saldo y no cuentan en el patrimonio.`}
            </Notice>
          )}

          {daily.length > 0 && (
            <Section title="Día a día">
              <Card padding="none" className="divide-y divide-border overflow-hidden">
                {daily.map((account) => (
                  <AccountRowLink key={account.id} account={account} balance={balanceOf(account)} />
                ))}
              </Card>
            </Section>
          )}

          {investments.length > 0 && (
            <Section title="Inversión">
              <div className="grid grid-cols-2 gap-3">
                {investments.map((account) => {
                  const balance = balanceOf(account);
                  const change = valuationChange(ledger.valuations, account.id, today);
                  const history = ledger.valuations
                    .filter(
                      (valuation) => valuation.accountId === account.id && valuation.date <= today,
                    )
                    .sort(
                      (a, b) =>
                        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
                    )
                    .map((valuation) => valuation.value);
                  const delta =
                    change?.previous != null
                      ? cents(change.last.value - change.previous.value)
                      : null;
                  const ratio =
                    delta !== null && change?.previous != null && change.previous.value > 0
                      ? delta / change.previous.value
                      : null;
                  return (
                    <Card
                      key={account.id}
                      padding="sm"
                      className="flex min-w-0 flex-col gap-3 sm:p-4"
                    >
                      <Link
                        to="/cuentas/$id"
                        params={{ id: account.id }}
                        className="flex min-w-0 items-center gap-2.5"
                      >
                        <EmojiChip emoji={account.emoji} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-body text-fg">
                          {account.name}
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          size={16}
                          strokeWidth={1.75}
                          className="shrink-0 text-fg-3"
                        />
                      </Link>
                      <div className="flex flex-col gap-2">
                        <div className="min-w-0">
                          <Money value={balance} className="block truncate text-h2 text-fg" />
                          <div
                            className={cn(
                              "num text-caption",
                              delta === null || delta === 0
                                ? "text-fg-2"
                                : delta > 0
                                  ? "text-accent"
                                  : "text-danger",
                            )}
                          >
                            {delta === null
                              ? "Sin variación todavía"
                              : `${formatMoney(delta, { sign: "always" })}${ratio === null ? "" : ` · ${formatPercent(ratio, 1)}`}`}
                          </div>
                        </div>
                        {history.length > 1 && (
                          <Sparkline
                            values={history}
                            tone={delta !== null && delta < 0 ? "danger" : "accent"}
                            width={120}
                            height={28}
                            className="w-full"
                          />
                        )}
                      </div>
                      <div className="text-caption text-fg-2">
                        {change
                          ? `Valorada el ${formatShortDate(change.last.date)}`
                          : "Sin valoraciones"}
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setValuing(account)}>
                        Actualizar valor
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </Section>
          )}

          {receivables.length > 0 && (
            <Section title="Por cobrar">
              <Card padding="none" className="divide-y divide-border overflow-hidden">
                {receivables.map((account) => (
                  <AccountRowLink key={account.id} account={account} balance={balanceOf(account)} />
                ))}
              </Card>
            </Section>
          )}

          {archived.length > 0 && (
            <section className="flex flex-col gap-2">
              <Button
                variant="ghost"
                className="self-start"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((current) => !current)}
              >
                {showArchived ? "Ocultar archivadas" : `Ver archivadas (${archived.length})`}
              </Button>
              {showArchived && (
                <Card padding="none" className="divide-y divide-border overflow-hidden">
                  {archived.map((account) => (
                    <AccountRowLink
                      key={account.id}
                      account={account}
                      balance={balanceOf(account)}
                    />
                  ))}
                </Card>
              )}
            </section>
          )}
        </div>
      )}

      <AccountFormSheet open={creating} onOpenChange={setCreating} account={null} />
      {valuing && (
        <ValuationSheet
          open
          onOpenChange={(open) => {
            if (!open) setValuing(null);
          }}
          account={valuing}
          currentValue={balanceOf(valuing)}
        />
      )}
    </>
  );
};

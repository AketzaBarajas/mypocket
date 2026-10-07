import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  HandCoins,
  Pencil,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useLedger, useRepo, useTransactions } from "@/data";
import { accountBalance, isScheduled } from "@/domain/balances";
import { ACCOUNT_TYPE_LABELS } from "@/domain/catalog";
import { formatShortDate } from "@/domain/dates";
import { formatMoney, formatPercent } from "@/domain/money";
import { accountSeries, seriesChange, type SeriesRange } from "@/domain/networthSeries";
import type { Account } from "@/domain/types";
import { RangeTabs } from "@/features/shared/RangeTabs";
import { useToday } from "@/features/shell/useToday";
import { SimpleTransactionList } from "@/features/transactions/TransactionList";
import { useTransactionActions } from "@/features/transactions/useTransactionActions";
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  HeroCard,
  IconButton,
  Menu,
  Money,
  PageHeader,
  toast,
} from "@/ui";
import { AreaLineChart } from "@/ui/charts";

import { AccountFormSheet, CollectSheet, ValuationSheet } from "./AccountSheets";

const RECENT_LIMIT = 30;

const Detail = ({ account }: { readonly account: Account }) => {
  const ledger = useLedger();
  const repo = useRepo();
  const today = useToday();
  const actions = useTransactionActions();
  const [range, setRange] = useState<SeriesRange>("3M");
  const [editing, setEditing] = useState(false);
  const [valuing, setValuing] = useState(false);
  const [collecting, setCollecting] = useState(false);

  const balance = useMemo(() => accountBalance(account, ledger, today), [account, ledger, today]);
  const series = useMemo(
    () => accountSeries(account, ledger, range, today),
    [account, ledger, range, today],
  );
  const change = seriesChange(series);
  const filter = useMemo(() => ({ accountIds: [account.id] }), [account.id]);
  const transactions = useTransactions(filter);
  const scheduled = transactions.filter((transaction) => isScheduled(transaction, today)).length;
  const valuations = useMemo(
    () =>
      ledger.valuations
        .filter((valuation) => valuation.accountId === account.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [ledger.valuations, account.id],
  );

  return (
    <>
      <PageHeader
        backTo="/cuentas"
        eyebrow={ACCOUNT_TYPE_LABELS[account.type]}
        title={
          <>
            <span aria-hidden="true">{account.emoji}</span> {account.name}
          </>
        }
        actions={
          <Menu
            actions={[
              {
                label: "Editar",
                icon: <Pencil size={16} strokeWidth={1.75} />,
                onSelect: () => setEditing(true),
              },
              {
                label: account.archived ? "Desarchivar" : "Archivar",
                icon: account.archived ? (
                  <ArchiveRestore size={16} strokeWidth={1.75} />
                ) : (
                  <Archive size={16} strokeWidth={1.75} />
                ),
                onSelect: () => {
                  repo.setAccountArchived(account.id, !account.archived);
                  toast(account.archived ? "Cuenta desarchivada" : "Cuenta archivada");
                },
              },
            ]}
          >
            <IconButton label="Opciones de la cuenta" variant="secondary">
              <Ellipsis aria-hidden="true" size={18} strokeWidth={1.75} />
            </IconButton>
          </Menu>
        }
      />

      <div className="flex flex-col gap-6">
        <HeroCard className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-caption text-fg-2">
                Saldo
                {account.archived && <Badge>Archivada</Badge>}
                {!account.includeInNetWorth && <Badge>Fuera del patrimonio</Badge>}
              </div>
              <AnimatedNumber value={balance} dimFraction className="text-display text-fg" />
              <div
                className={cn(
                  "mt-1 num text-caption",
                  change.amount === 0
                    ? "text-fg-2"
                    : change.amount > 0
                      ? "text-accent"
                      : "text-danger",
                )}
              >
                {formatMoney(change.amount, { sign: "always" })}
                {change.ratio !== null && ` · ${formatPercent(change.ratio, 1)}`}
                <span className="text-fg-2"> en el periodo</span>
              </div>
            </div>
            <RangeTabs value={range} onChange={setRange} />
          </div>
          <AreaLineChart
            data={series}
            drawKey={range}
            height={200}
            ariaLabel={`Saldo de ${account.name}: de ${formatMoney(series[0]?.value ?? balance)} a ${formatMoney(balance)}`}
          />
          {scheduled > 0 && (
            <p className="text-caption text-fg-2">
              {scheduled === 1
                ? "Hay 1 movimiento programado con fecha futura que aún no cuenta en el saldo."
                : `Hay ${scheduled} movimientos programados con fecha futura que aún no cuentan en el saldo.`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {account.type === "investment" && (
              <Button
                variant="primary"
                leading={<TrendingUp aria-hidden="true" size={16} strokeWidth={1.75} />}
                onClick={() => setValuing(true)}
              >
                Actualizar valor
              </Button>
            )}
            {account.type === "receivable" && (
              <Button
                variant="primary"
                leading={<HandCoins aria-hidden="true" size={16} strokeWidth={1.75} />}
                onClick={() => setCollecting(true)}
              >
                Registrar cobro
              </Button>
            )}
          </div>
        </HeroCard>

        {account.type === "investment" && (
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-title text-fg">Valoraciones</h2>
            {valuations.length === 0 ? (
              <Card>
                <EmptyState
                  compact
                  icon="📈"
                  title="Sin valoraciones"
                  description="Actualiza el valor cuando lo consultes en tu bróker: el saldo partirá de ahí."
                />
              </Card>
            ) : (
              <Card padding="none" className="divide-y divide-border overflow-hidden">
                {valuations.map((valuation) => (
                  <div key={valuation.id} className="flex min-h-13 items-center gap-3 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="num text-body text-fg">{formatShortDate(valuation.date)}</div>
                      {valuation.note !== null && (
                        <div className="truncate text-caption text-fg-2">{valuation.note}</div>
                      )}
                    </div>
                    <Money value={valuation.value} className="text-body font-medium text-fg" />
                    <IconButton
                      label={`Borrar la valoración del ${formatShortDate(valuation.date)}`}
                      size="sm"
                      onClick={() => {
                        repo.deleteValuation(valuation.id);
                        toast("Valoración borrada");
                      }}
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
                    </IconButton>
                  </div>
                ))}
              </Card>
            )}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-title text-fg">Movimientos</h2>
            {transactions.length > RECENT_LIMIT && (
              <Link
                to="/movimientos"
                search={{ cuentas: [account.id] }}
                className="text-caption font-semibold text-fg-2 hover:text-fg"
              >
                Ver los {transactions.length}
              </Link>
            )}
          </div>
          {transactions.length === 0 ? (
            <Card>
              <EmptyState compact icon="🧾" title="Sin movimientos en esta cuenta" />
            </Card>
          ) : (
            <SimpleTransactionList
              transactions={transactions.slice(0, RECENT_LIMIT)}
              actions={actions}
            />
          )}
        </section>
      </div>

      <AccountFormSheet open={editing} onOpenChange={setEditing} account={account} />
      <ValuationSheet
        open={valuing}
        onOpenChange={setValuing}
        account={account}
        currentValue={balance}
      />
      <CollectSheet
        open={collecting}
        onOpenChange={setCollecting}
        account={account}
        balance={balance}
      />
    </>
  );
};

export const AccountDetailPage = ({ id }: { readonly id: string }) => {
  const { accountById } = useLedger();
  const account = accountById.get(id);
  if (!account) {
    return (
      <>
        <PageHeader title="Cuenta" backTo="/cuentas" />
        <EmptyState
          icon="💳"
          title="Esta cuenta no existe"
          description="Puede que se haya eliminado desde otro dispositivo."
        />
      </>
    );
  }
  return <Detail account={account} />;
};

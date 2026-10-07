import { type CategoryIndex, categoryPath } from "./categories";
import { formatNumericDate } from "./dates";
import { toCsv } from "./importing/csv";
import { centsToInputValue, negCents } from "./money";
import { compareNewestFirst } from "./transactions";
import type { Account, AccountId, Tag, Transaction, TransactionId, TransactionType } from "./types";

/** Exportación legible de los movimientos, en claro, para abrir en una hoja de cálculo. */

export const EXPORT_HEADERS = [
  "Fecha",
  "Tipo",
  "Estado",
  "Concepto",
  "Importe",
  "Cuenta",
  "Cuenta destino",
  "Categoría",
  "Etiquetas",
  "Notas",
] as const;

const TYPE_NAMES: Record<TransactionType, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

export interface ExportContext {
  readonly accountById: ReadonlyMap<AccountId, Pick<Account, "name">>;
  readonly index: CategoryIndex;
  readonly tagsOf: ReadonlyMap<TransactionId, ReadonlyArray<Pick<Tag, "name">>>;
}

/**
 * CSV de todos los movimientos no borrados, del más reciente al más antiguo.
 * Los gastos llevan signo negativo; las transferencias, el importe sin signo.
 * Usa `;` y coma decimal, como espera Excel en español.
 */
export const transactionsToCsv = (
  transactions: ReadonlyArray<Transaction>,
  context: ExportContext,
): string => {
  const rows = transactions
    .filter((transaction) => !transaction.isDeleted)
    .sort(compareNewestFirst)
    .map((transaction) => [
      formatNumericDate(transaction.date),
      TYPE_NAMES[transaction.type],
      transaction.status === "pending" ? "Pendiente" : "Confirmado",
      transaction.concept,
      centsToInputValue(
        transaction.type === "expense" ? negCents(transaction.amount) : transaction.amount,
      ),
      context.accountById.get(transaction.accountId)?.name ?? "",
      transaction.toAccountId === null
        ? ""
        : (context.accountById.get(transaction.toAccountId)?.name ?? ""),
      transaction.categoryId === null ? "" : categoryPath(context.index, transaction.categoryId),
      (context.tagsOf.get(transaction.id) ?? []).map((tag) => `#${tag.name}`).join(" "),
      transaction.notes ?? "",
    ]);
  return toCsv(EXPORT_HEADERS, rows);
};

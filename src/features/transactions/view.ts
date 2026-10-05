import type { LedgerValue } from "@/data";
import { isOverdue } from "@/domain/balances";
import { parentOf } from "@/domain/categories";
import type { IsoDate, Transaction, TransactionType } from "@/domain/types";
import type { RowKind } from "@/ui";

export const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

export const TRANSFER_EMOJI = "🔁";

export interface TransactionView {
  readonly emoji: string;
  readonly title: string;
  /** "categoría · #etiquetas · cuenta", o "Cuenta → Cuenta" en transferencias. */
  readonly subtitle: string;
  readonly kind: RowKind;
  readonly status: "pending" | "overdue" | undefined;
  readonly categoryName: string;
  readonly accountName: string;
}

type ViewLedger = Pick<LedgerValue, "index" | "accountById" | "tagsOf">;

/** Datos de presentación de un movimiento para listas y tablas. */
export const describeTransaction = (
  transaction: Transaction,
  ledger: ViewLedger,
  today: IsoDate,
): TransactionView => {
  const account = ledger.accountById.get(transaction.accountId);
  const accountName = account?.name ?? "Cuenta eliminada";
  const status =
    transaction.status === "pending"
      ? isOverdue(transaction, today)
        ? "overdue"
        : "pending"
      : undefined;

  if (transaction.type === "transfer") {
    const destination =
      transaction.toAccountId === null
        ? undefined
        : ledger.accountById.get(transaction.toAccountId);
    return {
      emoji: TRANSFER_EMOJI,
      title: transaction.concept === "" ? "Transferencia" : transaction.concept,
      subtitle: `${accountName} → ${destination?.name ?? "Cuenta eliminada"}`,
      kind: "transfer",
      status,
      categoryName: "Transferencia",
      accountName,
    };
  }

  const category =
    transaction.categoryId === null ? undefined : ledger.index.byId.get(transaction.categoryId);
  const parent = category ? parentOf(ledger.index, category) : null;
  const categoryName = category?.name ?? "Sin categoría";
  const tags = (ledger.tagsOf.get(transaction.id) ?? []).map((tag) => `#${tag.name}`);

  return {
    emoji: category?.emoji ?? parent?.emoji ?? "🧾",
    title: transaction.concept === "" ? categoryName : transaction.concept,
    subtitle: [categoryName, ...tags, accountName].join(" · "),
    kind: transaction.type,
    status,
    categoryName,
    accountName,
  };
};

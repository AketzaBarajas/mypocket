import { useMemo, useSyncExternalStore } from "react";

import { filterTransactions, type TransactionFilter } from "@/domain/transactions";
import type { Account, Transaction } from "@/domain/types";

import { getEvoluErrorStore, getSyncStateStore, useOwnerSyncStatus } from "./evolu";
import { useLedger } from "./LedgerProvider";
import type { Settings } from "./settings";

/** Cuentas ordenadas. Por defecto, sin las archivadas. */
export const useAccounts = (
  options: { readonly includeArchived?: boolean } = {},
): ReadonlyArray<Account> => {
  const { accounts } = useLedger();
  const includeArchived = options.includeArchived === true;
  return useMemo(
    () => (includeArchived ? accounts : accounts.filter((account) => !account.archived)),
    [accounts, includeArchived],
  );
};

/** Movimientos filtrados, del más reciente al más antiguo y sin borrados. */
export const useTransactions = (filter: TransactionFilter): ReadonlyArray<Transaction> => {
  const { transactions, index, tags, transactionTags } = useLedger();
  return useMemo(
    () => filterTransactions(transactions, filter, { index, tags, transactionTags }),
    [transactions, filter, index, tags, transactionTags],
  );
};

export const useSettings = (): Settings => useLedger().settings;

export type SyncStatus = "synced" | "syncing" | "offline" | "error" | "off";

/** Estado de sincronización del owner de la app. */
export const useSyncStatus = (): SyncStatus => {
  const status = useOwnerSyncStatus(getSyncStateStore());
  switch (status.type) {
    case "Synced":
      return "synced";
    case "Syncing":
      return "syncing";
    case "Offline":
      return "offline";
    case "Error":
      return "error";
    case "NoRelays":
      return "off";
  }
};

export type DataError = "unsupported-version" | "other-build" | "unknown" | null;

/** Error de Evolu a nivel de app, traducido a algo que la interfaz puede explicar. */
export const useDataError = (): DataError => {
  const store = getEvoluErrorStore();
  const error = useSyncExternalStore(store.subscribe, store.get, () => null);
  if (error === null) return null;
  if (error.type === "UnsupportedDbVersionError") return "unsupported-version";
  if (error.type === "OtherBuildRunningError") return "other-build";
  return "unknown";
};

import { createContext, use, useMemo, type ReactNode } from "react";

import { buildCategoryIndex, type CategoryIndex } from "@/domain/categories";
import { tagsByTransaction } from "@/domain/transactions";
import type {
  Account,
  AccountId,
  ImportBatch,
  ImportProfile,
  Ledger,
  Tag,
  TransactionId,
} from "@/domain/types";

import { type Db, EvoluContext, useEvolu, useQueries } from "./evolu";
import {
  createRowMapper,
  toAccount,
  toBudget,
  toCategory,
  toGoal,
  toImportBatch,
  toImportProfile,
  toRecurrence,
  toRule,
  toTag,
  toTransaction,
  toTransactionTag,
  toValuation,
} from "./mappers";
import {
  accountsQuery,
  budgetsQuery,
  categoriesQuery,
  goalsQuery,
  importBatchesQuery,
  importProfilesQuery,
  recurrencesQuery,
  rulesQuery,
  settingsQuery,
  tagsQuery,
  transactionsQuery,
  transactionTagsQuery,
  valuationsQuery,
} from "./queries";
import { createRepo, type Repo } from "./repo";
import { type Settings, toSettings } from "./settings";

/** Datos de negocio en memoria, ya convertidos a tipos de dominio, más sus índices. */
export interface LedgerValue extends Ledger {
  readonly importProfiles: ReadonlyArray<ImportProfile>;
  readonly importBatches: ReadonlyArray<ImportBatch>;
  readonly settings: Settings;
  readonly index: CategoryIndex;
  readonly accountById: ReadonlyMap<AccountId, Account>;
  readonly tagsOf: ReadonlyMap<TransactionId, ReadonlyArray<Tag>>;
}

const LedgerContext = createContext<LedgerValue | null>(null);
const RepoContext = createContext<Repo | null>(null);

// Los conversores viven fuera del componente para conservar su caché de filas.
const mapAccounts = createRowMapper(toAccount);
const mapCategories = createRowMapper(toCategory);
const mapTransactions = createRowMapper(toTransaction);
const mapTags = createRowMapper(toTag);
const mapTransactionTags = createRowMapper(toTransactionTag);
const mapRecurrences = createRowMapper(toRecurrence);
const mapBudgets = createRowMapper(toBudget);
const mapGoals = createRowMapper(toGoal);
const mapValuations = createRowMapper(toValuation);
const mapRules = createRowMapper(toRule);
const mapImportProfiles = createRowMapper(toImportProfile);
const mapImportBatches = createRowMapper(toImportBatch);

const bySortOrder = (a: Account, b: Account) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");

const LedgerLoader = ({ children }: { readonly children: ReactNode }) => {
  const [
    accountRows,
    categoryRows,
    transactionRows,
    tagRows,
    transactionTagRows,
    recurrenceRows,
    budgetRows,
    goalRows,
    valuationRows,
    ruleRows,
    importProfileRows,
    importBatchRows,
    settingRows,
  ] = useQueries([
    accountsQuery,
    categoriesQuery,
    transactionsQuery,
    tagsQuery,
    transactionTagsQuery,
    recurrencesQuery,
    budgetsQuery,
    goalsQuery,
    valuationsQuery,
    rulesQuery,
    importProfilesQuery,
    importBatchesQuery,
    settingsQuery,
  ]);

  // Cada bloque se recalcula solo cuando cambian las filas de su tabla.
  const accounts = useMemo(() => [...mapAccounts(accountRows)].sort(bySortOrder), [accountRows]);
  const categories = useMemo(() => mapCategories(categoryRows), [categoryRows]);
  const transactions = useMemo(() => mapTransactions(transactionRows), [transactionRows]);
  const tags = useMemo(
    () => [...mapTags(tagRows)].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [tagRows],
  );
  const transactionTags = useMemo(
    () => mapTransactionTags(transactionTagRows),
    [transactionTagRows],
  );
  const recurrences = useMemo(() => mapRecurrences(recurrenceRows), [recurrenceRows]);
  const budgets = useMemo(() => mapBudgets(budgetRows), [budgetRows]);
  const goals = useMemo(() => mapGoals(goalRows), [goalRows]);
  const valuations = useMemo(() => mapValuations(valuationRows), [valuationRows]);
  const rules = useMemo(() => mapRules(ruleRows), [ruleRows]);
  const importProfiles = useMemo(() => mapImportProfiles(importProfileRows), [importProfileRows]);
  const importBatches = useMemo(
    () =>
      [...mapImportBatches(importBatchRows)].sort((a, b) =>
        b.importedAt.localeCompare(a.importedAt),
      ),
    [importBatchRows],
  );
  const settings = useMemo(() => toSettings(settingRows), [settingRows]);

  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const tagsOf = useMemo(() => tagsByTransaction(tags, transactionTags), [tags, transactionTags]);

  const value = useMemo<LedgerValue>(
    () => ({
      accounts,
      categories,
      transactions,
      tags,
      transactionTags,
      recurrences,
      budgets,
      goals,
      valuations,
      rules,
      importProfiles,
      importBatches,
      settings,
      index,
      accountById,
      tagsOf,
    }),
    [
      accounts,
      categories,
      transactions,
      tags,
      transactionTags,
      recurrences,
      budgets,
      goals,
      valuations,
      rules,
      importProfiles,
      importBatches,
      settings,
      index,
      accountById,
      tagsOf,
    ],
  );

  return <LedgerContext value={value}>{children}</LedgerContext>;
};

const RepoProvider = ({ children }: { readonly children: ReactNode }) => {
  const db = useEvolu();
  const repo = useMemo(() => createRepo(db), [db]);
  return <RepoContext value={repo}>{children}</RepoContext>;
};

/**
 * Proveedor de datos: conecta la instancia abierta de Evolu y carga las tablas.
 * Suspende hasta la primera carga; el llamador pone el `Suspense` y su skeleton.
 */
export const DataProvider = ({
  db,
  children,
}: {
  readonly db: Db;
  readonly children: ReactNode;
}) => (
  <EvoluContext value={db}>
    <RepoProvider>
      <LedgerLoader>{children}</LedgerLoader>
    </RepoProvider>
  </EvoluContext>
);

/** Todos los datos de negocio. Se actualiza solo cuando cambia algo. */
export const useLedger = (): LedgerValue => {
  const value = use(LedgerContext);
  if (!value) throw new Error("useLedger debe usarse dentro de DataProvider.");
  return value;
};

/** Operaciones de escritura. */
export const useRepo = (): Repo => {
  const value = use(RepoContext);
  if (!value) throw new Error("useRepo debe usarse dentro de DataProvider.");
  return value;
};

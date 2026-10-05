import { sqliteTrue } from "@evolu/common";

import { createQuery } from "./evolu";

/**
 * Una consulta por tabla. Los cálculos viven en `src/domain`, así que la capa
 * de datos solo entrega las filas completas; nada derivado se consulta ni se
 * guarda.
 */

export const accountsQuery = createQuery((db) =>
  db.selectFrom("account").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const categoriesQuery = createQuery((db) =>
  db.selectFrom("category").selectAll().where("isDeleted", "is not", sqliteTrue),
);

/** Incluye los borrados lógicos: las recurrencias los necesitan para no resucitarlos. */
export const transactionsQuery = createQuery((db) => db.selectFrom("transaction").selectAll());

export const tagsQuery = createQuery((db) =>
  db.selectFrom("tag").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const transactionTagsQuery = createQuery((db) =>
  db.selectFrom("transactionTag").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const recurrencesQuery = createQuery((db) =>
  db.selectFrom("recurrence").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const budgetsQuery = createQuery((db) =>
  db.selectFrom("budget").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const goalsQuery = createQuery((db) =>
  db.selectFrom("goal").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const valuationsQuery = createQuery((db) =>
  db.selectFrom("accountValuation").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const rulesQuery = createQuery((db) =>
  db.selectFrom("categorizationRule").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const importProfilesQuery = createQuery((db) =>
  db.selectFrom("importProfile").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const importBatchesQuery = createQuery((db) =>
  db.selectFrom("importBatch").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export const settingsQuery = createQuery((db) =>
  db.selectFrom("setting").selectAll().where("isDeleted", "is not", sqliteTrue),
);

export type AccountRow = typeof accountsQuery.Row;
export type CategoryRow = typeof categoriesQuery.Row;
export type TransactionRow = typeof transactionsQuery.Row;
export type TagRow = typeof tagsQuery.Row;
export type TransactionTagRow = typeof transactionTagsQuery.Row;
export type RecurrenceRow = typeof recurrencesQuery.Row;
export type BudgetRow = typeof budgetsQuery.Row;
export type GoalRow = typeof goalsQuery.Row;
export type ValuationRow = typeof valuationsQuery.Row;
export type RuleRow = typeof rulesQuery.Row;
export type ImportProfileRow = typeof importProfilesQuery.Row;
export type ImportBatchRow = typeof importBatchesQuery.Row;
export type SettingRow = typeof settingsQuery.Row;

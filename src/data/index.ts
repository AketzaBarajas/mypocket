// API pública de la capa de datos. La interfaz importa solo desde aquí: Evolu
// queda aislado dentro de src/data y es reemplazable.
export { closeDb, type Db, DEFAULT_RELAY_URL, openDb, type OpenDbOptions } from "./evolu";
export * from "./hooks";
export { DataProvider, type LedgerValue, useLedger, useRepo } from "./LedgerProvider";
export {
  type AccountInput,
  type CategoryInput,
  type GoalInput,
  type ImportProfileInput,
  nextSortOrder,
  type RecurrenceInput,
  type Repo,
  type RuleInput,
  type SeedAccountInput,
} from "./repo";
export {
  AUTO_LOCK_OPTIONS,
  type AutoLockMinutes,
  DEFAULT_SETTINGS,
  type SettingKey,
  type Settings,
} from "./settings";

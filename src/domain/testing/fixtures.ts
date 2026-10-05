import { buildCategoryIndex, type CategoryIndex } from "../categories";
import { isoDate, yearMonth } from "../dates";
import { cents } from "../money";
import type {
  Account,
  AccountValuation,
  Budget,
  CategorizationRule,
  Category,
  Goal,
  IsoDate,
  Ledger,
  Recurrence,
  Tag,
  Transaction,
  YearMonth,
} from "../types";

/** Atajos para escribir fechas, meses e importes en los tests. */
export const d = (value: string): IsoDate => isoDate(value);
export const ym = (value: string): YearMonth => yearMonth(value);
/** Euros a céntimos: `eur(12.5)` son 1250 céntimos. */
export const eur = (euros: number) => cents(Math.round(euros * 100));

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}-${String(++sequence).padStart(4, "0")}`;
/** Marca de creación creciente, para que el orden de inserción sea estable. */
const stamp = (): string => new Date(Date.UTC(2020, 0, 1, 0, 0, sequence)).toISOString();

export const makeAccount = (overrides: Partial<Account> = {}): Account => ({
  id: nextId("acc"),
  name: "BBVA débito",
  emoji: "💳",
  color: "blue",
  type: "checking",
  openingBalance: cents(0),
  openingDate: d("2026-01-01"),
  isLiquid: true,
  includeInNetWorth: true,
  archived: false,
  sortOrder: 0,
  ...overrides,
});

export const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: nextId("cat"),
  name: "Categoría",
  emoji: "🧾",
  kind: "expense",
  parentId: null,
  budgetGroup: "needs",
  archived: false,
  sortOrder: 0,
  ...overrides,
});

export const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: nextId("tx"),
  type: "expense",
  status: "confirmed",
  date: d("2026-10-05"),
  amount: eur(10),
  accountId: "acc",
  toAccountId: null,
  categoryId: null,
  concept: "",
  notes: null,
  originalAmount: null,
  originalCurrency: null,
  goalId: null,
  recurrenceId: null,
  importBatchId: null,
  importHash: null,
  isDeleted: false,
  createdAt: stamp(),
  ...overrides,
});

export const makeValuation = (overrides: Partial<AccountValuation> = {}): AccountValuation => ({
  id: nextId("val"),
  accountId: "acc",
  date: d("2026-10-01"),
  value: eur(1000),
  note: null,
  createdAt: stamp(),
  ...overrides,
});

export const makeBudget = (overrides: Partial<Budget> = {}): Budget => ({
  id: nextId("bud"),
  scope: "category",
  categoryId: "cat",
  amount: eur(100),
  validFrom: ym("2026-01"),
  updatedAt: stamp(),
  ...overrides,
});

export const makeRecurrence = (overrides: Partial<Recurrence> = {}): Recurrence => ({
  id: nextId("rec"),
  name: "Alquiler",
  type: "expense",
  amount: eur(620),
  accountId: "acc",
  toAccountId: null,
  categoryId: "cat",
  concept: "Alquiler",
  frequency: "monthly",
  interval: 1,
  anchorDate: d("2026-01-01"),
  nextDueDate: d("2026-01-01"),
  endDate: null,
  leadDays: 3,
  isSubscription: false,
  active: true,
  ...overrides,
});

export const makeRule = (overrides: Partial<CategorizationRule> = {}): CategorizationRule => ({
  id: nextId("rule"),
  pattern: "mercadona",
  matchType: "contains",
  categoryId: "cat",
  priority: 0,
  hitCount: 0,
  createdAt: stamp(),
  ...overrides,
});

export const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: nextId("goal"),
  name: "Viaje a Japón",
  emoji: "🗾",
  color: "teal",
  targetAmount: eur(3000),
  targetDate: null,
  status: "active",
  ...overrides,
});

export const makeTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: nextId("tag"),
  name: "viaje",
  color: "teal",
  ...overrides,
});

export const makeLedger = (overrides: Partial<Ledger> = {}): Ledger => ({
  accounts: [],
  categories: [],
  transactions: [],
  tags: [],
  transactionTags: [],
  recurrences: [],
  budgets: [],
  goals: [],
  valuations: [],
  rules: [],
  ...overrides,
});

/** Árbol mínimo de categorías con hojas en los dos grupos y de ingreso. */
export interface CategoryTree {
  readonly categories: ReadonlyArray<Category>;
  readonly index: CategoryIndex;
  readonly food: Category;
  readonly supermarket: Category;
  readonly market: Category;
  readonly housing: Category;
  readonly rent: Category;
  readonly leisure: Category;
  readonly gifts: Category;
  readonly salary: Category;
}

export const makeCategoryTree = (): CategoryTree => {
  const food = makeCategory({
    id: "food",
    name: "Alimentación",
    emoji: "🛒",
    budgetGroup: "needs",
  });
  const supermarket = makeCategory({
    id: "supermarket",
    name: "Supermercado",
    parentId: "food",
    budgetGroup: null,
  });
  const market = makeCategory({
    id: "market",
    name: "Mercado",
    parentId: "food",
    budgetGroup: null,
    sortOrder: 1,
  });
  const housing = makeCategory({
    id: "housing",
    name: "Vivienda",
    emoji: "🏠",
    budgetGroup: "needs",
    sortOrder: 1,
  });
  const rent = makeCategory({
    id: "rent",
    name: "Alquiler",
    parentId: "housing",
    budgetGroup: null,
  });
  const leisure = makeCategory({
    id: "leisure",
    name: "Ocio",
    emoji: "🎟️",
    budgetGroup: "wants",
    sortOrder: 2,
  });
  const gifts = makeCategory({
    id: "gifts",
    name: "Regalos",
    emoji: "🎁",
    budgetGroup: "wants",
    sortOrder: 3,
  });
  const salary = makeCategory({
    id: "salary",
    name: "Nómina",
    emoji: "💼",
    kind: "income",
    budgetGroup: null,
  });
  const categories = [food, supermarket, market, housing, rent, leisure, gifts, salary];
  return {
    categories,
    index: buildCategoryIndex(categories),
    food,
    supermarket,
    market,
    housing,
    rent,
    leisure,
    gifts,
    salary,
  };
};

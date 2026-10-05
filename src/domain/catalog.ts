import type { AccountType, BudgetGroup, CategoryKind, PaletteColor } from "./types";

/** Cuenta precargada en la bienvenida. El saldo inicial se edita allí. */
export interface SeedAccount {
  /** Clave estable: genera un id determinista, igual en todos los dispositivos. */
  readonly key: string;
  readonly name: string;
  readonly emoji: string;
  readonly color: PaletteColor;
  readonly type: AccountType;
}

export const SEED_ACCOUNTS: ReadonlyArray<SeedAccount> = [
  { key: "bbva-debito", name: "BBVA débito", emoji: "💳", color: "blue", type: "checking" },
  { key: "bbva-prepago", name: "BBVA prepago", emoji: "🪪", color: "teal", type: "prepaid" },
  { key: "efectivo", name: "Efectivo", emoji: "💶", color: "olive", type: "cash" },
  {
    key: "trade-republic",
    name: "Trade Republic",
    emoji: "📈",
    color: "slate",
    type: "investment",
  },
  { key: "myinvestor", name: "MyInvestor", emoji: "📈", color: "violet", type: "investment" },
  {
    key: "deudas-amigos",
    name: "Deudas de amigos",
    emoji: "🤝",
    color: "amber",
    type: "receivable",
  },
];

/** Por defecto son líquidas las cuentas del día a día y de ahorro. */
export const defaultIsLiquid = (type: AccountType): boolean =>
  type === "checking" || type === "prepaid" || type === "cash" || type === "savings";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Cuenta corriente",
  prepaid: "Prepago",
  cash: "Efectivo",
  savings: "Ahorro",
  investment: "Inversión",
  receivable: "Por cobrar",
};

export interface SeedCategory {
  readonly key: string;
  readonly name: string;
  readonly emoji: string;
  readonly kind: CategoryKind;
  readonly budgetGroup: BudgetGroup | null;
  /** Subcategorías. Vacío: la categoría es hoja. */
  readonly children: ReadonlyArray<string>;
}

const expense = (
  budgetGroup: BudgetGroup,
  key: string,
  emoji: string,
  name: string,
  children: ReadonlyArray<string> = [],
): SeedCategory => ({ key, name, emoji, kind: "expense", budgetGroup, children });

const income = (
  key: string,
  emoji: string,
  name: string,
  children: ReadonlyArray<string> = [],
): SeedCategory => ({ key, name, emoji, kind: "income", budgetGroup: null, children });

/** Catálogo de categorías precargado. */
export const SEED_CATEGORIES: ReadonlyArray<SeedCategory> = [
  expense("needs", "vivienda", "🏠", "Vivienda", ["Alquiler", "Suministros", "Internet"]),
  expense("needs", "alimentacion", "🛒", "Alimentación", ["Supermercado", "Mercado"]),
  expense("needs", "transporte", "🚇", "Transporte", [
    "Transporte público",
    "Combustible",
    "Taxi y VTC",
    "Parking",
  ]),
  expense("needs", "salud", "🩺", "Salud", ["Farmacia", "Médico", "Seguro"]),
  expense("needs", "formacion", "📚", "Formación", ["Matrícula", "Material", "Cursos"]),
  expense("needs", "telefonia", "📱", "Telefonía", ["Móvil"]),
  expense("needs", "impuestos", "🧾", "Impuestos y comisiones", [
    "Comisiones bancarias",
    "Impuestos",
  ]),

  expense("wants", "restaurantes", "🍜", "Restaurantes", [
    "Restaurantes",
    "Cafeterías",
    "Comida a domicilio",
  ]),
  expense("wants", "ocio", "🎟️", "Ocio", ["Eventos", "Salidas", "Hobbies"]),
  expense("wants", "compras", "🛍️", "Compras", ["Ropa", "Tecnología", "Hogar"]),
  expense("wants", "viajes", "✈️", "Viajes", ["Transporte", "Alojamiento", "Actividades"]),
  expense("wants", "suscripciones", "🎬", "Suscripciones", ["Streaming", "Software"]),
  expense("wants", "deporte", "🏋️", "Deporte", ["Gimnasio", "Material deportivo"]),
  expense("wants", "regalos", "🎁", "Regalos"),
  expense("wants", "cuidado-personal", "💇", "Cuidado personal"),

  income("nomina", "💼", "Nómina"),
  income("freelance", "🧑‍💻", "Consultoría y freelance"),
  income("rendimientos", "📈", "Rendimientos", ["Intereses", "Dividendos"]),
  income("reembolsos", "🔁", "Reembolsos"),
  income("otros-ingresos", "➕", "Otros ingresos", ["Regalos recibidos", "Varios"]),
];

/** Convierte un nombre en una clave estable: "Taxi y VTC" → "taxi-y-vtc". */
export const slugify = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Clave estable de una subcategoría del catálogo. */
export const seedChildKey = (parent: SeedCategory, child: string): string =>
  `${parent.key}/${slugify(child)}`;

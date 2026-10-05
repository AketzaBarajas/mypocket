import { categoryKey, SAVINGS_KEY } from "@/domain/budgets";
import { SEED_ACCOUNTS } from "@/domain/catalog";
import {
  addDaysIso,
  addMonthsIso,
  addMonthsYm,
  daysInMonth,
  endOfMonthIso,
  makeIsoDate,
  monthOf,
  startOfMonthIso,
  yearOf,
} from "@/domain/dates";
import { cents } from "@/domain/money";
import type { TransactionInput } from "@/domain/transactions";
import type { Cents, IsoDate, TransactionType, YearMonth } from "@/domain/types";

import { type Repo, seedAccountId, seedCategoryId } from "./repo";

/**
 * Datos ficticios para desarrollo: 12 meses coherentes de nómina, gastos
 * variados, recurrencias, valoraciones mensuales, presupuestos, una meta y una
 * etiqueta de viaje. Solo se usa en el perfil demo aislado (`pnpm seed:demo`).
 */

/** Generador pseudoaleatorio determinista: la demo es igual en cada arranque. */
const createRandom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const eur = (euros: number): Cents => cents(Math.round(euros * 100));

const OPENING: Record<string, number> = {
  "bbva-debito": 1850,
  "bbva-prepago": 60,
  efectivo: 85,
  "trade-republic": 6200,
  myinvestor: 2400,
  "deudas-amigos": 0,
};

const SUPERMARKETS = ["Mercadona", "Carrefour Express", "Lidl", "Ahorramas", "Mercadona"];
const RESTAURANTS = ["La Tagliatella", "Bar Manolo", "Honest Greens", "Sushi Yakuza", "Casa Dani"];
const CAFES = ["Café Central", "Toma Café", "Faborit", "Hola Coffee"];
const LEISURE = ["Cine Ideal", "Teatro Lara", "Escape room", "Concierto Sala But", "Bolera"];
const SHOPPING: ReadonlyArray<readonly [string, string]> = [
  ["Zara", "compras/ropa"],
  ["MediaMarkt", "compras/tecnologia"],
  ["IKEA", "compras/hogar"],
  ["Decathlon", "deporte/material-deportivo"],
];

export const seedDemo = (repo: Repo, today: IsoDate): void => {
  const random = createRandom(20261005);
  const between = (min: number, max: number) => min + random() * (max - min);
  const pick = <T>(items: ReadonlyArray<T>): T => items[Math.floor(random() * items.length)] as T;

  const currentMonth = monthOf(today);
  const firstMonth = addMonthsYm(currentMonth, -11);
  const openingDate = startOfMonthIso(firstMonth);

  repo.seedAccounts(
    SEED_ACCOUNTS.map((account) => ({
      ...account,
      openingBalance: eur(OPENING[account.key] ?? 0),
      openingDate,
    })),
  );
  repo.seedCategories();

  const bank = seedAccountId("bbva-debito");
  const cash = seedAccountId("efectivo");
  const broker = seedAccountId("trade-republic");
  const fund = seedAccountId("myinvestor");
  const debts = seedAccountId("deudas-amigos");
  const cat = seedCategoryId;

  const goal = repo.createGoal({
    name: "Fondo de emergencia",
    emoji: "🛟",
    color: "teal",
    targetAmount: eur(6000),
    targetDate: addMonthsIso(today, 9),
  });
  const trip = repo.ensureTag("lisboa", [], "coral");

  const add = (
    type: TransactionType,
    date: IsoDate,
    amount: number,
    concept: string,
    options: {
      readonly account?: string;
      readonly to?: string;
      readonly category?: string;
      readonly goal?: string;
      readonly tags?: ReadonlyArray<string>;
      readonly notes?: string;
    } = {},
  ) => {
    // Los movimientos del mes en curso posteriores a hoy aún no han ocurrido.
    if (date > today) return;
    const input: TransactionInput = {
      type,
      status: "confirmed",
      date,
      amount: eur(amount),
      accountId: options.account ?? bank,
      toAccountId: options.to ?? null,
      categoryId: options.category === undefined ? null : cat(options.category),
      concept,
      notes: options.notes ?? null,
      originalAmount: null,
      originalCurrency: null,
      goalId: options.goal ?? null,
    };
    repo.createTransaction(input, options.tags ?? []);
  };

  const day = (month: YearMonth, dayOfMonth: number): IsoDate =>
    makeIsoDate(
      yearOf(month),
      Number(month.slice(5, 7)),
      Math.min(dayOfMonth, daysInMonth(month)),
    ) ?? startOfMonthIso(month);
  const randomDay = (month: YearMonth) => day(month, 1 + Math.floor(random() * daysInMonth(month)));

  let brokerValue = OPENING["trade-republic"] ?? 0;
  let fundValue = OPENING.myinvestor ?? 0;

  for (let index = 0; index < 12; index += 1) {
    const month = addMonthsYm(firstMonth, index);

    // Ingresos.
    add("income", day(month, 1), 2450, "Nómina", { category: "nomina" });
    if (index % 4 === 2) {
      add("income", day(month, 18), between(350, 620), "Factura consultoría", {
        category: "freelance",
      });
    }
    if (index % 3 === 0) {
      add("income", day(month, 30), between(4, 11), "Intereses cuenta", {
        category: "rendimientos/intereses",
      });
    }

    // Fijos.
    add("expense", day(month, 2), 780, "Alquiler", { category: "vivienda/alquiler" });
    add("expense", day(month, 8), between(52, 94), "Luz y gas", {
      category: "vivienda/suministros",
    });
    add("expense", day(month, 5), 35, "Fibra Digi", { category: "vivienda/internet" });
    add("expense", day(month, 5), 15, "Móvil Digi", { category: "telefonia/movil" });
    add("expense", day(month, 3), 32.7, "Abono transporte", {
      category: "transporte/transporte-publico",
    });
    add("expense", day(month, 4), 34.9, "Gimnasio Basic-Fit", { category: "deporte/gimnasio" });
    add("expense", day(month, 12), 13.99, "Netflix", { category: "suscripciones/streaming" });
    add("expense", day(month, 20), 10.99, "Spotify", { category: "suscripciones/streaming" });
    if (index === 5) {
      add("expense", day(month, 14), 49.9, "Amazon Prime", { category: "suscripciones/streaming" });
    }

    // Variables.
    for (let i = 0; i < 7; i += 1) {
      add("expense", randomDay(month), between(18, 72), pick(SUPERMARKETS), {
        category: "alimentacion/supermercado",
      });
    }
    for (let i = 0; i < 2; i += 1) {
      add("expense", randomDay(month), between(8, 22), "Frutería del mercado", {
        category: "alimentacion/mercado",
        account: cash,
      });
    }
    for (let i = 0; i < 5; i += 1) {
      add("expense", randomDay(month), between(12, 42), pick(RESTAURANTS), {
        category: "restaurantes/restaurantes",
      });
    }
    for (let i = 0; i < 6; i += 1) {
      add("expense", randomDay(month), between(1.8, 4.6), pick(CAFES), {
        category: "restaurantes/cafeterias",
        account: random() < 0.4 ? cash : bank,
      });
    }
    for (let i = 0; i < 2; i += 1) {
      add("expense", randomDay(month), between(14, 48), pick(LEISURE), {
        category: "ocio/eventos",
      });
    }
    if (random() < 0.7) {
      const [shop, category] = pick(SHOPPING);
      add("expense", randomDay(month), between(19, 140), shop, { category });
    }
    if (random() < 0.5) {
      add("expense", randomDay(month), between(6, 24), "Farmacia", { category: "salud/farmacia" });
    }
    if (random() < 0.35) {
      add("expense", randomDay(month), between(9, 26), "Cabify", {
        category: "transporte/taxi-y-vtc",
      });
    }
    add("transfer", day(month, 6), 60, "Sacar efectivo", { to: cash });

    // Cena con adelanto: mi parte es gasto y lo adelantado va a «Deudas de amigos».
    if (index % 3 === 1) {
      const dinner = day(month, 16);
      add("expense", dinner, 28, "Cena cumpleaños", { category: "restaurantes/restaurantes" });
      add("transfer", dinner, 56, "Adelanto cena", { to: debts, notes: "Parte de Leire y Unai" });
      add("transfer", addDaysIso(dinner, 5), 56, "Bizum cena", { account: debts, to: bank });
    }

    // Viaje etiquetado, hace cuatro meses.
    if (index === 7 && trip !== null) {
      const tags = [trip];
      add("expense", day(month, 9), 184, "Vuelos TAP Lisboa", {
        category: "viajes/transporte",
        tags,
      });
      add("expense", day(month, 10), 312, "Apartamento Alfama", {
        category: "viajes/alojamiento",
        tags,
      });
      add("expense", day(month, 11), 46, "Tour Sintra", { category: "viajes/actividades", tags });
      add("expense", day(month, 11), 38.5, "Time Out Market", {
        category: "restaurantes/restaurantes",
        tags,
      });
      add("expense", day(month, 12), 27, "Pastéis de Belém y cena", {
        category: "restaurantes/restaurantes",
        tags,
      });
    }

    // Ahorro e inversión, con valoración a fin de mes.
    const contributionDay = day(month, 3);
    add("transfer", contributionDay, 250, "Aportación fondo indexado", { to: fund, goal });
    add("transfer", contributionDay, 150, "Plan de inversión", { to: broker });
    if (contributionDay <= today) {
      brokerValue = (brokerValue + 150) * (1 + between(-0.025, 0.04));
      fundValue = (fundValue + 250) * (1 + between(-0.015, 0.03));
    }
    const monthEnd = endOfMonthIso(month);
    if (monthEnd <= today) {
      repo.addValuation(broker, monthEnd, eur(brokerValue), null);
      repo.addValuation(fund, monthEnd, eur(fundValue), null);
    }
  }

  // Presupuestos desde el primer mes.
  const budgets: ReadonlyArray<readonly [string, number]> = [
    ["vivienda", 920],
    ["alimentacion", 380],
    ["transporte", 60],
    ["salud", 30],
    ["telefonia", 15],
    ["restaurantes", 190],
    ["ocio", 80],
    ["compras", 100],
    ["suscripciones", 30],
    ["deporte", 45],
  ];
  repo.applyBudgetWrites([
    ...budgets.map(([key, amount]) => ({
      id: null,
      key: categoryKey(cat(key)),
      amount: eur(amount),
      validFrom: firstMonth,
    })),
    { id: null, key: SAVINGS_KEY, amount: eur(400), validFrom: firstMonth },
  ]);

  // Recurrencias: la próxima ocurrencia de cada una cae a partir de hoy.
  const nextOn = (dayOfMonth: number): IsoDate => {
    const thisMonth = day(currentMonth, dayOfMonth);
    return thisMonth > today ? thisMonth : day(addMonthsYm(currentMonth, 1), dayOfMonth);
  };
  const recurring = (
    name: string,
    amount: number,
    dayOfMonth: number,
    category: string,
    isSubscription: boolean,
  ) =>
    repo.createRecurrence({
      name,
      type: "expense",
      amount: eur(amount),
      accountId: bank,
      toAccountId: null,
      categoryId: cat(category),
      concept: name,
      frequency: "monthly",
      interval: 1,
      anchorDate: day(firstMonth, dayOfMonth),
      nextDueDate: nextOn(dayOfMonth),
      endDate: null,
      leadDays: 3,
      isSubscription,
      active: true,
    });
  recurring("Alquiler", 780, 2, "vivienda/alquiler", false);
  recurring("Fibra Digi", 35, 5, "vivienda/internet", false);
  recurring("Gimnasio Basic-Fit", 34.9, 4, "deporte/gimnasio", true);
  recurring("Netflix", 13.99, 12, "suscripciones/streaming", true);
  recurring("Spotify", 10.99, 20, "suscripciones/streaming", true);
  repo.createRecurrence({
    name: "Amazon Prime",
    type: "expense",
    amount: eur(49.9),
    accountId: bank,
    toAccountId: null,
    categoryId: cat("suscripciones/streaming"),
    concept: "Amazon Prime",
    frequency: "yearly",
    interval: 1,
    anchorDate: day(addMonthsYm(firstMonth, 5), 14),
    nextDueDate: day(addMonthsYm(firstMonth, 17), 14),
    endDate: null,
    leadDays: 7,
    isSubscription: true,
    active: true,
  });
  repo.createRecurrence({
    name: "Aportación fondo indexado",
    type: "transfer",
    amount: eur(250),
    accountId: bank,
    toAccountId: fund,
    categoryId: null,
    concept: "Aportación fondo indexado",
    frequency: "monthly",
    interval: 1,
    anchorDate: day(firstMonth, 3),
    nextDueDate: nextOn(3),
    endDate: null,
    leadDays: 2,
    isSubscription: false,
    active: true,
  });

  // Reglas de autocategorización.
  const rules: ReadonlyArray<readonly [string, string]> = [
    ["mercadona", "alimentacion/supermercado"],
    ["carrefour", "alimentacion/supermercado"],
    ["lidl", "alimentacion/supermercado"],
    ["netflix", "suscripciones/streaming"],
    ["spotify", "suscripciones/streaming"],
    ["cabify", "transporte/taxi-y-vtc"],
    ["farmacia", "salud/farmacia"],
  ];
  rules.forEach(([pattern, category], index) => {
    repo.updateRule(
      repo.createRule({ pattern, matchType: "contains", categoryId: cat(category) }, []),
      { pattern, matchType: "contains", categoryId: cat(category), priority: index + 1 },
    );
  });

  repo.setSetting("defaultAccountId", bank);
  repo.setSetting("lastAccountId", bank);
};

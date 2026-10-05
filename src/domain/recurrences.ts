import { addDaysIso, addMonthsIso, diffDays, diffMonths, monthOf } from "./dates";
import { cents } from "./money";
import type {
  AccountId,
  CategoryId,
  Cents,
  Frequency,
  IsoDate,
  Recurrence,
  RecurrenceId,
  Transaction,
  TransactionType,
} from "./types";

type Schedule = Pick<Recurrence, "frequency" | "interval" | "anchorDate">;

const MONTHS_PER: Record<Exclude<Frequency, "weekly">, number> = { monthly: 1, yearly: 12 };

/**
 * Ocurrencia número `index` contada desde `anchorDate`. Mensual y anual se
 * calculan siempre desde el ancla, así conservan su día: un día 31 cae en el
 * 28 o 29 de febrero y vuelve al 31 en marzo.
 */
export const occurrenceAt = (schedule: Schedule, index: number): IsoDate => {
  const interval = Math.max(1, schedule.interval);
  return schedule.frequency === "weekly"
    ? addDaysIso(schedule.anchorDate, index * interval * 7)
    : addMonthsIso(schedule.anchorDate, index * interval * MONTHS_PER[schedule.frequency]);
};

/** Primera ocurrencia estrictamente posterior a una fecha. */
export const nextOccurrenceAfter = (schedule: Schedule, date: IsoDate): IsoDate => {
  const interval = Math.max(1, schedule.interval);
  if (date < schedule.anchorDate) return schedule.anchorDate;

  // Estimación del índice por división y ajuste fino hacia delante.
  let index =
    schedule.frequency === "weekly"
      ? Math.floor(diffDays(date, schedule.anchorDate) / (interval * 7))
      : Math.floor(
          diffMonths(monthOf(date), monthOf(schedule.anchorDate)) /
            (interval * MONTHS_PER[schedule.frequency]),
        );
  index = Math.max(0, index);
  let candidate = occurrenceAt(schedule, index);
  while (candidate <= date) candidate = occurrenceAt(schedule, ++index);
  return candidate;
};

/** Primera ocurrencia en una fecha o después de ella. */
export const firstOccurrenceOnOrAfter = (schedule: Schedule, date: IsoDate): IsoDate =>
  nextOccurrenceAfter(schedule, addDaysIso(date, -1));

/** Movimiento pendiente que hay que crear a partir de una plantilla. */
export interface PendingDraft {
  readonly recurrenceId: RecurrenceId;
  readonly type: TransactionType;
  readonly date: IsoDate;
  readonly amount: Cents;
  readonly accountId: AccountId;
  readonly toAccountId: AccountId | null;
  readonly categoryId: CategoryId | null;
  readonly concept: string;
}

export interface RecurrenceRun {
  readonly drafts: ReadonlyArray<PendingDraft>;
  /** Recurrencias cuyo `nextDueDate` hay que avanzar. */
  readonly advances: ReadonlyArray<{ readonly id: RecurrenceId; readonly nextDueDate: IsoDate }>;
}

/** Tope de ocurrencias por recurrencia y pasada, por si hay años de atraso. */
const MAX_OCCURRENCES_PER_RUN = 500;

/**
 * Genera los pendientes de las recurrencias activas. Para cada una, mientras
 * `nextDueDate − leadDays ≤ hoy` (y no se pase de `endDate`): crea un pendiente
 * si no existe ya un movimiento con ese `recurrenceId` y esa fecha —incluidos
 * los borrados, para no resucitar los omitidos— y avanza `nextDueDate`.
 *
 * Es idempotente: ejecutarla dos veces no duplica nada, aunque la segunda vez
 * reciba las recurrencias sin avanzar.
 */
export const processRecurrences = (
  recurrences: ReadonlyArray<Recurrence>,
  transactions: ReadonlyArray<Transaction>,
  today: IsoDate,
): RecurrenceRun => {
  const existing = new Set<string>();
  for (const transaction of transactions) {
    if (transaction.recurrenceId !== null) {
      existing.add(`${transaction.recurrenceId}|${transaction.date}`);
    }
  }

  const drafts: PendingDraft[] = [];
  const advances: Array<{ id: RecurrenceId; nextDueDate: IsoDate }> = [];

  for (const recurrence of recurrences) {
    if (!recurrence.active) continue;
    let due = recurrence.nextDueDate;
    let steps = 0;

    while (
      steps < MAX_OCCURRENCES_PER_RUN &&
      addDaysIso(due, -recurrence.leadDays) <= today &&
      (recurrence.endDate === null || due <= recurrence.endDate)
    ) {
      const key = `${recurrence.id}|${due}`;
      if (!existing.has(key)) {
        existing.add(key);
        drafts.push({
          recurrenceId: recurrence.id,
          type: recurrence.type,
          date: due,
          amount: recurrence.amount,
          accountId: recurrence.accountId,
          toAccountId: recurrence.type === "transfer" ? recurrence.toAccountId : null,
          categoryId: recurrence.type === "transfer" ? null : recurrence.categoryId,
          concept: recurrence.concept === "" ? recurrence.name : recurrence.concept,
        });
      }
      due = nextOccurrenceAfter(recurrence, due);
      steps += 1;
    }

    if (due !== recurrence.nextDueDate) advances.push({ id: recurrence.id, nextDueDate: due });
  }

  return { drafts, advances };
};

/** Importe mensual equivalente: anuales / 12 y semanales × 52 / 12. */
export const monthlyEquivalent = (
  recurrence: Pick<Recurrence, "amount" | "frequency" | "interval">,
): Cents => {
  const interval = Math.max(1, recurrence.interval);
  const perMonth =
    recurrence.frequency === "weekly"
      ? (recurrence.amount * 52) / 12 / interval
      : recurrence.frequency === "monthly"
        ? recurrence.amount / interval
        : recurrence.amount / 12 / interval;
  return cents(Math.round(perMonth));
};

/** Total mensual equivalente de las suscripciones activas. */
export const subscriptionsMonthlyTotal = (recurrences: ReadonlyArray<Recurrence>): Cents =>
  cents(
    recurrences
      .filter((recurrence) => recurrence.active && recurrence.isSubscription)
      .reduce((sum, recurrence) => sum + monthlyEquivalent(recurrence), 0),
  );

/** "Cada mes", "Cada 2 semanas", "Cada año". */
export const describeFrequency = (frequency: Frequency, interval: number): string => {
  const n = Math.max(1, interval);
  if (frequency === "weekly") return n === 1 ? "Cada semana" : `Cada ${n} semanas`;
  if (frequency === "monthly") return n === 1 ? "Cada mes" : `Cada ${n} meses`;
  return n === 1 ? "Cada año" : `Cada ${n} años`;
};

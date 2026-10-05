import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfMonth,
  format,
  getDay,
  isValid,
  lastDayOfMonth,
  startOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";

import type { IsoDate, YearMonth } from "./types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

/** Construye una fecha local a medianoche sin pasar por el parser de `Date`. */
const localDate = (year: number, month: number, day: number): Date =>
  new Date(year, month - 1, day);

export const isIsoDate = (value: string): value is IsoDate => {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = localDate(year, month, day);
  return (
    isValid(date) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

/** Valida y marca un string `YYYY-MM-DD`. Lanza si no es una fecha real. */
export const isoDate = (value: string): IsoDate => {
  if (!isIsoDate(value)) throw new RangeError(`Fecha no válida: ${value}`);
  return value;
};

export const isYearMonth = (value: string): value is YearMonth => {
  const match = YEAR_MONTH.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
};

export const yearMonth = (value: string): YearMonth => {
  if (!isYearMonth(value)) throw new RangeError(`Mes no válido: ${value}`);
  return value;
};

/** Convierte una fecha de negocio en un `Date` local a medianoche. */
export const toDate = (date: IsoDate): Date => {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Fecha no válida: ${date}`);
  return localDate(Number(match[1]), Number(match[2]), Number(match[3]));
};

const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

/** Convierte un `Date` en la fecha de negocio de su día local. */
export const fromDate = (date: Date): IsoDate =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as IsoDate;

/** Fecha de negocio de un instante. Es el único puente entre el reloj y el dominio. */
export const todayFrom = (now: Date): IsoDate => fromDate(now);

export const makeIsoDate = (year: number, month: number, day: number): IsoDate | null => {
  const candidate = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  return isIsoDate(candidate) ? candidate : null;
};

export const monthOf = (date: IsoDate): YearMonth => date.slice(0, 7) as YearMonth;
export const yearOf = (date: IsoDate | YearMonth): number => Number(date.slice(0, 4));

export const addDaysIso = (date: IsoDate, days: number): IsoDate =>
  fromDate(addDays(toDate(date), days));

/** Suma meses conservando el día, ajustado al último día si el mes es más corto. */
export const addMonthsIso = (date: IsoDate, months: number): IsoDate =>
  fromDate(addMonths(toDate(date), months));

export const diffDays = (later: IsoDate, earlier: IsoDate): number =>
  differenceInCalendarDays(toDate(later), toDate(earlier));

export const startOfMonthIso = (month: YearMonth): IsoDate => `${month}-01` as IsoDate;

export const endOfMonthIso = (month: YearMonth): IsoDate =>
  fromDate(endOfMonth(toDate(startOfMonthIso(month))));

export const daysInMonth = (month: YearMonth): number =>
  lastDayOfMonth(toDate(startOfMonthIso(month))).getDate();

export const addMonthsYm = (month: YearMonth, months: number): YearMonth =>
  monthOf(fromDate(addMonths(toDate(startOfMonthIso(month)), months)));

export const diffMonths = (later: YearMonth, earlier: YearMonth): number =>
  differenceInCalendarMonths(toDate(startOfMonthIso(later)), toDate(startOfMonthIso(earlier)));

export const isInMonth = (date: IsoDate, month: YearMonth): boolean => date.startsWith(month);

/** Días desde `today` hasta fin de mes, ambos incluidos. */
export const daysLeftInMonth = (today: IsoDate): number =>
  diffDays(endOfMonthIso(monthOf(today)), today) + 1;

/** Lunes de la semana de una fecha (las semanas empiezan en lunes). */
export const mondayOf = (date: IsoDate): IsoDate => {
  const weekday = getDay(toDate(date)); // 0 = domingo
  return addDaysIso(date, weekday === 0 ? -6 : 1 - weekday);
};

export const startOfMonthOf = (date: IsoDate): IsoDate => fromDate(startOfMonth(toDate(date)));

/** Lista de meses entre dos meses, ambos incluidos. */
export const monthRange = (from: YearMonth, to: YearMonth): ReadonlyArray<YearMonth> => {
  const months: YearMonth[] = [];
  for (let month = from; month <= to; month = addMonthsYm(month, 1)) months.push(month);
  return months;
};

const capitalize = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

const fmt = (date: IsoDate, pattern: string): string =>
  format(toDate(date), pattern, { locale: es });

/** "Lunes, 5 de octubre" */
export const formatLongDate = (date: IsoDate): string => capitalize(fmt(date, "EEEE, d 'de' MMMM"));

/** "5 oct 2026" */
export const formatShortDate = (date: IsoDate): string => fmt(date, "d MMM yyyy");

/** "5 oct" */
export const formatDayMonth = (date: IsoDate): string => fmt(date, "d MMM");

/** "05/10/2026" */
export const formatNumericDate = (date: IsoDate): string => fmt(date, "dd/MM/yyyy");

/** "Octubre 2026" */
export const formatMonthYear = (month: YearMonth): string =>
  capitalize(fmt(startOfMonthIso(month), "LLLL yyyy"));

/** "octubre" */
export const formatMonthName = (month: YearMonth): string => fmt(startOfMonthIso(month), "LLLL");

/** "oct" */
export const formatMonthShort = (month: YearMonth): string => fmt(startOfMonthIso(month), "LLL");

/** Cabecera de día en listas: "Hoy", "Ayer" o "Jue · 1 oct". */
export const formatDayHeader = (date: IsoDate, today: IsoDate): string => {
  const distance = diffDays(today, date);
  if (distance === 0) return "Hoy";
  if (distance === 1) return "Ayer";
  if (distance === -1) return "Mañana";
  const sameYear = yearOf(date) === yearOf(today);
  return capitalize(fmt(date, sameYear ? "EEE '·' d MMM" : "EEE '·' d MMM yyyy"));
};

/** Distancia relativa para pendientes: "hoy", "mañana", "en 3 días", "hace 2 días". */
export const formatRelativeDay = (date: IsoDate, today: IsoDate): string => {
  const distance = diffDays(date, today);
  if (distance === 0) return "hoy";
  if (distance === 1) return "mañana";
  if (distance === -1) return "ayer";
  return distance > 0 ? `en ${distance} días` : `hace ${-distance} días`;
};

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subYears,
} from "date-fns";
import { es } from "date-fns/locale";
import type { ISODate } from "./types";

export const toISO = (d: Date): ISODate => format(d, "yyyy-MM-dd");
export const fromISO = (s: ISODate): Date => parseISO(s);
export const todayISO = (): ISODate => toISO(new Date());
export const monthKey = (iso: ISODate) => iso.slice(0, 7); // YYYY-MM
export const monthStart = (iso: ISODate): ISODate => `${iso.slice(0, 7)}-01`;

export type PeriodKey =
  | "today"
  | "week"
  | "month"
  | "prev_month"
  | "last_3m"
  | "last_6m"
  | "year"
  | "prev_year"
  | "custom";

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
  prev_month: "Mes anterior",
  last_3m: "Últimos 3 meses",
  last_6m: "Últimos 6 meses",
  year: "Este año",
  prev_year: "Año anterior",
  custom: "Personalizado",
};

export function periodRange(key: PeriodKey, ref: Date = new Date(), custom?: DateRange): DateRange {
  const r = (a: Date, b: Date) => ({ from: toISO(a), to: toISO(b) });
  switch (key) {
    case "today":
      return r(ref, ref);
    case "week":
      return r(startOfWeek(ref, { weekStartsOn: 1 }), endOfWeek(ref, { weekStartsOn: 1 }));
    case "month":
      return r(startOfMonth(ref), endOfMonth(ref));
    case "prev_month": {
      const p = subMonths(ref, 1);
      return r(startOfMonth(p), endOfMonth(p));
    }
    case "last_3m":
      return r(startOfMonth(subMonths(ref, 2)), endOfMonth(ref));
    case "last_6m":
      return r(startOfMonth(subMonths(ref, 5)), endOfMonth(ref));
    case "year":
      return r(startOfYear(ref), endOfYear(ref));
    case "prev_year": {
      const p = subYears(ref, 1);
      return r(startOfYear(p), endOfYear(p));
    }
    case "custom":
      return custom ?? r(startOfMonth(ref), endOfMonth(ref));
  }
}

/** Periodo inmediatamente anterior con la misma duración (para comparar). */
export function previousRange(range: DateRange): DateRange {
  const from = fromISO(range.from);
  const to = fromISO(range.to);
  // Si el rango son meses completos, comparar con los mismos meses anteriores
  const isWholeMonths = range.from.endsWith("-01") && toISO(endOfMonth(to)) === range.to;
  if (isWholeMonths) {
    const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
    const pFrom = subMonths(from, months);
    return { from: toISO(pFrom), to: toISO(endOfMonth(addMonths(pFrom, months - 1))) };
  }
  const days = differenceInCalendarDays(to, from) + 1;
  return { from: toISO(addDays(from, -days)), to: toISO(addDays(from, -1)) };
}

export const inRange = (iso: ISODate, range: DateRange) => iso >= range.from && iso <= range.to;
export const daysInRange = (range: DateRange) =>
  differenceInCalendarDays(fromISO(range.to), fromISO(range.from)) + 1;

/** Lista de claves YYYY-MM entre dos fechas (incluidas). */
export function monthsBetween(range: DateRange): string[] {
  const out: string[] = [];
  let d = startOfMonth(fromISO(range.from));
  const end = fromISO(range.to);
  while (d <= end) {
    out.push(format(d, "yyyy-MM"));
    d = addMonths(d, 1);
  }
  return out;
}

export const formatDate = (iso: ISODate, pattern = "d MMM yyyy") => format(fromISO(iso), pattern, { locale: es });
export const formatMonth = (key: string, pattern = "MMM yy") => format(fromISO(`${key}-01`), pattern, { locale: es });

export function relativeDayLabel(iso: ISODate, today: ISODate = todayISO()): string {
  const diff = differenceInCalendarDays(fromISO(iso), fromISO(today));
  if (diff === 0) return "Hoy";
  if (diff === -1) return "Ayer";
  if (diff === 1) return "Mañana";
  return formatDate(iso, diff > -7 && diff < 0 ? "EEEE d" : "EEEE, d MMM");
}

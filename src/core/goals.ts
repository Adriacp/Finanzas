import { differenceInCalendarMonths, differenceInCalendarDays } from "date-fns";
import { fromISO } from "./dates";
import { round2 } from "./money";
import type { Goal, ISODate } from "./types";

export interface GoalProgress {
  pct: number;
  remaining: number;
  monthsLeft: number | null;
  daysLeft: number | null;
  /** Cuánto hay que ahorrar al mes para llegar a tiempo */
  monthlyNeeded: number | null;
  done: boolean;
  overdue: boolean;
}

export function goalProgress(g: Goal, today: ISODate): GoalProgress {
  const remaining = round2(Math.max(0, g.targetAmount - g.savedAmount));
  const pct = g.targetAmount > 0 ? Math.min(100, (g.savedAmount / g.targetAmount) * 100) : 0;
  const done = remaining <= 0;
  if (!g.deadline) return { pct, remaining, monthsLeft: null, daysLeft: null, monthlyNeeded: null, done, overdue: false };
  const daysLeft = differenceInCalendarDays(fromISO(g.deadline), fromISO(today));
  // Meses restantes contando el mes actual como uno (mínimo 1 si no ha vencido)
  const monthsLeft = Math.max(0, differenceInCalendarMonths(fromISO(g.deadline), fromISO(today)) + (daysLeft >= 0 ? 1 : 0));
  const overdue = daysLeft < 0 && !done;
  const monthlyNeeded = done ? 0 : monthsLeft > 0 ? round2(remaining / monthsLeft) : remaining;
  return { pct, remaining, monthsLeft, daysLeft, monthlyNeeded, done, overdue };
}

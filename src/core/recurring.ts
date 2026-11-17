import { addMonths, addWeeks, endOfMonth } from "date-fns";
import { type DateRange, fromISO, toISO } from "./dates";
import { round2 } from "./money";
import type { Frequency, ISODate, Recurring, Transaction } from "./types";

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

/** Factor para convertir el importe a coste mensual equivalente. */
const MONTHLY_FACTOR: Record<Frequency, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
};

export const monthlyCost = (r: Pick<Recurring, "amount" | "frequency">) => round2(r.amount * MONTHLY_FACTOR[r.frequency]);
export const annualCost = (r: Pick<Recurring, "amount" | "frequency">) => round2(r.amount * MONTHLY_FACTOR[r.frequency] * 12);

export function advanceDate(iso: ISODate, f: Frequency, times = 1): ISODate {
  const d = fromISO(iso);
  switch (f) {
    case "weekly": return toISO(addWeeks(d, times));
    case "monthly": return toISO(addMonths(d, times));
    case "quarterly": return toISO(addMonths(d, 3 * times));
    case "semiannual": return toISO(addMonths(d, 6 * times));
    case "annual": return toISO(addMonths(d, 12 * times));
  }
}

export const isActive = (r: Recurring, on: ISODate) =>
  r.status === "active" && (!r.endDate || r.endDate >= on);

/** Fechas de cobro previstas dentro de un rango (a partir de nextDate). */
export function occurrencesInRange(r: Recurring, range: DateRange, max = 400): ISODate[] {
  if (r.status !== "active") return [];
  const out: ISODate[] = [];
  let d = r.nextDate;
  let guard = 0;
  while (d <= range.to && guard++ < max) {
    if (r.endDate && d > r.endDate) break;
    if (d >= range.from) out.push(d);
    d = advanceDate(d, r.frequency);
  }
  return out;
}

export interface UpcomingPayment {
  recurring: Recurring;
  date: ISODate;
}

export function upcomingPayments(items: Recurring[], range: DateRange): UpcomingPayment[] {
  return items
    .flatMap((r) => occurrencesInRange(r, range).map((date) => ({ recurring: r, date })))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function subscriptionTotals(items: Recurring[], today: ISODate) {
  const active = items.filter((r) => r.type === "expense" && isActive(r, today));
  const monthly = round2(active.reduce((s, r) => s + monthlyCost(r), 0));
  return {
    monthly,
    annual: round2(monthly * 12),
    activeCount: active.length,
    cancelledCount: items.filter((r) => r.status === "cancelled").length,
  };
}

/** Construye el movimiento correspondiente a un cobro de un recurrente. */
export function transactionFromRecurring(r: Recurring, date: ISODate, status: Transaction["status"] = "paid"): Omit<Transaction, "id"> {
  return {
    type: r.type,
    amount: r.amount,
    concept: r.name,
    categoryId: r.categoryId,
    subcategoryId: r.subcategoryId,
    date,
    time: null,
    accountId: r.accountId,
    toAccountId: null,
    paymentMethod: "Domiciliación",
    merchant: r.merchant ?? r.name,
    description: null,
    tags: r.isSubscription ? ["suscripción"] : [],
    isFixed: r.isFixed,
    isRecurring: true,
    recurringId: r.id,
    status,
    attachmentPath: null,
    notes: null,
  };
}

/** Gasto recurrente que queda por cobrar en lo que resta de mes. */
export function remainingRecurringThisMonth(items: Recurring[], today: ISODate) {
  const range = { from: today, to: toISO(endOfMonth(fromISO(today))) };
  return round2(
    upcomingPayments(items.filter((r) => r.type === "expense"), range).reduce((s, p) => s + p.recurring.amount, 0),
  );
}

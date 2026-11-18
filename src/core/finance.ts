import { endOfMonth } from "date-fns";
import { type DateRange, fromISO, inRange, monthKey, toISO, daysInRange } from "./dates";
import { round2 } from "./money";
import type { Account, AccountType, Category, ID, Transaction } from "./types";

/** Solo los movimientos pagados afectan a saldos y totales reales. */
export const isEffective = (t: Transaction) => t.status === "paid";

/**
 * Movimiento marcado como pagado pero con fecha posterior a hoy. Suele ser un error:
 * cuenta ya en saldos y gastos aunque el dinero aún no ha salido (debería estar programado).
 */
export function isPaidInFuture(t: Pick<Transaction, "status" | "date"> & { time?: string | null }, now: Date = new Date()): boolean {
  if (t.status !== "paid") return false;
  const today = toISO(now);
  if (t.date !== today) return t.date > today;
  // Mismo día: es futuro si tiene una hora posterior a la actual (p. ej. dentro de una hora)
  if (!t.time) return false;
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return t.time.slice(0, 5) > nowHM;
}

/**
 * Saldo inicial necesario para que el saldo calculado de una cuenta coincida con el real del banco.
 * No crea movimientos: así ingresos, gastos y estadísticas no se alteran.
 */
export const adjustedInitialBalance = (initialBalance: number, currentBalance: number, realBalance: number) =>
  round2(initialBalance + (realBalance - currentBalance));

/**
 * Efecto neto de un movimiento sobre los gastos:
 *  - gasto suma, reembolso resta (es dinero de un gasto que vuelve)
 *  - ingresos y transferencias NO cuentan como gasto
 */
export const expenseContribution = (t: Transaction) =>
  t.type === "expense" ? t.amount : t.type === "refund" ? -t.amount : 0;
export const incomeContribution = (t: Transaction) => (t.type === "income" ? t.amount : 0);

/** Variación de saldo que provoca un movimiento en una cuenta concreta. */
export function accountDelta(t: Transaction, accountId: ID): number {
  if (!isEffective(t)) return 0;
  switch (t.type) {
    case "expense":
      return t.accountId === accountId ? -t.amount : 0;
    case "income":
    case "refund":
      return t.accountId === accountId ? t.amount : 0;
    case "transfer": {
      let d = 0;
      if (t.accountId === accountId) d -= t.amount;
      if (t.toAccountId === accountId) d += t.amount;
      return d;
    }
  }
}

export function accountBalances(accounts: Account[], txs: Transaction[], upTo?: string): Map<ID, number> {
  const map = new Map<ID, number>(accounts.map((a) => [a.id, a.initialBalance]));
  for (const t of txs) {
    if (!isEffective(t) || (upTo && t.date > upTo)) continue;
    if (t.accountId && map.has(t.accountId)) map.set(t.accountId, map.get(t.accountId)! + accountDelta(t, t.accountId));
    if (t.type === "transfer" && t.toAccountId && map.has(t.toAccountId) && t.toAccountId !== t.accountId)
      map.set(t.toAccountId, map.get(t.toAccountId)! + t.amount);
  }
  for (const [k, v] of map) map.set(k, round2(v));
  return map;
}

const LIQUID: AccountType[] = ["checking", "cash", "debit_card", "paypal", "credit_card", "other"];

export function wealth(accounts: Account[], txs: Transaction[]) {
  const balances = accountBalances(accounts, txs);
  let netWorth = 0;
  let available = 0;
  for (const a of accounts) {
    const b = balances.get(a.id) ?? 0;
    netWorth += b;
    if (!a.archived && LIQUID.includes(a.type)) available += b;
  }
  return { balances, netWorth: round2(netWorth), available: round2(available) };
}

export interface Summary {
  income: number;
  expense: number;
  balance: number;
  /** % de los ingresos que se ahorra (0-100). */
  savingsRate: number;
  pendingExpense: number;
  pendingIncome: number;
  count: number;
}

export function summarize(txs: Transaction[], range: DateRange): Summary {
  let income = 0, expense = 0, pendingExpense = 0, pendingIncome = 0, count = 0;
  for (const t of txs) {
    if (!inRange(t.date, range)) continue;
    if (isEffective(t)) {
      income += incomeContribution(t);
      expense += expenseContribution(t);
      count++;
    } else {
      pendingExpense += t.type === "expense" ? t.amount : 0;
      pendingIncome += t.type === "income" ? t.amount : 0;
    }
  }
  const balance = income - expense;
  return {
    income: round2(income),
    expense: round2(expense),
    balance: round2(balance),
    savingsRate: income > 0 ? Math.max(-100, Math.min(100, (balance / income) * 100)) : 0,
    pendingExpense: round2(pendingExpense),
    pendingIncome: round2(pendingIncome),
    count,
  };
}

export const pctChange = (current: number, previous: number) =>
  previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;

export interface CategoryTotal {
  id: ID | null;
  name: string;
  color: string;
  icon: string;
  amount: number;
  share: number;
  count: number;
}

export function expenseByCategory(
  txs: Transaction[],
  range: DateRange,
  categories: Category[],
  level: "category" | "subcategory" = "category",
  parentFilter?: ID,
): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, { amount: number; count: number }>();
  for (const t of txs) {
    if (!isEffective(t) || !inRange(t.date, range)) continue;
    const v = expenseContribution(t);
    if (!v) continue;
    if (parentFilter && t.categoryId !== parentFilter) continue;
    const key = (level === "subcategory" ? t.subcategoryId ?? t.categoryId : t.categoryId) ?? "none";
    const cur = totals.get(key) ?? { amount: 0, count: 0 };
    cur.amount += v;
    cur.count++;
    totals.set(key, cur);
  }
  const total = [...totals.values()].reduce((s, x) => s + Math.max(0, x.amount), 0);
  return [...totals.entries()]
    .map(([id, { amount, count }]) => {
      const c = id === "none" ? undefined : byId.get(id);
      const parent = c?.parentId ? byId.get(c.parentId) : undefined;
      return {
        id: id === "none" ? null : id,
        name: c ? (level === "subcategory" && parent && !parentFilter ? `${c.name} · ${parent.name}` : c.name) : "Sin categoría",
        color: c?.color ?? "#94a3b8",
        icon: c?.icon ?? "tag",
        amount: round2(amount),
        share: total > 0 ? (Math.max(0, amount) / total) * 100 : 0,
        count,
      };
    })
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export interface MonthPoint {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  balance: number;
}

export function monthlySeries(txs: Transaction[], months: string[]): MonthPoint[] {
  const map = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0, balance: 0 }]));
  for (const t of txs) {
    if (!isEffective(t)) continue;
    const p = map.get(monthKey(t.date));
    if (!p) continue;
    p.income += incomeContribution(t);
    p.expense += expenseContribution(t);
  }
  return months.map((m) => {
    const p = map.get(m)!;
    return { month: m, income: round2(p.income), expense: round2(p.expense), balance: round2(p.income - p.expense) };
  });
}

/** Patrimonio al cierre de cada mes. */
export function netWorthSeries(accounts: Account[], txs: Transaction[], months: string[]) {
  const initial = accounts.reduce((s, a) => s + a.initialBalance, 0);
  const accountIds = new Set(accounts.map((a) => a.id));
  const sorted = txs.filter(isEffective).sort((a, b) => (a.date < b.date ? -1 : 1));
  let i = 0;
  let acc = initial;
  return months.map((m) => {
    const end = toISO(endOfMonth(fromISO(`${m}-01`)));
    while (i < sorted.length && sorted[i].date <= end) {
      const t = sorted[i++];
      if (t.type === "transfer") {
        // Una transferencia a/desde una cuenta no registrada sí altera el patrimonio
        const fromKnown = t.accountId && accountIds.has(t.accountId);
        const toKnown = t.toAccountId && accountIds.has(t.toAccountId);
        if (fromKnown && !toKnown) acc -= t.amount;
        if (!fromKnown && toKnown) acc += t.amount;
      } else if (t.accountId && accountIds.has(t.accountId)) {
        acc += accountDelta(t, t.accountId);
      }
    }
    return { month: m, value: round2(acc) };
  });
}

/** Gasto por día de la semana (0 = lunes). */
export function expenseByWeekday(txs: Transaction[], range: DateRange) {
  const names = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const sums = new Array(7).fill(0);
  for (const t of txs) {
    if (!isEffective(t) || !inRange(t.date, range)) continue;
    const wd = (fromISO(t.date).getDay() + 6) % 7;
    sums[wd] += expenseContribution(t);
  }
  return names.map((name, i) => ({ name, amount: round2(sums[i]) }));
}

export function expenseByDay(txs: Transaction[], range: DateRange) {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (!isEffective(t) || !inRange(t.date, range)) continue;
    const v = expenseContribution(t);
    if (v) map.set(t.date, (map.get(t.date) ?? 0) + v);
  }
  return [...map.entries()].map(([date, amount]) => ({ date, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
}

export function averages(txs: Transaction[], range: DateRange) {
  const s = summarize(txs, range);
  const days = daysInRange(range);
  // Media mensual = gasto total / nº de meses (proporcional)
  const months = Math.max(1, days / 30.4375);
  return { daily: round2(s.expense / days), monthly: round2(s.expense / months), summary: s };
}

export function splitFixedVariable(txs: Transaction[], range: DateRange) {
  let fixed = 0, variable = 0;
  for (const t of txs) {
    if (!isEffective(t) || !inRange(t.date, range)) continue;
    const v = expenseContribution(t);
    if (t.isFixed) fixed += v; else variable += v;
  }
  return { fixed: round2(fixed), variable: round2(variable) };
}

export function splitEssential(txs: Transaction[], range: DateRange, categories: Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let essential = 0, discretionary = 0;
  for (const t of txs) {
    if (!isEffective(t) || !inRange(t.date, range)) continue;
    const v = expenseContribution(t);
    if (!v) continue;
    const c = byId.get(t.subcategoryId ?? "") ?? byId.get(t.categoryId ?? "");
    if (c?.essential) essential += v; else discretionary += v;
  }
  return { essential: round2(essential), discretionary: round2(discretionary) };
}

/** Gasto neto en una categoría o subcategoría durante un rango. */
export function spentInCategory(txs: Transaction[], categoryId: ID | null, range: DateRange): number {
  let s = 0;
  for (const t of txs) {
    if (!isEffective(t) || !inRange(t.date, range)) continue;
    if (categoryId && t.categoryId !== categoryId && t.subcategoryId !== categoryId) continue;
    s += expenseContribution(t);
  }
  return round2(s);
}

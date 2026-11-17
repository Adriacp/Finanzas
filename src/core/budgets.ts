import { endOfMonth } from "date-fns";
import { fromISO, toISO } from "./dates";
import { spentInCategory } from "./finance";
import { round2 } from "./money";
import type { Budget, Category, ID, Transaction } from "./types";

export const BUDGET_THRESHOLDS = [50, 75, 90, 100] as const;

export interface BudgetStatus {
  key: string;
  budgetId: ID;
  categoryId: ID | null;
  name: string;
  color: string;
  icon: string;
  isSub: boolean;
  amount: number;
  spent: number;
  remaining: number;
  pct: number;
  /** Último umbral alcanzado (50/75/90/100) o null */
  threshold: number | null;
}

/** Presupuesto efectivo para un mes: el específico del mes gana al genérico. */
export function budgetsForMonth(budgets: Budget[], month: string): Budget[] {
  const monthDate = `${month}-01`;
  const byKey = new Map<string, Budget>();
  for (const b of budgets) {
    const key = b.categoryId ?? "global";
    if (b.month === null) {
      if (!byKey.has(key)) byKey.set(key, b);
    } else if (b.month === monthDate) {
      byKey.set(key, b);
    }
  }
  // asegurar prioridad del específico aunque el genérico venga después
  for (const b of budgets) if (b.month === monthDate) byKey.set(b.categoryId ?? "global", b);
  return [...byKey.values()].filter((b) => b.amount > 0);
}

export function thresholdFor(pct: number): number | null {
  let t: number | null = null;
  for (const th of BUDGET_THRESHOLDS) if (pct >= th) t = th;
  return t;
}

export function budgetStatuses(budgets: Budget[], categories: Category[], txs: Transaction[], month: string): BudgetStatus[] {
  const range = { from: `${month}-01`, to: toISO(endOfMonth(fromISO(`${month}-01`))) };
  const byId = new Map(categories.map((c) => [c.id, c]));
  return budgetsForMonth(budgets, month)
    .map((b) => {
      const c = b.categoryId ? byId.get(b.categoryId) : undefined;
      if (b.categoryId && !c) return null;
      const spent = spentInCategory(txs, b.categoryId, range);
      const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
      const parent = c?.parentId ? byId.get(c.parentId) : undefined;
      return {
        key: b.categoryId ?? "global",
        budgetId: b.id,
        categoryId: b.categoryId,
        name: c ? (parent ? `${c.name} · ${parent.name}` : c.name) : "Presupuesto global",
        color: c?.color ?? "#6366f1",
        icon: c?.icon ?? "wallet",
        isSub: !!c?.parentId,
        amount: b.amount,
        spent,
        remaining: round2(b.amount - spent),
        pct,
        threshold: thresholdFor(pct),
      } satisfies BudgetStatus;
    })
    .filter((x): x is BudgetStatus => x !== null)
    .sort((a, b) => (a.categoryId === null ? -1 : b.categoryId === null ? 1 : b.pct - a.pct));
}

/**
 * Detecta si un nuevo gasto hace cruzar algún umbral de presupuesto.
 * Devuelve los avisos para mostrar al usuario.
 */
export function crossedThresholds(before: BudgetStatus[], after: BudgetStatus[]) {
  const prev = new Map(before.map((b) => [b.key, b.threshold ?? 0]));
  return after.filter((a) => (a.threshold ?? 0) > (prev.get(a.key) ?? 0));
}

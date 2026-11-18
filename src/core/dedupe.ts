import { normalize } from "./insights";
import type { Account, Budget, Category, FinanceData, Goal, ID, Recurring, Transaction } from "./types";

/**
 * Detecta categorías, subcategorías y cuentas duplicadas (mismo nombre y ámbito)
 * y calcula cómo fusionarlas sin perder datos: los movimientos, recurrentes,
 * presupuestos y objetivos que apuntan a un duplicado pasan a apuntar al que se conserva.
 *
 * Se conserva el elemento más usado; a igualdad, el primero (el más antiguo).
 * El formulario de categorías ya impide crear nombres repetidos en el mismo nivel,
 * así que un duplicado siempre es un error (p. ej. datos iniciales creados dos veces).
 */
export interface DedupePlan {
  hasChanges: boolean;
  categoryRemap: Map<ID, ID>;
  accountRemap: Map<ID, ID>;
  /** Subcategorías propias que colgaban de una categoría duplicada: se mueven a la conservada. */
  categoryUpdates: Category[];
  transactionUpdates: Transaction[];
  /** Transferencias entre dos cuentas duplicadas: tras fusionarlas quedarían de una cuenta a sí misma. */
  transactionDeletes: ID[];
  recurringUpdates: Recurring[];
  goalUpdates: Goal[];
  budgetUpdates: Budget[];
  budgetDeletes: ID[];
  subcategoryDeletes: ID[];
  categoryDeletes: ID[];
  accountDeletes: ID[];
}

function pickKeepers<T extends { id: ID }>(items: T[], keyOf: (t: T) => string, usage: Map<ID, number>): Map<ID, ID> {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(it);
  }
  const remap = new Map<ID, ID>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // Más usado primero; a igualdad, se mantiene el orden original (más antiguo primero).
    const keeper = list
      .map((it, i) => ({ it, i, u: usage.get(it.id) ?? 0 }))
      .sort((a, b) => b.u - a.u || a.i - b.i)[0].it;
    for (const it of list) if (it.id !== keeper.id) remap.set(it.id, keeper.id);
  }
  return remap;
}

const bump = (m: Map<ID, number>, id: ID | null | undefined) => {
  if (id) m.set(id, (m.get(id) ?? 0) + 1);
};

export function planDedupe(d: Pick<FinanceData, "categories" | "accounts" | "transactions" | "recurring" | "budgets" | "goals">): DedupePlan {
  // --- Uso de cada categoría y cuenta ---
  const catUsage = new Map<ID, number>();
  const accUsage = new Map<ID, number>();
  for (const t of d.transactions) {
    bump(catUsage, t.categoryId); bump(catUsage, t.subcategoryId);
    bump(accUsage, t.accountId); bump(accUsage, t.toAccountId);
  }
  for (const r of d.recurring) { bump(catUsage, r.categoryId); bump(catUsage, r.subcategoryId); bump(accUsage, r.accountId); }
  for (const b of d.budgets) bump(catUsage, b.categoryId);
  for (const g of d.goals) bump(accUsage, g.accountId);
  // Una categoría padre también cuenta el uso de sus subcategorías
  for (const c of d.categories) if (c.parentId) catUsage.set(c.parentId, (catUsage.get(c.parentId) ?? 0) + (catUsage.get(c.id) ?? 0));

  // --- Categorías: primero padres, luego subcategorías dentro del padre conservado ---
  const parents = d.categories.filter((c) => !c.parentId);
  const parentRemap = pickKeepers(parents, (c) => `${c.kind}|${normalize(c.name)}`, catUsage);
  const effParent = (c: Category) => (c.parentId ? parentRemap.get(c.parentId) ?? c.parentId : null);
  const subs = d.categories.filter((c) => c.parentId);
  const subRemap = pickKeepers(subs, (c) => `${effParent(c)}|${c.kind}|${normalize(c.name)}`, catUsage);
  const categoryRemap = new Map([...parentRemap, ...subRemap]);
  const categoryUpdates = subs
    .filter((c) => !subRemap.has(c.id) && parentRemap.has(c.parentId!))
    .map((c) => ({ ...c, parentId: effParent(c) }));

  // --- Cuentas: mismo nombre, tipo, moneda, entidad y saldo inicial ---
  const accountRemap = pickKeepers(
    d.accounts,
    (a: Account) => `${normalize(a.name)}|${a.type}|${a.currency}|${normalize(a.institution ?? "")}|${a.initialBalance}`,
    accUsage,
  );

  const rc = (id: ID | null) => (id ? categoryRemap.get(id) ?? id : null);
  const ra = (id: ID | null) => (id ? accountRemap.get(id) ?? id : null);

  // --- Movimientos ---
  const transactionUpdates: Transaction[] = [];
  const transactionDeletes: ID[] = [];
  for (const t of d.transactions) {
    const next = { ...t, categoryId: rc(t.categoryId), subcategoryId: rc(t.subcategoryId), accountId: ra(t.accountId), toAccountId: ra(t.toAccountId) };
    if (next.type === "transfer" && next.accountId && next.accountId === next.toAccountId) { transactionDeletes.push(t.id); continue; }
    if (next.categoryId !== t.categoryId || next.subcategoryId !== t.subcategoryId || next.accountId !== t.accountId || next.toAccountId !== t.toAccountId)
      transactionUpdates.push(next);
  }

  const recurringUpdates = d.recurring
    .map((r) => ({ ...r, categoryId: rc(r.categoryId), subcategoryId: rc(r.subcategoryId), accountId: ra(r.accountId) }))
    .filter((r, i) => r.categoryId !== d.recurring[i].categoryId || r.subcategoryId !== d.recurring[i].subcategoryId || r.accountId !== d.recurring[i].accountId);

  const goalUpdates = d.goals.filter((g) => g.accountId && accountRemap.has(g.accountId)).map((g) => ({ ...g, accountId: ra(g.accountId) }));

  // --- Presupuestos: no puede haber dos para la misma categoría y mes ---
  const budgetUpdates: Budget[] = [];
  const budgetDeletes: ID[] = [];
  const taken = new Set(d.budgets.filter((b) => !b.categoryId || !categoryRemap.has(b.categoryId)).map((b) => `${b.categoryId}|${b.month}`));
  for (const b of d.budgets) {
    if (!b.categoryId || !categoryRemap.has(b.categoryId)) continue;
    const key = `${rc(b.categoryId)}|${b.month}`;
    if (taken.has(key)) budgetDeletes.push(b.id);
    else { taken.add(key); budgetUpdates.push({ ...b, categoryId: rc(b.categoryId) }); }
  }

  const subcategoryDeletes = [...subRemap.keys()];
  const categoryDeletes = [...parentRemap.keys()];
  const accountDeletes = [...accountRemap.keys()];

  return {
    hasChanges: categoryRemap.size > 0 || accountRemap.size > 0,
    categoryRemap, accountRemap, categoryUpdates, transactionUpdates, transactionDeletes, recurringUpdates, goalUpdates,
    budgetUpdates, budgetDeletes, subcategoryDeletes, categoryDeletes, accountDeletes,
  };
}

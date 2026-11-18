import { describe, expect, it } from "vitest";
import { planDedupe } from "./dedupe";
import { buildDefaultAccounts, buildDefaultCategories } from "./defaults";
import type { Budget, Category, Transaction } from "./types";

let n = 0;
const id = () => `id${++n}`;

const tx = (p: Partial<Transaction>): Transaction => ({
  id: id(), type: "expense", amount: 10, concept: "x", categoryId: null, subcategoryId: null, date: "2026-11-10", time: null,
  accountId: null, toAccountId: null, paymentMethod: null, merchant: null, description: null, tags: [], isFixed: false,
  isRecurring: false, recurringId: null, status: "paid", attachmentPath: null, notes: null, ...p,
});

/** Simula la siembra doble: dos juegos completos de categorías y cuentas por defecto. */
function doubledSeed() {
  const a = buildDefaultCategories(id), b = buildDefaultCategories(id);
  const accA = buildDefaultAccounts(id), accB = buildDefaultAccounts(id);
  return { categories: [...a, ...b], accounts: [...accA, ...accB], a, b, accA, accB };
}
const find = (cats: Category[], name: string, parentName?: string) => {
  const p = parentName ? cats.find((c) => !c.parentId && c.name === parentName) : undefined;
  return cats.find((c) => c.name === name && (parentName ? c.parentId === p!.id : !c.parentId))!;
};

describe("planDedupe", () => {
  it("no cambia nada si no hay duplicados", () => {
    const categories = buildDefaultCategories(id);
    const plan = planDedupe({ categories, accounts: buildDefaultAccounts(id), transactions: [], recurring: [], budgets: [], goals: [] });
    expect(plan.hasChanges).toBe(false);
  });

  it("fusiona una siembra doble y reasigna los movimientos de ambos juegos", () => {
    const s = doubledSeed();
    const superB = find(s.b, "Supermercado", "Alimentación");
    const alimB = find(s.b, "Alimentación");
    // Movimientos en el SEGUNDO juego (más usado) y uno en el primero
    const t1 = tx({ categoryId: alimB.id, subcategoryId: superB.id, accountId: s.accB[0].id });
    const t2 = tx({ categoryId: alimB.id, subcategoryId: superB.id, accountId: s.accB[0].id });
    const cafeA = find(s.a, "Cafeterías", "Alimentación");
    const t3 = tx({ categoryId: find(s.a, "Alimentación").id, subcategoryId: cafeA.id, accountId: s.accA[1].id });
    const plan = planDedupe({ categories: s.categories, accounts: s.accounts, transactions: [t1, t2, t3], recurring: [], budgets: [], goals: [] });

    // Se elimina exactamente un juego completo (102 categorías → 51) y una de cada cuenta
    expect(plan.categoryDeletes.length + plan.subcategoryDeletes.length).toBe(s.a.length);
    expect(plan.accountDeletes).toHaveLength(2);
    // Alimentación del juego B es la más usada → se conserva
    expect(plan.categoryDeletes).not.toContain(alimB.id);
    expect(plan.categoryRemap.get(find(s.a, "Alimentación").id)).toBe(alimB.id);
    // Cafeterías: la subcategoría usada (de A) se conserva aunque su padre se fusione → se mueve al padre B
    const keptCafe = plan.categoryRemap.get(cafeA.id) ?? cafeA.id;
    const t3u = plan.transactionUpdates.find((t) => t.id === t3.id)!;
    expect(t3u.categoryId).toBe(alimB.id);
    expect(t3u.subcategoryId).toBe(keptCafe);
    if (keptCafe === cafeA.id) expect(plan.categoryUpdates.find((c) => c.id === cafeA.id)?.parentId).toBe(alimB.id);
    // Ninguna transacción apunta ya a algo que se borra
    const deleted = new Set([...plan.categoryDeletes, ...plan.subcategoryDeletes, ...plan.accountDeletes]);
    const all = [t1, t2, t3].map((t) => plan.transactionUpdates.find((u) => u.id === t.id) ?? t);
    for (const t of all) for (const ref of [t.categoryId, t.subcategoryId, t.accountId]) expect(deleted.has(ref ?? "")).toBe(false);
  });

  it("no duplica presupuestos al fusionar y elimina transferencias entre cuentas duplicadas", () => {
    const s = doubledSeed();
    const ocioA = find(s.a, "Ocio y entretenimiento"), ocioB = find(s.b, "Ocio y entretenimiento");
    const budgets: Budget[] = [
      { id: "b1", categoryId: ocioA.id, amount: 100, month: null },
      { id: "b2", categoryId: ocioB.id, amount: 150, month: null },
    ];
    const transfer = tx({ type: "transfer", accountId: s.accA[0].id, toAccountId: s.accB[0].id });
    const plan = planDedupe({ categories: s.categories, accounts: s.accounts, transactions: [transfer], recurring: [], budgets, goals: [] });
    expect(plan.budgetDeletes.length + plan.budgetUpdates.length).toBeLessThanOrEqual(1);
    const remaining = budgets.filter((b) => !plan.budgetDeletes.includes(b.id)).map((b) => plan.budgetUpdates.find((u) => u.id === b.id) ?? b);
    expect(new Set(remaining.map((b) => `${b.categoryId}|${b.month}`)).size).toBe(remaining.length);
    expect(plan.transactionDeletes).toEqual([transfer.id]);
  });

  it("no fusiona cuentas con el mismo nombre pero distinto saldo inicial", () => {
    const [a] = buildDefaultAccounts(id);
    const b = { ...a, id: id(), initialBalance: 500 };
    const plan = planDedupe({ categories: [], accounts: [a, b], transactions: [], recurring: [], budgets: [], goals: [] });
    expect(plan.hasChanges).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildDefaultCategories, buildDefaultProducts } from "./defaults";
import { filterTransactions } from "./filters";
import { itemsByTransaction, itemsTotal, lastUnitPrice, lineTotal, productStats } from "./products";
import type { Product, Transaction, TransactionItem } from "./types";

let n = 0;
const id = () => `id${++n}`;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: id(), type: "expense", amount: 10, concept: "Compra", categoryId: null, subcategoryId: null, date: "2026-11-10", time: null,
  accountId: null, toAccountId: null, paymentMethod: null, merchant: null, description: null, tags: [], isFixed: false,
  isRecurring: false, recurringId: null, status: "paid", attachmentPath: null, notes: null, ...p,
});
const item = (transactionId: string, productId: string | null, name: string, quantity: number, unitPrice: number): TransactionItem => ({
  id: id(), transactionId, productId, name, quantity, unitPrice, amount: lineTotal(quantity, unitPrice), sortOrder: 0,
});

const huevos: Product = { id: "p-huevos", name: "Huevos", unit: "docena", categoryId: null };
const leche: Product = { id: "p-leche", name: "Leche", unit: "l", categoryId: null };

describe("productos", () => {
  it("calcula totales de línea y de desglose", () => {
    expect(lineTotal(1.234, 1.99)).toBe(2.46);
    expect(itemsTotal([{ amount: 2.46 }, { amount: 3 }, { amount: -0.5 }])).toBe(4.96);
  });

  it("crea el catálogo por defecto enlazado a subcategorías", () => {
    const cats = buildDefaultCategories(id);
    const products = buildDefaultProducts(id, cats);
    const h = products.find((p) => p.name === "Huevos")!;
    expect(cats.find((c) => c.id === h.categoryId)?.name).toBe("Supermercado");
    expect(cats.find((c) => c.id === products.find((p) => p.name === "Gasolina 95")!.categoryId)?.name).toBe("Gasolina");
    expect(new Set(products.map((p) => p.name)).size).toBe(products.length);
  });

  it("calcula cuánto gastas, a qué precio y dónde sueles comprar", () => {
    const t1 = tx({ date: "2026-10-01", merchant: "Mercadona" });
    const t2 = tx({ date: "2026-10-15", merchant: "Mercadona" });
    const t3 = tx({ date: "2026-11-02", merchant: "Lidl" });
    const pending = tx({ date: "2026-11-20", merchant: "Lidl", status: "scheduled" });
    const items = [
      item(t1.id, huevos.id, "Huevos", 1, 2.4), item(t1.id, leche.id, "Leche", 6, 0.9),
      item(t2.id, huevos.id, "Huevos", 2, 2.5),
      item(t3.id, huevos.id, "Huevos", 1, 2.1),
      item(pending.id, huevos.id, "Huevos", 5, 2), // programado: no cuenta todavía
    ];
    const [h] = productStats([huevos, leche], items, [t1, t2, t3, pending]);
    expect(h.count).toBe(3);
    expect(h.quantity).toBe(4);
    expect(h.total).toBe(9.5); // 2,40 + 5,00 + 2,10
    expect(h.avgUnitPrice).toBe(2.38);
    expect(h.minUnitPrice).toBe(2.1);
    expect(h.lastUnitPrice).toBe(2.1);
    expect(h.lastDate).toBe("2026-11-02");
    expect(h.merchants[0]).toMatchObject({ merchant: "Mercadona", count: 2 }); // donde más lo compras
    expect(h.cheapestMerchant?.merchant).toBe("Lidl"); // donde sale más barato
    // Filtrado por periodo
    const [hNov] = productStats([huevos], items, [t1, t2, t3, pending], { from: "2026-11-01", to: "2026-11-30" });
    expect(hNov.count).toBe(1);
    expect(lastUnitPrice(huevos.id, items, [t1, t2, t3, pending])).toBe(2);
  });

  it("filtra y busca movimientos por producto", () => {
    const a = tx({ concept: "Compra semanal" });
    const b = tx({ concept: "Otra compra" });
    const items = [item(a.id, huevos.id, "Huevos", 1, 2.4), item(b.id, leche.id, "Leche", 1, 0.9)];
    const map = itemsByTransaction(items);
    expect(filterTransactions([a, b], { productIds: [huevos.id] }, [], [], map).map((t) => t.id)).toEqual([a.id]);
    expect(filterTransactions([a, b], { q: "huevos" }, [], [], map).map((t) => t.id)).toEqual([a.id]);
  });
});
